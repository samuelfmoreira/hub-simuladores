'use strict';
/**
 * Servidor Modbus TCP com as quatro áreas em memória (como o "ModbusTCP Slave Device" do CODESYS).
 * Usado pelo CLP de demonstração da IHM. Funções: 01, 02, 03, 04, 05, 06, 15, 16.
 *   coils / hr  -> o cliente (IHM) escreve, o programa lê
 *   di / ir     -> o programa escreve, o cliente (IHM) lê
 */
const net = require('net');

class ServidorModbusMemoria {
  constructor({ tamanho = 64, log = () => {} } = {}) {
    this.coils = new Uint8Array(tamanho); this.di = new Uint8Array(tamanho);
    this.hr = new Uint16Array(tamanho); this.ir = new Uint16Array(tamanho);
    this.log = log; this.srv = null; this.porta = null; this.clientes = new Set();
  }

  /** Abre a primeira porta livre da lista, no host indicado. */
  async iniciar(host, portas) {
    for (const p of portas) {
      try { await this.abrir(host, p); this.porta = p; return p; } catch (e) { if (e.code !== 'EADDRINUSE' && e.code !== 'EACCES') throw e; }
    }
    throw new Error(`portas ${portas.join(', ')} ocupadas`);
  }

  abrir(host, porta) {
    return new Promise((ok, falha) => {
      const srv = net.createServer((s) => this.atender(s));
      srv.once('error', falha);
      srv.listen(porta, host, () => { srv.removeListener('error', falha); this.srv = srv; ok(); });
    });
  }

  parar() {
    for (const s of this.clientes) s.destroy();
    this.clientes.clear();
    if (this.srv) { this.srv.close(); this.srv = null; }
  }

  atender(sock) {
    this.clientes.add(sock);
    let buf = Buffer.alloc(0);
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 7) {
        const len = buf.readUInt16BE(4);
        if (buf.length < 6 + len) break;
        const quadro = buf.subarray(0, 6 + len); buf = buf.subarray(6 + len);
        const pdu = this.responder(quadro.subarray(7));
        const cab = Buffer.alloc(7); quadro.copy(cab, 0, 0, 4); cab.writeUInt16BE(pdu.length + 1, 4); cab[6] = quadro[6];
        sock.write(Buffer.concat([cab, pdu]));
      }
    });
    sock.on('close', () => this.clientes.delete(sock));
    sock.on('error', () => {});
  }

  responder(p) {
    const fc = p[0], ini = p.readUInt16BE(1);
    const exc = (cod) => Buffer.from([fc | 0x80, cod]);
    const lerBits = (area, qtd) => {
      if (ini + qtd > area.length) return exc(2);
      const n = Math.ceil(qtd / 8), r = Buffer.alloc(2 + n); r[0] = fc; r[1] = n;
      for (let i = 0; i < qtd; i++) if (area[ini + i]) r[2 + (i >> 3)] |= 1 << (i & 7);
      return r;
    };
    const lerRegs = (area, qtd) => {
      if (ini + qtd > area.length) return exc(2);
      const r = Buffer.alloc(2 + qtd * 2); r[0] = fc; r[1] = qtd * 2;
      for (let i = 0; i < qtd; i++) r.writeUInt16BE(area[ini + i], 2 + i * 2);
      return r;
    };
    switch (fc) {
      case 1: return lerBits(this.coils, p.readUInt16BE(3));
      case 2: return lerBits(this.di, p.readUInt16BE(3));
      case 3: return lerRegs(this.hr, p.readUInt16BE(3));
      case 4: return lerRegs(this.ir, p.readUInt16BE(3));
      case 5: if (ini >= this.coils.length) return exc(2); this.coils[ini] = p.readUInt16BE(3) === 0xFF00 ? 1 : 0; return p.subarray(0, 5);
      case 6: if (ini >= this.hr.length) return exc(2); this.hr[ini] = p.readUInt16BE(3); return p.subarray(0, 5);
      case 15: { const qtd = p.readUInt16BE(3); if (ini + qtd > this.coils.length) return exc(2);
        for (let i = 0; i < qtd; i++) this.coils[ini + i] = (p[6 + (i >> 3)] >> (i & 7)) & 1; return p.subarray(0, 5); }
      case 16: { const qtd = p.readUInt16BE(3); if (ini + qtd > this.hr.length) return exc(2);
        for (let i = 0; i < qtd; i++) this.hr[ini + i] = p.readUInt16BE(6 + i * 2); return p.subarray(0, 5); }
      default: return exc(1);
    }
  }
}

module.exports = { ServidorModbusMemoria };
