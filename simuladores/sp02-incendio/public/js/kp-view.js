// Pressostato tipo Danfoss KP 5 (alta pressão, rearme automático).
import { el, svg, fmt, KGF } from './util.js';

export function createKP(host, name, meta, send) {
  const kp = meta.kp;
  const desc = name === 'PJ' ? 'Pressostato da bomba jockey' : 'Pressostato das bombas principais';
  const addr = name === 'PJ' ? 'I1.6' : 'I1.7';
  host.innerHTML = '';

  const root = svg('svg', { viewBox: '0 0 200 260', role: 'img', 'aria-label': `${desc} (${name})` }, host);
  const defs = svg('defs', {}, root);
  const gr = svg('linearGradient', { id: `kpg${name}`, x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
  svg('stop', { offset: 0, 'stop-color': '#f1f1ed' }, gr);
  svg('stop', { offset: 1, 'stop-color': '#c9cbc5' }, gr);

  // eixos de ajuste
  const knob = (x, lbl) => {
    const g = svg('g', { style: 'cursor:ns-resize' }, root);
    svg('rect', { x: x - 9, y: 6, width: 18, height: 22, rx: 2, fill: '#b9bcb6', stroke: '#777' }, g);
    svg('circle', { cx: x, cy: 14, r: 7, fill: '#d7d9d3', stroke: '#666' }, g);
    svg('line', { x1: x - 5, y1: 14, x2: x + 5, y2: 14, stroke: '#444', 'stroke-width': 2 }, g);
    svg('text', { x, y: 40, 'text-anchor': 'middle', 'font-size': 8.5, fill: '#444' }, root).textContent = lbl;
    return g;
  };
  svg('rect', { x: 14, y: 26, width: 172, height: 214, rx: 12, fill: `url(#kpg${name})`, stroke: '#8f938b', 'stroke-width': 1.5 }, root);
  const kRange = knob(70, 'Range');
  const kDif = knob(130, 'Dif');

  // janela das escalas
  svg('rect', { x: 46, y: 46, width: 108, height: 116, rx: 4, fill: '#1c1e1f', stroke: '#000' }, root);
  const Y0 = 150, Y1 = 58;
  const yR = (v) => Y0 - (v - kp.rangeMin) / (kp.rangeMax - kp.rangeMin) * (Y0 - Y1);
  const yD = (v) => Y0 - (v - kp.difMin) / (kp.difMax - kp.difMin) * (Y0 - Y1);
  svg('line', { x1: 78, y1: Y1, x2: 78, y2: Y0, stroke: '#ddd' }, root);
  svg('line', { x1: 128, y1: Y1, x2: 128, y2: Y0, stroke: '#ddd' }, root);
  for (let v = 8; v <= 32; v += 2) {
    const y = yR(v), major = v % 4 === 0;
    svg('line', { x1: 78, y1: y, x2: major ? 86 : 83, y2: y, stroke: '#ddd' }, root);
    if (major) svg('text', { x: 72, y: y + 3, 'text-anchor': 'end', 'font-size': 7.5, fill: '#eee' }, root).textContent = v;
  }
  for (let v = 2; v <= 6; v += 0.5) {
    const y = yD(v), major = Number.isInteger(v);
    svg('line', { x1: 128, y1: y, x2: major ? 136 : 133, y2: y, stroke: '#ddd' }, root);
    if (major) svg('text', { x: 140, y: y + 3, 'font-size': 7.5, fill: '#eee' }, root).textContent = v;
  }
  svg('text', { x: 78, y: 158 + 2, 'text-anchor': 'middle', 'font-size': 6.5, fill: '#aaa' }, root).textContent = 'bar';
  svg('text', { x: 128, y: 158 + 2, 'text-anchor': 'middle', 'font-size': 6.5, fill: '#aaa' }, root).textContent = 'bar';
  const pR = svg('polygon', { points: '0,0 9,-4 9,4', fill: '#ff3b2f' }, root);
  const pD = svg('polygon', { points: '0,0 -9,-4 -9,4', fill: '#ff3b2f' }, root);

  // identificação e contato
  svg('rect', { x: 34, y: 172, width: 132, height: 22, rx: 2, fill: '#a51e22' }, root);
  svg('text', { x: 100, y: 187, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#fff' }, root).textContent = `KP 5 · ${name}`;
  const led = svg('circle', { cx: 52, cy: 213, r: 6, fill: '#9aa29c', stroke: '#555' }, root);
  const ledTxt = svg('text', { x: 64, y: 217, 'font-size': 10, fill: '#333' }, root);
  // alavanca de teste
  const lever = svg('g', { style: 'cursor:pointer', role: 'button', tabindex: 0, 'aria-label': `Alavanca de teste manual do ${name}` }, root);
  svg('rect', { x: 150, y: 200, width: 26, height: 26, rx: 3, fill: '#d0d2cc', stroke: '#777' }, lever);
  const leverArm = svg('rect', { x: 160, y: 204, width: 6, height: 18, rx: 2, fill: '#444' }, lever);
  svg('text', { x: 163, y: 236, 'text-anchor': 'middle', 'font-size': 7, fill: '#444' }, root).textContent = 'teste';
  // conexão de pressão
  svg('rect', { x: 92, y: 240, width: 16, height: 16, fill: '#b8b9b4', stroke: '#777' }, root);

  // ------------- controles -------------
  const ctrl = el('div', { class: 'kp-ctrl' }, host);
  const h = el('h3', {}, ctrl); h.textContent = `${name} — ${desc}`;
  h.style.fontSize = '15px';

  const mkStepper = (label, field, step) => {
    const row = el('div', { class: 'stepper' }, ctrl);
    el('span', {}, row).textContent = label;
    const minus = el('button', { class: 'btn small', 'aria-label': `Diminuir ${label}` }, row); minus.textContent = '−';
    const val = el('b', {}, row);
    const plus = el('button', { class: 'btn small', 'aria-label': `Aumentar ${label}` }, row); plus.textContent = '+';
    const bump = (d) => send({ type: 'pressostat', name, field, value: Math.round((cur[field] + d) * 10) / 10 });
    hold(minus, () => bump(-step));
    hold(plus, () => bump(step));
    return val;
  };
  const cur = { range: 9.8, dif: 3.9 };
  const vRange = mkStepper('Faixa (abre)', 'range', 0.1);
  const vDif = mkStepper('Diferencial', 'dif', 0.1);
  const wheel = (g, field) => g.addEventListener('wheel', (e) => {
    e.preventDefault();
    send({ type: 'pressostat', name, field, value: Math.round((cur[field] + (e.deltaY < 0 ? 0.1 : -0.1)) * 10) / 10 });
  }, { passive: false });
  wheel(kRange, 'range'); wheel(kDif, 'dif');

  const summary = el('div', { class: 'kp-summary' }, ctrl);
  const wl = el('label', {}, ctrl);
  wl.append('Contato ligado ao CLP: ');
  const sel = el('select', {}, wl);
  [['NF', 'fecha em baixa pressão'], ['NA', 'fecha em alta pressão']].forEach(([v, t]) => { const o = el('option', { value: v }, sel); o.textContent = t; });
  sel.addEventListener('change', () => send({ type: 'pressostat', name, field: 'contact', value: sel.value }));
  const state = el('div', { class: 'contact' }, ctrl);
  el('i', {}, state);
  const stTxt = el('span', {}, state);
  const testBtn = el('button', { class: 'btn small ghost' }, ctrl);
  testBtn.textContent = 'Segurar alavanca de teste';
  const press = (v) => send({ type: 'pressostat', name, field: 'test', value: v });
  for (const t of [testBtn, lever]) {
    t.addEventListener('pointerdown', (e) => { e.preventDefault(); press(true); });
    t.addEventListener('pointerup', () => press(false));
    t.addEventListener('pointerleave', () => press(false));
  }

  function hold(btn, fn) {
    let t1, t2;
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); t1 = setTimeout(() => { t2 = setInterval(fn, 90); }, 400); });
    const stop = () => { clearTimeout(t1); clearInterval(t2); };
    btn.addEventListener('pointerup', stop); btn.addEventListener('pointerleave', stop);
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
  }

  return function update(p) {
    cur.range = p.range; cur.dif = p.dif;
    pR.setAttribute('transform', `translate(78,${yR(p.range)})`);
    pD.setAttribute('transform', `translate(128,${yD(p.dif)})`);
    vRange.textContent = `${fmt(p.range, 1)} bar · ${fmt(p.range * KGF, 1)} kgf/cm²`;
    vDif.textContent = `${fmt(p.dif, 1)} bar`;
    summary.innerHTML = `Contato <b>fecha</b> em ≤ ${fmt(p.cutIn, 1)} bar (${fmt(p.cutIn * KGF, 1)} kgf/cm²) e <b>abre</b> em ≥ ${fmt(p.range, 1)} bar (${fmt(p.range * KGF, 1)} kgf/cm²)` +
      (p.contact === 'NA' ? '<br><small>Ligação invertida: fecha em alta pressão.</small>' : '');
    if (document.activeElement !== sel) sel.value = p.contact;
    state.classList.toggle('on', p.closed);
    stTxt.textContent = `Contato ${p.closed ? 'fechado' : 'aberto'} → ${addr} = ${p.closed ? 1 : 0}${p.test ? ' (teste manual)' : ''}`;
    led.setAttribute('fill', p.closed ? '#39c463' : '#9aa29c');
    ledTxt.textContent = p.closed ? 'contato fechado' : 'contato aberto';
    leverArm.setAttribute('transform', p.test ? 'rotate(35 163 222)' : '');
  };
}
