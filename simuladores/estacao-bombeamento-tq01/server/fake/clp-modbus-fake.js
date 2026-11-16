'use strict';
// CLP falso falando Modbus TCP (servidor), com o programa de demonstração. Cada sinal no endereço de server/tags.js.
// Tabelas: coils (%IX, o simulador escreve), discrete inputs (%QX, o CLP escreve),
// holding registers (%IW, o simulador escreve), input registers (%QW, o CLP escreve).
const net = require('net');
const TG = require('../tags');
const { criarProgramaDemo } = require('./programa-demo');

function criarClpModbusFalso(opts = {}) {
  const port = opts.port || 502, fundo = opts.fundoEscala || 32767;
  const coils = new Array(64).fill(false), discretes = new Array(64).fill(false), holding = new Array(64).fill(0), input = new Array(64).fill(0);
  const s16 = (v) => (v & 0x8000 ? v - 65536 : v);
  let server = null, timer = null;
  // acesso por nome (o programa de demonstração trabalha com as mesmas variáveis da GVL_SIM)
  const le = (nome) => { const t = TG.porNome[nome]; const tab = { coil: coils, discrete: discretes, holding, input }[t.mb.t]; const r = tab[t.mb.a]; return t.tipo === 'BOOL' ? !!r : t.mb.escala ? r / t.mb.escala : r; };
  const escreve = (nome, v) => { const t = TG.porNome[nome]; const tab = { coil: coils, discrete: discretes, holding, input }[t.mb.t]; tab[t.mb.a] = t.tipo === 'BOOL' ? !!v : Math.round(Number(v) * (t.mb.escala || 1)); };
  const prog = criarProgramaDemo({ le, escreve, fundo, demo: opts.demo });

  function pdu(req) {
    const fc = req[0], addr = req.readUInt16BE(1);
    const exc = (code) => Buffer.from([fc | 0x80, code]);
    const bits = (tab, n) => { const nb = Math.ceil(n / 8), out = Buffer.alloc(2 + nb); out[0] = fc; out[1] = nb; for (let i = 0; i < n; i++) if (tab[addr + i]) out[2 + (i >> 3)] |= 1 << (i & 7); return out; };
    const regs = (tab, n) => { const out = Buffer.alloc(2 + n * 2); out[0] = fc; out[1] = n * 2; for (let i = 0; i < n; i++) out.writeUInt16BE(((tab[addr + i] | 0) + 65536) % 65536, 2 + i * 2); return out; };
    switch (fc) {
      case 1: { const n = req.readUInt16BE(3); return addr + n > 64 ? exc(2) : bits(coils, n); }
      case 2: { const n = req.readUInt16BE(3); return addr + n > 64 ? exc(2) : bits(discretes, n); }
      case 3: { const n = req.readUInt16BE(3); return addr + n > 64 ? exc(2) : regs(holding, n); }
      case 4: { const n = req.readUInt16BE(3); return addr + n > 64 ? exc(2) : regs(input, n); }
      case 5: { if (addr >= 64) return exc(2); coils[addr] = req.readUInt16BE(3) === 0xff00; return req.subarray(0, 5); }
      case 6: { if (addr >= 64) return exc(2); holding[addr] = s16(req.readUInt16BE(3)); return req.subarray(0, 5); }
      case 15: { const n = req.readUInt16BE(3); if (addr + n > 64) return exc(2); for (let i = 0; i < n; i++) coils[addr + i] = !!(req[6 + (i >> 3)] & (1 << (i & 7))); return req.subarray(0, 5); }
      case 16: { const n = req.readUInt16BE(3); if (addr + n > 64) return exc(2); for (let i = 0; i < n; i++) holding[addr + i] = s16(req.readUInt16BE(6 + i * 2)); return req.subarray(0, 5); }
      default: return exc(1);
    }
  }
  function onConn(sock) {
    let buf = Buffer.alloc(0);
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 7) {
        const len = buf.readUInt16BE(4); if (buf.length < 6 + len) break;
        const frame = buf.subarray(0, 6 + len); buf = buf.subarray(6 + len);
        const resp = pdu(frame.subarray(7));
        const mbap = Buffer.alloc(7); frame.copy(mbap, 0, 0, 7); mbap.writeUInt16BE(resp.length + 1, 4);
        sock.write(Buffer.concat([mbap, resp]));
      }
    });
    sock.on('error', () => {});
  }
  function iniciar() {
    return new Promise((resolve, reject) => {
      server = net.createServer(onConn); server.once('error', reject);
      server.listen(port, opts.host || '0.0.0.0', () => { if (opts.demo !== false) timer = setInterval(() => prog.scan(prog.DEMO.scanMs / 1000), prog.DEMO.scanMs); resolve(`modbus://${opts.host || '0.0.0.0'}:${port}`); });
    });
  }
  function parar() { if (timer) clearInterval(timer); return new Promise((r) => { if (server) server.close(() => r()); else r(); }); }
  return { iniciar, parar, plc: prog.plc, coils, discretes, holding, input, le, escreve };
}

module.exports = { criarClpModbusFalso };

if (require.main === module) {
  const port = Number(process.argv[2] || 502);
  criarClpModbusFalso({ port }).iniciar().then((u) => console.log(`CLP Modbus falso ouvindo em ${u} (programa de demonstração ativo)`)).catch((e) => { console.error(e.message); process.exit(1); });
}
