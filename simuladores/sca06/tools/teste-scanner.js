/* Teste de linha de comando: age como um CLP (scanner) contra o simulador.
 *   node tools/teste-scanner.js [ip]        (padrão 127.0.0.1)
 * Sequência: ListIdentity → P00202 = 6 → Forward Open (4+4 palavras) → habilita → 300 rpm → STOP → desabilita */
'use strict';
const { VirtualScanner } = require('../src/enip/scanner');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rpm2c = (r) => Math.round(r * 32767 / 18750), c2rpm = (c) => (c * 18750 / 32767).toFixed(1);

(async () => {
  const sc = new VirtualScanner();
  const host = process.argv[2] || '127.0.0.1';
  await sc.connect(host);
  console.log('ListIdentity:', await sc.listIdentity());
  console.log('P0202 antes:', (await sc.getParam(202)).value);
  console.log('P0202 = 6:', await sc.setParam(202, 6));
  console.log('P0002 (velocidade):', (await sc.getParam(2)).value, 'rpm');
  console.log('P0000 = 70000? (fora da faixa):', await sc.setParam(0, 9999 + 1));
  await sc.forwardOpen({ inWords: 4, outWords: 4, rpiMs: 10 });
  console.log('I/O aberto. Habilitando e girando a 300 rpm...');
  sc.out = [0x0008, rpm2c(300), 0, 1];
  for (let i = 0; i < 8; i++) { await sleep(250); const w = sc.inputs; console.log(`  estado=${(w[0] & 0xFFFF).toString(16).padStart(4, '0')}h  vel=${c2rpm(w[1])} rpm  Iq=${(w[2] / 10).toFixed(1)} A  modo=${w[3]}`); }
  console.log('STOP (bit 2)...'); sc.out[0] = 0x000C;
  for (let i = 0; i < 4; i++) { await sleep(250); const w = sc.inputs; console.log(`  estado=${(w[0] & 0xFFFF).toString(16).padStart(4, '0')}h  vel=${c2rpm(w[1])} rpm`); }
  sc.out = [0, 0, 0, 1]; await sleep(200);
  await sc.forwardClose(); sc.disconnect();
  console.log('Fim.'); process.exit(0);
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
