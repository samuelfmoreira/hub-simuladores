'use strict';
// CLP de demonstração: um servidor Modbus TCP mínimo rodando o programa de referência (programa-demo.js).
// Serve para usar o simulador sem CODESYS e para os testes. Escuta SÓ em 127.0.0.1 e procura uma porta livre,
// para nunca disputar a 502 com um CLP de verdade nem com os equipamentos da rede SIM-HUB.
// Tabelas: holding registers (%IW, o simulador escreve), discrete inputs (%QX) e input registers (%QW), o CLP escreve.
const net = require('net');
const TG = require('../tags');
const { criarProgramaDemo } = require('./programa-demo');

function criarClpDemo(opts = {}) {
  const N = 64;
  const coils = new Array(N).fill(false), discretes = new Array(N).fill(false), holding = new Array(N).fill(0), input = new Array(N).fill(0);
  const tabela = (t) => ({ coil: coils, discrete: discretes, holding, input }[t.mb.t]);
  const s16 = (v) => (v & 0x8000 ? v - 65536 : v);
  const le = (nome) => { const t = TG.porNome[nome]; const r = tabela(t)[t.mb.a]; return t.tipo === 'BOOL' ? !!r : t.mb.escala ? r / t.mb.escala : r; };
  const escreve = (nome, v) => { const t = TG.porNome[nome]; tabela(t)[t.mb.a] = t.tipo === 'BOOL' ? !!v : Math.round(Number(v) * (t.mb.escala || 1)); };
  const prog = criarProgramaDemo({ le, escreve });
  let servidor = null, timer = null, porta = 0;
  const conexoes = new Set();

  function pdu(req) {
    const fc = req[0], addr = req.readUInt16BE(1);
    const exc = (cod) => Buffer.from([fc | 0x80, cod]);
    const bits = (tab, n) => { const nb = Math.ceil(n / 8), out = Buffer.alloc(2 + nb); out[0] = fc; out[1] = nb; for (let i = 0; i < n; i++) if (tab[addr + i]) out[2 + (i >> 3)] |= 1 << (i & 7); return out; };
    const regs = (tab, n) => { const out = Buffer.alloc(2 + n * 2); out[0] = fc; out[1] = n * 2; for (let i = 0; i < n; i++) out.writeUInt16BE(((tab[addr + i] | 0) + 65536) % 65536, 2 + i * 2); return out; };
    const n = fc === 5 || fc === 6 ? 1 : req.readUInt16BE(3);
    if (n < 1 || addr + n > N) return exc(2);
    switch (fc) {
      case 1: return bits(coils, n);
      case 2: return bits(discretes, n);
      case 3: return regs(holding, n);
      case 4: return regs(input, n);
      case 5: coils[addr] = req.readUInt16BE(3) === 0xff00; return req.subarray(0, 5);
      case 6: holding[addr] = s16(req.readUInt16BE(3)); return req.subarray(0, 5);
      case 15: for (let i = 0; i < n; i++) coils[addr + i] = !!(req[6 + (i >> 3)] & (1 << (i & 7))); return req.subarray(0, 5);
      case 16: for (let i = 0; i < n; i++) holding[addr + i] = s16(req.readUInt16BE(6 + i * 2)); return req.subarray(0, 5);
      default: return exc(1);
    }
  }
  function aoConectar(sock) {
    conexoes.add(sock); sock.on('close', () => conexoes.delete(sock));
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
  // tenta a porta pedida e, se estiver ocupada, as seguintes (até 60 tentativas)
  function iniciar() {
    const primeira = opts.port || 1502, host = opts.host || '127.0.0.1';
    return new Promise((resolve, reject) => {
      const tentar = (p, resto) => {
        const s = net.createServer(aoConectar);
        s.once('error', (e) => { if (e.code === 'EADDRINUSE' && resto > 0) tentar(p + 1, resto - 1); else reject(e); });
        s.listen(p, host, () => {
          servidor = s; porta = p;
          if (opts.programa !== false) timer = setInterval(() => prog.scan(prog.LIMITES.scanMs / 1000), prog.LIMITES.scanMs);
          resolve({ host, port: p });
        });
      };
      tentar(primeira, 60);
    });
  }
  function parar() {
    if (timer) { clearInterval(timer); timer = null; }
    for (const c of conexoes) c.destroy();
    return new Promise((r) => { if (servidor) { servidor.close(() => r()); servidor = null; } else r(); });
  }
  return { iniciar, parar, prog, plc: prog.plc, le, escreve, coils, discretes, holding, input, get porta() { return porta; } };
}

module.exports = { criarClpDemo };

if (require.main === module) {
  criarClpDemo({ port: Number(process.argv[2] || 1502) }).iniciar().then((u) => console.log(`CLP de demonstração ouvindo em ${u.host}:${u.port}`)).catch((e) => { console.error(e.message); process.exit(1); });
}
