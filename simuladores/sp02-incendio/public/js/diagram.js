// Diagrama elétrico interativo da SP02, adaptado ao CLP Altus XP325.
// Lê o estado da sessão ao vivo (SSE) e envia ações ao simulador.
import { el, svg, fmt, KGF } from './util.js';

const $ = (id) => document.getElementById(id);
let meta = null;
let sessionId = null;
let es = null;
let ST = null;               // último estado recebido
let sheetNo = 1;
let selected = null;
let pick = null;             // borne escolhido na ligação da jockey: {kind:'T'|'M', n}
const sheets = {};
const COMP = {};

// ------------------------------------------------------------------ API
async function api(path, method = 'GET', body) {
  const r = await fetch(`/api/${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Erro ${r.status}`);
  return d;
}
const act = (a) => api(`sessions/${sessionId}/action`, 'POST', a).catch(() => {});

// ------------------------------------------------------------------ Dados derivados do estado
const XP_IN = ['I00', 'I01', 'I02', 'I03', 'I04', 'I05', 'I06', 'I07', 'I10', 'I11', 'I12', 'I13', 'I14', 'I15', 'I16', 'I17'];
const XP_OUT = ['Q00', 'Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06', 'Q07', 'Q10', 'Q11', 'Q12'];
const OUT_TAG = ['K-B1', 'K-B2', 'K-BJ', 'RAX1', 'RAX2', 'RAX3', 'RAX4', 'RAX5', 'RAX6', 'RAX7', 'RAX8'];
const LAMPS = [
  { tag: 'LB1_S', color: 'green', txt: 'Bomba 01 selecionada' }, { tag: 'LB2_S', color: 'green', txt: 'Bomba 02 selecionada' },
  { tag: 'LB1_L', color: 'red', txt: 'Bomba 01 ligada' }, { tag: 'LB2_L', color: 'red', txt: 'Bomba 02 ligada' },
  { tag: 'LBJ_L', color: 'red', txt: 'Jockey ligada' }, { tag: 'LB1_D', color: 'green', txt: 'Bomba 01 desligada' },
  { tag: 'LB2_D', color: 'green', txt: 'Bomba 02 desligada' }, { tag: 'LBJ_D', color: 'green', txt: 'Jockey desligada' },
];

const sim = () => ST.sim;
const conn = () => ST.status === 'conectado';
function rawIn(i) {
  const s = sim(), p = s.panel, b = s.buttons;
  return [p.B_SEL === 'B1', p.B_SEL === 'B2', p.B1_MA === 'M', p.B1_MA === 'A', p.B2_MA === 'M', p.B2_MA === 'A',
    p.BJ_MA === 'M', p.BJ_MA === 'A', b.B1_L, !b.B1_D, b.B2_L, !b.B2_D, b.BJ_L, !b.BJ_D,
    s.pressostats.PJ.closed, s.pressostats.PB.closed][i];
}
function outOn(j) {
  const s = sim();
  return j === 0 ? s.k.KB1 : j === 1 ? s.k.KB2 : j === 2 ? s.k.KBJ : s.lamps[j - 3];
}
const br = (n) => !!sim().breakers[n];

// Redes elétricas: nome didático, tipo e se está energizada
const NET = {
  pin: ['Fases L1/L2/L3 da rede (antes do DG)', 'phase', () => true],
  pbus: ['Barramento L1/L2/L3 (depois do DG)', 'phase', () => br('DG')],
  n: ['Neutro', 'zero', () => true],
  pe: ['Terra de proteção (PE)', 'pe', () => false],
  pDB1: ['Fases depois do DB1 (entrada da SS_01)', 'phase', () => br('DG') && br('DB1')],
  pSS1: ['Saída da SS_01 para o motor da Bomba 01', 'phase', () => br('DG') && br('DB1') && sim().ssw[0].vout > 0],
  pDB2: ['Fases depois do DB2 (entrada da SS_02)', 'phase', () => br('DG') && br('DB2')],
  pSS2: ['Saída da SS_02 para o motor da Bomba 02', 'phase', () => br('DG') && br('DB2') && sim().ssw[1].vout > 0],
  pDBJ: ['Fases depois do DBJ (entrada da K-BJ)', 'phase', () => br('DG') && br('DBJ')],
  pKBJ: ['Fases depois dos contatos principais da K-BJ', 'phase', () => br('DG') && br('DBJ') && sim().k.KBJ],
  acD1: ['Fase L1 depois do D1 (entrada da fonte)', 'phase', () => br('DG') && br('D1')],
  acD2: ['Fase L1 depois do D2 (A1 da SS_01)', 'phase', () => br('DG') && br('D2')],
  acD3: ['Fase L1 depois do D3 (A1 da SS_02)', 'phase', () => br('DG') && br('D3')],
  p24s: ['+24 Vcc na saída da fonte (antes do D4)', 'plus', () => br('DG') && br('D1')],
  p24: ['+24 Vcc L+ (depois do D4)', 'plus', () => sim().v24],
  z0: ['0 V (L−) da fonte', 'zero', () => br('DG') && br('D1')],
  ss0p: ['Fase L1 do D2 no A1 da SS_01 (alimenta a DI1)', 'phase', () => sim().ssw[0].powered],
  ss0d: ['Entrada DI1 da SS_01', 'sig', () => sim().ssw[0].di[0]],

  ss1p: ['Fase L1 do D3 no A1 da SS_02 (alimenta a DI1)', 'phase', () => sim().ssw[1].powered],
  ss1d: ['Entrada DI1 da SS_02', 'sig', () => sim().ssw[1].di[0]],
};
for (let i = 0; i < 16; i++) NET[`in${i}`] = [`Sinal da entrada ${XP_IN[i]} do XP325 (${meta_tag(i)})`, 'sig', () => ST.coils[i]];
for (let j = 0; j < 11; j++) NET[`q${j}`] = [`Saída ${XP_OUT[j]} do XP325 → bobina ${OUT_TAG[j]}`, 'sig', () => outOn(j)];
for (let i = 0; i < 8; i++) NET[`lmp${i}`] = [`Contato ${OUT_TAG[i + 3]} → sinaleiro ${LAMPS[i].tag}`, 'sig', () => sim().lamps[i]];
for (let m = 0; m < 3; m++) NET[`mj${m}`] = [`Cabo do motor jockey (${['U1', 'V1', 'W1'][m]})`, 'phase', () => br('DG') && br('DBJ') && sim().k.KBJ && sim().jockeyWiring[m] !== null];
function meta_tag(i) { return ['B_SEL B01', 'B_SEL B02', 'B1_MA Man', 'B1_MA Auto', 'B2_MA Man', 'B2_MA Auto', 'BJ_MA Man', 'BJ_MA Auto', 'B1_L', 'B1_D', 'B2_L', 'B2_D', 'BJ_L', 'BJ_D', 'PJ', 'PB'][i]; }

function sswShort(s) {
  if (!s.powered) return '';
  if (s.fault) return { E03: 'PH.LOSS', E05: 'OVERLOAD', E63: 'STALL', E66: 'OVERCUR.', E67: 'PH.SEQ' }[s.fault] || s.fault;
  return { ready: 'PRONTA', accel: 'RAMPA ↑', decel: 'RAMPA ↓', run: 'BY-PASS' }[s.state] || '';
}

/**
 * Ícone fiel da SSW-05 Plus: base azul, carcaça cinza-claro, bornes R/S/T no topo e U/V/W embaixo,
 * área de trimpots e dip-switch à esquerda, LEDs MOTOR PROTECTION / STARTER STATUS à direita (ao vivo).
 * w x h em unidades do SVG; holesX = posições x dos 3 bornes de potência (para casar com os fios).
 */
function sswIcon(parent, S, k, x, y, w, h, holesX) {
  const g = svg('g', {}, parent);
  const r = (o) => svg('rect', o, g);
  r({ x: x - 4, y: y + 4, width: w + 8, height: h - 8, rx: 3, fill: '#1e4f8f' });
  r({ x, y, width: w, height: h, rx: 4, fill: '#dde0e6', stroke: '#9aa0aa', 'stroke-width': 1 });
  const hx = holesX || [x + w * 0.22, x + w * 0.5, x + w * 0.78];
  hx.forEach((cx) => { svg('circle', { cx, cy: y + 9, r: Math.min(6, w * 0.06), fill: '#2a2e35' }, g); svg('circle', { cx, cy: y + h - 9, r: Math.min(6, w * 0.06), fill: '#2a2e35' }, g); });
  // aletas
  for (let i = 0; i < 4; i++) svg('path', { d: `M${x + w * 0.1 + i * w * 0.09} ${y + 20} l${w * 0.05} 0 l-${w * 0.04} ${h * 0.07} l-${w * 0.05} 0 z`, fill: '#9aa0aa' }, g);
  // área de ajustes (esquerda): dip + 4 trimpots
  const ax = x + w * 0.07, ay = y + h * 0.27, aw = w * 0.4, ah = h * 0.55;
  r({ x: ax, y: ay, width: aw, height: ah, rx: 2, fill: '#c6cad2' });
  r({ x: ax + aw * 0.3, y: ay + ah * 0.06, width: aw * 0.22, height: ah * 0.32, fill: '#f6f6f3', stroke: '#888', 'stroke-width': 0.5 });
  for (let i = 0; i < 6; i++) r({ x: ax + aw * 0.4, y: ay + ah * (0.08 + i * 0.05), width: aw * 0.1, height: ah * 0.03, fill: '#2b2f33' });
  [[0.3, 0.55], [0.72, 0.55], [0.3, 0.83], [0.72, 0.83]].forEach(([fx, fy]) => {
    svg('circle', { cx: ax + aw * fx, cy: ay + ah * fy, r: Math.min(aw, ah) * 0.13, fill: '#fff', stroke: '#8c9199', 'stroke-width': 0.8 }, g);
  });
  // LEDs (direita): 5 proteções + FAULT/RUN/READY
  const lx = x + w * 0.56, lw = w * 0.1, lh = Math.max(2.5, h * 0.025);
  const keys = ['overcurrent', 'phaseLoss', 'phaseSeq', 'stall', 'overload', 'fault', 'run', 'ready'];
  const cols = { fault: '#ff3b2f', run: '#3fe06a', ready: '#3fe06a' };
  const leds = keys.map((key, i) => {
    const ly = y + h * 0.28 + i * h * 0.045 + (i >= 5 ? h * 0.04 : 0);
    const e = r({ x: lx, y: ly, width: lw, height: lh, rx: 0.8, fill: '#3a3d42' });
    return [key, e];
  });
  // relés 13 14/23 24
  [0, 1, 2].forEach((i) => svg('circle', { cx: lx + i * w * 0.1 + 2, cy: y + h * 0.84, r: Math.min(3, w * 0.03), fill: '#2a2e35' }, g));
  const tt = svg('text', { x: lx + lw + 3, y: y + h * 0.25, 'font-size': Math.max(5, h * 0.045), 'font-family': 'Arial', 'font-weight': 700, fill: '#1d2024' }, g);
  tt.textContent = 'SSW-05';
  S.ups.push(() => {
    const st = sim().ssw[k].leds;
    leds.forEach(([key, e]) => e.setAttribute('fill', st[key] ? (cols[key] || '#ff3b2f') : '#3a3d42'));
  });
  return g;
}

// ------------------------------------------------------------------ Construtor de folhas
function newSheet(n, title) {
  const root = svg('svg', { viewBox: '0 0 1200 720', role: 'img', 'aria-label': `Folha ${n}: ${title}` });
  const S = { n, title, root, wires: [], ups: [], layer: {} };
  S.layer.wire = svg('g', {}, root);
  S.layer.sym = svg('g', {}, root);
  S.layer.hit = svg('g', {}, root);
  svg('rect', { x: 8, y: 8, width: 1184, height: 704, class: 'frame' }, root);
  const tb = svg('g', { class: 'titleblk' }, root);
  svg('rect', { x: 760, y: 664, width: 432, height: 48 }, tb);
  txt(tb, 770, 682, 'Simulador Sistema de Incêndio · CLP Altus XP325', 'b');
  txt(tb, 770, 700, `Folha ${n}/5 · ${title}`, 's');
  txt(root, 1182, 24, 'Adaptado do diagrama SAEP (S7-1200) para o Altus XP325', 's end');
  sheets[n] = S;
  return S;
}
function txt(parent, x, y, t, cls = '') {
  const e = svg('text', { x, y, class: `t ${cls}` }, parent);
  e.textContent = t;
  return e;
}
function W(S, pts, net, extra = '') {
  const d = 'M' + pts.map((p) => p.join(' ')).join(' L');
  const type = NET[net]?.[1] || 'sig';
  const e = svg('path', { d, class: `w ${type === 'pe' ? 'pe' : ''} ${extra}` }, S.layer.wire);
  const h = svg('path', { d, class: 'wh' }, S.layer.hit);
  h.addEventListener('mouseenter', (ev) => hoverNet(S, net, ev, true));
  h.addEventListener('mousemove', (ev) => moveTip(ev));
  h.addEventListener('mouseleave', (ev) => hoverNet(S, net, ev, false));
  S.wires.push({ e, net, type });
  return e;
}
function J(S, x, y, net) {
  const d = svg('circle', { cx: x, cy: y, r: 3.5, class: 'dot' }, S.layer.sym);
  S.ups.push(() => d.classList.toggle('on', NET[net][2]()));
}
// Contato vertical entre y1 (topo) e y2 (base). kind: 'NA' | 'NF' | 'CB' (disjuntor)
function contact(S, x, y1, y2, isClosed, kind = 'NA', parent) {
  const g = svg('g', {}, parent || S.layer.sym);
  const piv = y2 - 10, top = y1 + 10;
  svg('line', { x1: x, y1, x2: x, y2: top, class: 'sym' }, g);
  svg('line', { x1: x, y1: piv, x2: x, y2, class: 'sym' }, g);
  if (kind === 'NF') svg('line', { x1: x, y1: top, x2: x + 9, y2: top, class: 'sym' }, g);
  if (kind === 'CB') { svg('line', { x1: x - 4, y1: top - 4, x2: x + 4, y2: top + 4, class: 'sym' }, g); svg('line', { x1: x - 4, y1: top + 4, x2: x + 4, y2: top - 4, class: 'sym' }, g); }
  const blade = svg('line', { x1: x, y1: piv, x2: kind === 'NF' ? x + 5 : x, y2: top, class: 'blade' }, g);
  S.ups.push(() => blade.setAttribute('transform', isClosed() ? '' : `rotate(${kind === 'NF' ? -32 : -30} ${x} ${piv})`));
  return g;
}
function coil(S, x, yc, isOn, parent) {
  const g = svg('g', {}, parent || S.layer.sym);
  const r = svg('rect', { x: x - 17, y: yc - 10, width: 34, height: 20, class: 'coil-box' }, g);
  txt(g, x + 21, yc - 12, 'A1', 's'); txt(g, x + 21, yc + 20, 'A2', 's');
  S.ups.push(() => r.classList.toggle('on', isOn()));
  return g;
}
function comp(S, id, box, def) {
  const g = svg('g', { class: 'comp', tabindex: 0, role: 'button', 'aria-label': def.title }, S.layer.hit);
  svg('rect', { x: box[0], y: box[1], width: box[2], height: box[3], rx: 4, class: 'hit' }, g);
  COMP[id] = Object.assign({ id, sheet: S.n, g }, def);
  g.addEventListener('mouseenter', (ev) => { showTip(ev, `<b>${def.title}</b>${def.tip ? '<br>' + def.tip() : ''}`); });
  g.addEventListener('mousemove', moveTip);
  g.addEventListener('mouseleave', hideTip);
  if (def.hold) {
    const up = () => { if (g.dataset.down === '1') { g.dataset.down = '0'; def.hold(false); } };
    g.addEventListener('pointerdown', (e) => { e.preventDefault(); select(id); g.dataset.down = '1'; def.hold(true); });
    g.addEventListener('pointerup', up); g.addEventListener('pointerleave', up);
  } else {
    g.addEventListener('click', () => { select(id); if (def.click) def.click(); });
  }
  g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(id); if (def.click) def.click(); } });
  return g;
}
function xref(S, x, y, text, goSheet, goId) {
  const e = svg('text', { x, y, class: 'xref' }, S.layer.hit);
  e.textContent = text;
  e.addEventListener('click', () => { showSheet(goSheet); if (goId) select(goId); });
  return e;
}

// ------------------------------------------------------------------ Textos e cadeias didáticas
const yes = (ok) => (ok ? '' : 'no');
function inChain(i) {
  return () => {
    const c = ST.config;
    return [
      { t: `Contato do campo ${rawIn(i) ? 'fechado' : 'aberto'}`, ok: rawIn(i) },
      { t: '+24 Vcc no campo (DG, D1 e D4 ligados)', ok: sim().v24 },
      { t: `Borne ${XP_IN[i]} do XP325 recebe 24 V (lê 1)`, ok: ST.coils[i] },
      { t: `Modbus: coil ${c.coilBase + i} = ${ST.coils[i] ? 1 : 0} enviada ao CLP`, ok: conn(), wait: !conn() },
    ];
  };
}
function outChain(j, extra = []) {
  return () => {
    const c = ST.config;
    const base = [
      { t: 'Simulador conectado ao CLP', ok: conn() },
      { t: `Programa liga ${XP_OUT[j]} (discrete input ${c.diBase + j} = ${ST.plc[j] ? 1 : 0})`, ok: ST.plc[j] },
      { t: '+24 Vcc no Q+ das saídas (D4)', ok: sim().v24 },
      { t: `Bobina ${OUT_TAG[j]} energizada`, ok: outOn(j) },
    ];
    return base.concat(extra.map((f) => f()));
  };
}
const sswChain = (k) => [
  () => ({ t: `Contato 13-14 da K-B${k + 1} fecha a DI1 da SS_0${k + 1}`, ok: sim().ssw[k].di[0] }),
  () => ({ t: `SS_0${k + 1} alimentada (D${k + 2})`, ok: sim().ssw[k].powered }),
  () => ({ t: `Potência presente (DG e DB${k + 1})`, ok: br('DG') && br(`DB${k + 1}`) }),
  () => ({ t: sim().ssw[k].fault ? `Erro ${sim().ssw[k].fault} na soft` : 'Soft sem erro', ok: !sim().ssw[k].fault }),
  () => ({ t: `Tensão de saída ${fmt(sim().ssw[k].vout, 0)} % (trimpot de aceleração ${sim().ssw[k].pots.accT} s)`, ok: sim().ssw[k].vout > 0 }),
  () => ({ t: `Bomba 0${k + 1} girando (${fmt(sim().ssw[k].speed * 100, 0)} %)`, ok: sim().ssw[k].speed > 0.05 }),
];
const jockeyChain = [
  () => ({ t: 'Disjuntor-motor DBJ ligado', ok: br('DBJ') && br('DG') }),
  () => ({ t: `Motor ligado ao painel (${sim().jockeyLink.phases} de 3 fases)`, ok: sim().jockeyLink.phases === 3 }),
  () => ({ t: sim().jockeyLink.reverse ? 'Sentido de giro invertido (2 fases trocadas)' : 'Sentido de giro correto', ok: !sim().jockeyLink.reverse }),
  () => ({ t: `Jockey girando (${fmt(sim().jockeySpeed * 100, 0)} %)`, ok: sim().jockeySpeed > 0.05 }),
];
const kvIn = (i) => () => [['Borne XP325', XP_IN[i]], ['Tabela SP02', meta.coils[i].addr], ['Modbus (coil)', String(ST.config.coilBase + i)], ['Estado no CLP', ST.coils[i] ? '1' : '0']];
const kvOut = (j) => () => [['Borne XP325', XP_OUT[j]], ['Tabela SP02', meta.discreteInputs[j].addr], ['Modbus (discrete input)', String(ST.config.diBase + j)], ['Bobina', outOn(j) ? 'energizada' : 'desligada']];
const bkDef = (n, desc) => ({
  title: `Disjuntor ${n}`, kind: 'Proteção · clique para ligar/desligar', desc,
  tip: () => (br(n) ? 'ligado' : 'desligado'),
  kv: () => [['Estado', br(n) ? 'ligado' : 'desligado']],
  click: () => act({ type: 'breaker', name: n, value: !br(n) }),
  acts: () => [{ label: br(n) ? 'Desligar' : 'Ligar', fn: () => act({ type: 'breaker', name: n, value: !br(n) }), primary: true }],
});
const SEL_POS = { B_SEL: ['B1', '0', 'B2'], B1_MA: ['M', '0', 'A'], B2_MA: ['M', '0', 'A'], BJ_MA: ['M', '0', 'A'] };
const POS_TXT = { B1: 'Bomba 01', B2: 'Bomba 02', M: 'Manual', A: 'Automático', 0: '0 (desligado)' };
function selDef(name, title, iA, iB, desc) {
  const pos = SEL_POS[name];
  return {
    title: `${name} — ${title}`, kind: 'Chave seletora de 3 posições · clique para girar', desc,
    tip: () => `posição: ${POS_TXT[sim().panel[name]]}`,
    kv: () => [['Posição', POS_TXT[sim().panel[name]]], [`${XP_IN[iA]} (${pos[0] === 'B1' ? 'B01' : 'Man'})`, ST.coils[iA] ? '1' : '0'], [`${XP_IN[iB]} (${pos[2] === 'B2' ? 'B02' : 'Auto'})`, ST.coils[iB] ? '1' : '0']],
    chain: () => inChain(sim().panel[name] === pos[2] ? iB : iA)(),
    click: () => { const k = pos.indexOf(sim().panel[name]); act({ type: 'selector', name, value: pos[(k + 1) % 3] }); },
    acts: () => pos.map((p) => ({ label: POS_TXT[p], fn: () => act({ type: 'selector', name, value: p }), primary: sim().panel[name] === p })),
  };
}
function btnDef(name, i, nf, title) {
  return {
    title: `${name} — ${title}`, kind: `Botoeira ${nf ? 'NF (desliga)' : 'NA (liga)'} · segure para pressionar`,
    desc: nf
      ? `Contato normalmente fechado: solto = ${XP_IN[i]} em 1; pressionado = 0. O programa deve parar a bomba na queda do sinal. Sem 24 Vcc ele também vai a 0, por isso o NF é seguro: um fio rompido também desliga.`
      : `Contato normalmente aberto: pressionado = ${XP_IN[i]} em 1. O simulador mantém o pulso por no mínimo 300 ms para o CLP enxergar.`,
    tip: () => (sim().buttons[name] ? 'pressionado' : 'solto'),
    kv: kvIn(i), chain: inChain(i),
    hold: (v) => act({ type: 'button', name, value: v }),
  };
}
function psDef(name, i) {
  return {
    title: `${name} — pressostato ${name === 'PJ' ? 'da jockey' : 'das principais'}`, kind: 'Pressostato KP · segure para acionar a alavanca de teste',
    desc: `Contato que fecha com pressão baixa (≤ faixa − DIF) e abre com pressão alta (≥ faixa). Entre os dois valores mantém o estado (histerese). ${name === 'PJ' ? 'Pede a jockey.' : 'Pede a bomba principal selecionada.'}`,
    tip: () => `${sim().pressostats[name].closed ? 'fechado' : 'aberto'} · rede ${fmt(sim().pressure * KGF, 1)} kgf/cm²`,
    kv: () => {
      const p = sim().pressostats[name];
      return [['Pressão da rede', `${fmt(sim().pressure, 2)} bar · ${fmt(sim().pressure * KGF, 2)} kgf/cm²`], ['Fecha em', `≤ ${fmt(p.cutIn, 1)} bar`], ['Abre em', `≥ ${fmt(p.range, 1)} bar`], ['Contato', p.closed ? 'fechado' : 'aberto']].concat(kvIn(i)());
    },
    chain: inChain(i),
    hold: (v) => act({ type: 'pressostat', name, field: 'test', value: v }),
  };
}

// ------------------------------------------------------------------ Folha 1 — Potência
function buildSheet1() {
  const S = newSheet(1, 'Potência e alimentação');
  const Y = [130, 148, 166], YN = 184, YPE = 202;
  txt(S.root, 24, 28, '3~ 380 V + N + PE', 'b');
  // Entrada e DG
  [50, 70, 90].forEach((x, k) => {
    W(S, [[x, 36], [x, 60]], 'pin');
    contact(S, x, 60, 104, () => br('DG'), 'CB');
    W(S, [[x, 104], [x, Y[k]], [1170, Y[k]]], 'pbus');
  });
  svg('path', { d: 'M44 82 H96', class: 'mech' }, S.layer.sym);
  txt(S.root, 100, 80, 'DG', 'b');
  W(S, [[110, 36], [110, YN], [1170, YN]], 'n');
  W(S, [[130, 36], [130, YPE], [1170, YPE]], 'pe');
  txt(S.root, 1176, Y[0] + 4, 'L1', 's'); txt(S.root, 1176, Y[1] + 4, 'L2', 's'); txt(S.root, 1176, Y[2] + 4, 'L3', 's');
  txt(S.root, 1176, YN + 4, 'N', 's'); txt(S.root, 1176, YPE + 4, 'PE', 's');
  comp(S, 'DG', [36, 50, 80, 64], bkDef('DG', 'Disjuntor geral tripolar. Alimenta todo o painel: potência das três bombas, fonte 24 Vcc e controle das soft-starters.'));

  // Bombas principais com soft-starter
  const feederSS = (bx, k) => {
    const xs = [bx, bx + 24, bx + 48];
    const dbn = `DB${k + 1}`;
    xs.forEach((x, f) => { J(S, x, Y[f], 'pbus'); W(S, [[x, Y[f]], [x, 236]], 'pbus'); contact(S, x, 236, 290, () => br(dbn), 'CB'); W(S, [[x, 290], [x, 330]], `pDB${k + 1}`); });
    svg('path', { d: `M${bx - 6} 262 H${bx + 54}`, class: 'mech' }, S.layer.sym);
    txt(S.root, bx + 62, 258, dbn, 'b'); txt(S.root, bx + 62, 272, 'I>', 's');
    comp(S, dbn, [bx - 12, 226, 100, 70], bkDef(dbn, `Disjuntor-motor tripolar da Bomba 0${k + 1}. Protege contra curto-circuito e sobrecarga. Aberto com comando de partida: a soft acusa E03 (falta de fase).`));
    // soft-starter (ícone fiel da SSW-05 Plus)
    sswIcon(S.layer.sym, S, k, bx - 22, 330, 92, 120, xs);
    const stt = svg('text', { x: bx + 84, y: 396, class: 't s' }, S.layer.sym);
    txt(S.root, bx + 74, 360, `SS_0${k + 1}`, 'b');
    txt(S.root, bx + 74, 374, 'SSW-05 Plus', 's');
    S.ups.push(() => { stt.textContent = sswShort(sim().ssw[k]); });
    comp(S, `SS_0${k + 1}`, [bx - 24, 328, 96, 124], {
      title: `SS_0${k + 1} — micro soft-starter WEG SSW-05 Plus`, kind: 'Partida e parada em rampa · ajuste por trimpots',
      desc: `Parte e para a Bomba 0${k + 1} em rampa. Os tempos são ajustados nos trimpots frontais (aceleração 1–20 s, desaceleração OFF–20 s); não há IHM. Não conversa com o CLP: quem manda é a DI1, fechada pelo contato 13-14 da contatora K-B${k + 1} (folha 4). A eletrônica (A1-A2) vem do D${k + 2}.`,
      tip: () => sswShort(sim().ssw[k]) || 'sem alimentação',
      kv: () => { const s = sim().ssw[k]; return [['Estado', sswShort(s) || 'sem alimentação'], ['Tensão de saída', `${fmt(s.vout, 0)} %`], ['Corrente', `${fmt(s.currentA, 1)} A`], ['Aceleração / desaceleração', `${fmt(s.pots.accT, 1)} s / ${s.pots.decT <= 0 ? 'OFF' : fmt(s.pots.decT, 1) + ' s'}`], ['Tensão inicial', `${s.pots.initV} %`]]; },
      chain: () => sswChain(k).map((f) => f()),
      acts: () => [{ label: 'Botão RESET', fn: () => act({ type: 'sswKey', index: k, key: 'RESET' }) }, { label: 'Abrir soft no simulador', fn: () => window.open(`/#${sessionId}`, '_blank') }],
    });
    xs.forEach((x) => W(S, [[x, 444], [x, 530]], `pSS${k + 1}`));
    motor(S, bx + 24, 580, () => sim().ssw[k].speed > 0.05, () => false, `M${k + 1}`, `Bomba 0${k + 1}`);
    W(S, [[bx + 70, YPE], [bx + 70, 580], [bx + 62, 580]], 'pe');
    J(S, bx + 70, YPE, 'pe');
    comp(S, `M${k + 1}`, [bx - 16, 538, 84, 84], {
      title: `M${k + 1} — motor da Bomba 0${k + 1}`, kind: 'Motor trifásico',
      desc: `Motor da bomba principal ${k === 0 ? '(principal)' : '(reserva)'}. Acionado pela SS_0${k + 1}; a rotação acompanha a rampa de tensão.`,
      kv: () => [['Rotação', `${fmt(sim().ssw[k].speed * 100, 0)} %`], ['Corrente', `${fmt(sim().ssw[k].currentA, 1)} A`]],
      chain: () => sswChain(k).map((f) => f()),
    });
  };
  feederSS(200, 0);
  feederSS(410, 1);

  // Jockey: DBJ + K-BJ + ligação do motor (exercício)
  const bx = 610, xs = [bx, bx + 44, bx + 88];
  xs.forEach((x, f) => { J(S, x, Y[f], 'pbus'); W(S, [[x, Y[f]], [x, 236]], 'pbus'); contact(S, x, 236, 290, () => br('DBJ'), 'CB'); W(S, [[x, 290], [x, 320]], 'pDBJ'); contact(S, x, 320, 372, () => sim().k.KBJ, 'NA'); W(S, [[x, 372], [x, 410]], 'pKBJ'); });
  svg('path', { d: `M${bx - 6} 262 H${bx + 94}`, class: 'mech' }, S.layer.sym);
  svg('path', { d: `M${bx - 6} 346 H${bx + 94}`, class: 'mech' }, S.layer.sym);
  txt(S.root, bx + 100, 258, 'DBJ', 'b'); txt(S.root, bx + 100, 272, 'I>', 's');
  txt(S.root, bx + 100, 344, 'K-BJ', 'b'); txt(S.root, bx + 100, 358, '1-2 3-4 5-6', 's');
  comp(S, 'DBJ', [bx - 12, 226, 140, 70], bkDef('DBJ', 'Disjuntor-motor da bomba jockey. Desarma sozinho se o motor ficar ligado com só 2 fases (falta de fase).'));
  comp(S, 'K-BJ_P', [bx - 12, 314, 140, 64], {
    title: 'K-BJ — contatos principais', kind: 'Contatora de partida direta',
    desc: 'Os contatos 1-2, 3-4 e 5-6 ligam o motor da jockey direto na rede. A bobina está na saída Q02 do XP325 (folha 3).',
    kv: kvOut(2), chain: outChain(2, jockeyChain), acts: () => [{ label: 'Ver bobina (folha 3)', fn: () => { showSheet(3); select('K-BJ'); } }],
  });
  // Bornes da contatora e do motor
  const tT = [], tM = [];
  ['2/T1', '4/T2', '6/T3'].forEach((t, f) => {
    const c = svg('circle', { cx: xs[f], cy: 414, r: 7, class: 'term wire' }, S.layer.hit);
    txt(S.root, xs[f] + 9, 404, t, 's');
    c.addEventListener('click', () => wireClick('T', f + 1));
    tT.push(c);
  });
  ['U1', 'V1', 'W1'].forEach((t, m) => {
    const c = svg('circle', { cx: xs[m], cy: 494, r: 7, class: 'term wire' }, S.layer.hit);
    txt(S.root, xs[m] + 9, 510, t, 's');
    c.addEventListener('click', () => wireClick('M', m));
    tM.push(c);
  });
  const jWires = [0, 1, 2].map((m) => W(S, [[xs[m], 494], [xs[m], 494]], `mj${m}`));
  S.ups.push(() => {
    const wv = sim().jockeyWiring;
    wv.forEach((t, m) => {
      jWires[m].setAttribute('d', t ? `M${xs[t - 1]} 421 C ${xs[t - 1]} 455, ${xs[m]} 455, ${xs[m]} 487` : `M${xs[m]} 494 L${xs[m]} 494`);
    });
    tT.forEach((c, f) => c.classList.toggle('pick', pick?.kind === 'T' && pick.n === f + 1));
    tM.forEach((c, m) => c.classList.toggle('pick', pick?.kind === 'M' && pick.n === m));
  });
  xs.forEach((x, m) => W(S, [[x, 501], [x, 550]], `mj${m}`));
  motor(S, bx + 44, 584, () => sim().jockeySpeed > 0.05, () => sim().jockeyLink.reverse, 'MJ', 'Jockey');
  W(S, [[bx + 124, YPE], [bx + 124, 584], [bx + 78, 584]], 'pe'); J(S, bx + 124, YPE, 'pe');
  txt(S.root, bx - 10, 470, 'ligação', 's end'); txt(S.root, bx - 10, 483, 'do motor', 's end');
  comp(S, 'MJ', [bx + 2, 546, 84, 80], {
    title: 'MJ — motor da bomba jockey', kind: 'Exercício de ligação · partida direta',
    desc: 'Na SP02 este motor ainda não está ligado ao painel. Clique num borne da K-BJ (2/T1, 4/T2, 6/T3) e depois num borne do motor (U1, V1, W1) para ligar um cabo. Clique num borne do motor já ligado para soltar o cabo. Com 2 fases o DBJ desarma; trocando duas fases o motor gira ao contrário e a jockey quase não pressuriza.',
    kv: () => { const L = sim().jockeyLink, wv = sim().jockeyWiring; return [['Ligação', ['U1', 'V1', 'W1'].map((u, m) => `${u}→${wv[m] ? ['2/T1', '4/T2', '6/T3'][wv[m] - 1] : '—'}`).join('  ')], ['Fases ligadas', `${L.phases} de 3`], ['Sentido', L.phases < 3 ? '—' : L.reverse ? 'invertido' : 'correto'], ['Rotação', `${fmt(sim().jockeySpeed * 100, 0)} %`]]; },
    chain: () => jockeyChain.map((f) => f()),
    acts: () => [
      { label: 'Ligar corretamente', primary: true, fn: () => [0, 1, 2].forEach((m) => act({ type: 'jockeyWire', motor: m, terminal: m + 1 })) },
      { label: 'Trocar 2 fases', fn: () => { act({ type: 'jockeyWire', motor: 0, terminal: 2 }).then(() => act({ type: 'jockeyWire', motor: 1, terminal: 1 })).then(() => act({ type: 'jockeyWire', motor: 2, terminal: 3 })); } },
      { label: 'Soltar todos os cabos', fn: () => [0, 1, 2].forEach((m) => act({ type: 'jockeyWire', motor: m, terminal: null })) },
    ],
  });

  // Fonte 24 Vcc
  const fx = 860;
  J(S, fx, Y[0], 'pbus'); W(S, [[fx, Y[0]], [fx, 236]], 'pbus'); contact(S, fx, 236, 290, () => br('D1'), 'CB'); W(S, [[fx, 290], [fx, 330]], 'acD1');
  txt(S.root, fx + 10, 258, 'D1', 'b');
  comp(S, 'D1', [fx - 14, 226, 50, 70], bkDef('D1', 'Disjuntor unipolar da fonte 24 Vcc (FCC). Sem ele não existe 24 Vcc: chaves, botões, pressostatos e saídas do CLP ficam sem tensão.'));
  J(S, fx + 60, YN, 'n'); W(S, [[fx + 60, YN], [fx + 60, 330]], 'n');
  svg('rect', { x: fx - 20, y: 330, width: 100, height: 64, rx: 4, class: 'box' }, S.layer.sym);
  txt(S.root, fx + 30, 356, 'FCC', 'b mid'); txt(S.root, fx + 30, 372, '24 Vcc', 's mid');
  comp(S, 'FCC', [fx - 22, 328, 104, 68], { title: 'FCC — fonte 24 Vcc', kind: 'Fonte de alimentação', desc: 'Converte L1-N (via D1) em 24 Vcc. A saída + passa pelo D4 e vira o L+ do comando; a saída − é o 0 V (L−) comum de todo o comando.', kv: () => [['Entrada (D1)', br('DG') && br('D1') ? 'energizada' : 'sem tensão'], ['L+ (depois do D4)', sim().v24 ? '24 Vcc' : '0 V']] });
  W(S, [[fx, 394], [fx, 430]], 'p24s'); contact(S, fx, 430, 484, () => br('D4'), 'CB'); W(S, [[fx, 484], [fx, 560], [fx + 20, 560]], 'p24');
  txt(S.root, fx + 10, 452, 'D4', 'b');
  comp(S, 'D4', [fx - 14, 422, 50, 70], bkDef('D4', 'Disjuntor da saída 24 Vcc (L+). Alimenta o campo (entradas do XP325) e o Q+ das saídas.'));
  W(S, [[fx + 60, 394], [fx + 60, 600], [fx + 80, 600]], 'z0');
  txt(S.root, fx + 26, 564, 'L+ → folhas 2, 3, 4', 's'); txt(S.root, fx + 84, 604, 'L− (0 V)', 's');

  // Controle das softs
  [[1010, 'D2', 0, 'acD2'], [1110, 'D3', 1, 'acD3']].forEach(([x, n, k, net]) => {
    J(S, x, Y[0], 'pbus'); W(S, [[x, Y[0]], [x, 236]], 'pbus'); contact(S, x, 236, 290, () => br(n), 'CB'); W(S, [[x, 290], [x, 340]], net);
    J(S, x + 30, YN, 'n'); W(S, [[x + 30, YN], [x + 30, 340]], 'n');
    txt(S.root, x + 8, 258, n, 'b');
    svg('rect', { x: x - 16, y: 340, width: 62, height: 46, rx: 3, class: 'box' }, S.layer.sym);
    txt(S.root, x + 15, 358, `SS_0${k + 1}`, 'b mid'); txt(S.root, x + 15, 374, 'A1   A2', 's mid');
    const led = svg('circle', { cx: x + 15, cy: 398, r: 5, class: 'led' }, S.layer.sym);
    S.ups.push(() => led.classList.toggle('on', sim().ssw[k].powered));
    comp(S, n, [x - 18, 226, 66, 180], bkDef(n, `Disjuntor unipolar do controle da SS_0${k + 1} (bornes A1-A2). Desligado, a soft apaga e perde a senha P000.`));
  });
  return S;
}
function motor(S, cx, cy, isOn, isRev, tag, name) {
  const g = svg('g', {}, S.layer.sym);
  const c = svg('circle', { cx, cy, r: 34, class: 'motor' }, g);
  txt(g, cx, cy - 2, 'M', 'b mid'); txt(g, cx, cy + 14, '3~', 's mid');
  txt(g, cx, cy + 50, `${tag} · ${name}`, 's mid');
  const arrow = svg('path', { d: `M${cx - 22} ${cy - 26} A 34 34 0 0 1 ${cx + 22} ${cy - 26}`, fill: 'none', stroke: '#c0392b', 'stroke-width': 2, 'marker-end': '' }, g);
  const rot = svg('text', { x: cx + 40, y: cy - 20, class: 't s' }, g);
  S.ups.push(() => {
    const on = isOn(), rev = isRev();
    c.classList.toggle('on', on && !rev); c.classList.toggle('rev', on && rev);
    arrow.style.opacity = on ? 1 : 0;
    rot.textContent = on ? (rev ? '↺ invertido' : '↻') : '';
  });
}
function wireClick(kind, n) {
  if (kind === 'M' && !pick) {
    // borne do motor sem seleção: se ligado, solta
    if (sim().jockeyWiring[n] !== null) { act({ type: 'jockeyWire', motor: n, terminal: null }); return; }
    pick = { kind, n }; update(); return;
  }
  if (!pick) { pick = { kind, n }; update(); return; }
  if (pick.kind === kind) { pick = { kind, n }; update(); return; }
  const motorIdx = kind === 'M' ? n : pick.n;
  const term = kind === 'T' ? n : pick.n;
  pick = null;
  act({ type: 'jockeyWire', motor: motorIdx, terminal: term });
  select('MJ');
}

// ------------------------------------------------------------------ Folha 2 — Entradas XP325
function buildSheet2() {
  const S = newSheet(2, 'Comando 24 Vcc e entradas digitais do XP325');
  const yR = 70, y0 = 630, yT = 470;
  W(S, [[40, yR], [1170, yR]], 'p24'); txt(S.root, 44, yR - 8, 'L+ 24 Vcc (vem do D4, folha 1)', 'b');
  W(S, [[40, y0], [1170, y0]], 'z0'); txt(S.root, 44, y0 + 18, 'L− 0 V', 'b');
  xref(S, 300, yR - 8, '→ folha 1', 1, 'D4');
  const X = (i) => (i < 8 ? 90 + i * 62 : 640 + (i - 8) * 62);
  // Caixa do XP325
  svg('rect', { x: 50, y: yT, width: 1100, height: 100, rx: 4, class: 'box plc' }, S.layer.sym);
  txt(S.root, 600, yT + 62, 'Altus XP325 — entradas digitais 24 Vcc (tipo sink, dois grupos isolados)', 'b mid');
  comp(S, 'XP325_IN', [52, yT + 40, 1096, 58], { title: 'Altus XP325 — entradas digitais', kind: 'CLP Nexto Xpress', desc: '16 entradas digitais 24 Vcc em dois grupos isolados: I00 a I07 (comum C0) e I10 a I17 (comum C1). Ligação tipo sink: o comum vai ao 0 V e o dispositivo de campo leva +24 V à entrada. Neste simulador, cada entrada chega ao CLP como uma coil Modbus.', kv: () => [['Entradas em 1', String(ST.coils.filter(Boolean).length)], ['Simulador', conn() ? 'conectado' : 'desconectado']] });
  for (let i = 0; i < 16; i++) {
    const x = X(i);
    J(S, x, yR, 'p24');
    W(S, [[x, yR], [x, 180]], 'p24');
    const nf = [9, 11, 13].includes(i);
    contact(S, x, 180, 240, () => rawIn(i), nf ? 'NF' : 'NA');
    W(S, [[x, 240], [x, yT]], `in${i}`);
    const t = svg('rect', { x: x - 7, y: yT - 7, width: 14, height: 14, class: 'term' }, S.layer.sym);
    S.ups.push(() => t.classList.toggle('on', ST.coils[i]));
    txt(S.root, x, yT + 22, XP_IN[i], 'addr mid');
    const ma = txt(S.root, x, yT + 36, `c${i}`, 's mid');
    S.ups.push(() => { ma.textContent = `coil ${ST.config.coilBase + i}`; });
  }
  // Comuns
  [[307, 'C0'], [857, 'C1']].forEach(([x, c]) => { svg('rect', { x: x - 7, y: yT + 93, width: 14, height: 14, class: 'term' }, S.layer.sym); txt(S.root, x + 12, yT + 104, c, 'addr'); W(S, [[x, yT + 107], [x, y0]], 'z0'); J(S, x, y0, 'z0'); });
  // Atuadores e etiquetas
  const label = (x1, x2, y, t, sub) => {
    const cx = (x1 + x2) / 2;
    svg('rect', { x: cx - 64, y: y - 13, width: 128, height: sub ? 32 : 18, fill: '#fbfbf7' }, S.layer.sym);
    txt(S.root, cx, y, t, 'b mid'); if (sub) txt(S.root, cx, y + 14, sub, 's mid');
  };
  const selectorSym = (x1, x2) => { svg('path', { d: `M${x1 - 6} 210 H${x2 + 6}`, class: 'mech' }, S.layer.sym); svg('path', { d: `M${x1 - 18} 204 l6 -6 l6 6 l-6 6 z`, class: 'sym' }, S.layer.sym); };
  const pushSym = (x) => { svg('path', { d: `M${x - 22} 210 H${x - 2} M${x - 22} 202 V218`, class: 'mech' }, S.layer.sym); };
  const pressSym = (x) => { svg('path', { d: `M${x - 18} 210 H${x - 2}`, class: 'mech' }, S.layer.sym); svg('circle', { cx: x - 26, cy: 210, r: 9, class: 'sym-fill' }, S.layer.sym); txt(S.root, x - 26, 214, 'P', 'b mid'); };
  [['B_SEL', 0, 'Seleção', 'B01 · 0 · B02'], ['B1_MA', 2, 'Bomba 01', 'Man · 0 · Auto'], ['B2_MA', 4, 'Bomba 02', 'Man · 0 · Auto'], ['BJ_MA', 6, 'Jockey', 'Man · 0 · Auto']].forEach(([n, i, t, sub]) => {
    selectorSym(X(i), X(i + 1)); label(X(i), X(i + 1), 120, n, sub);
    txt(S.root, X(i) + 6, 270, n === 'B_SEL' ? 'B01' : 'Man', 's'); txt(S.root, X(i + 1) + 6, 270, n === 'B_SEL' ? 'B02' : 'Auto', 's');
    comp(S, n, [X(i) - 30, 96, X(i + 1) - X(i) + 60, 180], selDef(n, t, i, i + 1, n === 'B_SEL'
      ? 'Escolhe qual bomba principal parte no automático. B01 fecha o contato da I00; B02, o da I01; em 0, nenhum.'
      : `Chave Manual/0/Automático da ${t}. Man fecha o contato da ${XP_IN[i]}; Auto, o da ${XP_IN[i + 1]}; em 0, nenhum.`));
  });
  [['B1_L', 8, false, 'Liga Bomba 01'], ['B1_D', 9, true, 'Desliga Bomba 01'], ['B2_L', 10, false, 'Liga Bomba 02'], ['B2_D', 11, true, 'Desliga Bomba 02'], ['BJ_L', 12, false, 'Liga jockey'], ['BJ_D', 13, true, 'Desliga jockey']].forEach(([n, i, nf, t]) => {
    pushSym(X(i)); txt(S.root, X(i) + 8, 270, n, 's');
    comp(S, n, [X(i) - 28, 160, 58, 120], btnDef(n, i, nf, t));
  });
  label(X(8), X(9), 120, 'Bomba 01', 'NA liga · NF desliga'); label(X(10), X(11), 120, 'Bomba 02', 'NA liga · NF desliga'); label(X(12), X(13), 120, 'Jockey', 'NA liga · NF desliga');
  [['PJ', 14], ['PB', 15]].forEach(([n, i]) => { pressSym(X(i)); txt(S.root, X(i) + 8, 270, n, 's'); comp(S, n, [X(i) - 38, 160, 68, 120], psDef(n, i)); });
  label(X(14), X(15), 120, 'Pressostatos', 'fecham em pressão baixa');
  return S;
}

// ------------------------------------------------------------------ Folha 3 — Saídas XP325
function buildSheet3() {
  const S = newSheet(3, 'Saídas digitais do XP325 e bobinas');
  const yR = 60, y0 = 630, yB = 120, yQ = 210;
  W(S, [[40, yR], [1170, yR]], 'p24'); txt(S.root, 44, yR - 8, 'L+ 24 Vcc', 'b');
  W(S, [[40, y0], [1170, y0]], 'z0'); txt(S.root, 44, y0 + 18, 'L− 0 V', 'b');
  svg('rect', { x: 50, y: yB, width: 1100, height: yQ - yB, rx: 4, class: 'box plc' }, S.layer.sym);
  txt(S.root, 600, yB + 48, 'Altus XP325 — saídas digitais a transistor (tipo source, 1,5 A por saída)', 'b mid');
  // Q+ e Q-
  J(S, 80, yR, 'p24'); W(S, [[80, yR], [80, yB]], 'p24'); svg('rect', { x: 73, y: yB - 7, width: 14, height: 14, class: 'term' }, S.layer.sym); txt(S.root, 92, yB + 16, 'Q+', 'addr');
  W(S, [[1120, yB], [1120, 90], [1165, 90], [1165, y0]], 'z0'); svg('rect', { x: 1113, y: yB - 7, width: 14, height: 14, class: 'term' }, S.layer.sym); txt(S.root, 1096, yB + 16, 'Q−', 'addr'); J(S, 1165, y0, 'z0');
  comp(S, 'XP325_OUT', [52, yB + 24, 1096, 40], { title: 'Altus XP325 — saídas digitais', kind: 'CLP Nexto Xpress', desc: '16 saídas a transistor tipo source (1,5 A por saída). Q+ recebe +24 Vcc e Q− o 0 V; quando o programa liga uma saída, ela entrega +24 V à bobina. Neste simulador, o estado de cada saída é lido como discrete input Modbus.', kv: () => [['Saídas ligadas', String(ST.plc.filter(Boolean).length)], ['Q+ (24 Vcc)', sim().v24 ? 'presente' : 'ausente']] });
  const short = ['Bomba 01', 'Bomba 02', 'Jockey', 'LB1_S', 'LB2_S', 'LB1_L', 'LB2_L', 'LBJ_L', 'LB1_D', 'LB2_D', 'LBJ_D'];
  const desc = ['Contatora da Bomba 01', 'Contatora da Bomba 02', 'Contatora da jockey', 'Relé LB1_S', 'Relé LB2_S', 'Relé LB1_L', 'Relé LB2_L', 'Relé LBJ_L', 'Relé LB1_D', 'Relé LB2_D', 'Relé LBJ_D'];
  for (let j = 0; j < 11; j++) {
    const x = 130 + j * 92;
    svg('rect', { x: x - 7, y: yQ - 7, width: 14, height: 14, class: 'term' }, S.layer.sym);
    txt(S.root, x, yQ - 14, XP_OUT[j], 'addr mid');
    W(S, [[x, yQ + 7], [x, 360]], `q${j}`);
    coil(S, x, 370, () => outOn(j));
    W(S, [[x, 380], [x, y0]], 'z0'); J(S, x, y0, 'z0');
    txt(S.root, x + 6, 414, OUT_TAG[j], 'b');
    txt(S.root, x + 6, 428, short[j], 's');
    const di = txt(S.root, x + 6, 300, '', 's');
    S.ups.push(() => { di.textContent = `DI ${ST.config.diBase + j}`; });
    if (j < 2) xref(S, x + 6, 446, `→ DI1 SS_0${j + 1}`, 4, `SS_0${j + 1}_C`);
    else if (j === 2) xref(S, x + 6, 446, '→ motor MJ', 1, 'MJ');
    else xref(S, x + 6, 446, '→ sinaleiro', 4, LAMPS[j - 3].tag);
    const extra = j === 0 || j === 1 ? sswChain(j) : j === 2 ? jockeyChain : [() => ({ t: `Contato ${OUT_TAG[j]} 13-14 fecha`, ok: outOn(j) }), () => ({ t: `Sinaleiro ${LAMPS[j - 3].tag} aceso`, ok: sim().lamps[j - 3] })];
    comp(S, OUT_TAG[j], [x - 24, 344, 88, 108], {
      title: `${OUT_TAG[j]} — ${desc[j].toLowerCase()}`, kind: j < 3 ? 'Bobina de contatora' : 'Bobina de relé auxiliar',
      desc: j < 2 ? `Bobina na saída ${XP_OUT[j]}. O contato auxiliar 13-14 fecha a DI1 da SS_0${j + 1}, que faz a soft partir em rampa.`
        : j === 2 ? 'Bobina na saída Q02. Os contatos principais ligam o motor da jockey direto na rede (partida direta).'
          : `Relé auxiliar na saída ${XP_OUT[j]}. O contato 13-14 acende o sinaleiro ${LAMPS[j - 3].tag} (${LAMPS[j - 3].txt.toLowerCase()}).`,
      tip: () => (outOn(j) ? 'energizada' : 'desligada'),
      kv: kvOut(j), chain: outChain(j, extra),
    });
  }
  return S;
}

// ------------------------------------------------------------------ Folha 4 — Sinalização e comando das softs
function buildSheet4() {
  const S = newSheet(4, 'Sinalização e comando das soft-starters');
  const yR = 70, y0 = 630;
  W(S, [[40, yR], [760, yR]], 'p24'); txt(S.root, 44, yR - 8, 'L+ 24 Vcc', 'b');
  W(S, [[40, y0], [760, y0]], 'z0'); txt(S.root, 44, y0 + 18, 'L− 0 V', 'b');
  for (let i = 0; i < 8; i++) {
    const x = 90 + i * 86, L = LAMPS[i], j = i + 3;
    J(S, x, yR, 'p24'); W(S, [[x, yR], [x, 200]], 'p24');
    contact(S, x, 200, 260, () => sim().lamps[i], 'NA');
    txt(S.root, x + 10, 226, OUT_TAG[j], 'b'); txt(S.root, x + 10, 240, '13-14', 's');
    W(S, [[x, 260], [x, 426]], `lmp${i}`);
    const g = svg('g', {}, S.layer.sym);
    const c = svg('circle', { cx: x, cy: 440, r: 14, class: `lamp-c ${L.color}` }, g);
    svg('path', { d: `M${x - 10} ${430} L${x + 10} ${450} M${x + 10} ${430} L${x - 10} ${450}`, class: 'sym' }, g);
    S.ups.push(() => c.classList.toggle('on', sim().lamps[i]));
    W(S, [[x, 454], [x, y0]], 'z0'); J(S, x, y0, 'z0');
    txt(S.root, x + 18, 474, L.tag, 'b'); txt(S.root, x + 18, 488, L.color === 'green' ? 'verde' : 'vermelho', 's');
    xref(S, x + 6, 300, `bobina ${XP_OUT[j]}`, 3, OUT_TAG[j]);
    comp(S, L.tag, [x - 40, 190, 80, 320], {
      title: `${L.tag} — ${L.txt}`, kind: `Sinaleiro ${L.color === 'green' ? 'verde' : 'vermelho'}`,
      desc: `Acende quando o relé ${OUT_TAG[j]} fecha o contato 13-14. A bobina do ${OUT_TAG[j]} está na saída ${XP_OUT[j]} do XP325 (folha 3).`,
      tip: () => (sim().lamps[i] ? 'aceso' : 'apagado'),
      kv: kvOut(j), chain: outChain(j, [() => ({ t: `Sinaleiro ${L.tag} aceso`, ok: sim().lamps[i] })]),
    });
  }
  // Comando das softs
  [[0, 90], [1, 370]].forEach(([k, y]) => {
    const g = svg('g', {}, S.layer.sym);
    sswIcon(g, S, k, 838, y + 6, 116, 218);
    const tt = svg('text', { x: 896, y: y - 4, class: 't b mid' }, g); tt.textContent = `SS_0${k + 1} · SSW-05 Plus`;
    const disp = svg('text', { x: 896, y: y + 242, class: 't s mid' }, g);
    const led = svg('circle', { cx: 846, cy: y + 254, r: 0.01, class: 'led' }, g);
    const tl = (yy, t) => { svg('circle', { cx: 980, cy: yy, r: 5, class: 'term' }, g); const e = svg('text', { x: 970, y: yy - 7, class: 't s end' }, g); e.textContent = t; };
    tl(y + 140, 'A1 (D' + (k + 2) + ')'); tl(y + 200, 'DI1');
    W(S, [[985, y + 140], [1080, y + 140], [1080, y + 150]], `ss${k}p`);
    contact(S, 1080, y + 150, y + 192, () => sim().k[`KB${k + 1}`], 'NA');
    W(S, [[1080, y + 192], [1080, y + 200], [985, y + 200]], `ss${k}d`);
    txt(S.root, 1092, y + 170, `K-B${k + 1}`, 'b'); txt(S.root, 1092, y + 184, '13-14', 's');
    xref(S, 1092, y + 120, `bobina Q0${k}`, 3, `K-B${k + 1}`);
    comp(S, `SS_0${k + 1}_C`, [826, y - 4, 330, 240], {
      title: `Comando da SS_0${k + 1}`, kind: 'Contato da contatora na entrada da soft',
      desc: `A SS_0${k + 1} não conversa com o CLP. O XP325 liga a saída Q0${k}, a bobina K-B${k + 1} fecha o contato 13-14, e esse contato leva a mesma fase que alimenta o A1 (via D${k + 2}) até a DI1. Na SSW-05 a DI1 trabalha na tensão da eletrônica (90–250 Vca): contato fechado = aciona, aberto = desaciona. Ao abrir, a soft para pela rampa do trimpot de desaceleração (ou por inércia, em OFF).`,
      kv: () => { const s = sim().ssw[k]; return [['Estado', sswShort(s) || 'sem alimentação'], ['DI1', s.di[0] ? 'fechada' : 'aberta'], ['Tensão de saída', `${fmt(s.vout, 0)} %`]]; },
      chain: outChain(k, sswChain(k)),
      acts: () => [{ label: 'Botão RESET', fn: () => act({ type: 'sswKey', index: k, key: 'RESET' }) }],
    });
  });
  txt(S.root, 790, 640, 'SSW-05: a fase do A1 passa pelo contato e volta na DI1.', 's');
  return S;
}

// ------------------------------------------------------------------ Folha 5 — Lista de I/O
function buildIo() {
  const host = $('ioHost');
  host.innerHTML = '';
  const mk = (title, rows, kind) => {
    el('h3', {}, host).textContent = title;
    const t = el('table', {}, host);
    const hd = el('tr', {}, el('thead', {}, t));
    ['Borne XP325', 'SP02', 'Tag', 'Descrição', kind === 'in' ? 'Coil' : 'DI', 'Estado'].forEach((h) => { el('th', {}, hd).textContent = h; });
    const tb = el('tbody', {}, t);
    return rows.map((d, i) => {
      const tr = el('tr', {}, tb);
      el('td', {}, tr).textContent = d.xp; el('td', {}, tr).textContent = d.addr; el('td', {}, tr).textContent = d.tag; el('td', {}, tr).textContent = d.desc;
      const a = el('td', {}, tr); const b = el('span', { class: 'bit' }, el('td', {}, tr));
      const target = kind === 'in' ? ({ 0: 'B_SEL', 1: 'B_SEL', 2: 'B1_MA', 3: 'B1_MA', 4: 'B2_MA', 5: 'B2_MA', 6: 'BJ_MA', 7: 'BJ_MA' }[i] || d.tag) : d.tag;
      tr.addEventListener('click', () => { if (COMP[target]) { showSheet(COMP[target].sheet); select(target); } });
      return { a, b, i };
    });
  };
  const ri = mk('Entradas — o simulador escreve (coils)', meta.coils, 'in');
  const ro = mk('Saídas — o simulador lê (discrete inputs)', meta.discreteInputs, 'out');
  return () => {
    ri.forEach((r) => { const a = ST.coilAddrs?.[r.i]; r.a.textContent = a === undefined ? 'não enviada' : a; const v = ST.coils[r.i]; r.b.textContent = v ? '1' : '0'; r.b.classList.toggle('on', v); });
    ro.forEach((r) => { r.a.textContent = ST.config.diBase + r.i; const v = ST.plc[r.i]; r.b.textContent = v ? '1' : '0'; r.b.classList.toggle('on', v); });
  };
}

// ------------------------------------------------------------------ Navegação, seleção, dicas
function showSheet(n) {
  sheetNo = Number(n);
  document.querySelectorAll('.d-tabs button').forEach((b) => b.setAttribute('aria-selected', String(Number(b.dataset.sheet) === sheetNo)));
  const host = $('sheetHost');
  host.innerHTML = '';
  if (sheetNo === 5) { host.hidden = true; $('ioHost').hidden = false; }
  else { host.hidden = false; $('ioHost').hidden = true; host.appendChild(sheets[sheetNo].root); }
  history.replaceState(null, '', `#${sessionId}/${sheetNo}`);
  update();
}
function select(id) {
  if (selected && COMP[selected]) COMP[selected].g.classList.remove('sel');
  selected = id;
  if (COMP[id]) COMP[id].g.classList.add('sel');
  lastInfo = '';
  renderInfo();
}
let lastInfo = '';
let infoActs = [];
function renderInfo() {
  const host = $('infoHost');
  if (!ST) return;
  let html;
  infoActs = [];
  const c = selected && COMP[selected];
  if (!c) {
    html = `<h2>Como usar</h2><p class="kind">Diagrama ao vivo da sessão selecionada</p>
      <p>Os fios mudam de cor conforme a tensão: vermelho = fase, laranja = +24 Vcc, azul = 0 V, âmbar = sinal em 1, cinza = sem tensão.</p>
      <p>Clique num componente para ver o que ele faz, os endereços no XP325 e no Modbus, e a cadeia <b>siga o sinal</b> com o ponto exato onde ela quebra.</p>
      <p>Disjuntores e chaves mudam com um clique. Botoeiras e pressostatos funcionam enquanto você segura.</p>
      <div class="note">Exercício da SP02: na folha 1, ligue o motor da jockey aos bornes da K-BJ. Clique em um borne da contatora e depois em um borne do motor.</div>`;
  } else {
    const kv = c.kv ? c.kv() : [];
    const ch = c.chain ? c.chain() : [];
    infoActs = c.acts ? c.acts() : [];
    html = `<h2>${c.title}</h2><p class="kind">${c.kind || ''} · folha ${c.sheet}</p><p>${c.desc || ''}</p>`;
    if (kv.length) html += `<dl class="kv">${kv.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>`;
    if (ch.length) html += `<h3>Siga o sinal</h3><ol class="chain">${ch.map((x) => `<li class="${x.wait ? 'wait' : yes(x.ok)}">${x.t}</li>`).join('')}</ol>`;
    const broken = ch.find((x) => !x.ok && !x.wait);
    if (broken) html += `<div class="note">A cadeia para em: <b>${broken.t}</b></div>`;
    if (infoActs.length) html += `<div class="acts">${infoActs.map((a, i) => `<button data-i="${i}" class="${a.primary ? 'primary' : ''}">${a.label}</button>`).join('')}</div>`;
  }
  if (html !== lastInfo) { host.innerHTML = html; lastInfo = html; }
}
$('infoHost').addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) infoActs[Number(b.dataset.i)]?.fn(); });

const tip = $('tip');
function showTip(ev, html) { tip.innerHTML = html; tip.hidden = false; moveTip(ev); }
function moveTip(ev) { tip.style.left = `${ev.clientX + 14}px`; tip.style.top = `${ev.clientY + 14}px`; }
function hideTip() { tip.hidden = true; }
function hoverNet(S, net, ev, on) {
  S.wires.forEach((w) => { if (w.net === net) w.e.classList.toggle('hl', on); });
  if (on && ST) {
    const [name, type, f] = NET[net];
    const live = type === 'pe' ? 'terra' : f() ? 'energizado' : 'sem tensão';
    showTip(ev, `<b>${name}</b><br>${live}`);
  } else hideTip();
}

// ------------------------------------------------------------------ Atualização
let ioUp = null;
function update() {
  if (!ST) return;
  const S = sheets[sheetNo];
  if (S) {
    for (const w of S.wires) { if (w.type !== 'pe') { const on = NET[w.net][2](); w.e.classList.toggle('on', on); w.e.classList.toggle(w.type, true); } }
    for (const u of S.ups) u();
  } else if (sheetNo === 5 && ioUp) ioUp();
  renderInfo();
  const b = $('connBadge');
  b.textContent = ST.status === 'conectado' ? 'CLP conectado' : ST.statusText;
  b.className = `badge ${ST.status === 'conectado' ? 'ok' : ST.status === 'desconectado' ? '' : 'warn'}`;
}

// ------------------------------------------------------------------ Sessões
async function loadSessions() {
  const list = await api('sessions');
  const sel = $('selSession');
  sel.innerHTML = list.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
  return list;
}
function connect(id) {
  sessionId = id;
  $('selSession').value = id;
  $('lnkSim').href = `/#${id}`;
  if (es) es.close();
  es = new EventSource(`/api/sessions/${id}/stream`);
  let last = 0;
  es.addEventListener('state', (e) => { ST = JSON.parse(e.data); const now = performance.now(); if (now - last > 90) { last = now; update(); } });
  history.replaceState(null, '', `#${sessionId}/${sheetNo}`);
}

(async function init() {
  meta = await api('meta');
  buildSheet1(); buildSheet2(); buildSheet3(); buildSheet4();
  ioUp = buildIo();
  const list = await loadSessions();
  const [hs, hn] = location.hash.slice(1).split('/');
  let mine = null;
  try { mine = await api('sessions/mine'); } catch { /* */ }
  if (mine && !list.find((s) => s.id === mine.id)) await loadSessions();
  connect(list.find((s) => s.id === hs) ? hs : (mine ? mine.id : list[0].id));
  document.querySelectorAll('.d-tabs button').forEach((b) => b.addEventListener('click', () => showSheet(b.dataset.sheet)));
  $('selSession').addEventListener('change', (e) => connect(e.target.value));
  showSheet(hn && Number(hn) >= 1 && Number(hn) <= 5 ? hn : 1);
  renderInfo();
})();
