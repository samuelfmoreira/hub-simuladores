'use strict';
// Testes automáticos (rode com: node tools/teste.js). Termina com "0 falha(s)" quando está tudo certo.
// 1) núcleo do sensor   2) programa de referência contra o núcleo, ciclo a ciclo   3) fila   4) Modbus pela rede, com sessões   5) missões
const net = require('net');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { Nucleo, GEO, brutoDe } = require('../src/nucleo');
const { criarProgramaDemo } = require('../src/modbus/programa-demo');
const { criarClpDemo } = require('../src/modbus/clp-demo');
const { ClienteModbus } = require('../src/modbus/cliente');
const { Gerente } = require('../src/sessoes');
const TG = require('../src/tags');

let falhas = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ok ' : 'FALHA'}  ${msg}`); if (!cond) falhas++; };
const rodar = (n, s) => { for (let t = 0; t < s; t += 0.002) n.passo(0.002); };
const perto = (a, b, tol) => Math.abs(a - b) <= tol;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const f = (v, n = 3) => Number(v).toFixed(n);

function nucleoBasico() {
  console.log('\n1. Núcleo do sensor');
  let n = new Nucleo(); rodar(n, 2);
  ok(perto(n.m.D, 2.0, 0.001) && perto(n.m.mA, 10.4, 0.01) && n.m.bruto === 13107, `nível 1,000 m: D = ${f(n.m.D)} m, ${f(n.m.mA, 2)} mA, bruto ${n.m.bruto}`);
  ok(perto(n.m.tof, 11.648, 0.01), `tempo de voo a 20 °C: ${f(n.m.tof, 2)} ms (2 × 2,000 m ÷ 343,42 m/s)`);
  ok(brutoDe(4) === 0 && brutoDe(20) === 32767 && brutoDe(12) === 16384 && brutoDe(3.8) === -410 && brutoDe(0) === -8192, 'A/D de 15 bits: 4 mA = 0, 12 mA = 16384, 20 mA = 32767, 3,8 mA = −410, 0 mA = −8192');

  n = new Nucleo(); n.comando({ tipo: 'proc', campo: 'nivel', v: 2.5 }); rodar(n, 2);
  ok(perto(n.m.mA, 20, 0.01) && n.m.bruto >= 32760, `nível 2,500 m = 100 %: ${f(n.m.mA, 2)} mA, bruto ${n.m.bruto}`);
  n.comando({ tipo: 'proc', campo: 'nivel', v: 0 }); rodar(n, 4);
  ok(perto(n.m.mA, 4, 0.01) && Math.abs(n.m.bruto) <= 3, `tanque vazio = 0 %: ${f(n.m.mA, 2)} mA, bruto ${n.m.bruto}`);

  n = new Nucleo(); n.comando({ tipo: 'proc', campo: 'obstaculo', v: 1 }); n.comando({ tipo: 'proc', campo: 'nivel', v: 0.8 }); rodar(n, 2);
  ok(n.m.status === 'falso' && perto(n.m.D, 1.2, 0.002), `obstáculo no feixe: preso em eco falso, D = ${f(n.m.D)} m (indica ${f(n.nivelIndicado(), 2)} m com 0,80 m reais)`);
  n.comando({ tipo: 'param', id: 'supressao', v: 1 }); rodar(n, 2);
  ok(n.m.status === 'ok' && perto(n.m.D, 2.2, 0.002), `supressão de sinal falso ligada: volta ao eco do nível, D = ${f(n.m.D)} m`);

  n = new Nucleo(); n.comando({ tipo: 'proc', campo: 'temp', v: 50 }); n.comando({ tipo: 'param', id: 'correcaoTemp', v: 0 }); rodar(n, 2);
  ok(perto(n.nivelIndicado() - 1.0, 0.101, 0.003), `50 °C sem correção: erro de +${f((n.nivelIndicado() - 1) * 1000, 0)} mm no nível`);
  n.comando({ tipo: 'param', id: 'correcaoTemp', v: 1 }); rodar(n, 2);
  ok(perto(n.nivelIndicado(), 1.0, 0.001), 'com a correção de temperatura o erro some');

  n = new Nucleo(); n.comando({ tipo: 'proc', campo: 'nivel', v: 2.85 }); rodar(n, 2);
  ok(n.m.status === 'multiplo' && n.nivelIndicado() < 2.85 - 0.1, `nível na zona morta: agarra o 2º eco e indica ${f(n.nivelIndicado(), 2)} m com 2,85 m reais`);

  n = new Nucleo(); rodar(n, 1); n.comando({ tipo: 'proc', campo: 'espuma', v: 90 }); rodar(n, 2);
  ok(n.m.status === 'aguardando' && perto(n.m.mA, 10.4, 0.01), 'espuma 90 %: sem eco, mantém o último valor enquanto aguarda');
  rodar(n, 3);
  ok(n.m.erro === 'E013' && perto(n.m.mA, 3.55, 0.001) && n.m.bruto === -922, `depois de 4 s: E013, ${f(n.m.mA, 2)} mA, bruto ${n.m.bruto} (modo de falha < 3,6 mA)`);
  n.comando({ tipo: 'param', id: 'modoFalha', v: 3 }); rodar(n, 0.1);
  ok(perto(n.m.mA, 22, 0.001) && n.m.bruto === 32767, 'modo de falha 22 mA: o A/D satura em 32767, igual a 100 % (o CLP não distingue)');
  n.comando({ tipo: 'proc', campo: 'espuma', v: 0 }); rodar(n, 1);
  ok(n.m.status === 'ok' && n.m.erro === null && perto(n.m.mA, 10.4, 0.02), 'sem espuma, o eco volta e a falha some sozinha');

  n = new Nucleo(); n.comando({ tipo: 'proc', campo: 'cabo', v: 1 }); rodar(n, 0.1);
  ok(n.m.status === 'desligado' && n.m.mA === 0 && n.m.bruto === -8192, 'cabo rompido: transmissor sem alimentação, 0 mA, bruto −8192');

  n = new Nucleo(); n.comando({ tipo: 'param', id: 'calMax', v: 3.0 }); rodar(n, 0.1);
  ok(n.m.erro === 'E017', 'calibração mín. igual à máx.: E017 (faixa de calibração pequena demais)');
  ok(n.comando({ tipo: 'param', id: 'calMin', v: 99 }).v === 5 && n.comando({ tipo: 'param', id: 'naoExiste', v: 1 }).ok === false, 'parâmetro fora da faixa é limitado; parâmetro desconhecido é recusado');
  { const tela = (fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8').match(/VERSAO_TELA = '([^']+)'/) || [])[1]; ok(tela === require('../package.json').version, `a versão da tela (${tela}) é a mesma do package.json`); }
  const g = n.paraGravar(); ok(g.calMin === 5 && g.calMax === 3 && !('atenuacao' in g), 'só o que mudou é gravado');
  const m2 = new Nucleo({ salvos: { atenuacao: 5, lixo: 1 } }); ok(m2.p.atenuacao === 5 && !('lixo' in m2.p), 'carrega o que foi gravado e ignora o que não conhece');

  n = new Nucleo(); n.comando({ tipo: 'proc', campo: 'nivel', v: 0.5 }); n.comando({ tipo: 'proc', campo: 'vazao', v: 1 }); rodar(n, 10);
  ok(perto(n.proc.nivel, 1.5, 0.01), `encher por 10 s: +1,00 m (${f(n.proc.nivel, 2)} m)`);
  const a = new Nucleo(), b = new Nucleo(); for (const x of [a, b]) { x.comando({ tipo: 'proc', campo: 'vazao', v: 1 }); rodar(x, 3); }
  ok(a.m.D === b.m.D && a.m.bruto === b.m.bruto, 'determinístico: duas rodadas iguais dão o mesmo resultado');
}

function programaContraNucleo() {
  console.log('\n2. Programa de referência (PRG_Nivel) contra o núcleo, ciclo de 20 ms');
  const n = new Nucleo(); const mem = {};
  const prog = criarProgramaDemo({ le: (k) => n.entradasDoClp()[k], escreve: (k, v) => { mem[k] = v; } });
  const ciclo = (s) => { for (let t = 0; t < s; t += 0.02) { rodar(n, 0.02); prog.scan(0.02); } };
  const ir = (nivel) => { n.comando({ tipo: 'proc', campo: 'nivel', v: nivel }); ciclo(3); };
  const al = () => `${mem.LALL_01 ? 'LL ' : ''}${mem.LAL_01 ? 'L ' : ''}${mem.LAH_01 ? 'H ' : ''}${mem.LAHH_01 ? 'HH ' : ''}${mem.Falha_LT01 ? 'FALHA' : ''}`.trim() || 'nenhum';
  ir(1.0); ok(perto(mem.Nivel_Pct, 40, 0.1) && al() === 'nenhum', `1,00 m: CLP calcula ${f(mem.Nivel_Pct, 1)} %, alarmes: ${al()}`);
  ir(2.01); ok(perto(mem.Nivel_Pct, 80.4, 0.1) && al() === 'H', `2,01 m = 80,4 %: alarmes: ${al()}`);
  ir(1.96); ok(al() === 'H', `1,96 m = 78,4 %: LAH continua (histerese de 2 %): ${al()}`);
  ir(1.94); ok(al() === 'nenhum', `1,94 m = 77,6 %: LAH desarma: ${al()}`);
  ir(2.26); ok(al() === 'H HH', `2,26 m = 90,4 %: alarmes: ${al()}`);
  ir(0.49); ok(al() === 'L', `0,49 m = 19,6 %: alarmes: ${al()}`);
  ir(0.24); ok(al() === 'LL L', `0,24 m = 9,6 %: alarmes: ${al()}`);
  ir(1.0); n.comando({ tipo: 'proc', campo: 'espuma', v: 95 }); ciclo(5);
  ok(al() === 'FALHA' && mem.Nivel_Pct === 0, `espuma, E013 com < 3,6 mA: ${al()}, Nivel_Pct = ${mem.Nivel_Pct}`);
  n.comando({ tipo: 'proc', campo: 'espuma', v: 0 }); ciclo(1.5); ok(al() === 'nenhum', 'eco de volta: a falha limpa sozinha');
  n.comando({ tipo: 'proc', campo: 'cabo', v: 1 }); ciclo(0.2); ok(al() === 'FALHA', `cabo rompido (bruto ${n.m.bruto}): ${al()}`);
  n.comando({ tipo: 'proc', campo: 'cabo', v: 0 }); n.comando({ tipo: 'proc', campo: 'nivel', v: 0.1 }); ciclo(1.5);
  ok(al() === 'LL L', `tanque em 0,10 m = 4 %: é alarme de nível, não é falha (bruto ${n.m.bruto} ≥ −410): ${al()}`);
}

function nucleoParametros() {
  console.log('\n1b. Parâmetros do menu do aparelho');
  const P = (n, id, v) => n.comando({ tipo: 'param', id, v });
  let n = new Nucleo(); P(n, 'calMinPct', 10); P(n, 'calMaxPct', 90); rodar(n, 2);
  ok(perto(n.m.pct, 42, 0.05) && perto(n.m.mA, 10.72, 0.01), `calibração por dois pontos (10 % = 3,000 m; 90 % = 0,500 m) com 1,00 m: ${f(n.m.pct, 1)} %, ${f(n.m.mA, 2)} mA`);
  n = new Nucleo(); P(n, 'caracteristica', 1); rodar(n, 2);
  ok(perto(n.m.mA, 13.6, 0.01), `curva característica 20-4 mA com 40 %: ${f(n.m.mA, 2)} mA`);
  n = new Nucleo(); P(n, 'linearizacao', 1); n.comando({ tipo: 'proc', campo: 'nivel', v: 1.25 }); rodar(n, 3);
  ok(perto(n.m.pct, 50, 0.1), `linearização cilindro deitado: metade da altura = ${f(n.m.pct, 1)} % do volume`);
  n.comando({ tipo: 'proc', campo: 'nivel', v: 0.625 }); rodar(n, 3);
  ok(perto(n.m.pct, 19.55, 0.2) && perto(n.m.pctNivel, 25, 0.1), `linearização cilindro deitado: 25 % da altura = ${f(n.m.pct, 1)} % do volume`);
  P(n, 'linearizacao', 2); rodar(n, 0.1); ok(perto(n.m.pct, 15.6, 0.2), `linearização tanque esférico: 25 % da altura = ${f(n.m.pct, 1)} % do volume`);
  n = new Nucleo(); P(n, 'iMinSel', 1); P(n, 'iMaxSel', 0); n.comando({ tipo: 'proc', campo: 'nivel', v: 2.7 }); rodar(n, 3);
  ok(perto(n.m.mA, 20, 0.001), `corrente máx. 20 mA: com 108 % a saída para em ${f(n.m.mA, 2)} mA`);
  n = new Nucleo(); rodar(n, 1); const rs = n.comando({ tipo: 'simular', modo: 'pct', v: 75 }); rodar(n, 0.1);
  ok(rs.ok && perto(n.m.mA, 16, 0.001) && n.m.bruto === 24575 && perto(n.m.D, 2, 0.001), `simulação 75 %: saída ${f(n.m.mA, 2)} mA (bruto ${n.m.bruto}) com o nível real em 40 %`);
  n.comando({ tipo: 'simular', modo: 'mA', v: 4 }); rodar(n, 0.1); ok(perto(n.m.mA, 4, 0.001), 'simulação em corrente: 4,00 mA');
  rodar(n, 601); ok(!n.sim.ativa && perto(n.m.mA, 10.4, 0.01), 'a simulação termina sozinha depois de 10 min e a saída volta a seguir o nível');
  n = new Nucleo(); n.comando({ tipo: 'proc', campo: 'obstaculo', v: 1 }); n.comando({ tipo: 'proc', campo: 'nivel', v: 0.8 }); rodar(n, 2);
  let r = n.comando({ tipo: 'supressao', acao: 'criar', dist: 2.2 }); rodar(n, 2);
  ok(r.ok && r.n === 1 && !r.pegouNivel && n.m.status === 'ok' && perto(n.m.D, 2.2, 0.002), `supressão criada com a distância certa (2,200 m): ${r.n} eco gravado e a medição volta ao nível`);
  r = n.comando({ tipo: 'supressao', acao: 'criar', dist: 3.0 }); rodar(n, 6);
  ok(r.pegouNivel && n.m.erro === 'E013', 'supressão com distância grande demais (3,000 m): o nível é gravado como sinal falso e a medição se perde (E013)');
  r = n.comando({ tipo: 'supressao', acao: 'apagar' }); rodar(n, 2); ok(n.falsos.length === 0 && n.m.status === 'falso', 'apagar a supressão: o eco falso volta a mandar');
  n = new Nucleo(); P(n, 'hartMulti', 1); rodar(n, 1); ok(n.m.mA === 4 && n.m.bruto === 0, 'HART Multidrop: saída fixa em 4 mA');
  n = new Nucleo(); P(n, 'modoFalha', 1); P(n, 'sil', 1);
  ok(n.p.modoFalha === 0 && P(n, 'modoFalha', 2).ok === false && P(n, 'hartMulti', 1).ok === false, 'SIL ativado: Manter valor e 20,5 mA bloqueados (volta para < 3,6 mA) e Multidrop bloqueado');
  n = new Nucleo(); P(n, 'atenuacao', 12); P(n, 'idioma', 1); n.comando({ tipo: 'tag', v: 'tq-99' }); n.comando({ tipo: 'reset', qual: 'basico' }); rodar(n, 2);
  ok(n.p.calMin === 5 && n.p.calMax === 0 && n.p.atenuacao === 0 && n.p.iMinSel === 1 && n.p.iMaxSel === 0 && n.p.valorExibido === 1 && n.tag === 'Sensor' && n.p.idioma === 1, 'Reset: valores da tabela do manual (5,000 m / 0,000 m, 4 e 20 mA, valor exibido Distância, TAG Sensor); o idioma não muda');
  ok(perto(n.m.pct, 60, 0.05), `depois do Reset o tanque com 1,00 m indica ${f(n.m.pct, 1)} %: é preciso calibrar de novo`);
  n = new Nucleo(); n.comando({ tipo: 'proc', campo: 'nivel', v: 2.0 }); rodar(n, 2); n.comando({ tipo: 'proc', campo: 'nivel', v: 0.5 }); rodar(n, 2);
  ok(perto(n.picos.dMin, 1.0, 0.01) && perto(n.picos.dMax, 2.5, 0.01), `valores de pico: distância mín. ${f(n.picos.dMin, 2)} m, máx. ${f(n.picos.dMax, 2)} m`);
  n.comando({ tipo: 'reset', qual: 'picos' }); ok(perto(n.picos.dMin, n.m.D, 0.001) && n.p.calMin === 3, 'reset dos valores de pico não mexe na calibração');
  const s2 = new Nucleo({ salvos: n.paraGravar() }); const n3 = new Nucleo(); n3.comando({ tipo: 'proc', campo: 'obstaculo', v: 1 }); n3.comando({ tipo: 'proc', campo: 'nivel', v: 0.8 }); rodar(n3, 2); n3.comando({ tipo: 'supressao', acao: 'criar', dist: 2.2 }); n3.comando({ tipo: 'tag', v: 'TQ-01A' });
  const n4 = new Nucleo({ salvos: JSON.parse(JSON.stringify(n3.paraGravar())) }); ok(s2.p.calMin === 3 && n4.falsos.length === 1 && n4.tag === 'TQ-01A', 'a TAG e a supressão de sinais falsos ficam gravadas com a sessão');
}

async function moduloTeclas() {
  console.log('\n6. Módulo de configuração: as teclas como no aparelho ([ESC] [+] [->] [OK])');
  const { criarModulo, arvore } = await import('../public/js/modulo-ajuste.mjs');
  const n = new Nucleo(); rodar(n, 2);
  let relogio = 1e6;
  const mod = criarModulo({ enviar: (c) => n.comando(c), estado: () => n.retrato(), agora: () => relogio });
  const T = () => mod.tela();
  const ap = async (seq) => { for (const k of seq.split(' ')) { const [tecla, q] = k.split('*'); for (let i = 0; i < (q ? +q : 1); i++) await mod.tecla(tecla); } };
  const digitar = async (alvo) => {            // como o aluno faz: [+] até o dígito certo, [->] para a próxima casa
    const dig = alvo.replace(/[^0-9]/g, '');
    for (let i = 0; i < dig.length; i++) { for (let g = 0; g < 10; g++) { const l = T().linhas.find((x) => x.cur !== undefined); if (l.t[l.cur] === dig[i]) break; await mod.tecla('mais'); } if (i < dig.length - 1) await mod.tecla('seta'); }
  };
  const linhas = () => T().linhas.map((l) => l.t).join(' | ');
  const a = arvore(); ok(a.length === 5 && a.map((m) => m.pt).join(', ') === 'Ajuste básico, Display, Diagnóstico, Serviço, Info' && a.reduce((s, m) => s + m.filhos.length, 0) === 30, `plano de menus: ${a.map((m) => m.pt + ' (' + m.filhos.length + ')').join(', ')}`);
  ok(T().titulo === 'LT-01' && T().linhas[0].t === '40.0 %', `tela de medição: TAG "${T().titulo}", valor "${T().linhas[0].t}"`);
  await ap('ok'); ok(T().lista && T().lista.itens.length === 5 && T().lista.sel === 0, '[OK] abre o menu principal, com "Ajuste básico" marcado');
  await ap('ok'); ok(T().titulo === 'Calibrar mín.' && T().num === '1.1' && linhas() === '0.00 % | = | 3.000 m(d) | 2.000 m(d)', `1.1 ${T().titulo}: ${linhas()}`);
  await ap('ok mais esc'); ok(n.p.calMinPct === 0 && !T().linhas.some((l) => l.cur !== undefined), '[ESC] durante a edição: nada é salvo');
  await ap('ok ok'); await digitar('2.800'); await ap('ok');
  ok(n.p.calMin === 2.8 && linhas().includes('2.800 m(d)'), `1.1 editado pelas teclas: 0.00 % = ${n.p.calMin.toFixed(3)} m(d)`);
  await ap('seta'); ok(T().num === '1.2' && T().titulo === 'Calibração Máx.', '[->] passa para 1.2 Calibração Máx.');
  await ap('seta*3'); ok(T().num === '1.5' && T().titulo === 'Atenuação', '1.5 Atenuação');
  await ap('ok'); await digitar('005'); await ap('ok'); ok(n.p.atenuacao === 5 && linhas() === '5 s', `atenuação pelas teclas: ${linhas()}`);
  await ap('esc seta*3 ok'); ok(T().num === '4.1' && T().titulo === 'Supressão de sinais de interferência' && linhas() === 'Alterar agora?', `4.1 ${T().titulo}: ${linhas()}`);
  await ap('seta*2'); ok(T().num === '4.3' && linhas().includes('Modo de falha: < 3.6 mA'), `4.3 Saída de corrente: ${linhas()}`);
  await ap('ok ok'); ok(T().lista && T().lista.itens.join(', ') === 'Manter valor, 20.5 mA, 22 mA, < 3.6 mA' && T().lista.sel === 3, 'modo de falha: as quatro opções do manual, com "< 3.6 mA" marcado');
  await ap('mais ok ok ok'); ok(n.p.modoFalha === 1 && n.p.iMinSel === 0 && n.p.iMaxSel === 1, 'modo de falha trocado para "Manter valor" pelas teclas; correntes mín. e máx. mantidas');
  // supressão de sinais falsos pelo menu, com o obstáculo no feixe
  n.comando({ tipo: 'proc', campo: 'obstaculo', v: 1 }); n.comando({ tipo: 'proc', campo: 'nivel', v: 0.8 }); n.comando({ tipo: 'param', id: 'calMin', v: 3 }); n.comando({ tipo: 'param', id: 'atenuacao', v: 0 }); rodar(n, 2);
  await ap('seta*9 ok'); ok(T().lista.itens.join(', ') === 'Criar novo, Atualizar, Apagar', '4.1 [OK]: Criar novo, Atualizar, Apagar');
  await ap('ok'); const sug = T().linhas.find((l) => l.cur !== undefined).t; await digitar('2.200'); await ap('ok');
  ok(sug.startsWith('1.200') && n.falsos.length === 1 && /salvos: 1/.test(linhas()), `"Criar novo": o visor sugere a distância medida (${sug}, que é o obstáculo); digitando a real, 2.200: ${linhas()}`);
  await ap('ok'); rodar(n, 2); ok(n.m.status === 'ok' && perto(n.m.D, 2.2, 0.002), 'depois da supressão, a medição volta ao nível');
  // simulação da saída
  await ap('seta*3'); ok(T().num === '4.4' && linhas() === 'Iniciar a simulação?', `4.4 Simulação: ${linhas()}`);
  await ap('ok ok'); await digitar('050.0'); await ap('ok'); rodar(n, 0.1);
  ok(n.sim.ativa && perto(n.m.mA, 12, 0.001) && n.m.bruto === 16384 && /Simulação em curso/.test(linhas()), `simulação 50 % pelas teclas: ${f(n.m.mA, 2)} mA, bruto ${n.m.bruto}`);
  await ap('esc'); rodar(n, 0.1); ok(!n.sim.ativa && T().num === '4.4', '[ESC] encerra a simulação');
  // idioma, reset e retorno automático
  await ap('seta*3 ok mais ok'); ok(n.p.idioma === 1 && T().titulo === 'Language', '4.7 Idioma: English (os menus passam para os nomes do manual em inglês)');
  await ap('ok mais ok'); ok(n.p.idioma === 0 && T().titulo === 'Idioma', 'de volta para português');
  await ap('seta*9 ok'); ok(T().num === '4.5' && T().lista.itens.join(', ') === 'Reset, Ajuste de fábrica, Indicador de valor de pico', '4.5 Reset: três opções');
  await ap('ok'); ok(/Executar reset agora\?/.test(linhas()), 'pede confirmação antes do reset');
  await ap('ok'); ok(n.p.calMin === 5 && n.p.calMax === 0 && n.tag === 'Sensor' && linhas() === 'Reset executado', 'reset feito pelas teclas');
  await ap('ok'); relogio += 61 * 60 * 1000; ok(T().titulo === 'Sensor' && T().num === '', '60 minutos sem tecla: volta sozinho para a tela de medição');
  n.comando({ tipo: 'proc', campo: 'espuma', v: 95 }); rodar(n, 5); ok(T().linhas[0].t === 'E013' && T().linhas[1].t === 'Sem valor de medição', `falha na tela de medição: ${linhas()}`);
  n.comando({ tipo: 'proc', campo: 'cabo', v: 1 }); rodar(n, 0.1); ok(T().apagado === true, 'cabo rompido: o módulo apaga junto com o transmissor');
}

async function fila() {
  console.log('\n3. Fila do cliente Modbus');
  const clp = criarClpDemo({ port: 15502, programa: false }); const u = await clp.iniciar();
  const c = new ClienteModbus({ host: u.host, port: u.port, gapMs: 10 });
  await c.conectar();
  let v = 0;
  const p1 = c.pedir({ key: 'esc', priority: 1, fc: 16, address: 0, getValues: () => [v] });
  for (v = 1; v <= 50; v++) c.pedir({ key: 'esc', priority: 1, fc: 16, address: 0, getValues: () => [v] });
  v = 777; await p1; await espera(80);
  ok(c.est.enviadas <= 2 && clp.holding[0] === 777, `coalescência: 51 pedidos iguais viraram ${c.est.enviadas} frame(s) e chegou o valor mais novo (${clp.holding[0]})`);
  const ordem = [];
  c.pedir({ fc: 4, address: 0, quantity: 1, priority: 3 }).then(() => ordem.push('P3'));
  c.pedir({ fc: 4, address: 0, quantity: 1, priority: 2 }).then(() => ordem.push('P2'));
  c.pedir({ fc: 2, address: 0, quantity: 5, priority: 0 }).then(() => ordem.push('P0'));
  await espera(150);
  ok(ordem.slice(1).join(',') === 'P0,P2' || ordem.join(',') === 'P0,P2,P3', `prioridade: depois da que já estava em voo, sai primeiro a mais urgente (${ordem.join(' → ')})`);
  const t0 = Date.now(); await Promise.all(Array.from({ length: 10 }, (_, i) => c.pedir({ fc: 4, address: 0, quantity: 1, priority: 1, key: 'k' + i })));
  ok(Date.now() - t0 >= 80, `uma de cada vez com 10 ms entre frames: 10 leituras levaram ${Date.now() - t0} ms`);
  let erro = ''; await c.pedir({ fc: 4, address: 100, quantity: 2, priority: 1 }).catch((e) => { erro = e.message; });
  ok(/exceção Modbus 2/.test(erro) && c.conectado, 'endereço que não existe: exceção 2 informada e a conexão continua');
  c.fechar(); await clp.parar();
}

async function redeComSessoes() {
  console.log('\n4. Modbus pela rede, com sessões independentes');
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-lt01-'));
  const g = new Gerente({ pastaDados: pasta });
  const tk = setInterval(() => { g.passo(0.02, 0.002); g.tick(Date.now()); }, 20);
  const a = g.criar('Ana'), b = g.criar('Bruno');
  ok(a.id !== b.id && g.criar('Ana').nome === 'Ana 2', 'cada sessão tem o seu código; nome repetido ganha um número');
  ok(g.criar('').nome === 'Bancada 1' && g.criar('').nome === 'Bancada 2', 'sessão criada sem nome (entrada automática): Bancada 1, Bancada 2...');
  { const g9 = new Gerente({ pastaDados: pasta + '-lim' }); for (let i = 0; i < 60; i++) g9.criar(''); const primeira = g9.lista()[0]; g9.obter(primeira.id).ultimoUso = 1; const nova = g9.criar('Extra'); ok(g9.sessoes.size === 60 && !g9.obter(primeira.id) && !!g9.obter(nova.id), 'no limite de 60 sessões, a que está parada há mais tempo dá lugar à nova'); clearTimeout(g9.timerGravar); }
  await a.ligarDemo(); await b.ligarDemo();
  ok(a.rede.conectado && b.rede.conectado && a.conexao.host !== b.conexao.host && a.conexao.port === 502 && b.conexao.port === 502 && /^127\./.test(a.conexao.host) && /^127\./.test(b.conexao.host),
    `cada sessão liga o seu CLP de demonstração, sempre na porta 502 do Modbus, num endereço próprio só deste PC (${a.conexao.host}:${a.conexao.port} e ${b.conexao.host}:${b.conexao.port})`);
  await a.comando({ tipo: 'proc', campo: 'nivel', v: 2.3 }); await b.comando({ tipo: 'proc', campo: 'nivel', v: 0.2 });
  await espera(2500);
  const ca = a.nucleo.clp, cb = b.nucleo.clp;
  ok(ca && perto(ca.Nivel_Pct, 92, 0.3) && ca.LAH_01 && ca.LAHH_01 && !ca.LAL_01, `Ana (2,30 m): o CLP dela devolve ${ca && ca.Nivel_Pct} % com LAH e LAHH`);
  ok(cb && perto(cb.Nivel_Pct, 8, 0.3) && cb.LAL_01 && cb.LALL_01 && !cb.LAH_01, `Bruno (0,20 m): o CLP dele devolve ${cb && cb.Nivel_Pct} % com LAL e LALL`);
  ok(Math.abs(a.demo.holding[0] - a.nucleo.m.bruto) < 8, `LT01_Bruto (${a.demo.holding[0]}, dentro da banda morta de 8 contagens) chegou no holding 0`);
  ok(a.retorno === true, 'ligar o CLP de demonstração liga o retorno do CLP da sessão (sinaleiros e IHM)');
  const taxa = a.cli.taxa();
  ok(taxa > 5 && taxa <= 15, `carga no CLP: ${taxa.toFixed(1)} requisições por segundo (limite 15)`);
  ok(a.cli.est.timeouts === 0 && a.cli.est.excecoes === 0, `sem timeouts nem exceções (${a.cli.est.ok} respostas, tempo médio ${a.cli.est.rtMedio.toFixed(1)} ms)`);
  const r = await g.criar('Caio').comando({ tipo: 'conectar', host: a.conexao.host, port: a.conexao.port, unitId: 1 });
  ok(r.ok === false && /já está conectada/.test(r.erro), 'duas sessões não conectam no mesmo CLP: a segunda é recusada com explicação');
  // queda do CLP e reconexão sozinha
  const porta = a.conexao.port, hostA = a.conexao.host; await a.demo.parar(); await espera(400);
  ok(!a.rede.conectado && a.nucleo.clp === null, 'CLP caiu: sessão marca desconectado e apaga sinaleiros e IHM (estado seguro)');
  a.demo = criarClpDemo({ host: hostA, port: porta, tentativas: 0 }); await a.demo.iniciar(); await espera(6500);
  ok(a.rede.conectado && Math.abs(a.demo.holding[0] - a.nucleo.m.bruto) < 8, 'CLP de volta: reconecta sozinho em até 5 s e reenvia o valor atual');
  // CLP que não responde: timeouts, queda declarada
  const mudo = net.createServer((s) => { s.on('data', () => {}); s.on('error', () => {}); }); await new Promise((res) => mudo.listen(15599, '127.0.0.1', res));
  const d = g.criar('Dani'); const rd = await d.comando({ tipo: 'conectar', host: '127.0.0.1', port: 15599, unitId: 1 });
  ok(rd.ok === false && !d.rede.conectado, 'servidor que aceita a conexão mas não responde Modbus: conexão recusada com mensagem');
  await d.desconectar(true); mudo.close();
  // retorno do CLP desligado: o simulador só envia o nível e não lê nada
  const clpE = criarClpDemo({ port: 15610 }); const ue = await clpE.iniciar();
  const e = g.criar('Eva'); const re = await e.comando({ tipo: 'conectar', host: ue.host, port: ue.port, unitId: 1 }); await e.comando({ tipo: 'proc', campo: 'nivel', v: 2.3 });
  await espera(6000);
  ok(re.ok && e.retorno === false && Math.abs(clpE.holding[0] - e.nucleo.m.bruto) < 8, `só envio (padrão): LT01_Bruto = ${clpE.holding[0]} chegou no CLP`);
  ok(e.nucleo.clp === null && e.cli.taxa() <= 2, `sem retorno o simulador não lê nada do CLP: ${e.cli.taxa().toFixed(1)} requisição por segundo, painel sem dados`);
  await e.comando({ tipo: 'retorno', ligado: true }); await espera(1200);
  ok(e.nucleo.clp && Math.abs(e.nucleo.clp.Nivel_Pct - 92) < 0.3 && e.nucleo.clp.LAHH_01, `retorno ligado com a conexão aberta: passa a ler os sinaleiros e ${e.nucleo.clp && e.nucleo.clp.Nivel_Pct} %`);
  await e.comando({ tipo: 'retorno', ligado: false }); await espera(300);
  ok(e.nucleo.clp === null, 'retorno desligado de novo: o painel some e as leituras param');
  // desconectar e conectar de novo, várias vezes
  let voltou = true; for (let i = 0; i < 3; i++) { await e.comando({ tipo: 'desconectar' }); const r2 = await e.comando({ tipo: 'conectar', host: ue.host, port: ue.port, unitId: 1 }); voltou = voltou && r2.ok && e.rede.conectado; }
  ok(voltou, 'desconectar e conectar de novo 3 vezes seguidas: sempre volta');
  await e.desconectar(true); await clpE.parar();
  // gravação e recarga
  await a.comando({ tipo: 'param', id: 'atenuacao', v: 7 }); await b.comando({ tipo: 'conectar', host: b.conexao.host, port: b.conexao.port, unitId: 1 }).catch(() => {});
  g.gravarAgora();
  const g2 = new Gerente({ pastaDados: pasta });
  const a2 = g2.obter(a.id);
  ok(a2 && a2.nome === 'Ana' && a2.nucleo.p.atenuacao === 7 && a2.retorno === true && !a2.rede.desejado, 'sessões voltam depois de reiniciar o servidor (nome, parâmetros e opção de retorno), desconectadas');
  clearInterval(tk); await g.encerrar(); await g2.encerrar();
  fs.rmSync(pasta, { recursive: true, force: true });
}

async function missoes() {
  console.log('\n5. Missões: cada uma é cumprida pela sequência que o aluno faria (programa de referência no lugar do CLP)');
  const { MISSOES, avaliar } = await import('../public/js/missoes.mjs');
  const n = new Nucleo(); const saidas = {};
  const prog = criarProgramaDemo({ le: (k) => n.entradasDoClp()[k], escreve: (k, v) => { saidas[k] = v; } });
  const mems = {}, feitas = new Set();
  const por = (s) => { for (let t = 0; t < s; t += 0.1) { for (let i = 0; i < 5; i++) { rodar(n, 0.02); prog.scan(0.02); } n.aplicarSaidasDoClp(saidas);
    const c = Object.assign(n.retrato(), { rede: { conectado: true, clpRodando: true, demo: false } });
    const r = avaliar(c, mems, 0.1); for (const [id, v] of Object.entries(r)) if (v) feitas.add(id); } };
  const proc = (campo, v) => n.comando({ tipo: 'proc', campo, v }), par = (id, v) => n.comando({ tipo: 'param', id, v });
  por(0.5); proc('nivel', 1.0); por(4.5);                                   // com, escala
  proc('nivel', 2.1); por(2); proc('nivel', 2.3); por(2); proc('nivel', 0.2); por(2);   // alto, muito alto, baixos
  proc('nivel', 2.1); por(2); proc('nivel', 1.975); por(2.5); proc('nivel', 1.9); por(2);  // histerese
  proc('nivel', 1.0); proc('espuma', 95); por(6); proc('espuma', 0); por(1.5);          // falha E013
  proc('cabo', 1); por(1); proc('cabo', 0); por(1);                                     // cabo rompido
  proc('nivel', 0.8); proc('obstaculo', 1); por(2); par('supressao', 1); por(2); proc('obstaculo', 0);   // eco falso
  proc('nivel', 1.0); par('modoFalha', 3); proc('espuma', 95); por(6);                  // armadilha do 22 mA
  proc('espuma', 0); par('modoFalha', 0); por(1.5);
  n.comando({ tipo: 'reset', qual: 'basico' }); por(0.5); par('calMin', 3); par('calMax', 0.5); por(0.5);        // comissionar depois do Reset
  n.comando({ tipo: 'simular', modo: 'pct', v: 50 }); por(0.5); n.comando({ tipo: 'simular', modo: 'parar' });       // simular a saída
  for (const m of MISSOES) ok(feitas.has(m.id), `missão "${m.titulo}"`);
  // sem CLP, nenhuma missão que precisa de CLP pode fechar
  const m2 = {}; const r2 = avaliar(Object.assign(new Nucleo().retrato(), { rede: { conectado: false, clpRodando: false } }), m2, 0.1);
  ok(MISSOES.filter((m) => m.precisaClp).every((m) => !r2[m.id]), 'sem CLP conectado, as missões de CLP não fecham sozinhas');
}

(async () => {
  const alvo = process.argv[2] || 'tudo';
  if (alvo === 'tudo' || alvo === 'nucleo') { nucleoBasico(); nucleoParametros(); programaContraNucleo(); await moduloTeclas(); }
  if (alvo === 'tudo' || alvo === 'nucleo') await missoes();
  if (alvo === 'tudo' || alvo === 'rede') { await fila(); await redeComSessoes(); }
  console.log(`\n${falhas} falha(s)`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
