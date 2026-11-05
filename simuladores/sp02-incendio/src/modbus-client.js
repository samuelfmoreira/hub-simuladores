'use strict';
/**
 * Cliente Modbus TCP (o simulador é o CLIENT, o CLP é o SERVER).
 *
 * - Implementação própria sobre o módulo `net` do Node (sem dependências).
 * - Uma única transação em andamento por vez (o CLP nunca recebe rajadas).
 * - Intervalo mínimo entre frames configurável (gapMs).
 * - Fila com prioridade, coalescência e envelhecimento (ver priority-queue.js).
 * - Timeout por requisição, novas tentativas para escritas e detecção de
 *   queda de comunicação após N timeouts seguidos.
 *
 * Funções suportadas:
 *   FC01 Read Coils            (verificação das saídas do simulador)
 *   FC02 Read Discrete Inputs  (entradas do simulador = saídas do CLP)
 *   FC05 Write Single Coil     (saídas do simulador, modo "uma a uma")
 *   FC15 Write Multiple Coils  (saídas do simulador, modo "bloco")
 */
const net = require('net');
const EventEmitter = require('events');
const { PriorityQueue } = require('./priority-queue');

const EXCEPTIONS = {
  1: 'função ilegal',
  2: 'endereço de dado ilegal',
  3: 'valor de dado ilegal',
  4: 'falha no dispositivo servidor',
  5: 'reconhecimento (processando)',
  6: 'dispositivo ocupado',
  10: 'gateway: caminho indisponível',
  11: 'gateway: dispositivo não respondeu',
};

const FC_NAMES = { 1: 'FC01 ler coils', 2: 'FC02 ler entradas', 5: 'FC05 escrever coil', 15: 'FC15 escrever coils' };

function hex(buf) {
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join(' ');
}

class ModbusTcpClient extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.o = Object.assign({
      host: '127.0.0.1', port: 502, unitId: 1,
      timeoutMs: 1000, gapMs: 10, connectTimeoutMs: 3000,
      maxConsecutiveTimeouts: 3, agingMs: 1500,
    }, opts);
    this.queue = new PriorityQueue({ agingMs: this.o.agingMs });
    this.socket = null;
    this.connected = false;
    this.inflight = null;
    this.gapTimer = null;
    this.tid = 0;
    this.rx = Buffer.alloc(0);
    this.resetStats();
  }

  resetStats() {
    this.stats = {
      sent: 0, ok: 0, timeouts: 0, exceptions: 0, errors: 0, retries: 0,
      consecutiveTimeouts: 0, lastRtMs: 0, avgRtMs: 0, maxRtMs: 0,
      sentByPriority: [0, 0, 0, 0], since: Date.now(), window: [],
    };
  }

  /** Requisições por segundo nos últimos 5 s. */
  rate() {
    const now = Date.now();
    this.stats.window = this.stats.window.filter((t) => now - t < 5000);
    return this.stats.window.length / 5;
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (this.socket) { reject(new Error('Já existe uma conexão aberta')); return; }
      const s = net.createConnection({ host: this.o.host, port: this.o.port });
      this.socket = s;
      s.setNoDelay(true);
      let settled = false;
      const ct = setTimeout(() => {
        if (!settled) s.destroy(new Error(`Sem resposta de ${this.o.host}:${this.o.port} em ${this.o.connectTimeoutMs} ms`));
      }, this.o.connectTimeoutMs);

      s.once('connect', () => {
        settled = true; clearTimeout(ct);
        this.connected = true;
        this.stats.consecutiveTimeouts = 0;
        this.emit('connect');
        resolve();
        this._pump();
      });
      s.on('data', (d) => this._onData(d));
      s.on('error', (e) => {
        clearTimeout(ct);
        this.emit('error', e);
        if (!settled) { settled = true; reject(e); }
      });
      s.on('close', () => {
        clearTimeout(ct);
        const was = this.connected;
        this.connected = false;
        this.socket = null;
        this.rx = Buffer.alloc(0);
        if (this.gapTimer) { clearTimeout(this.gapTimer); this.gapTimer = null; }
        this._failAll(new Error('Conexão encerrada'));
        this.emit('close', was);
        if (!settled) { settled = true; reject(new Error('Conexão recusada ou encerrada')); }
      });
    });
  }

  close() {
    if (this.socket) { this.socket.destroy(); }
  }

  /**
   * Coloca uma requisição na fila.
   * r = { key, priority, fc, address, quantity?, getValues?() , getValue?(), retries? }
   * Os valores de escrita são obtidos no MOMENTO DO ENVIO (getValues/getValue),
   * por isso a coalescência nunca envia dado velho.
   */
  request(r) {
    const existing = r.key ? this.queue.find(r.key) : null;
    if (existing) {
      if (r.priority < existing.priority) existing.priority = r.priority;
      if (r.getValues) existing.getValues = r.getValues;
      if (r.getValue) existing.getValue = r.getValue;
      return existing.promise;
    }
    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    promise.catch(() => {});
    Object.assign(r, { resolve, reject, promise, attempts: 0 });
    if (!this.queue.push(r)) return promise;
    this._pump();
    return promise;
  }

  isQueued(key) { return !!this.queue.find(key) || (this.inflight && this.inflight.r.key === key); }

  _buildPdu(r) {
    const a = r.address & 0xffff;
    switch (r.fc) {
      case 1: case 2: {
        const b = Buffer.alloc(5);
        b[0] = r.fc; b.writeUInt16BE(a, 1); b.writeUInt16BE(r.quantity, 3);
        return b;
      }
      case 5: {
        const v = r.getValue ? r.getValue() : r.value;
        r.sentValue = !!v;
        const b = Buffer.alloc(5);
        b[0] = 5; b.writeUInt16BE(a, 1); b.writeUInt16BE(v ? 0xff00 : 0x0000, 3);
        return b;
      }
      case 15: {
        const vals = r.getValues ? r.getValues() : r.values;
        r.sentValues = vals.slice();
        const qty = vals.length;
        const nBytes = Math.ceil(qty / 8);
        const b = Buffer.alloc(6 + nBytes);
        b[0] = 15; b.writeUInt16BE(a, 1); b.writeUInt16BE(qty, 3); b[5] = nBytes;
        vals.forEach((v, i) => { if (v) b[6 + (i >> 3)] |= 1 << (i & 7); });
        return b;
      }
      default: throw new Error(`Função ${r.fc} não suportada`);
    }
  }

  _pump() {
    if (!this.connected || this.inflight || this.gapTimer) return;
    const r = this.queue.pop();
    if (!r) return;
    let pdu;
    try { pdu = this._buildPdu(r); } catch (e) { r.reject(e); this._next(); return; }
    this.tid = (this.tid + 1) & 0xffff;
    const mbap = Buffer.alloc(7);
    mbap.writeUInt16BE(this.tid, 0);
    mbap.writeUInt16BE(0, 2);
    mbap.writeUInt16BE(pdu.length + 1, 4);
    mbap[6] = this.o.unitId & 0xff;
    const frame = Buffer.concat([mbap, pdu]);
    const timer = setTimeout(() => this._onTimeout(), this.o.timeoutMs);
    this.inflight = { r, tid: this.tid, t0: Date.now(), timer };
    this.stats.sent++;
    this.stats.sentByPriority[Math.min(3, r.priority)]++;
    this.stats.window.push(Date.now());
    this.emit('frame', 'TX', frame, r);
    this.socket.write(frame);
  }

  _next() {
    this.inflight = null;
    if (this.o.gapMs > 0) {
      this.gapTimer = setTimeout(() => { this.gapTimer = null; this._pump(); }, this.o.gapMs);
    } else {
      setImmediate(() => this._pump());
    }
  }

  _onData(d) {
    this.rx = Buffer.concat([this.rx, d]);
    while (this.rx.length >= 7) {
      const len = this.rx.readUInt16BE(4);
      if (len < 2 || len > 254) {
        this.emit('error', new Error(`Frame inválido recebido (comprimento ${len}). Reiniciando conexão.`));
        this.close();
        return;
      }
      const total = 6 + len;
      if (this.rx.length < total) break;
      const frame = this.rx.subarray(0, total);
      this.rx = this.rx.subarray(total);
      this._onFrame(Buffer.from(frame));
    }
  }

  _onFrame(frame) {
    const tid = frame.readUInt16BE(0);
    this.emit('frame', 'RX', frame);
    if (!this.inflight || tid !== this.inflight.tid) {
      this.emit('warn', `Resposta fora de ordem/atrasada ignorada (TID ${tid})`);
      return;
    }
    const { r, t0, timer } = this.inflight;
    clearTimeout(timer);
    const rt = Date.now() - t0;
    this.stats.lastRtMs = rt;
    this.stats.maxRtMs = Math.max(this.stats.maxRtMs, rt);
    this.stats.avgRtMs = this.stats.avgRtMs ? this.stats.avgRtMs * 0.9 + rt * 0.1 : rt;
    this.stats.consecutiveTimeouts = 0;

    const pdu = frame.subarray(7);
    const fc = pdu[0];
    try {
      if (fc & 0x80) {
        const code = pdu[1];
        this.stats.exceptions++;
        throw new Error(`Exceção Modbus ${code} (${EXCEPTIONS[code] || 'desconhecida'}) em ${FC_NAMES[r.fc] || 'FC' + r.fc} endereço ${r.address}`);
      }
      if (fc !== r.fc) throw new Error(`Função na resposta (${fc}) diferente da enviada (${r.fc})`);
      let result;
      if (fc === 1 || fc === 2) {
        const n = pdu[1];
        if (pdu.length < 2 + n) throw new Error('Resposta truncada');
        result = [];
        for (let i = 0; i < r.quantity; i++) result.push(((pdu[2 + (i >> 3)] >> (i & 7)) & 1) === 1);
      } else if (fc === 5) {
        result = r.sentValue;
      } else if (fc === 15) {
        result = r.sentValues;
      }
      this.stats.ok++;
      r.resolve(result);
    } catch (e) {
      if (!(fc & 0x80)) this.stats.errors++;
      r.reject(e);
      this.emit('requestError', e, r);
    }
    this._next();
  }

  _onTimeout() {
    if (!this.inflight) return;
    const { r } = this.inflight;
    this.stats.timeouts++;
    this.stats.consecutiveTimeouts++;
    this.inflight = null;
    const isWrite = r.fc === 5 || r.fc === 15;
    if (isWrite && r.attempts < (r.retries ?? 2)) {
      r.attempts++;
      this.stats.retries++;
      r.enqueuedAt = Date.now();
      this.queue.push(r);
    } else {
      const e = new Error(`Timeout (${this.o.timeoutMs} ms) em ${FC_NAMES[r.fc] || 'FC' + r.fc} endereço ${r.address}`);
      r.reject(e);
      this.emit('requestError', e, r);
    }
    if (this.stats.consecutiveTimeouts >= this.o.maxConsecutiveTimeouts) {
      this.emit('error', new Error(`${this.stats.consecutiveTimeouts} timeouts seguidos — CLP não está respondendo. Encerrando a conexão.`));
      this.close();
      return;
    }
    this._next();
  }

  _failAll(err) {
    if (this.inflight) {
      clearTimeout(this.inflight.timer);
      this.inflight.r.reject(err);
      this.inflight = null;
    }
    this.queue.clear(err);
  }
}

module.exports = { ModbusTcpClient, hex, FC_NAMES };
