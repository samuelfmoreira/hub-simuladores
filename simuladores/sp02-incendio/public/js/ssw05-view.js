// WEG SSW-05 Plus — frente fiel à Figura 5.1 do manual 0899.5119 e à foto do produto.
// Tampa articulada, dip-switch de 6 posições, 4 trimpots, botão RESET, LEDs MOTOR PROTECTION / STARTER STATUS.
import { el, svg, fmt } from './util.js';

const STATE_TXT = { off: 'Sem alimentação em A1-A2', ready: 'Pronta (READY aceso)', accel: 'Acelerando (READY piscando)', run: 'Tensão plena — by-pass (RUN aceso)', decel: 'Desacelerando (READY piscando)', fault: 'Em falha' };
const C = { body: '#dcdfe5', body2: '#cfd3da', recess: '#c6cad2', blue: '#1e4f8f', blue2: '#163d70', hole: '#2a2e35', ink: '#1d2024', red: '#d42a1f' };

function fmtPot(p, v) {
  if (p.off !== undefined && v <= p.off) return 'OFF';
  return `${fmt(v, p.step < 1 ? 1 : 0)} ${p.unit}`;
}

export function createSSW05(host, index, meta, send) {
  const M = meta.ssw;
  const SW = M.potSweep, S0 = M.potStart;
  const label = `SS_0${index + 1}`;
  const pump = index === 0 ? 'Bomba 01' : 'Bomba 02';
  host.innerHTML = '';
  const local = {};
  let dragging = null;
  const T = (parent, x, y, t, o = {}) => { const e = svg('text', Object.assign({ x, y, 'font-family': 'Arial, Helvetica, sans-serif', 'font-size': 8, fill: C.ink }, o), parent); e.textContent = t; return e; };

  const root = svg('svg', { viewBox: '-92 0 370 560', role: 'img', 'aria-label': `Soft-starter ${label} WEG SSW-05 Plus` }, host);
  const defs = svg('defs', {}, root);
  const gk = svg('radialGradient', { id: `kn5${index}`, cx: '40%', cy: '35%', r: '70%' }, defs);
  svg('stop', { offset: 0, 'stop-color': '#ffffff' }, gk); svg('stop', { offset: 1, 'stop-color': '#d7dade' }, gk);
  const gb = svg('linearGradient', { id: `bd5${index}`, x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
  svg('stop', { offset: 0, 'stop-color': '#e6e8ed' }, gb); svg('stop', { offset: 1, 'stop-color': '#d2d6dd' }, gb);

  // ---------- Base azul com abas de fixação
  svg('rect', { x: 18, y: 28, width: 261, height: 504, rx: 6, fill: C.blue }, root);
  [[24, 12], [240, 12], [24, 526], [240, 526]].forEach(([x, y]) => {
    svg('rect', { x, y, width: 26, height: 22, rx: 3, fill: C.blue2 }, root);
    svg('circle', { cx: x + 13, cy: y + 11, r: 5, fill: '#0d2547' }, root);
  });
  // ---------- Carcaça cinza
  svg('rect', { x: 30, y: 22, width: 237, height: 516, rx: 8, fill: `url(#bd5${index})`, stroke: '#aeb3bc' }, root);
  // degraus da carcaça (sombras): bloco dos bornes de potência, coluna dos LEDs e bloco inferior
  const gs = svg('linearGradient', { id: `st5${index}`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  svg('stop', { offset: 0, 'stop-color': '#8d939c', 'stop-opacity': 0.55 }, gs); svg('stop', { offset: 1, 'stop-color': '#8d939c', 'stop-opacity': 0 }, gs);
  svg('rect', { x: 31, y: 100, width: 235, height: 9, fill: `url(#st5${index})` }, root);
  svg('rect', { x: 31, y: 478, width: 235, height: 8, fill: `url(#st5${index})` }, root);
  const gv = svg('linearGradient', { id: `sv5${index}`, x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
  svg('stop', { offset: 0, 'stop-color': '#8d939c', 'stop-opacity': 0.5 }, gv); svg('stop', { offset: 1, 'stop-color': '#8d939c', 'stop-opacity': 0 }, gv);
  svg('rect', { x: 150, y: 150, width: 7, height: 326, fill: `url(#sv5${index})` }, root);
  svg('line', { x1: 31, y1: 100, x2: 266, y2: 100, stroke: '#f4f5f7', 'stroke-width': 1 }, root);
  // Bornes de potência
  [['R / 1L1', 72], ['S / 3L2', 150], ['T / 5L3', 228]].forEach(([t, x]) => {
    T(root, x, 46, t, { 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700 });
    svg('circle', { cx: x, cy: 76, r: 17, fill: C.hole }, root);
    svg('circle', { cx: x, cy: 76, r: 9, fill: '#55595f' }, root);
  });
  // Aletas de ventilação
  for (let i = 0; i < 4; i++) svg('path', { d: `M${50 + i * 26} 108 l14 0 l-10 34 l-14 0 z`, fill: '#9aa0aa' }, root);
  for (let i = 0; i < 4; i++) svg('rect', { x: 162 + i * 26, y: 132, width: 20, height: 8, fill: '#b9bec6' }, root);
  // Bornes A1 A2 DI1 DI2
  const cTerm = {};
  ['A1', 'A2', 'DI1', 'DI2'].forEach((t, i) => {
    const x = 170 + i * 28;
    T(root, x, 162, t, { 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700 });
    svg('circle', { cx: x, cy: 178, r: 9, fill: C.hole }, root);
    cTerm[t] = svg('circle', { cx: x, cy: 178, r: 3.5, fill: '#55595f' }, root);
  });

  // ---------- Área de ajustes (rebaixada, sob a tampa)
  svg('rect', { x: 34, y: 152, width: 112, height: 324, rx: 3, fill: C.recess, stroke: '#a7acb5' }, root);
  svg('circle', { cx: 44, cy: 166, r: 2.4, fill: C.red }, root);
  T(root, 50, 169, 'FACTORY DEFAULT', { 'font-size': 7.5 });

  // Dip-switch: 6 chaves (ON à direita) — linhas 1..5 apontam para os LEDs de proteção
  const dipKeys = Object.keys(M.dips);
  const DY0 = 208, DH = 12;
  svg('rect', { x: 62, y: DY0 - 4, width: 22, height: DH * 6 + 8, rx: 2, fill: '#f6f6f3', stroke: '#888' }, root);
  const dipEls = {};
  dipKeys.forEach((k, i) => {
    const y = DY0 + i * DH;
    T(root, 40, y + 8, i < 5 ? 'OFF' : 'MAN', { 'font-size': 7 });
    T(root, 92, y + 8, i < 5 ? 'ON' : 'AUTO', { 'font-size': 7 });
    if (i < 5) svg('circle', { cx: 105, cy: y + 5.5, r: 1.8, fill: C.red }, root); // padrão de fábrica: ON
    T(root, 66, y + 8, String(i + 1), { 'font-size': 5.5, fill: '#888' });
    // canal escuro e alavanca branca: a posição da alavanca é o estado (direita = ON)
    svg('rect', { x: 70, y: y + 1, width: 12, height: 9, rx: 1, fill: '#2b2f33' }, root);
    const lever = svg('rect', { x: 70.5, y: y + 1.5, width: 5.5, height: 8, rx: 1, fill: '#f4f4f0', stroke: '#9aa0aa', 'stroke-width': 0.5 }, root);
    const hit = svg('rect', { x: 60, y: y - 1, width: 26, height: DH, fill: 'transparent', style: 'cursor:pointer', tabindex: 0, role: 'switch', 'aria-label': `Chave ${i + 1}: ${M.dips[k].name}` }, root);
    const toggle = () => send({ type: 'sswDip', index, name: k, value: !dipEls[k].on });
    hit.addEventListener('click', toggle);
    hit.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    dipEls[k] = { lever, on: false, y };
    if (i < 5) { // seta até o LED de proteção correspondente
      svg('path', { d: `M110 ${y + 5.5} H166`, stroke: C.ink, 'stroke-width': 0.9 }, root);
      svg('path', { d: `M166 ${y + 3} l5 2.5 l-5 2.5 z`, fill: C.ink }, root);
    }
  });
  svg('circle', { cx: 44, cy: DY0 + 5 * DH + 15, r: 1.8, fill: C.red }, root); // MAN é o padrão
  // RESET
  svg('path', { d: `M46 ${DY0 + 6 * DH + 4} v14 h20`, stroke: C.ink, 'stroke-width': 1, fill: 'none' }, root);
  svg('path', { d: `M64 ${DY0 + 6 * DH + 15} l5 3 l-5 3 z`, fill: C.ink }, root);
  const rst = svg('g', { style: 'cursor:pointer', tabindex: 0, role: 'button', 'aria-label': `Botão RESET da ${label}` }, root);
  const ry = DY0 + 6 * DH + 18;
  svg('circle', { cx: 80, cy: ry, r: 7, fill: '#555a61' }, rst);
  const rb = svg('circle', { cx: 80, cy: ry, r: 5, fill: '#2b2f33' }, rst);
  T(root, 92, ry + 3, 'RESET', { 'font-size': 8 });
  const doReset = () => send({ type: 'sswKey', index, key: 'RESET' });
  rst.addEventListener('pointerdown', () => { rb.setAttribute('r', 4); doReset(); });
  rst.addEventListener('pointerup', () => rb.setAttribute('r', 5));
  rst.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doReset(); } });

  // Trimpots (2 x 2) — ordem e legendas da frente real
  const knobs = {};
  const maxLabels = []; // legendas que ficam fora da tampa: somem com a tampa fechada
  const POT_LAYOUT = [
    ['accT', 64, 366, ['ACCEL', 'TIME'], '1s', '20s'],
    ['motorPct', 118, 366, ['MOTOR', 'CURRENT'], '30%', '100%'],
    ['initV', 64, 440, ['PEDESTAL', 'VOLTAGE'], '30%', '80%'],
    ['decT', 118, 440, ['DECEL', 'TIME'], 'OFF', '20s'],
  ];
  const pt = (cx, cy, r, a) => [cx + r * Math.sin(a * Math.PI / 180), cy - r * Math.cos(a * Math.PI / 180)];
  POT_LAYOUT.forEach(([k, cx, cy, lab, mn, mx]) => {
    const p = M.pots[k];
    T(root, cx, cy - 32, lab[0], { 'text-anchor': 'middle', 'font-size': 7.5 });
    T(root, cx, cy - 24, lab[1], { 'text-anchor': 'middle', 'font-size': 7.5 });
    const g = svg('g', { tabindex: 0, role: 'slider', 'aria-label': `${p.name} da ${label}`, 'aria-valuemin': p.min, 'aria-valuemax': p.max, style: 'cursor:ns-resize' }, root);
    for (let t = 0; t <= 10; t++) {
      const a = S0 + (SW * t) / 10;
      const [x1, y1] = pt(cx, cy, 15, a), [x2, y2] = pt(cx, cy, t % 5 === 0 ? 19 : 17.5, a);
      svg('line', { x1, y1, x2, y2, stroke: C.ink, 'stroke-width': t % 5 === 0 ? 1 : 0.6 }, g);
    }
    const [mx1, my1] = pt(cx, cy, 25, S0); T(g, mx1 + 2, my1 + 6, mn, { 'text-anchor': 'middle', 'font-size': 7 });
    const [xx, xy] = pt(cx, cy, 25, S0 + SW); maxLabels.push(T(g, xx + 4, xy + 3, mx, { 'font-size': 7 }));
    // ponto vermelho = padrão de fábrica
    const da = S0 + SW * (p.def - p.min) / (p.max - p.min);
    const [dx, dy] = pt(cx, cy, 21.5, da);
    svg('circle', { cx: dx, cy: dy, r: 1.8, fill: C.red }, g);
    svg('circle', { cx, cy, r: 22, fill: 'transparent' }, g);
    svg('circle', { cx, cy, r: 13, fill: '#a9aeb5' }, g);
    svg('circle', { cx, cy, r: 11, fill: `url(#kn5${index})`, stroke: '#8c9199' }, g);
    const rot = svg('g', {}, g);
    svg('rect', { x: cx - 1.2, y: cy - 8, width: 2.4, height: 16, fill: '#9ca1a8' }, rot);
    svg('rect', { x: cx - 8, y: cy - 1.2, width: 16, height: 2.4, fill: '#9ca1a8' }, rot);
    svg('path', { d: `M${cx} ${cy - 11} l-2.5 4 h5 z`, fill: C.ink }, rot); // ponteiro
    knobs[k] = { g, rot, cx, cy };
    bindKnob(k, g);
  });

  // Tampa articulada
  const door = svg('g', { style: 'cursor:pointer', role: 'button', tabindex: 0, 'aria-label': `Abrir ou fechar a tampa frontal da ${label}` }, root);
  const doorClosed = svg('g', {}, door);
  const gl = svg('linearGradient', { id: `lid5${index}`, x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
  svg('stop', { offset: 0, 'stop-color': '#eceef2' }, gl); svg('stop', { offset: 1, 'stop-color': '#d6d9df' }, gl);
  svg('rect', { x: 31, y: 149, width: 118, height: 330, rx: 5, fill: '#b3b8c0' }, doorClosed);            // sombra/borda
  svg('rect', { x: 32, y: 150, width: 115, height: 327, rx: 5, fill: `url(#lid5${index})`, stroke: '#a7acb5' }, doorClosed);
  svg('rect', { x: 36, y: 154, width: 107, height: 2, fill: '#ffffff', opacity: 0.7 }, doorClosed);       // brilho da aresta
  // trava: rebaixo semicircular na borda direita da tampa, com o deslizador branco horizontal
  svg('path', { d: 'M147 236 A22 22 0 0 0 147 280 Z', fill: '#c3c7ce' }, doorClosed);                       // rebaixo
  svg('path', { d: 'M147 236 A22 22 0 0 0 147 280', fill: 'none', stroke: '#9aa0aa', 'stroke-width': 1.2 }, doorClosed);
  svg('path', { d: 'M145 240 A18 18 0 0 0 145 276', fill: 'none', stroke: '#ffffff', 'stroke-width': 1, opacity: 0.6 }, doorClosed);
  svg('rect', { x: 129, y: 251, width: 30, height: 15, rx: 7.5, fill: '#8f949c', opacity: 0.45 }, doorClosed);  // sombra
  svg('rect', { x: 128, y: 249, width: 30, height: 15, rx: 7.5, fill: '#f7f8fa', stroke: '#8c9199' }, doorClosed); // deslizador
  svg('rect', { x: 134, y: 253, width: 14, height: 7, rx: 2, fill: '#3c4148' }, doorClosed);                 // fenda escura
  svg('rect', { x: 135, y: 254, width: 6, height: 2, rx: 1, fill: '#9aa0aa' }, doorClosed);
  // janela de identificação (etiqueta)
  svg('rect', { x: 46, y: 398, width: 86, height: 30, rx: 2, fill: '#ffffff', stroke: '#9aa0aa' }, doorClosed);
  T(doorClosed, 89, 418, label, { 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#3c444a' });
  svg('title', {}, doorClosed).textContent = 'Tampa fechada — clique para abrir';
  // Tampa aberta para fora, à esquerda, em perspectiva: face interna, espessura e lingueta da trava
  const doorOpen = svg('g', {}, door);
  const gd = svg('linearGradient', { id: `do5${index}`, x1: 1, y1: 0, x2: 0, y2: 0 }, defs);
  svg('stop', { offset: 0, 'stop-color': '#c4c8cf' }, gd); svg('stop', { offset: 1, 'stop-color': '#eef0f3' }, gd);
  svg('path', { d: 'M30 150 L-58 132 L-58 494 L30 478 Z', fill: '#000', opacity: 0.12, transform: 'translate(4 6)' }, doorOpen); // sombra
  svg('path', { d: 'M30 150 L-58 132 L-58 494 L30 478 Z', fill: `url(#do5${index})`, stroke: '#9aa0aa' }, doorOpen);         // face interna
  svg('path', { d: 'M-58 132 L-66 136 L-66 490 L-58 494 Z', fill: '#b7bcc4', stroke: '#9aa0aa' }, doorOpen);               // espessura
  // nervuras e rebaixos da face interna
  svg('path', { d: 'M18 172 L-44 160 L-44 466 L18 456 Z', fill: 'none', stroke: '#b2b7bf', 'stroke-width': 1 }, doorOpen);
  svg('path', { d: 'M8 380 L-30 373 L-30 432 L8 437 Z', fill: '#d3d6dc', stroke: '#a9aeb6' }, doorOpen);
  svg('path', { d: 'M2 392 L-24 387 L-24 424 L2 428 Z', fill: '#c6cad1' }, doorOpen);
  svg('ellipse', { cx: -12, cy: 214, rx: 16, ry: 22, fill: 'none', stroke: '#b2b7bf', 'stroke-width': 1.5 }, doorOpen);
  // lingueta da trava na borda livre
  svg('path', { d: 'M-66 286 C-84 286 -84 318 -66 318 Z', fill: '#e6e8ec', stroke: '#9aa0aa' }, doorOpen);
  svg('rect', { x: -78, y: 296, width: 8, height: 12, rx: 3, fill: '#c3c7ce', stroke: '#9aa0aa' }, doorOpen);
  // dobradiças
  [[164], [458]].forEach(([y]) => svg('rect', { x: 26, y, width: 8, height: 14, rx: 2, fill: '#a9aeb6' }, doorOpen));
  svg('title', {}, doorOpen).textContent = 'Tampa aberta — clique para fechar';
  const toggleDoor = (e) => { e.stopPropagation(); send({ type: 'sswDoor', index, value: !curDoor }); };
  door.addEventListener('click', toggleDoor);
  door.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDoor(e); } });

  // ---------- Coluna de LEDs
  T(root, 158, 202, 'MOTOR PROTECTION', { 'font-size': 10, 'font-weight': 700 });
  const leds = {};
  [['overcurrent', 'OVERCURRENT'], ['phaseLoss', 'PHASE LOSS'], ['phaseSeq', 'PHASE SEQ'], ['stall', 'STALL'], ['overload', 'OVERLOAD']].forEach(([k, t], i) => {
    const y = DY0 + i * DH + 1;
    leds[k] = { e: svg('rect', { x: 173, y: y + 1.5, width: 10, height: 6, rx: 1, fill: '#3a3d42' }, root), c: '#ff3b2f' };
    T(root, 188, y + 8, t, { 'font-size': 8, 'font-weight': 700 });
  });
  T(root, 168, 294, 'STARTER STATUS', { 'font-size': 10, 'font-weight': 700 });
  [['fault', 'FAULT', '#ff3b2f'], ['run', 'RUN', '#3fe06a'], ['ready', 'READY', '#3fe06a']].forEach(([k, t, c], i) => {
    const y = 300 + i * 12;
    leds[k] = { e: svg('rect', { x: 173, y: y + 1.5, width: 10, height: 6, rx: 1, fill: '#3a3d42' }, root), c };
    T(root, 188, y + 8, t, { 'font-size': 8, 'font-weight': 700 });
  });
  // Porta serial RS-232 (tampa)
  svg('rect', { x: 182, y: 342, width: 64, height: 56, rx: 4, fill: '#e8eaee', stroke: '#a7acb5' }, root);
  svg('rect', { x: 196, y: 352, width: 36, height: 30, rx: 2, fill: 'none', stroke: '#b9bec6' }, root);
  for (let i = 0; i < 4; i++) svg('line', { x1: 202 + i * 8, y1: 358, x2: 202 + i * 8, y2: 370, stroke: '#c3c7ce' }, root);
  T(root, 214, 410, 'SERIAL PORT', { 'text-anchor': 'middle', 'font-size': 8, 'font-weight': 700 });
  T(root, 214, 420, 'RS-232', { 'text-anchor': 'middle', 'font-size': 8, 'font-weight': 700 });
  // Relés 13, 14/23, 24 (contatos de saída da soft)
  const rTerm = {};
  [['13', 190], ['14/23', 218], ['24', 246]].forEach(([t, x]) => {
    svg('circle', { cx: x, cy: 442, r: 9, fill: C.hole }, root);
    rTerm[t] = svg('circle', { cx: x, cy: 442, r: 3.5, fill: '#55595f' }, root);
    T(root, x, 463, t, { 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 700 });
  });
  // Bornes do motor
  [['U / 2T1', 72], ['V / 4T2', 150], ['W / 6T3', 228]].forEach(([t, x]) => {
    svg('circle', { cx: x, cy: 494, r: 15, fill: C.hole }, root);
    svg('circle', { cx: x, cy: 494, r: 8, fill: '#55595f' }, root);
    T(root, x, 526, t, { 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700 });
  });

  // ---------- Painel lateral
  const info = el('div', { class: 'soft-info' }, host);
  el('h3', {}, info).textContent = `${label} — ${pump} · SSW-05 Plus`;
  const st = el('span', { class: 'soft-state' }, info);
  const kv = el('dl', { class: 'kv' }, info); kv.style.marginTop = '8px';
  const rows = {};
  [['mot', 'Motor ligado (corrente de placa)'], ['iset', 'MOTOR CURRENT ajustado'], ['cmd', `DI1 (contato K-B${index + 1})`], ['vout', 'Tensão de saída'], ['cur', 'Corrente do motor'], ['spd', 'Rotação'], ['th', 'Imagem térmica'], ['rl', 'Relés 13–14/23 · 14/23–24'], ['err', 'Falha']].forEach(([k, t]) => {
    el('dt', {}, kv).textContent = t; rows[k] = el('dd', {}, kv);
  });
  const help = el('p', { class: 'soft-help' }, info);
  help.innerHTML = 'A soft começa com a <b>tampa aberta</b>. Para fechar, clique na aba da esquerda; para abrir de novo, clique na tampa. Gire os trimpots arrastando para cima/baixo, com a rodinha ou com as setas. Chaves 1–5 ligam as proteções (ON à direita); chave 6 escolhe o reset MAN/AUTO. Pontos vermelhos = padrão de fábrica.';
  const fine = el('div', { class: 'kp-ctrl' }, info);
  const fineVal = {};
  [['accT', 'ACCEL TIME'], ['decT', 'DECEL TIME'], ['initV', 'PEDESTAL V.'], ['motorPct', 'MOTOR CURRENT']].forEach(([k, t]) => {
    const p = M.pots[k];
    const row = el('div', { class: 'stepper' }, fine);
    el('span', {}, row).textContent = t;
    const minus = el('button', { class: 'btn small', 'aria-label': `Diminuir ${p.name}` }, row); minus.textContent = '−';
    fineVal[k] = el('b', {}, row);
    const plus = el('button', { class: 'btn small', 'aria-label': `Aumentar ${p.name}` }, row); plus.textContent = '+';
    minus.addEventListener('click', () => send({ type: 'sswPot', index, name: k, value: cur[k] - p.step }));
    plus.addEventListener('click', () => send({ type: 'sswPot', index, name: k, value: cur[k] + p.step }));
  });
  const ml = el('label', { class: 'check' }, fine);
  ml.append('Modelo (In da chave): ');
  const modelSel = el('select', {}, ml);
  M.models.forEach((m) => { const o = el('option', { value: m }, modelSel); o.textContent = `SSW05${String(m).padStart(4, '0')} · ${m} A`; });
  modelSel.addEventListener('change', () => send({ type: 'sswModel', index, value: Number(modelSel.value) }));
  const det = el('details', { class: 'params' }, info);
  el('summary', {}, det).textContent = 'Defeitos para treino';
  const trainBox = el('div', { class: 'kp-ctrl' }, det);
  const train = {};
  [['seqInverted', 'Sequência de fases da rede invertida na entrada (R-S-T)'], ['jammed', 'Eixo do motor travado (bomba presa)']].forEach(([k, t]) => {
    const l = el('label', { class: 'check' }, trainBox);
    const c = el('input', { type: 'checkbox' }, l); l.append(t);
    c.addEventListener('change', () => send({ type: 'sswTrain', index, name: k, value: c.checked }));
    train[k] = c;
  });

  // ---------- Trimpots: arraste, rodinha, teclado
  const cur = {};
  let curDoor = true;
  function setKnob(k, v) {
    const p = M.pots[k], kn = knobs[k];
    const a = S0 + SW * (v - p.min) / (p.max - p.min);
    kn.rot.setAttribute('transform', `rotate(${a} ${kn.cx} ${kn.cy})`);
    kn.g.setAttribute('aria-valuenow', v);
    kn.g.setAttribute('aria-valuetext', fmtPot(p, v));
  }
  let sendT = 0;
  function bindKnob(k, g) {
    const p = M.pots[k], range = p.max - p.min;
    const commit = (v, force) => {
      v = Math.min(p.max, Math.max(p.min, Math.round(v / p.step) * p.step));
      local[k] = v; setKnob(k, v); fineVal[k].textContent = fmtPot(p, v);
      const now = performance.now();
      if (force || now - sendT > 80) { sendT = now; send({ type: 'sswPot', index, name: k, value: v }); }
    };
    let y0 = 0, v0 = 0;
    g.addEventListener('pointerdown', (e) => { if (!curDoor) return; e.preventDefault(); g.setPointerCapture(e.pointerId); dragging = k; y0 = e.clientY; v0 = cur[k]; });
    g.addEventListener('pointermove', (e) => { if (dragging !== k) return; commit(v0 + ((y0 - e.clientY) / 140) * range); });
    const end = () => { if (dragging === k) { commit(local[k] ?? cur[k], true); dragging = null; setTimeout(() => { delete local[k]; }, 400); } };
    g.addEventListener('pointerup', end); g.addEventListener('lostpointercapture', end);
    g.addEventListener('wheel', (e) => { if (!curDoor) return; e.preventDefault(); commit((local[k] ?? cur[k]) + (e.deltaY < 0 ? p.step : -p.step), true); setTimeout(() => { delete local[k]; }, 400); }, { passive: false });
    g.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
      if (d && curDoor) { e.preventDefault(); commit(cur[k] + d * p.step, true); }
    });
  }

  return function update(s) {
    Object.keys(knobs).forEach((k) => { cur[k] = local[k] ?? s.pots[k]; setKnob(k, cur[k]); fineVal[k].textContent = fmtPot(M.pots[k], cur[k]); });
    Object.entries(dipEls).forEach(([k, d]) => { d.on = !!s.dips[k]; d.lever.setAttribute('x', d.on ? 76 : 70.5); });
    curDoor = !!s.door;
    doorClosed.style.display = curDoor ? 'none' : '';
    doorOpen.style.display = curDoor ? '' : 'none';
    maxLabels.forEach((e) => { e.style.display = curDoor ? '' : 'none'; });
    Object.entries(leds).forEach(([k, l]) => l.e.setAttribute('fill', s.leds[k] ? l.c : '#3a3d42'));
    const on = (b, c = '#3fe06a') => (b ? c : '#55595f');
    cTerm.A1.setAttribute('fill', on(s.powered, '#ffb52e')); cTerm.A2.setAttribute('fill', on(s.powered, '#ffb52e'));
    cTerm.DI1.setAttribute('fill', on(s.di[0]));
    rTerm['13'].setAttribute('fill', on(s.rl[0])); rTerm['14/23'].setAttribute('fill', on(s.rl[0] || s.rl[1])); rTerm['24'].setAttribute('fill', on(s.rl[1])); cTerm.DI2.setAttribute('fill', on(s.di[1]));
    if (document.activeElement !== modelSel) modelSel.value = String(s.model);
    modelSel.disabled = s.state !== 'ready' && s.state !== 'off';
    Object.entries(train).forEach(([k, c]) => { c.checked = !!s.train[k]; });

    st.textContent = STATE_TXT[s.state] || s.state;
    st.className = 'soft-state ' + (s.state === 'run' ? 'run' : s.state === 'fault' ? 'fault' : (s.state === 'accel' || s.state === 'decel') ? 'ramp' : '');
    rows.mot.textContent = `${fmt(s.motorA, 1)} A`;
    rows.iset.textContent = `${s.pots.motorPct} % = ${fmt(s.inMotorA, 1)} A`;
    rows.cmd.textContent = s.di[0] ? 'fechada' : 'aberta';
    rows.vout.textContent = `${fmt(s.vout, 0)} %`;
    rows.cur.textContent = `${fmt(s.currentA, 1)} A`;
    rows.spd.textContent = `${fmt(s.speed * 100, 0)} %${s.reverse && s.speed > 0.05 ? ' (girando ao contrário!)' : ''}`;
    rows.th.textContent = `${s.thermal} %`;
    rows.rl.textContent = `${s.rl[0] ? 'fechado' : 'aberto'} · ${s.rl[1] ? 'fechado' : 'aberto'}`;
    rows.err.textContent = s.fault ? `${s.fault} — ${s.faultText}${s.autoResetIn !== null ? ` · reset AUTO em ${Math.ceil(s.autoResetIn / 60)} min` : ''}` : 'nenhuma';
  };
}
