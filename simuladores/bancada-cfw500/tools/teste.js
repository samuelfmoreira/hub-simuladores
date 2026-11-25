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
  b = nova(); ['X1.L1,M1.U1', 'X1.L2,M1.V1', 'X1.L3,M1.W1'].forEach((x) => b.addFio(...x.split(','))); b.acao('X1', { ligada: true }); b.avanca(2); ok(b.motor.rpm > 1700, 'motor direto na rede (partida direta) gira a 60 Hz', b.motor.rpm.toFixed(0));
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
  ({ m, b, mem } = prep('link_dc')); b.motor.volante = true; P(b, 121, 60); P(b, 100, 3); tecla(b, 'i'); roda(b, m, mem, 8); tecla(b, 'o'); ok(roda(b, m, mem, 12), 'missão link DC');
}
// ------------------------------------------------------------------ gravar e recarregar
{
  const b = nova('pot'); liga(b); P(b, 100, 2.5); b.acao('RP1', { pos: 0.4 });
  const b2 = new SIM.Bancada({ salvo: JSON.parse(JSON.stringify(b.salvar())) });
  ok(b2.fios.length === b.fios.length && b2.inv.P[100] === 2.5 && b2.comp('RP1').st.pos === 0.4 && !b2.comp('X1').st.ligada, 'salvar e carregar a bancada (rede volta desligada)');
}
console.log(`\n${total} verificações, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
