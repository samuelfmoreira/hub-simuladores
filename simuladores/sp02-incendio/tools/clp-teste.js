'use strict';
/**
 * CLP VIRTUAL DE TESTE — servidor Modbus TCP simples.
 * Serve para testar o simulador sem um CLP físico.
 *
 *   node tools/clp-teste.js [porta]       (padrão: 502)
 *
 * Coils 0..15            -> entradas do CLP  I00 .. I17 (escritas pelo simulador)
 * Discrete inputs 0..10  -> saídas do CLP    Q0.0 .. Q1.2 (lidas pelo simulador)
 *
 * Contém uma lógica de REFERÊNCIA simplificada da SP02 apenas para o teste
 * fechar o laço. Não substitui o programa do CLP real.
 */
const net = require('net');

/** Cria um CLP virtual independente (estado próprio). Cada sessão do simulador usa o seu. */
function createPlc() {
  const I = new Array(16).fill(false);  // coils
  const Q = new Array(11).fill(false);  // discrete inputs
  const mem = { b1: false, b2: false, bj: false };
  let scanTimer = null;

  function scan() {
    const [SEL1, SEL2, B1M, B1A, B2M, B2A, BJM, BJA, B1L, B1D, B2L, B2D, BJL, BJD, PJ, PB] = I;
    // Bombas principais: manual por botoeira; automático pela seleção + PB. Desliga só no botão.
    if ((B1M && B1L) || (B1A && SEL1 && PB)) mem.b1 = true;
    if (!B1D || (!B1M && !B1A)) mem.b1 = false;
    if ((B2M && B2L) || (B2A && SEL2 && PB)) mem.b2 = true;
    if (!B2D || (!B2M && !B2A)) mem.b2 = false;
    // Jockey
    const mainOn = mem.b1 || mem.b2;
    if (BJM) { if (BJL) mem.bj = true; if (!BJD) mem.bj = false; }
    else if (BJA) { mem.bj = PJ && !mainOn; }
    else mem.bj = false;
    if (!BJD) mem.bj = false;

    Q[0] = mem.b1; Q[1] = mem.b2; Q[2] = mem.bj;
    Q[3] = SEL1; Q[4] = SEL2;
    Q[5] = mem.b1; Q[6] = mem.b2; Q[7] = mem.bj;
    Q[8] = !mem.b1; Q[9] = !mem.b2; Q[10] = !mem.bj;
  }

  function bitsToBytes(arr, start, qty) {
    const out = Buffer.alloc(Math.ceil(qty / 8));
    for (let i = 0; i < qty; i++) if (arr[start + i]) out[i >> 3] |= 1 << (i & 7);
    return out;
  }

  function handle(pdu) {
    const fc = pdu[0];
    const ex = (code) => Buffer.from([fc | 0x80, code]);
    const addr = pdu.readUInt16BE(1);
    switch (fc) {
      case 1: case 2: {
        const qty = pdu.readUInt16BE(3);
        const arr = fc === 1 ? I : Q;
        if (qty < 1 || addr + qty > arr.length) return ex(2);
        const data = bitsToBytes(arr, addr, qty);
        return Buffer.concat([Buffer.from([fc, data.length]), data]);
      }
      case 5: {
        const v = pdu.readUInt16BE(3);
        if (addr >= I.length) return ex(2);
        if (v !== 0xff00 && v !== 0) return ex(3);
        I[addr] = v === 0xff00;
        return pdu.subarray(0, 5);
      }
      case 15: {
        const qty = pdu.readUInt16BE(3);
        if (addr + qty > I.length) return ex(2);
        for (let i = 0; i < qty; i++) I[addr + i] = ((pdu[6 + (i >> 3)] >> (i & 7)) & 1) === 1;
        return pdu.subarray(0, 5);
      }
      default: return ex(1);
    }
  }

  return { I, Q, scan, handle, get scanTimer() { return scanTimer; }, set scanTimer(v) { scanTimer = v; } };
}

function start(port = 502, log = console.log) {
  const plc = createPlc();
  return new Promise((resolve, reject) => {
  const clients = new Set();
  const srv = net.createServer((sock) => {
  clients.add(sock);
  const who = `${sock.remoteAddress}:${sock.remotePort}`;
  log(`[CLP teste] cliente conectado: ${who}`);
  let buf = Buffer.alloc(0);
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 7) {
      const len = buf.readUInt16BE(4);
      if (buf.length < 6 + len) break;
      const frame = buf.subarray(0, 6 + len);
      buf = buf.subarray(6 + len);
      const resp = plc.handle(frame.subarray(7));
      const head = Buffer.alloc(7);
      frame.copy(head, 0, 0, 4);
      head.writeUInt16BE(resp.length + 1, 4);
      head[6] = frame[6];
      sock.write(Buffer.concat([head, resp]));
    }
  });
  sock.on('close', () => { clients.delete(sock); log(`[CLP teste] cliente saiu: ${who}`); });
  sock.on('error', () => {});
  });
  srv.once('error', reject);
  // [HUB] dentro do HUB, o CLP de teste escuta só no próprio PC (127.0.0.1): é onde este simulador se conecta,
  // e assim ele não disputa a porta 502 com os outros equipamentos da rede virtual (CFW500, SCA06...).
  const host = process.env.HUB === '1' ? '127.0.0.1' : undefined;
  srv.listen(port, host, () => {
    plc.scanTimer = setInterval(plc.scan, 10);
    log(`[CLP teste] servidor Modbus TCP escutando na porta ${port}${host ? ' (só neste PC, ' + host + ')' : ''}`);
    resolve({
      port,
      close: () => new Promise((r) => {
        for (const c of clients) c.destroy();
        srv.close(() => { clearInterval(plc.scanTimer); plc.scanTimer = null; r(); });
      }),
    });
  });
  });
}

module.exports = { start };

if (require.main === module) {
  start(parseInt(process.argv[2] || process.env.PORT || '502', 10)).catch((e) => {
    console.error(`[CLP teste] não foi possível abrir a porta: ${e.message}`);
    process.exit(1);
  });
}
