/**
 * Teste completo do Adapter EtherNet/IP do simulador, agindo como um CLP.
 *   node tools/scanner-test.js [ip-do-simulador]
 *
 * Sequência:
 *  1) ListIdentity (UDP)          5) Forward Open com tamanho ERRADO (deve ser recusado)
 *  2) RegisterSession (TCP)       6) Forward Open correto + I/O cíclico
 *  3) Identity (Get_Attributes_All)  7) Liga o motor a 30 Hz pela rede, lê P0680/P0681
 *  4) Lê/escreve parâmetros (classe A2h)  8) Forward Close
 */
'use strict';
const { ScannerEIP } = require('../src/scanner/scanner');

const host = process.argv[2] || '127.0.0.1';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const hx = (v) => '0x' + v.toString(16).toUpperCase().padStart(4, '0');

(async () => {
  console.log(`\n=== 1) ListIdentity (UDP 44818) em ${host} ===`);
  const ids = await ScannerEIP.listIdentity(host);
  console.log(ids);

  const s = new ScannerEIP({ host, portaIOLocal: 2223 });
  console.log('\n=== 2) RegisterSession ===');
  console.log('Sessão:', '0x' + (await s.conectar()).toString(16));

  console.log('\n=== 3) Identity Object (classe 0x01) ===');
  console.log(await s.identidade());

  console.log('\n=== 4) Parâmetros via classe A2h / atributo 5 ===');
  for (const n of [23, 295, 403, 402, 100, 801, 800]) console.log(`P${String(n).padStart(4, '0')} =`, await s.lerParam(n));
  try { await s.escreverParam(3, 10); } catch (e) { console.log('Escrita em P0003 (ro) →', e.message, '(esperado 0x0e)'); }
  try { await s.escreverParam(100, 99999); } catch (e) { console.log('P0100 fora da faixa →', e.message, '(esperado 0x09)'); }
  try { await s.lerParam(8); } catch (e) { console.log('P0008 inexistente →', e.message, '(esperado 0x05)'); }

  // Programa o inversor para ser comandado pela rede (motor parado)
  console.log('\nProgramando P0220=1, P0222=11, P0226=9, P0227=4, P0100=30 (3,0 s)...');
  for (const [n, v] of [[220, 1], [222, 11], [226, 9], [227, 4], [100, 30], [101, 30]]) await s.escreverParam(n, v);

  console.log('\n=== 5) Forward Open com 4 palavras de entrada (o inversor espera 2) ===');
  try { await s.forwardOpen({ palavrasSaida: 2, palavrasEntrada: 4 }); } catch (e) { console.log(e.message); }

  console.log('\n=== 6) Forward Open correto (100/150, 2+2 palavras, RPI 10 ms, unicast) ===');
  const c = await s.forwardOpen({ palavrasSaida: 2, palavrasEntrada: 2, rpi: 10 });
  console.log(`O→T 0x${c.idOT.toString(16)}  T→O 0x${c.idTO.toString(16)}  API ${c.apiOT / 1000}/${c.apiTO / 1000} ms`);
  await espera(300);
  console.log('Entradas (P0680, P0681):', s.entradas.map(hx), ' P0801 =', await s.lerParam(801), '(4 = Data Active)');

  console.log('\n=== 7) Liga motor a 30 Hz: P0684 = 0x0017 (Gira+HabGeral+Horário+Remoto), P0685 = 4096 ===');
  s.saidas = [0x0017, 4096];
  for (let i = 0; i < 8; i++) {
    await espera(500);
    const [st, vel] = s.entradas;
    console.log(`t=${((i + 1) * 0.5).toFixed(1)}s  P0680=${hx(st)}  P0681=${vel > 32767 ? vel - 65536 : vel} (${(((vel > 32767 ? vel - 65536 : vel) * 60) / 8192).toFixed(1)} Hz)  P0003=${(await s.lerParam(3)) / 10} A`);
  }
  console.log('\nScanner em IDLE (bit Run/Idle = 0) → inversor deve aplicar P0313 (para por rampa) e indicar A0149');
  s.run = false; await espera(600);
  console.log(`P0048 (alarme) = ${await s.lerParam(48)}  P0801 = ${await s.lerParam(801)} (3 = Idle)  P0684 = ${hx(await s.lerParam(684))}`);
  s.run = true; s.saidas = [0x0016, 0]; await espera(3500);
  console.log(`Volta a RUN com Gira=0: P0048 = ${await s.lerParam(48)}  P0680 = ${hx(s.entradas[0])}`);

  console.log('\n=== 8) Forward Close ===');
  await s.fechar();
  console.log('OK');
  process.exit(0);
})().catch((e) => { console.error('FALHOU:', e); process.exit(1); });
