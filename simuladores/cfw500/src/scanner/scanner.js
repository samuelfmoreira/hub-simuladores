/**
 * =====================================================================
 *  SCANNER (ORIGINATOR) EtherNet/IP mínimo — "CLP virtual"
 * =====================================================================
 *  Faz o papel do CLP: abre sessão, lê/escreve parâmetros por mensagem
 *  explícita (classe A2h) e abre a conexão de I/O (Forward Open) com o
 *  CFW500, trocando dados cíclicos pela UDP.
 *
 *  Útil para: testar o simulador sem CLP físico e para estudar, passo a
 *  passo, o que um scanner real (Studio 5000, CODESYS...) faz por baixo.
 * =====================================================================
 */
'use strict';

const net = require('net');
const dgram = require('dgram');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const C = require('../eip/cip');

const { Escritor, CPF, ENCAP } = C;

class ScannerEIP extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.host = opts.host || '127.0.0.1';
    this.porta = opts.porta || 44818;
    this.portaIOAlvo = opts.portaIOAlvo || 2222;
    this.portaIOLocal = opts.portaIOLocal || 2223; // porta local para receber T→O (≠ 2222 quando no mesmo PC)
    this.sessao = 0;
    this.ctx = 0;
    this.pend = new Map();
    this.saidas = [0, 0];
    this.entradas = [];
    this.run = true;
    this.conn = null;
  }

  // ------------------------------------------------------------------
  conectar() {
    return new Promise((res, rej) => {
      this.sock = net.connect(this.porta, this.host, async () => {
        try {
          const r = await this.encap(ENCAP.REGISTER_SESSION, new Escritor().u16(1).u16(0).fim());
          if (r.status) throw new Error(`RegisterSession recusado (0x${r.status.toString(16)})`);
          this.sessao = r.sessao;
          res(this.sessao);
        } catch (e) { rej(e); }
      });
      this.sock.on('error', (e) => { rej(e); this.emit('erro', e.message); });
      let acum = Buffer.alloc(0);
      this.sock.on('data', (d) => {
        acum = Buffer.concat([acum, d]);
        while (acum.length >= 24) {
          const len = acum.readUInt16LE(2);
          if (acum.length < 24 + len) break;
          const q = acum.subarray(0, 24 + len); acum = acum.subarray(24 + len);
          const id = q.readUInt32LE(12);
          const p = this.pend.get(id);
          if (p) { this.pend.delete(id); clearTimeout(p.t); p.res({ cmd: q.readUInt16LE(0), sessao: q.readUInt32LE(4), status: q.readUInt32LE(8), dados: q.subarray(24) }); }
        }
      });
      this.sock.on('close', () => { this.emit('desconectado'); for (const p of this.pend.values()) p.rej(new Error('conexão TCP encerrada')); this.pend.clear(); });
    });
  }

  encap(cmd, dados) {
    return new Promise((res, rej) => {
      const id = ++this.ctx;
      const h = new Escritor().u16(cmd).u16(dados.length).u32(this.sessao).u32(0).u32(id).u32(0).u32(0).fim();
      const t = setTimeout(() => { this.pend.delete(id); rej(new Error('timeout de resposta')); }, 3000);
      this.pend.set(id, { res, rej, t });
      this.sock.write(Buffer.concat([h, dados]));
    });
  }

  /** Mensagem explícita não conectada (SendRRData). Retorna {status, ext, dados, itens} */
  async mensagem(svc, path, dados = Buffer.alloc(0), extras = []) {
    const mr = Buffer.concat([Buffer.from([svc, path.length / 2]), path, dados]);
    const cpf = C.montarCPF([{ tipo: CPF.NULL, dados: Buffer.alloc(0) }, { tipo: CPF.UNCONNECTED_DATA, dados: mr }, ...extras]);
    const r = await this.encap(ENCAP.SEND_RR_DATA, Buffer.concat([new Escritor().u32(0).u16(10).fim(), cpf]));
    if (r.status) throw new Error(`erro de encapsulamento 0x${r.status.toString(16)}`);
    const itens = C.lerCPF(r.dados, 6);
    const ud = itens.find((i) => i.tipo === CPF.UNCONNECTED_DATA).dados;
    const nExt = ud[3];
    const ext = []; for (let i = 0; i < nExt; i++) ext.push(ud.readUInt16LE(4 + i * 2));
    return { svc: ud[0], status: ud[2], ext, dados: ud.subarray(4 + nExt * 2), itens };
  }

  getAttr(cl, inst, attr) { return this.mensagem(0x0E, C.pathLogico(cl, inst, attr)); }
  setAttr(cl, inst, attr, buf) { return this.mensagem(0x10, C.pathLogico(cl, inst, attr), buf); }

  /** Lê parâmetro do CFW500: classe A2h, instância = nº, atributo 5 */
  async lerParam(n) {
    const r = await this.getAttr(0xA2, n, 5);
    if (r.status) throw Object.assign(new Error(`P${n}: erro CIP 0x${r.status.toString(16)}`), { status: r.status });
    return r.dados.readUInt16LE(0);
  }
  async escreverParam(n, v) {
    const r = await this.setAttr(0xA2, n, 5, new Escritor().u16(v & 0xFFFF).fim());
    if (r.status) throw Object.assign(new Error(`P${n}: erro CIP 0x${r.status.toString(16)}`), { status: r.status });
  }

  async identidade() {
    const r = await this.mensagem(0x01, C.pathLogico(0x01, 1));
    const d = r.dados;
    return { vendor: d.readUInt16LE(0), tipo: d.readUInt16LE(2), produto: d.readUInt16LE(4), rev: `${d[6]}.${d[7]}`, status: d.readUInt16LE(8), serie: d.readUInt32LE(10).toString(16), nome: d.subarray(15, 15 + d[14]).toString() };
  }

  // ------------------------------------------------------------------
  //  CONEXÃO DE I/O
  // ------------------------------------------------------------------
  /**
   * Abre conexão Exclusive Owner (ou Listen Only com pontoOT=199).
   * palavrasSaida/palavrasEntrada = nº de palavras de 16 bits de DADOS (sem cabeçalhos).
   */
  async forwardOpen(o = {}) {
    const pontoOT = o.pontoOT || 100; const pontoTO = o.pontoTO || 150;
    const nS = o.palavrasSaida ?? 2; const nE = o.palavrasEntrada ?? 2;
    const rpi = (o.rpi || 10) * 1000;
    const multicast = !!o.multicast;
    const owner = pontoOT !== 199 && pontoOT !== 198;
    const tamOT = owner ? 2 + 4 + nS * 2 : 2;            // seq (2) + Run/Idle (4) + dados
    const tamTO = 2 + nE * 2;                          // seq (2) + dados
    this.serial = crypto.randomBytes(2).readUInt16LE(0);
    this.origSerial = 0x5C5C0000 | (crypto.randomBytes(2).readUInt16LE(0));
    const idTO = crypto.randomBytes(4).readUInt32LE(0);
    const np = (tam, tipo) => (tam & 0x1FF) | (2 << 10) | (tipo << 13);  // fixo, prioridade "scheduled"
    const chave = o.chave === false ? Buffer.alloc(0)
      : new Escritor().u8(0x34).u8(0x04).u16(853).u16(43).u16(6656).u8(0x80 | 1).u8(o.revMenor ?? 10).fim();
    const path = Buffer.concat([chave, Buffer.from([0x20, 0x04, 0x24, 0x01, 0x2C, pontoOT, 0x2C, pontoTO])]);
    const req = new Escritor()
      .u8(0x0A).u8(0x0E)                         // prioridade/tick, timeout ticks
      .u32(0).u32(idTO)                          // O→T id (alvo escolhe), T→O id (nós escolhemos se p2p)
      .u16(this.serial).u16(0x1337).u32(this.origSerial)
      .u8(o.multiplicador ?? 2).zeros(3)         // timeout = RPI x 16
      .u32(rpi).u16(np(tamOT, 2))
      .u32(rpi).u16(np(tamTO, multicast ? 1 : 2))
      .u8(0x01)                                  // cíclico, classe 1
      .u8(path.length / 2).buf(path).fim();
    const extras = multicast ? [] : [{ tipo: CPF.SOCKADDR_TO, dados: C.sockaddr('0.0.0.0', this.portaIOLocal) }];
    const r = await this.mensagem(0x54, Buffer.from([0x20, 0x06, 0x24, 0x01]), req, extras);
    if (r.status) {
      const e = new Error(`Forward Open recusado: status 0x${r.status.toString(16)} ext ${r.ext.map((x) => '0x' + x.toString(16).padStart(4, '0')).join(' ')} — ${C.EXT_NOME[r.ext[0]] || ''}`);
      e.status = r.status; e.ext = r.ext; throw e;
    }
    const d = r.dados;
    this.conn = {
      idOT: d.readUInt32LE(0), idTO: d.readUInt32LE(4), apiOT: d.readUInt32LE(16), apiTO: d.readUInt32LE(20),
      owner, nS, nE, rpi: rpi / 1000, seq: 0, encSeq: 0, ultimoRx: Date.now(), rx: 0, tx: 0,
    };
    const sa = r.itens.find((i) => i.tipo === CPF.SOCKADDR_TO);
    this.conn.grupo = sa ? C.lerSockaddr(sa.dados).ip : null;
    this.saidas = Array(nS).fill(0);
    await this.iniciarUDP();
    return this.conn;
  }

  iniciarUDP() {
    return new Promise((res) => {
      this.udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.udp.on('message', (m) => this.recebeTO(m));
      this.udp.on('error', (e) => this.emit('erro', 'UDP: ' + e.message));
      const porta = this.conn.grupo ? this.portaIOAlvo : this.portaIOLocal;
      this.udp.bind(porta, () => {
        if (this.conn.grupo) { try { this.udp.addMembership(this.conn.grupo); } catch (e) { this.emit('erro', 'multicast: ' + e.message); } }
        this.tmrOT = setInterval(() => this.enviaOT(), this.conn.apiOT / 1000);
        this.tmrWd = setInterval(() => {
          if (this.conn && Date.now() - this.conn.ultimoRx > Math.max(100, this.conn.rpi * 16)) this.emit('timeout');
        }, 50);
        res();
      });
    });
  }

  enviaOT() {
    const c = this.conn; if (!c) return;
    c.encSeq = (c.encSeq + 1) >>> 0; c.seq = (c.seq + 1) & 0xFFFF;
    const w = new Escritor().u16(c.seq);
    if (c.owner) { w.u32(this.run ? 1 : 0); this.saidas.forEach((v) => w.u16(v)); }
    const pkt = C.montarCPF([
      { tipo: CPF.SEQUENCED_ADDR, dados: new Escritor().u32(c.idOT).u32(c.encSeq).fim() },
      { tipo: CPF.CONNECTED_DATA, dados: w.fim() },
    ]);
    this.udp.send(pkt, this.portaIOAlvo, this.host);
    c.tx++;
  }

  recebeTO(m) {
    const itens = C.lerCPF(m, 0); if (!itens) return;
    const sa = itens.find((i) => i.tipo === CPF.SEQUENCED_ADDR);
    const cd = itens.find((i) => i.tipo === CPF.CONNECTED_DATA);
    if (!sa || !cd || !this.conn || sa.dados.readUInt32LE(0) !== this.conn.idTO) return;
    const d = cd.dados.subarray(2);
    this.entradas = [...Array(d.length >> 1)].map((_, i) => d.readUInt16LE(i * 2));
    this.conn.ultimoRx = Date.now(); this.conn.rx++;
    this.emit('entradas', this.entradas);
  }

  async forwardClose() {
    if (!this.conn) return;
    clearInterval(this.tmrOT); clearInterval(this.tmrWd);
    const path = Buffer.from([0x20, 0x04, 0x24, 0x01, 0x2C, 100, 0x2C, 150]);
    const req = new Escritor().u8(0x0A).u8(0x0E).u16(this.serial).u16(0x1337).u32(this.origSerial).u8(path.length / 2).u8(0).buf(path).fim();
    try { await this.mensagem(0x4E, Buffer.from([0x20, 0x06, 0x24, 0x01]), req); } catch { /* */ }
    try { this.udp.close(); } catch { /* */ }
    this.conn = null;
  }

  /** Para de enviar O→T sem Forward Close (simula cabo rompido / CLP desligado) */
  pararIO() { clearInterval(this.tmrOT); clearInterval(this.tmrWd); try { this.udp.close(); } catch { /* */ } this.conn = null; }

  async fechar() {
    await this.forwardClose();
    if (this.sock) { try { await this.encap(ENCAP.UNREGISTER_SESSION, Buffer.alloc(0)).catch(() => {}); } catch { /* */ } this.sock.destroy(); }
  }

  /** ListIdentity por UDP (como o "browse" do RSLinx/CODESYS) */
  static listIdentity(host = '255.255.255.255', porta = 44818, espera = 800) {
    return new Promise((res) => {
      const s = dgram.createSocket('udp4');
      const achados = [];
      s.on('message', (m, ri) => {
        const itens = C.lerCPF(m, 24); if (!itens || !itens.length) return;
        const d = itens[0].dados;
        const sa = C.lerSockaddr(d.subarray(2, 18));
        achados.push({ de: ri.address, ip: sa.ip, porta: sa.porta, vendor: d.readUInt16LE(18), tipo: d.readUInt16LE(20), produto: d.readUInt16LE(22),
          rev: `${d[24]}.${d[25]}`, status: d.readUInt16LE(26), serie: d.readUInt32LE(28).toString(16), nome: d.subarray(33, 33 + d[32]).toString(), estado: d[33 + d[32]] });
      });
      s.bind(() => {
        s.setBroadcast(true);
        const q = new Escritor().u16(ENCAP.LIST_IDENTITY).u16(0).u32(0).u32(0).u32(0).u32(0).u32(0).fim();
        s.send(q, porta, host);
        setTimeout(() => { s.close(); res(achados); }, espera);
      });
    });
  }
}

module.exports = { ScannerEIP };
