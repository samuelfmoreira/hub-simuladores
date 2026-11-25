'use strict';
/**
 * Cliente Modbus TCP (o simulador é o CLIENTE, o CLP é o SERVIDOR). Sem dependências, sobre o módulo `net`.
 *
 * Feito para vários alunos ao mesmo tempo, cada um com o seu CLP, sem sobrecarregar ninguém:
 *  - uma única transação em andamento por vez (o CLP nunca recebe rajadas);
 *  - intervalo mínimo entre frames (gapMs);
 *  - fila com prioridade, coalescência (mesma "key" não acumula) e envelhecimento (priority-queue.js);
 *  - os valores de escrita são lidos no MOMENTO DO ENVIO (getValues), então nunca vai dado velho;
 *  - timeout por requisição, novas tentativas só para escritas, e queda declarada após N timeouts seguidos.
 *
 * Funções: FC01/FC02 (ler bits), FC03/FC04 (ler registradores), FC05/FC15 (escrever bits), FC06/FC16 (escrever registradores).
 */
const net = require('net');
const EventEmitter = require('events');
const { PriorityQueue } = require('./priority-queue');

const EXCECOES = { 1: 'função ilegal', 2: 'endereço de dado ilegal', 3: 'valor de dado ilegal', 4: 'falha no dispositivo servidor', 6: 'dispositivo ocupado' };
const NOME_FC = { 1: 'FC01 ler coils', 2: 'FC02 ler discrete inputs', 3: 'FC03 ler holding registers', 4: 'FC04 ler input registers', 5: 'FC05 escrever coil', 6: 'FC06 escrever registrador', 15: 'FC15 escrever coils', 16: 'FC16 escrever registradores' };
const ESCRITA = new Set([5, 6, 15, 16]);
const u16 = (v) => { const x = Math.max(-32768, Math.min(65535, Math.round(Number(v) || 0))); return x < 0 ? x + 65536 : x; };

class ClienteModbus extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.o = Object.assign({ host: '192.168.100.10', port: 502, unitId: 1, timeoutMs: 1000, gapMs: 10, connectTimeoutMs: 3000, maxTimeoutsSeguidos: 3, agingMs: 1500 }, opts);
    this.fila = new PriorityQueue({ agingMs: this.o.agingMs, maxSize: 50 });
    this.socket = null; this.conectado = false; this.emVoo = null; this.gapTimer = null; this.tid = 0; this.rx = Buffer.alloc(0);
    this.zerarEstatisticas();
  }

  zerarEstatisticas() {
    this.est = { enviadas: 0, ok: 0, timeouts: 0, excecoes: 0, erros: 0, retentativas: 0, timeoutsSeguidos: 0, rtUltimo: 0, rtMedio: 0, rtMax: 0, porPrioridade: [0, 0, 0, 0], janela: [] };
  }
  /** Requisições por segundo nos últimos 5 s. */
  taxa() { const agora = Date.now(); this.est.janela = this.est.janela.filter((t) => agora - t < 5000); return this.est.janela.length / 5; }

  conectar() {
    return new Promise((resolve, reject) => {
      if (this.socket) { reject(new Error('já existe uma conexão aberta')); return; }
      const s = net.createConnection({ host: this.o.host, port: this.o.port });
      this.socket = s; s.setNoDelay(true);
      let decidido = false;
      const ct = setTimeout(() => { if (!decidido) s.destroy(new Error(`sem resposta de ${this.o.host}:${this.o.port} em ${this.o.connectTimeoutMs} ms`)); }, this.o.connectTimeoutMs);
      s.once('connect', () => { decidido = true; clearTimeout(ct); this.conectado = true; this.est.timeoutsSeguidos = 0; this.emit('conectou'); resolve(); this._bombear(); });
      s.on('data', (d) => this._aoReceber(d));
      s.on('error', (e) => { clearTimeout(ct); this.emit('erro', e); if (!decidido) { decidido = true; reject(e); } });
      s.on('close', () => {
        clearTimeout(ct);
        const estava = this.conectado;
        this.conectado = false; this.socket = null; this.rx = Buffer.alloc(0);
        if (this.gapTimer) { clearTimeout(this.gapTimer); this.gapTimer = null; }
        this._falharTudo(new Error('conexão encerrada'));
        this.emit('fechou', estava);
        if (!decidido) { decidido = true; reject(new Error('conexão recusada ou encerrada')); }
      });
    });
  }
  fechar() { if (this.socket) this.socket.destroy(); }

  /**
   * Coloca uma requisição na fila.
   * r = { key, priority, fc, address, quantity? (leituras), getValues?() (escritas), retries? }
   */
  pedir(r) {
    const igual = r.key ? this.fila.find(r.key) : null;
    if (igual) {                                   // coalescência: funde na que já espera
      if (r.priority < igual.priority) igual.priority = r.priority;
      if (r.getValues) igual.getValues = r.getValues;
      return igual.promise;
    }
    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    promise.catch(() => {});
    Object.assign(r, { resolve, reject, promise, attempts: 0 });
    if (!this.fila.push(r)) return promise;
    this._bombear();
    return promise;
  }
  naFila(key) { return !!this.fila.find(key) || !!(this.emVoo && this.emVoo.r.key === key); }

  _montar(r) {
    const a = r.address & 0xffff;
    if (r.fc >= 1 && r.fc <= 4) { const b = Buffer.alloc(5); b[0] = r.fc; b.writeUInt16BE(a, 1); b.writeUInt16BE(r.quantity, 3); return b; }
    const vals = r.getValues ? r.getValues() : r.values;
    r.enviados = vals.slice();
    if (r.fc === 5) { const b = Buffer.alloc(5); b[0] = 5; b.writeUInt16BE(a, 1); b.writeUInt16BE(vals[0] ? 0xff00 : 0, 3); return b; }
    if (r.fc === 6) { const b = Buffer.alloc(5); b[0] = 6; b.writeUInt16BE(a, 1); b.writeUInt16BE(u16(vals[0]), 3); return b; }
    if (r.fc === 15) {
      const nb = Math.ceil(vals.length / 8), b = Buffer.alloc(6 + nb);
      b[0] = 15; b.writeUInt16BE(a, 1); b.writeUInt16BE(vals.length, 3); b[5] = nb;
      vals.forEach((v, i) => { if (v) b[6 + (i >> 3)] |= 1 << (i & 7); });
      return b;
    }
    if (r.fc === 16) {
      const b = Buffer.alloc(6 + vals.length * 2);
      b[0] = 16; b.writeUInt16BE(a, 1); b.writeUInt16BE(vals.length, 3); b[5] = vals.length * 2;
      vals.forEach((v, i) => b.writeUInt16BE(u16(v), 6 + i * 2));
      return b;
    }
    throw new Error(`função ${r.fc} não suportada`);
  }

  _bombear() {
    if (!this.conectado || this.emVoo || this.gapTimer) return;
    const r = this.fila.pop();
    if (!r) return;
    let pdu;
    try { pdu = this._montar(r); } catch (e) { r.reject(e); this._proxima(); return; }
    this.tid = (this.tid + 1) & 0xffff;
    const mbap = Buffer.alloc(7);
    mbap.writeUInt16BE(this.tid, 0); mbap.writeUInt16BE(0, 2); mbap.writeUInt16BE(pdu.length + 1, 4); mbap[6] = this.o.unitId & 0xff;
    const timer = setTimeout(() => this._aoEstourar(), this.o.timeoutMs);
    this.emVoo = { r, tid: this.tid, t0: Date.now(), timer };
    this.est.enviadas++; this.est.porPrioridade[Math.min(3, r.priority)]++; this.est.janela.push(Date.now());
    this.socket.write(Buffer.concat([mbap, pdu]));
  }
  _proxima() {
    this.emVoo = null;
    if (this.o.gapMs > 0) this.gapTimer = setTimeout(() => { this.gapTimer = null; this._bombear(); }, this.o.gapMs);
    else setImmediate(() => this._bombear());
  }

  _aoReceber(d) {
    this.rx = Buffer.concat([this.rx, d]);
    while (this.rx.length >= 7) {
      const len = this.rx.readUInt16BE(4);
      if (len < 2 || len > 254) { this.emit('erro', new Error(`frame inválido recebido (comprimento ${len}); reiniciando a conexão`)); this.fechar(); return; }
      if (this.rx.length < 6 + len) break;
      const frame = Buffer.from(this.rx.subarray(0, 6 + len)); this.rx = this.rx.subarray(6 + len);
      this._aoFrame(frame);
    }
  }
  _aoFrame(frame) {
    const tid = frame.readUInt16BE(0);
    if (!this.emVoo || tid !== this.emVoo.tid) return;                 // resposta atrasada: ignora
    const { r, t0, timer } = this.emVoo;
    clearTimeout(timer);
    const rt = Date.now() - t0, e = this.est;
    e.rtUltimo = rt; e.rtMax = Math.max(e.rtMax, rt); e.rtMedio = e.rtMedio ? e.rtMedio * 0.9 + rt * 0.1 : rt; e.timeoutsSeguidos = 0;
    const pdu = frame.subarray(7), fc = pdu[0];
    try {
      if (fc & 0x80) { e.excecoes++; throw new Error(`exceção Modbus ${pdu[1]} (${EXCECOES[pdu[1]] || 'desconhecida'}) em ${NOME_FC[r.fc] || 'FC' + r.fc}, endereço ${r.address}`); }
      if (fc !== r.fc) throw new Error(`função na resposta (${fc}) diferente da enviada (${r.fc})`);
      let res;
      if (fc === 1 || fc === 2) { if (pdu.length < 2 + pdu[1]) throw new Error('resposta truncada'); res = []; for (let i = 0; i < r.quantity; i++) res.push(((pdu[2 + (i >> 3)] >> (i & 7)) & 1) === 1); }
      else if (fc === 3 || fc === 4) { if (pdu.length < 2 + r.quantity * 2) throw new Error('resposta truncada'); res = []; for (let i = 0; i < r.quantity; i++) res.push(pdu.readInt16BE(2 + i * 2)); }
      else res = r.enviados;
      e.ok++; r.resolve(res);
    } catch (err) { if (!(fc & 0x80)) e.erros++; r.reject(err); this.emit('pedidoFalhou', err, r); }
    this._proxima();
  }
  _aoEstourar() {
    if (!this.emVoo) return;
    const { r } = this.emVoo, e = this.est;
    e.timeouts++; e.timeoutsSeguidos++; this.emVoo = null;
    if (ESCRITA.has(r.fc) && r.attempts < (r.retries ?? 2)) { r.attempts++; e.retentativas++; r.enqueuedAt = Date.now(); this.fila.push(r); }
    else { const err = new Error(`timeout (${this.o.timeoutMs} ms) em ${NOME_FC[r.fc] || 'FC' + r.fc}, endereço ${r.address}`); r.reject(err); this.emit('pedidoFalhou', err, r); }
    if (e.timeoutsSeguidos >= this.o.maxTimeoutsSeguidos) { this.emit('erro', new Error(`${e.timeoutsSeguidos} timeouts seguidos: o CLP não está respondendo`)); this.fechar(); return; }
    this._proxima();
  }
  _falharTudo(err) {
    if (this.emVoo) { clearTimeout(this.emVoo.timer); this.emVoo.r.reject(err); this.emVoo = null; }
    this.fila.clear(err);
  }
}

module.exports = { ClienteModbus, NOME_FC };
