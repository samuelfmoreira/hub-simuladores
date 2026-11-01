/**
 * =====================================================================
 *  SERVIDOR MODBUS TCP do módulo CFW500-CETH-IP (Manual Ethernet, item 7.5)
 * =====================================================================
 *  "O módulo plug-in para comunicação EtherNet/IP também disponibiliza até
 *   2 conexões Modbus TCP" — úteis para parametrização (ex.: supervisório).
 *
 *  Mapa: Holding Register N = Parâmetro PN (offset zero). Ex.: P0680 -> HR 680.
 *  Funções: 01, 02, 03, 04, 05, 06, 15, 16, 43 (Read Device Identification).
 *  Exceções: 1 função inválida, 2 endereço inválido, 3 valor inválido / somente leitura.
 *  Timeout P0806 (0,1 s): sem telegramas válidos -> A0149 / ação P0313.
 * =====================================================================
 */
'use strict';

const net = require('net');
const { EventEmitter } = require('events');
const { MAP } = require('../drive/params');

class ServidorModbus extends EventEmitter {
  constructor(drive, opts = {}) {
    super();
    this.drive = drive;
    this.porta = opts.porta || 502;
    this.bindIp = opts.bindIp || '0.0.0.0';
    this.maxConexoes = 2;
    this.clientes = new Set();
    this.marcadores = new Uint8Array(2048);   // marcadores de bit (%MX) usados pela SoftPLC/WLP
    this.ultimoValido = 0;
    this.telegramas = 0;
    this.emErro = false;
  }

  iniciar() {
    this.srv = net.createServer((s) => this.novo(s));
    this.srv.on('error', (e) => {
      if ((e.code === 'EACCES' || e.code === 'EADDRINUSE') && this.porta === 502) {
        this.emit('log', `Porta 502 indisponível (${e.code}) — usando 5020`);
        this.porta = 5020; this.srv.listen(this.porta, this.bindIp);
      } else this.emit('log', `Modbus TCP: ${e.message}`);
    });
    this.srv.listen(this.porta, this.bindIp, () => this.emit('log', `Servidor Modbus TCP na porta ${this.porta}`));
    this.tmr = setInterval(() => this.supervisao(), 50);
  }

  /** Acompanha o IP do módulo (mesmo IP do EtherNet/IP) */
  mudarIp(ip) {
    if (ip === this.bindIp) return;
    this.bindIp = ip;
    for (const c of this.clientes) c.destroy();
    const srv = this.srv;
    srv.close(() => {
      this.srv = net.createServer((s) => this.novo(s));
      this.srv.on('error', (e) => this.emit('log', `Modbus TCP: ${e.message}`));
      this.srv.listen(this.porta, this.bindIp, () => this.emit('log', `Servidor Modbus TCP do inversor agora em ${ip === '0.0.0.0' ? 'todas as placas' : ip}:${this.porta}`));
    });
  }

  parar() { clearInterval(this.tmr); for (const c of this.clientes) c.destroy(); try { this.srv.close(); } catch { /* */ } }

  supervisao() {
    const t = this.drive.get(806) / 10;
    if (t > 0 && this.ultimoValido && Date.now() - this.ultimoValido > t * 1000 && !this.emErro) {
      this.emErro = true;
      this.drive.erroComunicacao(true, `timeout Modbus TCP (P0806 = ${t} s)`, 'modbus');
    }
  }

  novo(sock) {
    if (this.clientes.size >= this.maxConexoes || !this.drive.ligado) { sock.destroy(); return; }
    this.clientes.add(sock);
    const ip = (sock.remoteAddress || '').replace('::ffff:', '');
    this.emit('log', `Cliente Modbus TCP conectado: ${ip}`);
    let acum = Buffer.alloc(0);
    sock.on('data', (d) => {
      acum = Buffer.concat([acum, d]);
      while (acum.length >= 7) {
        const len = acum.readUInt16BE(4);
        if (acum.length < 6 + len) break;
        const adu = acum.subarray(0, 6 + len);
        acum = acum.subarray(6 + len);
        const resp = this.processar(adu);
        if (resp) sock.write(resp);
      }
    });
    sock.on('close', () => { this.clientes.delete(sock); this.emit('log', `Cliente Modbus TCP desconectado: ${ip}`); });
    sock.on('error', () => {});
  }

  processar(adu) {
    const d = this.drive;
    if (!d.ligado) return null;
    const tid = adu.readUInt16BE(0);
    const uid = adu[6];
    const pdu = adu.subarray(7);
    const fc = pdu[0];
    const exc = (code) => this.adu(tid, uid, Buffer.from([fc | 0x80, code]));
    const ok = (corpo) => {
      this.telegramas++;
      this.ultimoValido = Date.now();
      if (this.emErro) { this.emErro = false; d.erroComunicacao(false, '', 'modbus'); }
      return this.adu(tid, uid, corpo);
    };
    try {
      switch (fc) {
        case 3: case 4: {
          const ini = pdu.readUInt16BE(1); const qt = pdu.readUInt16BE(3);
          if (qt < 1 || qt > 125) return exc(3);
          if (!MAP.has(ini)) return exc(2);
          const b = Buffer.alloc(2 + qt * 2); b[0] = fc; b[1] = qt * 2;
          for (let i = 0; i < qt; i++) b.writeUInt16BE(MAP.has(ini + i) ? d.lerPalavra(ini + i) : 0, 2 + i * 2);
          return ok(b);
        }
        case 6: {
          const reg = pdu.readUInt16BE(1); const val = pdu.readUInt16BE(3);
          const r = d.escrever(reg, val, 'net');
          if (r) return exc(r.erro === 'inexistente' ? 2 : 3);
          this.emit('escrita', { reg, val });
          return ok(pdu.subarray(0, 5));
        }
        case 16: {
          const ini = pdu.readUInt16BE(1); const qt = pdu.readUInt16BE(3);
          if (qt < 1 || qt > 123 || pdu[5] !== qt * 2) return exc(3);
          for (let i = 0; i < qt; i++) {
            const r = d.escrever(ini + i, pdu.readUInt16BE(6 + i * 2), 'net');
            if (r) return exc(r.erro === 'inexistente' ? 2 : 3);
          }
          return ok(pdu.subarray(0, 5));
        }
        case 1: case 2: {
          const ini = pdu.readUInt16BE(1); const qt = pdu.readUInt16BE(3);
          if (qt < 1 || qt > 2000) return exc(3);
          if (ini + qt > this.marcadores.length) return exc(2);
          const nb = Math.ceil(qt / 8); const b = Buffer.alloc(2 + nb); b[0] = fc; b[1] = nb;
          for (let i = 0; i < qt; i++) if (this.marcadores[ini + i]) b[2 + (i >> 3)] |= 1 << (i & 7);
          return ok(b);
        }
        case 5: {
          const a = pdu.readUInt16BE(1); const v = pdu.readUInt16BE(3);
          if (a >= this.marcadores.length) return exc(2);
          if (v !== 0xFF00 && v !== 0) return exc(3);
          this.marcadores[a] = v ? 1 : 0; return ok(pdu.subarray(0, 5));
        }
        case 15: {
          const ini = pdu.readUInt16BE(1); const qt = pdu.readUInt16BE(3);
          if (ini + qt > this.marcadores.length) return exc(2);
          for (let i = 0; i < qt; i++) this.marcadores[ini + i] = (pdu[6 + (i >> 3)] >> (i & 7)) & 1;
          return ok(pdu.subarray(0, 5));
        }
        case 43: {
          if (pdu[1] !== 0x0E) return exc(1);
          const objs = [['WEG'], ['CFW500'], [`V${(d.get(23) / 100).toFixed(2)}`]];
          const partes = [Buffer.from([43, 0x0E, pdu[2] || 1, 0x01, 0x00, 0x00, objs.length])];
          objs.forEach(([s], i) => partes.push(Buffer.from([i, s.length]), Buffer.from(s)));
          return ok(Buffer.concat(partes));
        }
        default: return exc(1);
      }
    } catch { return exc(3); }
  }

  adu(tid, uid, pdu) {
    const h = Buffer.alloc(7);
    h.writeUInt16BE(tid, 0); h.writeUInt16BE(0, 2); h.writeUInt16BE(pdu.length + 1, 4); h[6] = uid;
    return Buffer.concat([h, pdu]);
  }
}

module.exports = { ServidorModbus };
