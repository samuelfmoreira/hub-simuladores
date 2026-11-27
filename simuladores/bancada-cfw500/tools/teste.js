'use strict';
/* Testes do núcleo da Bancada CFW500: rode com "node tools/teste.js" (ou TESTAR.bat). A última linha deve dizer "0 falha(s)". */
const path = require('path');
const core = path.join(__dirname, '..', 'public', 'core');
['params', 'hmi', 'cfw500', 'bancada', 'missoes'].forEach((f) => require(path.join(core, f + '.js')));
const SIM = globalThis.SIM;
let falhas = 0, total = 0;
function ok(cond, nome, extra) { total++; if (!cond) falhas++; console.log(`${cond ? ' ok ' : 'FALHA'} ${nome}${extra !== undefined ? '  [' + extra + ']' : ''}`); }
const perto = (a, b, t) => Math.abs(a - b) <= t;

function nova(montagem) {
  const b = new SIM.Bancada();
  if (montagem) b.montagem(montagem);
  return b;
}
function liga(b) { b.acao('Q1', { fechado: true }); b.acao('X1', { ligada: true }); b.avanca(2); }
function tecla(b, n, seg = 0.05) { b.inv.hmi.tecla(n, true); b.avanca(seg); b.inv.hmi.tecla(n, false); b.avanca(0.02); }
function P(b, n, v) { const r = b.inv.set(n, v); if (!r.ok) console.log(`     (P${n} = ${v} recusado: ${r.msg})`); return r.ok; }
function missao(id) { return SIM.MISSOES.find((m) => m.id === id); }
function roda(b, m, mem, seg) { let okk = false; for (let t = 0; t < seg; t += 0.02) { b.avanca(0.02); okk = m.check(b, mem); } return okk; }

// ------------------------------------------------------------------ lista de parâmetros
{
  const L = SIM.params.LISTA;
  ok(L.length > 480, 'lista de parâmetros carregada', L.length + ' parâmetros');
  ok(new Set(L.map((p) => p.n)).size === L.length, 'sem parâmetro repetido');
  ok(L.every((p) => p.def >= p.min && p.def <= p.max), 'valores de fábrica dentro da faixa', L.filter((p) => p.def < p.min || p.def > p.max).map((p) => p.n).join(','));
  ok(SIM.params.MAPA[263].opc[13] === 'Multispeed' && SIM.params.MAPA[275].opc[11] === 'Run', 'opções de DI e DO');
}
// ------------------------------------------------------------------ energização e circuito de força
{
  const b = nova('forca');
  b.avanca(0.5); ok(!b.inv.vivo, 'sem rede o inversor fica apagado');
  b.acao('X1', { ligada: true }); b.avanca(1); ok(!b.inv.vivo, 'com Q1 aberto não chega tensão em R/S/T');
  b.acao('Q1', { fechado: true }); b.avanca(2.5);
  ok(b.inv.vivo && b.inv.boot <= 0, 'fechou Q1: inversor energizado'); ok(perto(b.inv.P[4], 311, 4), 'link DC perto de 311 V', b.inv.P[4]);
  ok(b.inv.ent.fases === 3 && b.inv.ent.motor.fases === 3, 'três fases na entrada e motor ligado nas três saídas');
  ok(b.inv.estado === 0 && b.inv.P[47] === 0, 'estado Ready, sem CONFIG');
  const mm = b.porTipo('multi');
  b.acao(mm.id, { modo: 1, pv: 'A1.R', pc: 'A1.S' }); b.avanca(0.05); ok(perto(parseFloat(b.leitura.txt), 220, 1), 'multímetro V~ entre R e S = 220 V', b.leitura.txt);
  b.acao(mm.id, { pv: 'X1.L1', pc: 'X1.N' }); b.avanca(0.05); ok(perto(parseFloat(b.leitura.txt), 127, 1), 'V~ fase-neutro = 127 V', b.leitura.txt);
  b.acao(mm.id, { modo: 2, pv: 'A1.c9', pc: 'A1.c16' }); b.avanca(0.05); ok(perto(parseFloat(b.leitura.txt), 24, 0.3), 'V⎓ +24 V', b.leitura.txt);
  b.acao(mm.id, { pv: 'A1.c1', pc: 'A1.c4' }); b.avanca(0.05); ok(perto(parseFloat(b.leitura.txt), 24, 0.5), 'DI1 aberta (NPN) fica em 24 V', b.leitura.txt);
  b.acao(mm.id, { pv: 'A1.c8', pc: 'A1.c4' }); b.avanca(0.05); ok(perto(parseFloat(b.leitura.txt), 10, 0.1), 'V⎓ +10 V', b.leitura.txt);
  // comando local pela HMI
  tecla(b, 'i'); b.avanca(3); ok(b.inv.pwm && perto(b.inv.P[5], 3, 0.05), 'tecla I: parte e fica na mínima de 3 Hz', b.inv.P[5]);
  b.inv.P[121] = 60; b.avanca(12);
  ok(perto(b.inv.P[5], 60, 0.1), 'acelera até 60 Hz', b.inv.P[5]); ok(perto(b.motor.rpm, 1775, 20), 'motor perto de 1775 rpm com 30 % de carga', b.motor.rpm.toFixed(0));
  ok(b.inv.P[3] > 1.6 && b.inv.P[3] < 2.6, 'corrente coerente com a carga', b.inv.P[3]); ok(perto(b.inv.P[7], 220, 2), 'tensão de saída 220 V', b.inv.P[7]);
  b.acao(mm.id, { modo: 1, pv: 'M1.U1', pc: 'M1.V1' }); b.avanca(0.05); ok(perto(parseFloat(b.leitura.txt), 220, 2), 'V~ nos bornes do motor', b.leitura.txt);
  b.motor.carga = 1.0; b.avanca(3); ok(perto(b.motor.rpm, 1725, 12) && perto(b.inv.P[3], 3.0, 0.25), 'carga nominal: 1725 rpm e ~3,0 A', `${b.motor.rpm.toFixed(0)} rpm ${b.inv.P[3]} A`);
  ok(perto(b.inv.P[9], 100, 12), 'torque perto de 100 %', b.inv.P[9]);
  b.motor.carga = 0.3;
  tecla(b, 'giro'); b.avanca(22); ok(perto(b.inv.fS, -60, 0.1) && b.motor.rpm < -1700, 'tecla de giro: inverte o sentido', b.motor.rpm.toFixed(0));
  tecla(b, 'o'); b.avanca(11); ok(!b.inv.pwm && Math.abs(b.motor.rpm) < 5, 'tecla O: para por rampa');
  // JOG e LOC/REM
  b.inv.hmi.tecla('jog', true); b.avanca(2); ok(b.inv.pwm && perto(Math.abs(b.inv.fS), 5, 0.1), 'JOG gira em 5 Hz enquanto apertado', b.inv.fS.toFixed(1)); b.inv.hmi.tecla('jog', false); b.avanca(2); ok(!b.inv.pwm, 'soltou o JOG: para');
  tecla(b, 'locrem'); ok(!b.inv.loc, 'tecla LOC/REM passa para REM');
  // HMI: navegar até P0100 e gravar 3,0 s
  const h = b.inv.hmi; tecla(b, 'enter'); ok(h.modo === 'menu', 'ENTER/MENU abre a seleção de grupo'); tecla(b, 'enter');
  while (h.par.n !== 100) tecla(b, 'up', 0.02);
  ok(h.display().main === 'P0100', 'nível 2 mostra P0100 no display principal', h.display().sec);
  tecla(b, 'enter'); for (let i = 0; i < 70; i++) tecla(b, 'down', 0.02); tecla(b, 'enter');
  ok(b.inv.P[100] === 3, 'editou P0100 de 10,0 para 3,0 s pelas teclas', b.inv.P[100]); tecla(b, 'esc'); tecla(b, 'esc'); ok(h.modo === 'mon', 'BACK/ESC volta à monitoração');
  // desliga a rede
  b.acao('X1', { ligada: false }); b.avanca(3); ok(!b.inv.vivo, 'sem rede: link DC descarrega e o display apaga', b.inv.ud.toFixed(0));
}
// ------------------------------------------------------------------ erros de ligação
{
  let b = nova('forca'); b.addFio('X1.L1', 'X1.L2'); liga(b); ok(b.comp('X1').st.desarmada && !b.inv.vivo, 'curto entre fases desarma a proteção geral', b.erros[0]);
  b = nova('forca'); b.addFio('X1.L1', 'A1.c1'); liga(b); ok(b.comp('X1').st.desarmada, '220 V em borne de comando desarma e avisa', b.erros[0]);
  b = nova('forca'); b.fios = b.fios.filter((f) => f.a !== 'A1.W'); b.sujo = true; liga(b); tecla(b, 'i'); b.inv.P[121] = 30; b.avanca(5);
  ok(Math.abs(b.motor.rpm) < 5 && b.inv.P[3] > 3, 'motor com duas fases não parte e a corrente sobe', `${b.motor.rpm.toFixed(0)} rpm ${b.inv.P[3]} A`);
  b = nova('forca'); b.fios.forEach((f) => { if (f.a === 'A1.U') f.b = 'M1.V1'; else if (f.a === 'A1.V') f.b = 'M1.U1'; }); b.sujo = true; liga(b); tecla(b, 'i'); b.avanca(3);
  ok(b.motor.rpm < -20, 'duas fases trocadas no motor: gira ao contrário', b.motor.rpm.toFixed(0));
  b = nova('forca'); b.addFio('A1.U', 'A1.V'); liga(b); tecla(b, 'i'); b.avanca(1); ok(b.inv.falhaCod === 70, 'curto entre U e V: F0070', b.inv.falhaCod);
  tecla(b, 'o'); ok(b.inv.falhaCod === 0, 'tecla O faz o reset da falha');
  b = nova(); ['X1.L1,A1.R', 'X1.N,A1.S'].forEach((x) => b.addFio(...x.split(','))); b.acao('X1', { ligada: true }); b.avanca(2); ok(b.inv.vivo && b.inv.estado === 2, 'alimentado em 127 V (fase-neutro): subtensão', b.inv.P[4]);
  b = nova(); ['X1.L1,M1.U1', 'X1.L2,M1.V1', 'X1.L3,M1.W1'].forEach((x) => b.addFio(...x.split(','))); b.fechamento('D'); b.acao('X1', { ligada: true }); b.avanca(2); ok(b.motor.rpm > 1700, 'motor direto na rede (partida direta) gira a 60 Hz', b.motor.rpm.toFixed(0));
  b = nova('forca'); liga(b); b.addFio('A1.c9', 'A1.c16'); b.avanca(0.1); ok(b.avisos.length > 0 && b.vcc('A1.c9') < 1, 'curto no +24 V: fonte limita e avisa', b.avisos[0]);
}
// ------------------------------------------------------------------ CONFIG, falhas e proteções
{
  const b = nova('dois_fios'); liga(b);
  P(b, 263, 6); b.avanca(0.1); ok(b.inv.P[47] === 16 && b.inv.estado === 5, 'Start sem Stop: CONFIG 16', b.inv.P[47]); P(b, 263, 1);
  P(b, 222, 8); b.avanca(0.1); ok(b.inv.P[47] === 17, 'Multispeed sem DIx: CONFIG 17', b.inv.P[47]); P(b, 222, 0);
  b.avanca(0.1); ok(b.inv.P[47] === 0, 'corrigido: sai do CONFIG');
  tecla(b, 'locrem'); b.acao('K1', { on: true }); b.avanca(1); ok(b.inv.pwm, 'K1 na DI1 liga em REM');
  ok(!P(b, 263, 0), 'parâmetro cfg não altera com o motor girando');
  b.acao('K1', { on: false }); b.avanca(3);
  // sobrecarga do motor
  P(b, 121, 60); P(b, 100, 2); P(b, 156, 2); P(b, 157, 2); P(b, 158, 2); b.motor.carga = 1.0; tecla(b, 'locrem'); tecla(b, 'i'); b.avanca(100);
  ok(b.inv.falhaCod === 72, 'P0156 baixo com carga nominal: F0072 por Ixt', `falha ${b.inv.falhaCod} Ixt ${b.inv.P[37]} %`);
  ok(b.inv.P[50] === 72 && b.inv.P[51] > 2, 'histórico: P0050 = 72 e corrente da falha em P0051', b.inv.P[51]);
}
{ // inércia alta: regulação do link DC e F0022
  const b = nova('forca'); liga(b); b.motor.volante = true; b.motor.carga = 0; P(b, 100, 4); P(b, 101, 1); P(b, 121, 60); tecla(b, 'i'); b.avanca(8);
  tecla(b, 'o'); let lim = false, udMax = 0, t = 0; while (b.inv.pwm && t < 30) { b.avanca(0.02); t += 0.02; lim = lim || b.inv.limit === 'link DC'; udMax = Math.max(udMax, b.inv.ud); }
  ok(lim && !b.inv.falhaCod && t > 1.3, 'volante + rampa de 1 s: regulação do link DC estica a rampa', `parou em ${t.toFixed(1)} s, Ud máx ${udMax.toFixed(0)} V`);
  P(b, 151, 600); tecla(b, 'i'); b.avanca(8); tecla(b, 'o'); b.avanca(2); ok(b.inv.falhaCod === 22, 'com P0151 alto (sem regulação): F0022', b.inv.falhaCod);
}
{ // rampa curta com inércia: limitação de corrente
  const b = nova('forca'); liga(b); b.motor.volante = true; P(b, 100, 0.5); P(b, 121, 60); tecla(b, 'i'); let lim = false, t = 0, imax = 0;
  while (Math.abs(b.inv.fS) < 59.9 && t < 20 && !b.inv.falhaCod) { b.avanca(0.02); t += 0.02; lim = lim || b.inv.limit === 'corrente'; imax = Math.max(imax, b.motor.i); }
  ok(lim && !b.inv.falhaCod && t > 0.7, 'aceleração de 0,5 s com volante: limitação em P0135', `chegou em ${t.toFixed(1)} s, pico ${imax.toFixed(1)} A`);
}
// ------------------------------------------------------------------ missões: cada uma é resolvida "na mão" e o check precisa acusar
function prep(id) { const m = missao(id), b = nova(m.montagem); liga(b); (m.params || []).forEach(([n, v]) => P(b, n, v)); return { m, b, mem: {} }; }
{
  let { m, b, mem } = prep('energizar'); ok(roda(b, m, mem, 0.1), 'missão energizar');
  ({ m, b, mem } = prep('motor')); ok(roda(b, m, mem, 0.1), 'missão motor');
  ({ m, b, mem } = prep('hmi')); tecla(b, 'i'); b.inv.P[121] = 30; roda(b, m, mem, 7); tecla(b, 'giro'); roda(b, m, mem, 12); tecla(b, 'o'); ok(roda(b, m, mem, 7), 'missão hmi');
  ({ m, b, mem } = prep('rampas')); tecla(b, 'i'); b.inv.P[121] = 60; ok(roda(b, m, mem, 4), 'missão rampas');
  ({ m, b, mem } = prep('di')); tecla(b, 'locrem'); b.acao('K1', { on: true }); roda(b, m, mem, 3); b.acao('K1', { on: false }); ok(roda(b, m, mem, 3), 'missão di');
  ({ m, b, mem } = prep('sentido')); tecla(b, 'locrem'); b.acao('K1', { on: true }); roda(b, m, mem, 3); b.acao('K2', { on: true }); ok(roda(b, m, mem, 4), 'missão sentido');
  ({ m, b, mem } = prep('pot')); tecla(b, 'locrem'); b.acao('K1', { on: true }); roda(b, m, mem, 2); ok(perto(b.inv.P[5], 3, 0.1), '  potenciômetro no mínimo: 3 Hz', b.inv.P[5]);
  b.acao('RP1', { pos: 0.5 }); b.avanca(8); ok(perto(b.inv.P[18], 49.3, 0.5) && perto(b.inv.P[5], 34.0, 0.3), '  potenciômetro no meio: 49,3 % e 34,0 Hz (a AI1 carrega o cursor)', `${b.inv.P[18]} % ${b.inv.P[5]} Hz`);
  b.acao('RP1', { pos: 1 }); ok(roda(b, m, mem, 8), 'missão pot', `${b.inv.P[18]} % ${b.inv.P[5]} Hz`);
  ok(perto(b.inv.sai.ao1, 10, 0.2), '  AO1 (velocidade real) em 10 V na máxima', b.inv.sai.ao1.toFixed(2));
  ({ m, b, mem } = prep('multimetro')); b.acao('P1', { modo: 2, pv: 'A1.c6', pc: 'A1.c4' }); b.acao('RP1', { pos: 0.507 }); ok(roda(b, m, mem, 0.5), 'missão multímetro', b.leitura.txt + ' V');
  b.acao('X1', { ligada: false }); b.avanca(3); b.acao('P1', { modo: 3, pv: 'RP1.1', pc: 'RP1.3' }); b.avanca(0.05); ok(b.leitura.txt === '4.94', '  Ω no potenciômetro ainda ligado ao inversor: 4,94 kΩ (a AI1 fica em paralelo)', b.leitura.txt); b.fios = b.fios.filter((f) => !f.b.startsWith('RP1.')); b.sujo = true; b.avanca(0.05); ok(b.leitura.txt === '5.00' && b.leitura.un === 'kΩ', '  Ω no potenciômetro (desenergizado) = 5,00 kΩ', b.leitura.txt + b.leitura.un);
  b.acao('P1', { pv: 'M1.U1', pc: 'M1.V1' }); b.avanca(0.05); ok(perto(parseFloat(b.leitura.txt), 6.8, 0.1), '  Ω entre U1 e V1 = 6,8 Ω', b.leitura.txt);
  b.acao('P1', { modo: 4, pv: 'K1.13', pc: 'K1.14' }); b.avanca(0.05); ok(!b.leitura.bip, '  continuidade: chave aberta não apita'); b.acao('K1', { on: true }); b.avanca(0.05); ok(b.leitura.bip, '  continuidade: chave fechada apita');
  ({ m, b, mem } = prep('tres_fios')); ok(b.inv.P[47] === 0, '  3 fios sem CONFIG', b.inv.P[47]); tecla(b, 'locrem'); b.acao('S1', { ap: true }); b.avanca(0.2); b.acao('S1', { ap: false }); roda(b, m, mem, 2);
  ok(b.inv.pwm, '  pulso em S1 mantém girando'); b.acao('S2', { ap: true }); b.avanca(0.2); b.acao('S2', { ap: false }); ok(roda(b, m, mem, 3), 'missão 3 fios');
  ({ m, b, mem } = prep('multispeed')); ok(b.inv.P[47] === 0, '  multispeed sem CONFIG', b.inv.P[47]); tecla(b, 'locrem'); b.acao('K1', { on: true }); P(b, 100, 2); P(b, 101, 2);
  for (const [k3, k4] of [[0, 0], [0, 1], [1, 0], [1, 1]]) { b.acao('K3', { on: !!k3 }); b.acao('K4', { on: !!k4 }); roda(b, m, mem, 3); }
  ok(m.check(b, mem), 'missão multispeed', JSON.stringify(mem));
  ({ m, b, mem } = prep('sinal')); tecla(b, 'locrem'); P(b, 100, 2); P(b, 101, 2); b.acao('K1', { on: true }); b.acao('RP1', { pos: 0.2 }); roda(b, m, mem, 3); b.acao('RP1', { pos: 0.9 }); roda(b, m, mem, 4); b.acao('K1', { on: false });
  ok(roda(b, m, mem, 4), 'missão sinalização', JSON.stringify(mem));
  ({ m, b, mem } = prep('falha_ext')); b.addFio('A1.c16', 'S0.11'); b.addFio('S0.12', 'A1.c7'); b.avanca(0.1); tecla(b, 'i'); b.avanca(1); b.acao('S0', { ap: true }); roda(b, m, mem, 0.5);
  ok(b.inv.falhaCod === 91, '  emergência apertada: F0091'); b.acao('S0', { ap: false }); b.avanca(0.1); tecla(b, 'o'); ok(roda(b, m, mem, 0.2), 'missão falha externa');
  ({ m, b, mem } = prep('corrente')); b.acao('A1', { s1: true }); b.acao('G1', { modo: 'mA', valor: 12 }); roda(b, m, mem, 0.5); ok(perto(b.inv.P[18], 50, 0.5), '  12 mA = 50 %', b.inv.P[18]);
  b.fios = b.fios.filter((f) => f.a !== 'G1.P'); b.sujo = true; ok(roda(b, m, mem, 0.5), 'missão 4-20 mA (A0163 com o laço aberto)', 'alarme ' + b.inv.alarme);
  ({ m, b, mem } = prep('osciloscopio')); b.acao('P2', { a1: 'A1.U', b1: 'M1.V1' }); tecla(b, 'i'); b.inv.P[121] = 30; roda(b, m, mem, 7); ok(!!mem.a && !mem.b, '  osciloscópio entre U e V: vê o PWM'); b.acao('P2', { filtro: true }); ok(roda(b, m, mem, 0.3), 'missão osciloscópio');
  ({ m, b, mem } = prep('link_dc')); b.motor.volante = true; P(b, 121, 60); P(b, 100, 3); tecla(b, 'i'); roda(b, m, mem, 8); tecla(b, 'o'); ok(roda(b, m, mem, 12), 'missão link DC');
}
// ------------------------------------------------------------------ osciloscópio
{
  const b = nova('forca'); liga(b); ok(!!b.porTipo('osc'), 'a bancada tem o osciloscópio');
  let c = b.canal('X1.L1', 'X1.L2', 0.05, 300, false); ok(c.tipo === 'rede' && c.freq === 60 && perto(c.rms, 220, 0.5) && perto(c.vpp, 622, 3), 'rede entre L1 e L2: senoide de 60 Hz, 220 V eficazes, 622 V pico a pico', `${c.rms.toFixed(1)} V ${c.vpp.toFixed(0)} Vpp`);
  c = b.canal('X1.L1', 'X1.N', 0.05, 300, false); ok(perto(c.rms, 127, 0.5), 'fase-neutro: 127 V eficazes', c.rms.toFixed(1));
  c = b.canal('A1.c9', 'A1.c4', 0.05, 300, false); ok(c.tipo === 'cc' && perto(c.media, 24, 0.2) && c.vpp < 0.01, '+24 V: linha reta em 24 V', c.media.toFixed(2));
  c = b.canal('A1.U', 'A1.V', 0.05, 300, false); ok(c.tipo === 'cc' && c.vpp === 0, 'inversor parado: saída em zero');
  tecla(b, 'i'); b.inv.P[121] = 30; b.avanca(7);
  c = b.canal('A1.U', 'A1.V', 0.1, 300, false); const ud = b.inv.ud;
  ok(c.tipo === 'pwm' && perto(c.freq, 30, 0.1) && perto(c.vpp, 2 * ud, 1), 'saída U-V a 30 Hz: pulsos PWM entre +Ud e -Ud', `${c.vpp.toFixed(0)} Vpp, Ud ${ud.toFixed(0)} V`);
  const niveis = new Set(); for (let k = 0; k < 4000; k++) niveis.add(Math.round(b.potencial('A1.U', k * 1.37e-5, false) - b.potencial('A1.V', k * 1.37e-5, false)));
  ok(niveis.size === 3 && niveis.has(0), 'o PWM entre fases só tem três níveis: +Ud, 0 e -Ud', [...niveis].join(' / '));
  const f = b.canal('A1.U', 'A1.V', 0.1, 300, true);
  ok(f.tipo === 'fundamental' && perto(f.rms, b.inv.P[7], 1.5) && perto(f.vpp, b.inv.P[7] * 2 * Math.SQRT2, 5), 'com o filtro: senoide com o mesmo valor de P0007', `${f.rms.toFixed(1)} V x P0007 ${b.inv.P[7]} V`);
  ok(c.rms > f.rms * 1.25, 'o eficaz do PWM é bem maior que o da fundamental (o que um multímetro comum erra)', `${c.rms.toFixed(0)} V x ${f.rms.toFixed(0)} V`);
  const m1 = b.canal('M1.U1', 'M1.V1', 0.1, 300, true); ok(perto(m1.rms, f.rms, 0.5), 'nos bornes do motor chega a mesma onda', m1.rms.toFixed(1));
  const t = 1 / 30 / 4, u = b.potencial('A1.U', t, true), v = b.potencial('A1.V', t, true), w = b.potencial('A1.W', t, true); ok(Math.abs(u + v + w) < 0.5 && u > v && u > w, 'três fases defasadas de 120° (soma zero)', `${u.toFixed(0)} ${v.toFixed(0)} ${w.toFixed(0)}`);
  const s2 = JSON.parse(JSON.stringify(b.salvar())); s2.comps = s2.comps.filter((x) => x.tipo !== 'osc'); ok(!!new SIM.Bancada({ salvo: s2 }).porTipo('osc'), 'bancada gravada antes do osciloscópio ganha o instrumento ao abrir');
}
// ------------------------------------------------------------------ contatora, fonte, sinaleiro 220 V, componentes extras
{
  const b = nova(); const r = b.montagem('contatora'); ok(r.novos === 2 && !!b.comp('KM1') && !!b.comp('U1'), 'montagem com contatora recoloca KM1 e U1 no painel', JSON.stringify(r));
  ok(!b.ocupado('cont', b.comp('KM1').x, b.comp('KM1').y, 'KM1') && !b.ocupado('fonte', b.comp('U1').x, b.comp('U1').y, 'U1'), 'KM1 e U1 em lugares livres', `${b.comp('KM1').x},${b.comp('KM1').y} / ${b.comp('U1').x},${b.comp('U1').y}`);
  liga(b); ok(b.comp('U1').st.on && perto(b.vcc('U1.P') - b.vcc('U1.M'), 24, 0.2), 'fonte U1 ligada em fase-neutro: 24 V na saída');
  ok(!b.comp('KM1').st.fechado && b.comp('H2').st.aceso && !b.comp('H1').st.aceso, 'em repouso: KM1 aberta, sinaleiro vermelho pelo NF aceso');
  b.acao('S1', { ap: true }); b.avanca(0.1); b.acao('S1', { ap: false }); b.avanca(3);
  ok(b.comp('KM1').st.fechado && b.motor.rpm > 1700 && b.comp('H1').st.aceso && !b.comp('H2').st.aceso, 'pulso em S1: KM1 fecha, fica selada e o motor parte direto da rede', b.motor.rpm.toFixed(0));
  b.acao('S2', { ap: true }); b.avanca(0.1); b.acao('S2', { ap: false }); b.avanca(0.2); ok(!b.comp('KM1').st.fechado, 'pulso em S2: KM1 abre');
  b.avanca(6); ok(Math.abs(b.motor.rpm) < 50, 'o motor para por inércia');
  const c = nova('forca'); const k1 = c.add('cont'), k2 = c.add('cont'); ok(!!k1 && !!k2 && k1.id === 'KM1' && k2.id === 'KM2', 'acrescentar duas contatoras', `${k1 && k1.id} ${k2 && k2.id}`);
  [['A1.c9', k1.id + '.A1'], [k1.id + '.A2', 'A1.c16']].forEach(([x, y]) => c.addFio(x, y)); liga(c);
  ok(c.comp(k1.id).st.fechado, 'uma bobina no +24 V do inversor (~105 mA): fecha');
  [['A1.c9', k2.id + '.A1'], [k2.id + '.A2', 'A1.c16']].forEach(([x, y]) => c.addFio(x, y)); c.avanca(0.2);
  ok(c.comp(k1.id).st.fechado && !c.comp(k2.id).st.fechado && c.avisos.length > 0, 'duas bobinas passam dos 150 mA do inversor: a tensão cai, a segunda não fecha (a primeira se mantém, como na prática)', `${(c.vcc('A1.c9') - c.vcc('A1.c4')).toFixed(1)} V · ${c.avisos[0]}`);
  const d = nova('forca'); d.add('lamp', undefined, undefined, 'verde'); const h = d.comps[d.comps.length - 1]; d.addFio('X1.L1', h.id + '.X1'); d.addFio('X1.N', h.id + '.X2'); liga(d); ok(!h.st.aceso && h.st.brilho > 0.3 && h.st.brilho < 0.6, 'sinaleiro 220 Vca em 127 V (fase-neutro): acende fraco', h.st.brilho.toFixed(2));
  d.removerFio(d.fios[d.fios.length - 1].id); d.addFio('X1.L2', h.id + '.X2'); d.avanca(0.05); ok(h.st.aceso, 'sinaleiro 220 Vca entre duas fases: aceso');
  let n = 0; const e = nova(); while (e.add('sinal', undefined, undefined, 'azul')) n++; ok(n > 15 && e.motivo === 'cheio', 'dá para encher o painel de sinaleiros até não caber mais', n + ' sinaleiros');
  ok(e.remover('S3') && !e.comp('S3') && !e.remover('A1'), 'remover componente (o inversor não sai)');
  const n1 = n; e.tamanhoPainel('grande'); let n2 = 0; while (e.add('sinal', undefined, undefined, 'azul')) n2++; ok(n2 > 12, 'painel Grande: cabem mais componentes', `+${n2} sinaleiros`);
  e.tamanhoPainel('extra'); let n3 = 0; while (e.add('sinal', undefined, undefined, 'azul')) n3++; ok(n3 > 25, 'painel Extra: cabem ainda mais', `+${n3} sinaleiros`); void n1;
  const pe = nova(); pe.tamanhoPainel('grande'); const sx = pe.add('chave'); sx.x = 1.2; const mv = pe.tamanhoPainel('normal'); ok(mv >= 1 && Math.abs(sx.x) <= 0.9, 'voltar para o painel Normal traz para dentro o que ficou fora', `${mv} movido(s), x = ${sx.x}`);
  const pg = JSON.parse(JSON.stringify(pe.salvar())); pg.painel = 'extra'; ok(new SIM.Bancada({ salvo: pg }).painel === 'extra', 'o tamanho do painel é gravado na sessão');
  const f = nova('forca'); ok(f.corFio(f.fios[0].id, 'laranja') && f.fios[0].cor === 'laranja', 'trocar a cor de um fio');
  const g = nova('forca'); liga(g); g.inv.set(222, 8); g.inv.set(100, 2.5); const np = g.inv.parametrizar(SIM.PLACA_P.concat(SIM.MISSOES.find((m) => m.id === 'multispeed').params));
  ok(np === 17 && g.inv.P[222] === 8 && g.inv.P[265] === 13 && g.inv.P[100] === 10 && g.inv.P[401] === 3, 'parametrizar automático: fábrica + placa + parâmetros da atividade', np);
  g.avanca(0.1); ok(g.inv.P[47] === 0, 'a atividade parametrizada não fica em CONF', g.inv.P[47]);
  for (const m of SIM.MISSOES) { const x = nova('forca'); liga(x); x.inv.parametrizar(SIM.PLACA_P.concat(m.params || [])); x.avanca(0.05); if (x.inv.P[47] !== 0) ok(false, `  ${m.id} parametrizada sem CONF`, x.inv.P[47]); }
  ok(true, 'nenhuma atividade parametrizada automaticamente cai em CONF');
}
// ------------------------------------------------------------------ campo girante: grandezas do memorial de cálculo
{
  const K = SIM.MOTOR_K, m = new SIM.Motor(); m.carga = 1; for (let t = 0; t < 4; t += 0.002) m.passo(0.002, { f: 60, v: 220, seq: 1, fases: 3, cc: 0 });
  const ns = 120 * 60 / 4, sl = (ns - m.rpm) / ns, f2 = sl * 60, x = f2 / K.FK, T = 2 * K.TMAX * m.phi * m.phi * x / (1 + x * x) * (1 + K.BP * x * x / (K.CP + x * x));
  ok(perto(m.rpm, 1725, 3) && perto(sl * 100, 4.17, 0.2) && perto(f2, 2.5, 0.1) && perto(m.fs, f2, 0.01), 'carga nominal a 60 Hz: ns 1800, n 1725, s 4,17 %, f2 2,5 Hz', `${m.rpm.toFixed(0)} rpm · s ${(sl * 100).toFixed(2)} % · f2 ${f2.toFixed(2)} Hz`);
  ok(perto(T, m.torque, 0.01) && perto(m.torque, K.TN, 0.1) && perto(m.phi, 1, 0.02), 'conjugado pela fórmula de Kloss = conjugado do modelo = nominal (4,15 N·m), fluxo 100 %', `${T.toFixed(2)} N·m, fluxo ${(m.phi * 100).toFixed(0)} %`);
  const m2 = new SIM.Motor(); m2.carga = 1; for (let t = 0; t < 4; t += 0.002) m2.passo(0.002, { f: 30, v: 0.03 * 220 + 0.97 * 110, seq: 1, fases: 3, cc: 0 });
  ok(perto(900 - m2.rpm, 1800 - m.rpm, 25) && (900 - m2.rpm) / 900 > sl * 1.6, 'a 30 Hz com V/f: o escorregamento em rpm quase não muda e em % dobra', `${(900 - m2.rpm).toFixed(0)} rpm (${((900 - m2.rpm) / 9).toFixed(1)} %) x ${(1800 - m.rpm).toFixed(0)} rpm (${(sl * 100).toFixed(1)} %)`);
  ok(perto(2 * K.TMAX * x / (1 + x * x) / K.TN, 1, 0.03), 'na faixa de trabalho a fórmula de Kloss simples já dá o conjugado (erro menor que 3 %)', (2 * K.TMAX * x / (1 + x * x) / K.TN).toFixed(3));
  const m3 = new SIM.Motor(); m3.travado = true; for (let t = 0; t < 1; t += 0.002) m3.passo(0.002, { f: 60, v: 220, seq: 1, fases: 3, cc: 0 }); ok(m3.rpm === 0 && perto(m3.fs, 60, 0.01), 'rotor travado: s = 100 % e f2 = f', m3.fs);
  ok(perto(m3.torque / K.TN, 1.55, 0.25), 'conjugado de partida com rotor travado e 220 V (com a queda no estator)', (m3.torque / K.TN).toFixed(2) + ' x Tn');
}
// ------------------------------------------------------------------ fechamento do motor (6 pontas) e rede 220 / 380 V
{
  let b = nova('forca'); ok(b.fios.filter((f) => f.a.startsWith('M1.') && f.b.startsWith('M1.')).length === 3, 'rede 220 V: a montagem pronta fecha o motor em triângulo (3 jumpers)');
  liga(b); ok(b.alim.lig === 'Δ' && perto(b.alim.kv, 1, 0.01) && b.inv.ent.motor.fases === 3, 'triângulo: cada enrolamento recebe a tensão entre fases', `kv ${b.alim.kv.toFixed(2)}`);
  tecla(b, 'i'); b.inv.P[121] = 60; b.motor.carga = 1; b.avanca(14); ok(perto(b.motor.rpm, 1725, 8) && perto(b.iLinha, 2.98, 0.15) && perto(b.vEnrol, 220, 3), 'triângulo em 220 V na carga nominal: 1725 rpm, 2,98 A de linha, 220 V no enrolamento', `${b.motor.rpm.toFixed(0)} rpm · ${b.iLinha.toFixed(2)} A · ${b.vEnrol.toFixed(0)} V`);
  b = nova('forca'); b.fechamento(''); liga(b); tecla(b, 'i'); b.inv.P[121] = 30; b.avanca(4); ok(b.alim.via === '' && Math.abs(b.motor.rpm) < 1 && b.inv.ent.motor.fases === 0, 'sem fechamento (6 pontas soltas): não passa corrente e o motor não gira');
  b = nova('forca'); b.fechamento('Y'); liga(b); ok(b.alim.lig === 'Y' && perto(b.alim.kv, 0.577, 0.01), 'estrela: cada enrolamento recebe a tensão entre fases ÷ √3', b.alim.kv.toFixed(3));
  tecla(b, 'i'); b.inv.P[121] = 60; b.motor.carga = 0.3; b.avanca(14); ok(perto(b.vEnrol, 127, 3) && b.motor.phi < 0.65, 'estrela em 220 V (errado): só 127 V no enrolamento, fluxo fraco', `${b.vEnrol.toFixed(0)} V · fluxo ${(b.motor.phi * 100).toFixed(0)} %`);
  b.motor.carga = 1; b.avanca(6); ok(b.motor.rpm < 1650 || b.inv.falhaCod !== 0, '  e com carga nominal ele perde rotação ou cai em falha', `${b.motor.rpm.toFixed(0)} rpm, falha ${b.inv.falhaCod}`);
  b = nova('forca'); b.acao('P1', { modo: 3, pv: 'M1.U1', pc: 'M1.U2' }); b.fechamento(''); b.avanca(0.05); ok(perto(parseFloat(b.leitura.txt), 10.2, 0.1), 'multímetro em Ω num enrolamento solto (U1-U2): 10,2 Ω', b.leitura.txt);
  b.fios = b.fios.filter((f) => !f.b.startsWith('M1.') && !f.a.startsWith('M1.')); b.fechamento('Y'); b.acao('P1', { pv: 'M1.U1', pc: 'M1.V1' }); b.avanca(0.05); ok(perto(parseFloat(b.leitura.txt), 20.4, 0.2), 'em estrela, entre U1 e V1: 20,4 Ω (dois enrolamentos em série)', b.leitura.txt);
  b.fechamento('D'); b.avanca(0.05); ok(perto(parseFloat(b.leitura.txt), 6.8, 0.1), 'em triângulo, entre U1 e V1: 6,8 Ω', b.leitura.txt);
  // rede 380 V
  b = nova(); ok(b.tensaoRede(380) && b.tensao === 380 && b.inv.classe === 380 && b.inv.P[296] === 1 && b.inv.P[400] === 380 && b.inv.P[151] === 800 && b.inv.P[29] === 9, 'rede 380 V: o inversor passa a ser o de 380-480 V, com os padrões dele');
  b.montagem('forca'); ok(b.fios.filter((f) => f.a.startsWith('M1.') && f.b.startsWith('M1.')).length === 2, 'rede 380 V: a montagem pronta fecha o motor em estrela (2 jumpers)');
  liga(b); ok(perto(b.inv.P[4], 537, 6) && b.inv.estado === 0, 'link DC perto de 537 V e inversor pronto', b.inv.P[4]);
  b.acao('P1', { modo: 1, pv: 'X1.L1', pc: 'X1.L2' }); b.avanca(0.05); const vll = parseFloat(b.leitura.txt); b.acao('P1', { pc: 'X1.N' }); b.avanca(0.05); ok(perto(vll, 380, 1) && perto(parseFloat(b.leitura.txt), 219.4, 1), 'multímetro: 380 V entre fases e 220 V fase-neutro', `${vll} / ${b.leitura.txt}`);
  b.inv.parametrizar(SIM.placaP(b)); ok(b.inv.P[400] === 380 && b.inv.P[401] === 1.7, 'placa em estrela: P0400 = 380 V e P0401 = 1,7 A'); ok(missao('motor').check(b, {}), 'missão motor na rede de 380 V (estrela + placa)');
  tecla(b, 'i'); b.inv.P[121] = 60; b.motor.carga = 1; b.avanca(14); ok(perto(b.motor.rpm, 1725, 8) && perto(b.iLinha, 1.72, 0.1) && perto(b.inv.P[7], 380, 4) && perto(b.vEnrol, 220, 3), 'estrela em 380 V na carga nominal: 1725 rpm, 1,72 A de linha, 380 V na saída, 220 V no enrolamento', `${b.motor.rpm.toFixed(0)} rpm · ${b.iLinha.toFixed(2)} A · ${b.inv.P[7]} V · ${b.vEnrol.toFixed(0)} V`);
  const ca = b.canal('A1.U', 'A1.V', 0.05, 100, true); ok(perto(ca.rms, 380, 5), 'osciloscópio na saída em 380 V', ca.rms.toFixed(0));
  b = nova(); b.tensaoRede(380); ['X1.L1,M1.U1', 'X1.L2,M1.V1', 'X1.L3,M1.W1'].forEach((x) => b.addFio(...x.split(','))); b.fechamento('D'); b.acao('X1', { ligada: true }); b.avanca(7);
  ok(b.comp('X1').st.desarmada && /triângulo/.test(b.erros[0]), 'triângulo direto em 380 V: 380 V em cada enrolamento, a proteção desarma e explica', b.erros[0]);
  b = nova(); b.tensaoRede(380); ['X1.L1,M1.U1', 'X1.L2,M1.V1', 'X1.L3,M1.W1'].forEach((x) => b.addFio(...x.split(','))); b.fechamento('Y'); b.acao('X1', { ligada: true }); b.avanca(5); ok(b.motor.rpm > 1700 && !b.comp('X1').st.desarmada && perto(b.iLinha, 1.15, 0.2), 'estrela direto em 380 V: gira normal', `${b.motor.rpm.toFixed(0)} rpm · ${b.iLinha.toFixed(2)} A`);
  b = nova(); b.tensaoRede(380); const fo = b.add('fonte'); b.addFio('X1.L1', fo.id + '.L'); b.addFio('X1.L2', fo.id + '.N'); b.acao('X1', { ligada: true }); b.avanca(0.1); ok(b.comp('X1').st.desarmada && /Fonte/.test(b.erros[0]), 'fonte de 24 V entre duas fases em 380 V: desarma', b.erros[0]);
  b = nova(); b.tensaoRede(380); const f2 = b.add('fonte'); b.addFio('X1.L1', f2.id + '.L'); b.addFio('X1.N', f2.id + '.N'); b.acao('X1', { ligada: true }); b.avanca(0.1); ok(f2.st.on && !b.comp('X1').st.desarmada, 'fonte entre fase e neutro em 380 V (220 V): liga');
  ok(b.tensaoRede(220) && b.inv.classe === 220 && b.inv.P[400] === 220 && !b.comp('X1').st.ligada, 'voltar para 220 V: inversor de 200-240 V e rede desligada');
  const antigo = JSON.parse(JSON.stringify(nova('forca').salvar())); delete antigo.v; antigo.fios = antigo.fios.filter((f) => !(f.a.startsWith('M1.') && f.b.startsWith('M1.')));
  const nb = new SIM.Bancada({ salvo: antigo }); ok(nb.fios.filter((f) => f.a.startsWith('M1.') && f.b.startsWith('M1.')).length === 3, 'bancada gravada antes (triângulo interno) ganha os 3 jumpers ao abrir');
  const s380 = nova(); s380.tensaoRede(380); const r380 = new SIM.Bancada({ salvo: JSON.parse(JSON.stringify(s380.salvar())) }); ok(r380.tensao === 380 && r380.inv.classe === 380, 'a rede de 380 V e a classe do inversor ficam gravadas');
}
// ------------------------------------------------------------------ gravar e recarregar
{
  const b = nova('pot'); liga(b); P(b, 100, 2.5); b.acao('RP1', { pos: 0.4 });
  const b2 = new SIM.Bancada({ salvo: JSON.parse(JSON.stringify(b.salvar())) });
  ok(b2.fios.length === b.fios.length && b2.inv.P[100] === 2.5 && b2.comp('RP1').st.pos === 0.4 && !b2.comp('X1').st.ligada, 'salvar e carregar a bancada (rede volta desligada)');
}
console.log(`\n${total} verificações, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
