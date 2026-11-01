/* =============================================================================
 *  Modbus TCP do acessório ECO5  [ETH 8.5]
 *  "O acessório para comunicação EtherNet/IP também disponibiliza até 2 conexões
 *   Modbus TCP" — usadas para parametrização.
 *  Mapa [ETH 7.3.1]: parâmetro Pxxxx = holding register xxxx (offset zero).
 *  No mestre que usa base 40000/4x: P0121 → 40121 (ou 40122 se o software for base 1).
 * ===========================================================================*/
'use strict';
const net = require('net');
const EventEmitter = require('events');

class ModbusServer extends EventEmitter {
  constructor(drive, { port = 502, bind = '0.0.0.0', maxConnections = 2, online = () => true } = {}) {
    super();
    Object.assign(this, { drive, port, bind, maxConnections, online });
    this.clients = new Set();
  }
  start() {
    this.server = net.createServer((s) => this.onClient(s));
    this.server.on('error', (e) => this.emit('error', e));
    this.server.listen(this.port, this.bind, () => this.emit('listening', this.port));
    return this;
  }
  stop() { this.server.close(); for (const c of this.clients) c.destroy(); }

  onClient(sock) {
    const peer = `${sock.remoteAddress}:${sock.remotePort}`.replace('::ffff:', '');
    if (this.clients.size >= this.maxConnections) {
      this.emit('log', { dir: 'rx', proto: 'MBTCP', summary: `Conexão de ${peer} recusada: limite de ${this.maxConnections} conexões Modbus TCP (ECO5)`, hex: '' });
      return sock.destroy();
    }
    this.clients.add(sock);
    let acc = Buffer.alloc(0);
    sock.on('data', (d) => {
      if (!this.online()) return;
      acc = Buffer.concat([acc, d]);
      while (acc.length >= 7) {
        const len = acc.readUInt16BE(4); if (acc.length < 6 + len) break;
        const adu = acc.subarray(0, 6 + len); acc = acc.subarray(6 + len);
        const pdu = this.handle(adu.subarray(7), adu[6]);
        const head = Buffer.alloc(7); adu.copy(head, 0, 0, 4); head.writeUInt16BE(pdu.length + 1, 4); head[6] = adu[6];
        sock.write(Buffer.concat([head, pdu]));
        this.drive.netModbusRx();
      }
    });
    const bye = () => this.clients.delete(sock);
    sock.on('close', bye); sock.on('error', bye);
  }

  exc(fc, code) { return Buffer.from([fc | 0x80, code]); }   // 1 função inválida, 2 endereço inválido, 3 valor inválido  [ETH Tabela 7.4]

  handle(pdu, unit) {
    const fc = pdu[0], d = this.drive;
    const log = (s) => this.emit('log', { dir: 'rx', proto: 'MBTCP', summary: s, hex: pdu.toString('hex').replace(/(..)/g, '$1 ').trim() });
    try {
      if (fc === 3 || fc === 4) {
        const addr = pdu.readUInt16BE(1), qty = pdu.readUInt16BE(3);
        log(`FC${String(fc).padStart(2, '0')} lê ${qty} reg. a partir de ${addr} (P${String(addr).padStart(4, '0')})`);
        if (qty < 1 || qty > 125) return this.exc(fc, 3);
        const out = Buffer.alloc(2 + qty * 2); out[0] = fc; out[1] = qty * 2;
        for (let i = 0; i < qty; i++) { const v = d.get(addr + i); if (v === undefined) return this.exc(fc, 2); out.writeUInt16BE(v & 0xFFFF, 2 + i * 2); }
        return out;
      }
      if (fc === 6) {
        const addr = pdu.readUInt16BE(1), raw = pdu.readUInt16BE(3);
        log(`FC06 escreve P${String(addr).padStart(4, '0')} = ${raw}`);
        const r = this.writeParam(addr, raw); if (r) return this.exc(fc, r);
        return pdu.subarray(0, 5);
      }
      if (fc === 16) {
        const addr = pdu.readUInt16BE(1), qty = pdu.readUInt16BE(3);
        log(`FC16 escreve ${qty} reg. a partir de P${String(addr).padStart(4, '0')}`);
        for (let i = 0; i < qty; i++) { const r = this.writeParam(addr + i, pdu.readUInt16BE(6 + i * 2)); if (r) return this.exc(fc, r); }
        return pdu.subarray(0, 5);
      }
      if (fc === 43 && pdu[1] === 0x0E) {                   // Read Device Identification
        log('FC43 Read Device Identification');
        const objs = [['WEG', 0], ['SCA06', 1], ['V2.10', 2]];
        const parts = [Buffer.from([43, 0x0E, pdu[2] || 1, 0x01, 0, 0, objs.length])];
        for (const [s, id] of objs) { const b = Buffer.from(s, 'latin1'); parts.push(Buffer.from([id, b.length]), b); }
        return Buffer.concat(parts);
      }
      if ([1, 2, 5, 15].includes(fc)) { log(`FC${String(fc).padStart(2, '0')} (marcadores SoftPLC) — não simulados`); return this.exc(fc, 2); }
      log(`FC${fc} não suportada`); return this.exc(fc, 1);
    } catch (e) { return this.exc(fc, 3); }
  }
  writeParam(n, raw) {
    const def = this.drive.def(n); if (!def) return 2;
    let v = raw; if (def.min < 0 && v > 32767) v -= 65536;
    const r = this.drive.write(n, v, 'modbus');
    return r.ok ? 0 : (r.code === 'NOEXIST' ? 2 : 3);
  }
}
module.exports = { ModbusServer };
