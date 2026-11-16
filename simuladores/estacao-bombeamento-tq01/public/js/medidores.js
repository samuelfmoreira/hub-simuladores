// Medidores: coluna de nível de TQ-01, manômetro 0–6 bar e tendência.
import { svg, fmt } from './util.js';

export function createLevelGauge(host) {
  host.innerHTML = '';
  const H_MAX = 3.0, X = 30, Y0 = 16, HPX = 150, W = 34;
  const r = svg('svg', { viewBox: '0 0 110 190', class: 'level', role: 'img', 'aria-label': 'Nível do tanque TQ-01' }, host);
  svg('rect', { x: X, y: Y0, width: W, height: HPX, rx: 3, class: 'col' }, r);
  const water = svg('rect', { x: X + 2, y: Y0 + HPX - 2, width: W - 4, height: 0, class: 'water' }, r);
  const yOf = (m) => Y0 + HPX - (m / H_MAX) * HPX;
  for (let m = 0; m <= 3; m += 0.5) {
    const y = yOf(m);
    svg('line', { x1: X + W, y1: y, x2: X + W + (Number.isInteger(m) ? 10 : 5), y2: y, stroke: '#3c444a', 'stroke-width': Number.isInteger(m) ? 1.5 : 0.8 }, r);
    if (Number.isInteger(m)) svg('text', { x: X + W + 13, y: y + 3 }, r).textContent = `${m} m`;
  }
  const mark = (m, txt) => { const y = yOf(m); svg('line', { x1: X - 10, y1: y, x2: X, y2: y, stroke: '#c0392b', 'stroke-width': 2 }, r); svg('text', { x: X - 12, y: y + 3, 'text-anchor': 'end', fill: '#c0392b' }, r).textContent = txt; };
  mark(2.8, 'HH'); mark(0.3, 'LL');
  svg('text', { x: X + W / 2, y: Y0 + HPX + 16, 'text-anchor': 'middle', 'font-weight': 600 }, r).textContent = 'TQ-01';
  const ultra = svg('rect', { x: X + W / 2 - 6, y: Y0 - 12, width: 12, height: 10, rx: 2, fill: '#3c444a' }, r);
  svg('text', { x: X + W / 2 + 10, y: Y0 - 4 }, r).textContent = 'LT-01';
  let shown = 0;
  return function update(s) {
    shown += (s.h - shown) * 0.3;
    const hp = Math.max(0, Math.min(H_MAX, shown)) / H_MAX * (HPX - 4);
    water.setAttribute('y', Y0 + HPX - 2 - hp); water.setAttribute('height', hp);
    ultra.setAttribute('fill', s.sensores['LT-01'].st === 'ok' ? '#3c444a' : '#c0392b');
  };
}

export function createPressureGauge(host) {
  // Indicador de frequência do inversor (0–60 Hz): mostra o efeito da saída analógica SA0
  host.innerHTML = '';
  const MAX = 60, cx = 110, cy = 110, R = 92;
  const ang = (v) => -135 + (v / MAX) * 270;
  const pt = (v, rad) => { const a = (ang(v) - 90) * Math.PI / 180; return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)]; };
  const r = svg('svg', { viewBox: '0 0 220 220', role: 'img', 'aria-label': 'Frequência do inversor' }, host);
  svg('circle', { cx, cy, r: R + 8, class: 'g-face' }, r);
  const arc = (v0, v1, rad, color, w) => { const [x0, y0] = pt(v0, rad), [x1, y1] = pt(v1, rad); const large = (v1 - v0) / MAX * 270 > 180 ? 1 : 0; return svg('path', { d: `M${x0} ${y0} A${rad} ${rad} 0 ${large} 1 ${x1} ${y1}`, stroke: color, 'stroke-width': w, fill: 'none' }, r); };
  arc(0, 36, R - 4, '#e3a6a3', 6);    // abaixo de ~36 Hz a bomba não vence a altura estática
  arc(36, 60, R - 4, '#a9cfeb', 6);
  for (let v = 0; v <= MAX; v += 2) {
    const major = v % 10 === 0;
    const [x0, y0] = pt(v, R); const [x1, y1] = pt(v, R - (major ? 12 : 6));
    svg('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: 'g-tick' + (major ? '' : ' minor') }, r);
    if (major) { const [tx, ty] = pt(v, R - 24); svg('text', { x: tx, y: ty + 4, class: 'g-num' }, r).textContent = v; }
  }
  svg('text', { x: cx, y: cy + 36, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 600 }, r).textContent = 'Hz';
  svg('text', { x: cx, y: cy + 49, 'text-anchor': 'middle', 'font-size': 9, fill: '#1b5e9e' }, r).textContent = 'CFW500 · SA0';
  const needle = svg('line', { x1: cx, y1: cy + 14, x2: cx, y2: cy - R + 16, class: 'g-needle' }, r);
  svg('circle', { cx, cy, r: 7, fill: '#3c444a' }, r);
  let shown = 0, target = 0;
  (function tick() { shown += (target - shown) * 0.25; needle.setAttribute('transform', `rotate(${ang(Math.max(0, Math.min(MAX, shown)))} ${cx} ${cy})`); requestAnimationFrame(tick); })();
  return function update(s) { target = s.inv.fHz; };
}

// Tendência: janela de 5 min, 2 amostras/s. series: [{ k, nome, cor, max, un, mult }]
const valor = (s, k) => k === 'f' ? s.inv.fHz : k === 'ref' ? s.ao.raw[0] / s.canais.fundoEscala * 100 : s[k];
export function createTrend(canvas, legendEl, series) {
  const N = 600;
  const buf = series.map(() => new Float32Array(N).fill(NaN));
  let idx = 0, lastT = -1;
  const leg = series.map((sr) => { const sp = document.createElement('span'); sp.innerHTML = `<i style="background:${sr.cor}"></i>${sr.nome} <b></b>`; legendEl.appendChild(sp); return sp.querySelector('b'); });
  function draw() {
    const c = canvas.getContext('2d'); const W = canvas.width = canvas.clientWidth || 600, H = canvas.height;
    c.clearRect(0, 0, W, H); c.fillStyle = '#fbfbf8'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#e1e3dd'; c.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const y = (H * i) / 4; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    for (let i = 1; i < 5; i++) { const x = (W * i) / 5; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    series.forEach((sr, si) => {
      c.strokeStyle = sr.cor; c.lineWidth = 1.6; c.beginPath(); let started = false;
      for (let i = 0; i < N; i++) {
        const v = buf[si][(idx + i) % N]; if (Number.isNaN(v)) { started = false; continue; }
        const x = (i / (N - 1)) * W, y = H - 4 - (Math.max(0, Math.min(1, v / sr.max)) * (H - 8));
        if (!started) { c.moveTo(x, y); started = true; } else c.lineTo(x, y);
      }
      c.stroke();
    });
    c.fillStyle = '#5d666c'; c.font = '10px sans-serif'; c.fillText('−5 min', 4, H - 4); c.textAlign = 'right'; c.fillText('agora', W - 4, H - 4); c.textAlign = 'left';
  }
  return function update(s) {
    const t = Math.floor(s.t * 2);
    if (t !== lastT) { lastT = t; series.forEach((sr, si) => { buf[si][idx] = valor(s, sr.k); }); idx = (idx + 1) % N; draw(); }
    series.forEach((sr, si) => { const v = valor(s, sr.k); leg[si].textContent = `${fmt(v * (sr.mult || 1), sr.un === '%' || sr.un === 'Hz' ? 0 : sr.un === 'm³/h' ? 1 : 2)} ${sr.un}`; });
  };
}
