// Diagrama de ligação ao vivo: força (Q1 → CFW500 → motor) e comando (CLP ↔ campo ↔ inversor), com o estado de cada ponto.
import { svg, fmt } from './util.js';

const r = document.getElementById('diag');
r.setAttribute('viewBox', '0 0 1400 900');
const T = (x, y, t, cls = 'lbl', anchor = 'start') => { const e = svg('text', { x, y, class: cls, 'text-anchor': anchor }, r); e.textContent = t; return e; };
const L = (d, cls = 'dl') => svg('path', { d, class: cls }, r);
const term = (x, y, name, anchor = 'middle') => { const c = svg('circle', { cx: x, cy: y, r: 6, class: 'term' }, r); T(x, y - 10, name, 'lbl m', anchor); return c; };
const box = (x, y, w, h, t1, t2) => { svg('rect', { x, y, width: w, height: h, class: 'blk', rx: 6 }, r); T(x + w / 2, y + 20, t1, 'lbl b', 'middle'); if (t2) T(x + w / 2, y + 36, t2, 'lbl m', 'middle'); };
const live = {};

// ============ 1. FORÇA ============
T(20, 28, '1 · Circuito de força', 'lbl b');
['L1', 'L2', 'L3'].forEach((f, i) => { const y = 60 + i * 14; L(`M40 ${y} H200`, 'dl'); T(30, y + 4, f, 'lbl m', 'end'); });
T(40, 46, '380 V trifásico', 'lbl m');
// Q1
box(200, 44, 90, 60, 'Q1', 'disjuntor-motor');
live.q1 = [0, 1, 2].map((i) => L(`M290 ${60 + i * 14} H420`, 'dl'));
T(245, 120, 'manual, no quadro', 'lbl m', 'middle');
// CFW500 potência
box(420, 40, 170, 80, 'CFW500', 'R S T  →  U V W');
live.uvw = [0, 1, 2].map((i) => L(`M590 ${60 + i * 14} H720`, 'dl'));
// motor
svg('circle', { cx: 760, cy: 74, r: 36, class: 'blk' }, r); T(760, 70, 'M', 'lbl b', 'middle'); T(760, 86, '3~', 'lbl m', 'middle');
T(760, 130, 'B-01 · 1,5 kW · 4,3 A', 'lbl m', 'middle'); live.motor = T(760, 146, '', 'lbl v', 'middle');
T(860, 62, 'Q1 ligado alimenta o CFW500; o CLP não comanda a alimentação.', 'lbl m');
T(860, 78, 'O cogumelo S0 não corta a força: ele corta a DI1 (ver abaixo).', 'lbl m');
live.pw = T(860, 100, '', 'lbl v');

// ============ 2. COMANDO ============
T(20, 196, '2 · Comando: CLP, campo e bornes do inversor', 'lbl b');
svg('rect', { x: 560, y: 210, width: 280, height: 660, class: 'blk', rx: 6 }, r);
T(700, 232, 'CLP (XP325 / CODESYS)', 'lbl b', 'middle'); T(700, 248, 'ED 24 Vcc · SD transistor · EA/SA', 'lbl m', 'middle');
L('M60 270 V700', 'dl'); T(44, 264, '+24 V', 'lbl b');
L('M1340 270 V640', 'dl'); T(1356, 264, '0 V', 'lbl b');
const DI = [['ED00', 'S1 liga', 'NA'], ['ED01', 'S2 desliga', 'NF'], ['ED02', 'S3 reset', 'NA'], ['ED03', 'S4 auto', 'NA'], ['ED04', 'S0 emergência (1º NF)', 'NF'],
  ['ED05', 'CFW500 DO2 rodando', 'NA'], ['ED06', 'CFW500 DO1 sem falha', 'NA'], ['ED07', 'LSHH-01', 'NA'], ['ED08', 'LSLL-01', 'NA']];
live.di = []; live.diC = [];
DI.forEach(([t, nome, tipo], i) => {
  const y = 280 + i * 40;
  L(`M60 ${y} H300`, 'dl on');
  const arm = svg('line', { x1: 330, y1: y, x2: 362, y2: tipo === 'NF' ? y : y - 12, class: 'dl' }, r);
  svg('line', { x1: 300, y1: y, x2: 330, y2: y, class: 'dl on' }, r);
  const tail = L(`M362 ${y} H560`, 'dl');
  T(370, y - 8, `${nome} · ${tipo}`, 'lbl');
  live.diC.push({ arm, tail, y }); live.di.push(term(560, y, t));
});
T(150, 262, 'Contatos de campo (botoeiras, chaves de nível, relés do inversor)', 'lbl m');
// saídas digitais
const DO = [['SD00', 'H1 verde', 'lamp'], ['SD01', 'H2 amarelo', 'lamp'], ['SD02', 'H3 vermelho', 'lamp'], ['SD03', 'H4 sirene', 'bob'], ['SD04', 'CFW500 DI1 gira/para', 'di'], ['SD05', 'CFW500 DI3 reset', 'di']];
live.do = []; live.doL = [];
DO.forEach(([t, nome, k], i) => {
  const y = 280 + i * 40;
  live.do.push(term(840, y, t));
  if (i === 4) {   // SD04 passa pelo segundo NF do S0 antes da DI1
    live.doL.push(L(`M840 ${y} H950`, 'dl'));
    live.s0arm = svg('line', { x1: 950, y1: y, x2: 982, y2: y, class: 'dl' }, r);
    T(950, y - 8, 'S0 (2º NF)', 'lbl m');
    live.s0tail = L(`M982 ${y} H1100`, 'dl');
  } else live.doL.push(L(`M840 ${y} H1100`, 'dl'));
  if (k === 'lamp') { svg('circle', { cx: 1120, cy: y, r: 10, fill: '#fff', stroke: '#1b2125', 'stroke-width': 1.4 }, r); L(`M1113 ${y - 7} L1127 ${y + 7} M1127 ${y - 7} L1113 ${y + 7}`); L(`M1130 ${y} H1340`); }
  else if (k === 'bob') { svg('rect', { x: 1106, y: y - 10, width: 28, height: 20, fill: '#fff', stroke: '#1b2125', 'stroke-width': 1.4 }, r); L(`M1134 ${y} H1340`); }
  else { svg('rect', { x: 1100, y: y - 9, width: 40, height: 18, fill: '#eef3f9', stroke: '#1b5e9e', 'stroke-width': 1.4 }, r); T(1120, y + 4, i === 4 ? 'DI1' : 'DI3', 'lbl m', 'middle'); }
  T(1150, y - 8, nome, 'lbl');
});
T(880, 262, 'Cargas e entradas do inversor', 'lbl m');
// bornes de comando do CFW500
box(1170, 520, 160, 150, 'CFW500 · bornes', 'controle');
['DI1 ← SD04 (via 2º NF do S0)', 'DI3 ← SD05', 'AI1 ← SA0 0–10 V', 'DO1 relé → ED06', 'DO2 relé → ED05', 'GND / 24 V'].forEach((t, i) => T(1180, 572 + i * 15, t, 'lbl m'));
live.cfw = T(1250, 690, '', 'lbl v', 'middle');
L('M1120 440 V500 H1250 V520', 'dl sig');   // DI1 e DI3 descem até o bloco de bornes
L('M1120 480 V500', 'dl sig');
// os relés DO1/DO2 do inversor são os contatos de campo ED05/ED06 (desenhados à esquerda)
// analógicas
T(300, 650, 'Analógicas', 'lbl b');
svg('circle', { cx: 330, cy: 700, r: 12, fill: '#fff', stroke: '#1b5e9e', 'stroke-width': 1.6 }, r); T(330, 704, 'LT', 'lbl m', 'middle');
L('M342 700 H560', 'dl sig'); live.ai = term(560, 700, 'EA0'); T(348, 690, 'LT-01 nível 4–20 mA (0–3,5 m)', 'lbl'); live.aiVal = T(350, 722, '', 'lbl v');
live.ao = term(840, 700, 'SA0'); L('M840 700 H1150 V655 H1170', 'dl sig'); T(860, 690, 'SA0 0–10 V → AI1 do CFW500', 'lbl'); live.aoVal = T(860, 722, '', 'lbl v');

// ============ estado ao vivo ============
function conectar() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data); const s = msg.estado; if (!s) return;
    const q1 = s.quadro.q1;
    live.q1.forEach((l) => l.classList.toggle('on', q1)); live.uvw.forEach((l) => l.classList.toggle('on', q1 && s.inv.rodando));
    live.motor.textContent = `${fmt(s.inv.fHz, 1)} Hz · ${fmt(s.iMot, 1)} A`;
    live.pw.textContent = q1 ? 'Q1 ligado · CFW500 alimentado' : 'Q1 desligado · CFW500 sem alimentação';
    DI.forEach((d, i) => { const on = s.di[i], c = live.diC[i]; live.di[i].classList.toggle('on', on); c.arm.setAttribute('y2', on ? c.y : c.y - 12); c.arm.classList.toggle('on', on); c.tail.classList.toggle('on', on); });
    DO.forEach((d, i) => { const on = s.do[i]; live.do[i].classList.toggle('on', on); live.doL[i].classList.toggle('on', on); });
    const y4 = 280 + 4 * 40; live.s0arm.setAttribute('y2', s.quadro.S0 ? y4 - 12 : y4); const passa = s.do[4] && !s.quadro.S0; live.s0arm.classList.toggle('on', passa); live.s0tail.classList.toggle('on', passa);
    const lt = s.sensores['LT-01']; live.aiVal.textContent = `${fmt(lt.sinal, 2)} mA · bruto ${lt.raw} · ${fmt(lt.eng, 2)} m`; live.ai.classList.toggle('on', lt.st === 'ok');
    const sig = s.ao.sinais && s.ao.sinais.ref; live.aoVal.textContent = sig ? `${fmt(sig.valor, 2)} ${sig.tipo} → ${fmt(s.inv.fHz, 1)} Hz` : ''; live.ao.classList.toggle('on', !!(sig && sig.valor > 0.05));
    live.cfw.textContent = !s.inv.power ? 'sem alimentação' : s.inv.falha ? `falha ${s.inv.codFalha}` : s.inv.rodando ? `rodando ${fmt(s.inv.fHz, 1)} Hz` : `parado · ${s.inv.locRem}`;
  };
  ws.onclose = () => setTimeout(conectar, 1500);
}
conectar();
