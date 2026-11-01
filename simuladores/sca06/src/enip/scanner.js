/* =============================================================================
 *  SCANNER DIDÁTICO (mestre / "originator") — usado pelo painel web.
 *  Fala com o adapter por pacotes EtherNet/IP REAIS (TCP 44818 + UDP), igual a um CLP.
 *  Se um CLP de verdade já for o "Exclusive Owner", este scanner recebe o erro 0x0106
 *  (conflito de propriedade) — exatamente o que aconteceria na planta.
 * ===========================================================================*/
'use strict';
const net = require('net');
const dgram = require('dgram');
const crypto = require('crypto');
const EventEmitter = require('events');
const C = require('./cip');
const { CMD, ITEM, SVC } = C;

class VirtualScanner extends EventEmitter {
  constructor() {
    super();
    this.state = 'offline';           // offline | session | io
    this.session = 0; this.pending = []; this.acc = Buffer.alloc(0);
    this.out = []; this.run = true; this.inputs = []; this.io = null;
    this.vendor = 0xFFFE; this.serial = crypto.randomBytes(4).readUInt32LE(0);
  }
  log(dir, proto, summary, buf) { this.emit('log', { t: Date.now(), dir, proto, summary, hex: buf ? C.hex(buf) : '', len: buf ? buf.length : 0, side: 'scanner' }); }

  async connect(host = '127.0.0.1', port = 44818) {
    if (this.sock) this.disconnect();
    this.host = host;
    await new Promise((res, rej) => {
      this.sock = net.connect(port, host, res);
      this.sock.once('error', rej);
      this.sock.setNoDelay(true);
      this.sock.on('data', (d) => this.onData(d));
      this.sock.on('close', () => { this.cleanupIo(); this.state = 'offline'; this.session = 0; this.emit('state'); this.pending.forEach(p => p.rej(new Error('TCP fechado'))); this.pending = []; });
      this.sock.on('error', () => { });
    });
    const r = await this.request(CMD.RegisterSession, Buffer.from([1, 0, 0, 0]), 'RegisterSession');
    if (r.status !== 0) throw new Error(`RegisterSession recusada (status 0x${r.status.toString(16)})`);
    this.session = r.session; this.state = 'session'; this.emit('state');
    return this.session;
  }
  disconnect() {
    this.cleanupIo();
    if (this.sock) { try { if (this.session) this.sock.write(C.buildEncap(CMD.UnRegisterSession, this.session, 0, null, Buffer.alloc(0))); } catch (_) { } this.sock.destroy(); }
    this.sock = null; this.session = 0; this.state = 'offline'; this.emit('state');
  }
  onData(d) {
    this.acc = Buffer.concat([this.acc, d]);
    for (; ;) {
      const f = C.parseEncap(this.acc); if (!f) break; this.acc = this.acc.subarray(f.total);
      const p = this.pending.shift(); if (p) { clearTimeout(p.to); p.res(f); }
    }
  }
  request(cmd, data, label, timeout = 1500) {
    return new Promise((res, rej) => {
      if (!this.sock || this.sock.destroyed) return rej(new Error('Sem conexão TCP'));
      const buf = C.buildEncap(cmd, this.session, 0, crypto.randomBytes(8), data);
      const to = setTimeout(() => { const i = this.pending.findIndex(p => p.to === to); if (i >= 0) this.pending.splice(i, 1); rej(new Error('Timeout (sem resposta do adapter)')); }, timeout);
      this.pending.push({ res, rej, to });
      this.sock.write(buf); this.log('tx', 'TCP', label, buf);
    });
  }
  async sendRR(cipMsg, label, extraItems = []) {
    const data = Buffer.concat([Buffer.alloc(6), C.buildCPF([{ type: ITEM.NULL, data: Buffer.alloc(0) }, { type: ITEM.UNCONNECTED_DATA, data: cipMsg }, ...extraItems])]);
    const f = await this.request(CMD.SendRRData, data, label);
    if (f.status !== 0) throw new Error(`Encapsulação status 0x${f.status.toString(16)}`);
    const items = C.parseCPF(f.data, 6);
    const it = items.find(i => i.type === ITEM.UNCONNECTED_DATA);
    const b = it.data; const gs = b[2], n = b[3];
    const ext = []; for (let i = 0; i < n; i++) ext.push(b.readUInt16LE(4 + i * 2));
    const res = { gs, ext, data: b.subarray(4 + n * 2), items };
    this.log('rx', 'TCP', `Resposta: ${gs === 0 ? 'OK' : 'ERRO 0x' + gs.toString(16)}${ext.length ? ' ext 0x' + ext[0].toString(16).padStart(4, '0') : ''}`, b);
    return res;
  }

  async listIdentity() {
    const f = await this.request(CMD.ListIdentity, Buffer.alloc(0), 'ListIdentity');
    const it = C.parseCPF(f.data, 0)[0].data;
    const sa = C.parseSockaddr(it.subarray(2, 18));
    const nameLen = it[32];
    return { ip: sa.ip, vendor: it.readUInt16LE(18), deviceType: it.readUInt16LE(20), productCode: it.readUInt16LE(22), revision: `${it[24]}.${it[25]}`, status: '0x' + it.readUInt16LE(26).toString(16).padStart(4, '0'), serial: '0x' + it.readUInt32LE(28).toString(16), name: it.subarray(33, 33 + nameLen).toString('latin1') };
  }
  /** Get_Attribute_Single classe 0xA2, instância = parâmetro, atributo 5  [ETH 8.3] */
  async getParam(n) {
    const msg = Buffer.from([SVC.GetAttributeSingle, 4, 0x20, 0xA2, 0x25, 0x00, n & 0xFF, n >> 8, 0x30, 0x05]);
    const r = await this.sendRR(msg, `Get_Attribute_Single 0xA2/${n}/5 (P${String(n).padStart(4, '0')})`);
    return r.gs === 0 ? { ok: true, value: r.data.readInt16LE(0), raw: r.data.readUInt16LE(0) } : { ok: false, gs: r.gs };
  }
  async setParam(n, v) {
    const b = Buffer.alloc(2); b.writeInt16LE(v > 32767 ? v - 65536 : v, 0);
    const msg = Buffer.concat([Buffer.from([SVC.SetAttributeSingle, 4, 0x20, 0xA2, 0x25, 0x00, n & 0xFF, n >> 8, 0x30, 0x05]), b]);
    const r = await this.sendRR(msg, `Set_Attribute_Single 0xA2/${n}/5 = ${v} (P${String(n).padStart(4, '0')})`);
    return r.gs === 0 ? { ok: true } : { ok: false, gs: r.gs, text: C.GS_TEXT[r.gs] };
  }

  /** Forward Open "Exclusive Owner" — igual a um Generic Ethernet Module (Data-INT) */
  async forwardOpen({ inWords = 4, outWords = 4, rpiMs = 20, cfgInst = 1, mult = 2, multicast = false } = {}) {
    if (this.io) await this.forwardClose();
    this.udp = dgram.createSocket('udp4');
    await new Promise(r => this.udp.bind(0, r));
    const myPort = this.udp.address().port;
    this.udp.on('message', (m) => this.onUdp(m));
    const rpi = Math.round(rpiMs * 1000);
    const otSize = outWords * 2 + 2 + 4;                // dados + seq classe 1 + header run/idle
    const toSize = inWords * 2 + 2;                     // dados + seq classe 1 (modeless)
    this.connSerial = crypto.randomBytes(2).readUInt16LE(0);
    const toIdMine = crypto.randomBytes(4).readUInt32LE(0) || 1;
    const path = Buffer.from([0x20, 0x04, 0x24, cfgInst, 0x2C, 150, 0x2C, 100]);
    const d = Buffer.alloc(36 + path.length);
    let o = 0;
    d[o++] = 0x0A; d[o++] = 0x0E;                       // priority/tick, timeout ticks
    d.writeUInt32LE(0, o); o += 4;                       // O→T id (o target escolhe)
    d.writeUInt32LE(toIdMine, o); o += 4;
    d.writeUInt16LE(this.connSerial, o); o += 2; d.writeUInt16LE(this.vendor, o); o += 2; d.writeUInt32LE(this.serial, o); o += 4;
    d[o] = mult; o += 4;
    d.writeUInt32LE(rpi, o); o += 4; d.writeUInt16LE((2 << 13) | (0 << 10) | otSize, o); o += 2;       // P2P, fixo
    d.writeUInt32LE(rpi, o); o += 4; d.writeUInt16LE(((multicast ? 1 : 2) << 13) | (0 << 10) | toSize, o); o += 2;
    d[o++] = 0x01;                                       // classe 1, cíclico
    d[o++] = path.length / 2; path.copy(d, o);
    const msg = Buffer.concat([Buffer.from([SVC.ForwardOpen, 2, 0x20, 0x06, 0x24, 0x01]), d]);
    const r = await this.sendRR(msg, `Forward_Open (cfg ${cfgInst}, O→T 150: ${otSize} B, T→O 100: ${toSize} B, RPI ${rpiMs} ms)`, [{ type: ITEM.SOCKADDR_TO, data: C.sockaddr(myPort, '0.0.0.0') }]);
    if (r.gs !== 0) {
      this.udp.close(); this.udp = null;
      const ext = r.ext[0];
      throw Object.assign(new Error(`Forward Open recusado: 0x${(ext || 0).toString(16).padStart(4, '0')} – ${C.CM_TEXT[ext] || C.GS_TEXT[r.gs]}${r.ext[1] != null ? ` (tamanho esperado pelo adapter: ${r.ext[1]} bytes)` : ''}`), { ext });
    }
    const otId = r.data.readUInt32LE(0), toId = r.data.readUInt32LE(4);
    let dest = { ip: this.host, port: 2222 };
    const mc = r.items.find(i => i.type === ITEM.SOCKADDR_TO);
    if (mc) { const s = C.parseSockaddr(mc.data); try { this.udp.addMembership(s.ip); } catch (_) { } }
    this.io = { otId, toId, rpiMs, inWords, outWords, seq: 0, encSeq: 0, dest, rx: 0, tx: 0, lastRx: Date.now() };
    this.out = new Array(outWords).fill(0);
    this.state = 'io'; this.emit('state');
    this.ioTimer = setInterval(() => this.sendIo(), rpiMs);
    return this.io;
  }
  sendIo() {
    const io = this.io; if (!io) return;
    io.seq = (io.seq + 1) & 0xFFFF; io.encSeq = (io.encSeq + 1) >>> 0;
    const data = Buffer.alloc(2 + 4 + io.outWords * 2);
    data.writeUInt16LE(io.seq, 0); data.writeUInt32LE(this.run ? 1 : 0, 2);
    for (let i = 0; i < io.outWords; i++) data.writeUInt16LE((this.out[i] || 0) & 0xFFFF, 6 + i * 2);
    const addr = Buffer.alloc(8); addr.writeUInt32LE(io.otId, 0); addr.writeUInt32LE(io.encSeq, 4);
    const pkt = C.buildCPF([{ type: ITEM.SEQUENCED_ADDR, data: addr }, { type: ITEM.CONNECTED_DATA, data }]);
    this.udp.send(pkt, io.dest.port, io.dest.ip); io.tx++;
    if (Date.now() - (io.lastTxLog || 0) > 1000) { io.lastTxLog = Date.now(); this.log('tx', 'UDP', `O→T ${this.run ? 'RUN' : 'IDLE'} | ${this.out.map(w => (w & 0xFFFF).toString(16).padStart(4, '0')).join(' ')}`, pkt); }
  }
  onUdp(m) {
    const io = this.io; if (!io) return;
    try {
      const items = C.parseCPF(m, 0);
      const sa = items.find(i => i.type === ITEM.SEQUENCED_ADDR), da = items.find(i => i.type === ITEM.CONNECTED_DATA);
      if (!sa || sa.data.readUInt32LE(0) !== io.toId) return;
      const words = []; for (let i = 2; i + 1 < da.data.length; i += 2) words.push(da.data.readInt16LE(i));
      this.inputs = words; io.rx++; io.lastRx = Date.now();
      this.emit('input', words);
    } catch (_) { }
  }
  async forwardClose() {
    const io = this.io; this.cleanupIo();
    if (!io || !this.session) return;
    const path = Buffer.from([0x20, 0x04, 0x24, 0x01, 0x2C, 150, 0x2C, 100]);
    const d = Buffer.alloc(12 + path.length);
    d[0] = 0x0A; d[1] = 0x0E; d.writeUInt16LE(this.connSerial, 2); d.writeUInt16LE(this.vendor, 4); d.writeUInt32LE(this.serial, 6);
    d[10] = path.length / 2; d[11] = 0; path.copy(d, 12);
    try { await this.sendRR(Buffer.concat([Buffer.from([SVC.ForwardClose, 2, 0x20, 0x06, 0x24, 0x01]), d]), 'Forward_Close'); } catch (_) { }
    this.state = this.session ? 'session' : 'offline'; this.emit('state');
  }
  cleanupIo() { clearInterval(this.ioTimer); this.ioTimer = null; this.io = null; if (this.udp) { try { this.udp.close(); } catch (_) { } this.udp = null; } }
  view() { return { state: this.state, run: this.run, out: this.out, inputs: this.inputs, io: this.io ? { rpiMs: this.io.rpiMs, inWords: this.io.inWords, outWords: this.io.outWords, rx: this.io.rx, tx: this.io.tx, otId: '0x' + this.io.otId.toString(16), toId: '0x' + this.io.toId.toString(16), stale: Date.now() - this.io.lastRx > 300 } : null }; }
}
module.exports = { VirtualScanner };
