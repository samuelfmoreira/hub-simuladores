/**
 * =====================================================================
 *  CLIENTE MODBUS TCP (mestre) — usado pela IHM virtual do painel
 * =====================================================================
 *  A IHM do painel QC-01 é o CLIENTE; o CLP do aluno é o SERVIDOR.
 *  Uma transação por vez (como a maioria das IHMs), com timeout,
 *  reconexão automática e estatísticas para diagnóstico.
 *
 *  Funções: 01 Read Coils · 02 Read Discrete Inputs
 *           03 Read Holding Registers · 04 Read Input Registers
 *           05 Write Single Coil · 06 Write Single Register
 *           16 Write Multiple Registers
 * =====================================================================
 */
'use strict';

const net = require('net');
const { EventEmitter } = require('events');

const EXCECOES = {
  1: 'função ilegal', 2: 'endereço de dado ilegal', 3: 'valor de dado ilegal', 4: 'falha no servidor',
  5: 'reconhecimento (ocupado)', 6: 'servidor ocupado', 10: 'gateway: caminho indisponível', 11: 'gateway: sem resposta',
};
const NOMES_FC = { 1: 'Read Coils', 2: 'Read Discrete Inputs', 3: 'Read Holding Registers', 4: 'Read Input Registers',
  5: 'Write Single Coil', 6: 'Write Single Register', 15: 'Write Multiple Coils', 16: 'Write Multiple Registers' };

class ErroModbus extends Error {
  constructor(msg, tipo, codigo) { super(msg); this.tipo = tipo; this.codigo = codigo; }
}

class ClienteModbus extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.host = opts.host || '127.0.0.1';
    this.porta = opts.porta || 502;
    this.unitId = opts.unitId ?? 1;
    this.timeout = opts.timeout || 1000;
    this.sock = null;
    this.conectado = false;
    this.conectando = false;
    this.tid = 0;
    this.fila = [];
    this.atual = null;
    this.acum = Buffer.alloc(0);
    this.stats = { tx: 0, rx: 0, timeouts: 0, excecoes: 0, erros: 0, tResp: 0, tRespMax: 0, conexoes: 0 };
  }

  conectar() {
    if (this.conectado || this.conectando) return;
    this.conectando = true;
    const s = net.connect({ host: this.host, port: this.porta });
    this.sock = s;
    s.setNoDelay(true);
    const tCon = setTimeout(() => { s.destroy(new Error(`sem resposta de ${this.host}:${this.porta} (timeout de conexão)`)); }, 3000);
    s.on('connect', () => {
      clearTimeout(tCon);
      this.conectando = false; this.conectado = true; this.stats.conexoes++;
      this.emit('conectado');
      this.proxima();
    });
    s.on('data', (d) => this.receber(d));
    s.on('error', (e) => {
      clearTimeout(tCon);
      const m = e.code === 'ECONNREFUSED' ? `conexão recusada por ${this.host}:${this.porta} (o servidor Modbus do CLP está ativo?)`
        : e.code === 'EHOSTUNREACH' || e.code === 'ENETUNREACH' ? `rede inalcançável para ${this.host}` : e.message;
      this.emit('erroConexao', m);
    });
    s.on('close', () => {
      clearTimeout(tCon);
      const estava = this.conectado;
      this.conectado = false; this.conectando = false; this.sock = null; this.acum = Buffer.alloc(0);
      if (this.atual) { clearTimeout(this.atual.tmr); this.atual.rej(new ErroModbus('conexão encerrada', 'conexao')); this.atual = null; }
      for (const q of this.fila.splice(0)) q.rej(new ErroModbus('conexão encerrada', 'conexao'));
      if (estava) this.emit('desconectado');
    });
  }

  fechar() {
    for (const q of this.fila.splice(0)) q.rej(new ErroModbus('cliente parado', 'conexao'));
    if (this.sock) { this.sock.destroy(); this.sock = null; }
    this.conectado = false; this.conectando = false;
  }

  // ------------------------------------------------------------------
  pedir(pdu) {
    return new Promise((res, rej) => {
      if (!this.conectado) { rej(new ErroModbus('não conectado', 'conexao')); return; }
      this.fila.push({ pdu, res, rej });
      this.proxima();
    });
  }

  proxima() {
    if (this.atual || !this.conectado || !this.fila.length) return;
    const q = this.fila.shift();
    this.tid = (this.tid + 1) & 0xFFFF;
    const h = Buffer.alloc(7);
    h.writeUInt16BE(this.tid, 0); h.writeUInt16BE(0, 2); h.writeUInt16BE(q.pdu.length + 1, 4); h[6] = this.unitId & 0xFF;
    const adu = Buffer.concat([h, q.pdu]);
    q.tid = this.tid; q.t0 = process.hrtime.bigint();
    q.tmr = setTimeout(() => {
      if (this.atual !== q) return;
      this.atual = null; this.stats.timeouts++;
      this.emit('quadro', { dir: 'erro', fc: q.pdu[0], txt: `timeout (${this.timeout} ms) TID ${q.tid}` });
      q.rej(new ErroModbus(`sem resposta em ${this.timeout} ms`, 'timeout'));
      this.proxima();
    }, this.timeout);
    this.atual = q;
    this.stats.tx++;
    this.emit('quadro', { dir: 'tx', fc: q.pdu[0], hex: adu.toString('hex') });
    this.sock.write(adu);
  }

  receber(d) {
    this.acum = Buffer.concat([this.acum, d]);
    while (this.acum.length >= 8) {
      const len = this.acum.readUInt16BE(4);
      if (len < 2 || len > 260) { this.stats.erros++; this.acum = Buffer.alloc(0); this.sock?.destroy(); return; }
      if (this.acum.length < 6 + len) return;
      const adu = this.acum.subarray(0, 6 + len);
      this.acum = this.acum.subarray(6 + len);
      const tid = adu.readUInt16BE(0);
      const q = this.atual;
      if (!q || q.tid !== tid) continue;          // resposta atrasada de uma transação já expirada
      clearTimeout(q.tmr); this.atual = null;
      const ms = Number(process.hrtime.bigint() - q.t0) / 1e6;
      this.stats.rx++; this.stats.tResp = this.stats.tResp ? this.stats.tResp * 0.9 + ms * 0.1 : ms;
      this.stats.tRespMax = Math.max(this.stats.tRespMax, ms);
      const pdu = adu.subarray(7);
      this.emit('quadro', { dir: 'rx', fc: pdu[0], hex: adu.toString('hex'), ms });
      if (pdu[0] & 0x80) {
        this.stats.excecoes++;
        const c = pdu[1];
        q.rej(new ErroModbus(`exceção ${c} – ${EXCECOES[c] || 'desconhecida'} (${NOMES_FC[pdu[0] & 0x7F] || 'FC ' + (pdu[0] & 0x7F)})`, 'excecao', c));
      } else q.res(pdu);
      this.proxima();
    }
  }

  // ------------------------------------------------------------------
  async lerBits(fc, ini, qt) {
    const p = Buffer.from([fc, ini >> 8, ini & 255, qt >> 8, qt & 255]);
    const r = await this.pedir(p);
    const out = [];
    for (let i = 0; i < qt; i++) out.push(((r[2 + (i >> 3)] >> (i & 7)) & 1) === 1);
    return out;
  }

  async lerRegs(fc, ini, qt) {
    const p = Buffer.from([fc, ini >> 8, ini & 255, qt >> 8, qt & 255]);
    const r = await this.pedir(p);
    if (r[1] !== qt * 2) throw new ErroModbus(`resposta com ${r[1]} bytes (esperado ${qt * 2})`, 'protocolo');
    const out = [];
    for (let i = 0; i < qt; i++) out.push(r.readUInt16BE(2 + i * 2));
    return out;
  }

  escreverBit(end, v) {
    return this.pedir(Buffer.from([5, end >> 8, end & 255, v ? 0xFF : 0, 0]));
  }

  escreverReg(end, v) {
    return this.pedir(Buffer.from([6, end >> 8, end & 255, (v >> 8) & 255, v & 255]));
  }

  escreverRegs(end, vals) {
    const b = Buffer.alloc(6 + vals.length * 2);
    b[0] = 16; b.writeUInt16BE(end, 1); b.writeUInt16BE(vals.length, 3); b[5] = vals.length * 2;
    vals.forEach((v, i) => b.writeUInt16BE(v & 0xFFFF, 6 + i * 2));
    return this.pedir(b);
  }
}

module.exports = { ClienteModbus, ErroModbus, NOMES_FC };
