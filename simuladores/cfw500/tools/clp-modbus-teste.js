/**
 * =====================================================================
 *  "CLP de teste": Modbus TCP Server + Scanner EtherNet/IP
 * =====================================================================
 *  Faz exatamente o papel que o CLP do aluno (CODESYS) vai fazer:
 *
 *    IHM do painel ──Modbus TCP──► ESTE SCRIPT ──EtherNet/IP──► CFW500
 *
 *  Uso:  node tools/clp-modbus-teste.js [ip-do-cfw500] [porta-modbus]
 *        (padrão: 127.0.0.1 e porta 1502)
 *  Depois, na aba "IHM Modbus" do simulador, aponte a IHM para
 *  127.0.0.1 : 1502 e ative a comunicação.
 *
 *  Mapa (o mesmo padrão da IHM):
 *   A IHM escreve                         A IHM lê
 *    Coil 0  CMD_LIGA                      Discrete Input 0  ST_OPERANDO
 *    Coil 1  CMD_REVERSO                   Discrete Input 1  ST_REVERSO
 *    Coil 2  CMD_RESET (pulso)             Discrete Input 2  ST_FALHA
 *    HR 0    SP_VELOCIDADE (rpm)           IR 0  VEL_ATUAL (rpm, com sinal)
 *                                          IR 1  CORRENTE (x0,1 A)
 *  Lógica (a mesma que se escreve no CLP):
 *    P0684 = bit0 Gira (CMD_LIGA) | bit1 Habilita | bit2 Horário (NOT CMD_REVERSO)
 *            | bit4 REM | bit7 Reset de falha (CMD_RESET)
 *    P0685 = SP_VELOCIDADE * 8192 / 1800        (8192 = P0403 = 60 Hz = 1800 rpm síncronos)
 *    VEL_ATUAL = P0681 * 1800 / 8192
 * =====================================================================
 */
'use strict';
const net = require('net');
const { ScannerEIP } = require('../src/scanner/scanner');

const HOST = process.argv[2] || '127.0.0.1';
const PORTA = +(process.argv[3] || 1502);
const HR = new Uint16Array(100);
const IR = new Uint16Array(100);
const COILS = new Uint8Array(256);
const DIS = new Uint8Array(256);

// ----------------------------- servidor Modbus -----------------------------
const adu = (tid, uid, pdu) => { const h = Buffer.alloc(7); h.writeUInt16BE(tid, 0); h.writeUInt16BE(pdu.length + 1, 4); h[6] = uid; return Buffer.concat([h, pdu]); };
function processar(q) {
  const tid = q.readUInt16BE(0); const uid = q[6]; const p = q.subarray(7); const fc = p[0];
  const exc = (c) => adu(tid, uid, Buffer.from([fc | 0x80, c]));
  const ini = p.readUInt16BE(1); const qt = p.readUInt16BE(3);
  if (fc === 3 || fc === 4) {
    const m = fc === 3 ? HR : IR;
    if (qt < 1 || qt > 125) return exc(3); if (ini + qt > m.length) return exc(2);
    const b = Buffer.alloc(2 + qt * 2); b[0] = fc; b[1] = qt * 2;
    for (let i = 0; i < qt; i++) b.writeUInt16BE(m[ini + i], 2 + i * 2);
    return adu(tid, uid, b);
  }
  if (fc === 1 || fc === 2) {
    const m = fc === 1 ? COILS : DIS;
    if (ini + qt > m.length) return exc(2);
    const b = Buffer.alloc(2 + Math.ceil(qt / 8)); b[0] = fc; b[1] = b.length - 2;
    for (let i = 0; i < qt; i++) if (m[ini + i]) b[2 + (i >> 3)] |= 1 << (i & 7);
    return adu(tid, uid, b);
  }
  if (fc === 6) { if (ini >= HR.length) return exc(2); HR[ini] = qt; return adu(tid, uid, p.subarray(0, 5)); }
  if (fc === 5) { if (ini >= COILS.length) return exc(2); COILS[ini] = qt ? 1 : 0; return adu(tid, uid, p.subarray(0, 5)); }
  if (fc === 16) { if (ini + qt > HR.length) return exc(2); for (let i = 0; i < qt; i++) HR[ini + i] = p.readUInt16BE(6 + i * 2); return adu(tid, uid, p.subarray(0, 5)); }
  return exc(1);
}
net.createServer((s) => {
  console.log('IHM conectada:', s.remoteAddress);
  let acc = Buffer.alloc(0);
  s.on('data', (d) => {
    acc = Buffer.concat([acc, d]);
    while (acc.length >= 7 && acc.length >= 6 + acc.readUInt16BE(4)) {
      const n = 6 + acc.readUInt16BE(4); s.write(processar(acc.subarray(0, n))); acc = acc.subarray(n);
    }
  });
  s.on('error', () => {});
  s.on('close', () => console.log('IHM desconectada'));
}).listen(PORTA, () => console.log(`Servidor Modbus TCP (CLP de teste) na porta ${PORTA}`));

// ----------------------------- scanner EtherNet/IP -----------------------------
(async () => {
  const s = new ScannerEIP({ host: HOST, portaIOLocal: 2224 });
  await s.conectar();
  // parametrização para comando pela rede (P0220=1 REM, P0222=11 ref. rede, P0226=9 sentido rede, P0227=4 gira/para rede)
  for (const [n, v] of [[220, 1], [222, 11], [226, 9], [227, 4], [313, 1]]) await s.escreverParam(n, v);
  await s.forwardOpen({ rpi: 10, palavrasSaida: 2, palavrasEntrada: 2 });
  console.log(`EtherNet/IP: Forward Open com o CFW500 em ${HOST} (RPI 10 ms)`);
  let corrente = 0;
  setInterval(async () => { try { corrente = await s.lerParam(3); } catch { /* */ } }, 250);
  setInterval(() => {
    const sp = HR[0]; const liga = COILS[0] === 1; const rev = COILS[1] === 1; const reset = COILS[2] === 1;
    s.saidas[0] = (liga ? 1 : 0) | 2 | (rev ? 0 : 4) | 16 | (reset ? 128 : 0);
    s.saidas[1] = Math.min(32767, Math.round((sp * 8192) / 1800));
    const st = s.entradas[0] || 0; let vel = s.entradas[1] || 0; if (vel > 32767) vel -= 65536;
    IR[0] = Math.round((vel * 1800) / 8192) & 0xFFFF;
    DIS[0] = (st >> 8) & 1;          // girando
    DIS[1] = ((st >> 10) & 1) ^ 1;   // anti-horário
    DIS[2] = (st >> 15) & 1;         // falha
    IR[1] = corrente;
  }, 10);
})().catch((e) => { console.error('Falha EtherNet/IP:', e.message); process.exit(1); });
