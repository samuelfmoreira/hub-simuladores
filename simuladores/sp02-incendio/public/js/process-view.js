// Casa de bombas: P&ID animado, manômetro e tendência de pressão.
import { svg, fmt, KGF } from './util.js';

export function createPID(host) {
  host.innerHTML = '';
  const r = svg('svg', { viewBox: '0 0 760 290', role: 'img', 'aria-label': 'Diagrama da casa de bombas' }, host);

  // Reservatório
  svg('rect', { x: 16, y: 40, width: 96, height: 205, fill: '#fff', stroke: '#3c444a', 'stroke-width': 2 }, r);
  svg('rect', { x: 18, y: 92, width: 92, height: 151, fill: '#cfe6f5' }, r);
  svg('text', { x: 64, y: 32, 'text-anchor': 'middle', class: 'pid-label' }, r).textContent = 'Reservatório';

  // Sucção
  svg('path', { d: 'M112 232 H470', class: 'pipe-in' }, r);
  const pumps = [
    { key: 'jockey', x: 210, rad: 20, name: 'Jockey', sub: 'partida direta (K-BJ)', jk: true },
    { key: 'main1', x: 330, rad: 28, name: 'Bomba 01', sub: 'SS_01 (K-B1)' },
    { key: 'main2', x: 450, rad: 28, name: 'Bomba 02', sub: 'SS_02 (K-B2)' },
  ];
  const y = 172;
  // Recalque (barrilete)
  svg('path', { d: 'M210 70 H730', class: 'pipe' }, r);
  const headerWater = svg('path', { d: 'M210 70 H730', class: 'water' }, r);

  const parts = {};
  for (const p of pumps) {
    svg('path', { d: `M${p.x} 232 V${y + p.rad}`, class: 'pipe-in' }, r);
    svg('path', { d: `M${p.x} ${y - p.rad} V70`, class: 'pipe' }, r);
    const water = svg('path', { d: `M${p.x} ${y - p.rad} V70`, class: 'water' }, r);
    // válvula de retenção
    svg('polygon', { points: `${p.x - 8},118 ${p.x + 8},118 ${p.x},106`, fill: '#fff', stroke: '#3c444a', 'stroke-width': 1.5 }, r);
    const body = svg('circle', { cx: p.x, cy: y, r: p.rad, class: 'pump-body' + (p.jk ? ' jk' : '') }, r);
    const imp = svg('g', {}, r);
    for (let i = 0; i < 4; i++) {
      const a = i * 90;
      svg('path', { d: `M${p.x} ${y} q ${p.rad * 0.35} ${-p.rad * 0.2} ${p.rad * 0.7} ${-p.rad * 0.05}`, class: 'imp', transform: `rotate(${a} ${p.x} ${y})`, fill: 'none', stroke: '#3c444a', 'stroke-width': 3, 'stroke-linecap': 'round' }, imp);
    }
    svg('circle', { cx: p.x, cy: y, r: 3.5, fill: '#3c444a' }, r);
    svg('text', { x: p.x, y: 262, 'text-anchor': 'middle', class: 'pid-label' }, r).textContent = p.name;
    svg('text', { x: p.x, y: 277, 'text-anchor': 'middle', class: 'pid-small' }, r).textContent = p.sub;
    const spd = svg('text', { x: p.x + p.rad + 6, y: y + 4, class: 'pid-small' }, r);
    parts[p.key] = { ...p, body, imp, water, spd, angle: 0 };
  }

  // Manômetro de campo
  svg('path', { d: 'M560 70 V44', class: 'pipe-in' }, r);
  svg('circle', { cx: 560, cy: 32, r: 13, fill: '#fff', stroke: '#3c444a', 'stroke-width': 1.5 }, r);
  svg('text', { x: 560, y: 36, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700 }, r).textContent = 'PI';

  // Pressostatos
  const ps = {};
  for (const [n, x] of [['PJ', 615], ['PB', 668]]) {
    svg('path', { d: `M${x} 70 V44`, class: 'pipe-in' }, r);
    svg('rect', { x: x - 20, y: 18, width: 40, height: 26, class: 'ps-box' }, r);
    svg('text', { x: x - 4, y: 36, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700 }, r).textContent = n;
    ps[n] = svg('circle', { cx: x + 12, cy: 31, r: 4.5, class: 'ps-led' }, r);
  }

  // Hidrante
  svg('path', { d: 'M730 70 V170', class: 'pipe' }, r);
  const hydWater = svg('path', { d: 'M730 70 V170', class: 'water' }, r);
  svg('polygon', { points: '718,100 742,124 742,100 718,124', fill: '#fff', stroke: '#a51e22', 'stroke-width': 2 }, r);
  svg('text', { x: 712, y: 116, 'text-anchor': 'end', class: 'pid-small' }, r).textContent = 'hidrante';
  const spray = svg('g', {}, r);
  for (let i = 0; i < 9; i++) svg('circle', { cx: 730 + (i % 3 - 1) * 9, cy: 182 + Math.floor(i / 3) * 10, r: 2.4, class: 'spray' }, spray);
  // Vazamento
  const leak = svg('g', {}, r);
  for (let i = 0; i < 3; i++) svg('circle', { cx: 520, cy: 82 + i * 9, r: 2, class: 'spray' }, leak);
  svg('text', { x: 520, y: 118, 'text-anchor': 'middle', class: 'pid-small' }, r).textContent = 'vazamento';

  let last = performance.now();
  let speeds = { jockey: 0, main1: 0, main2: 0 };
  let flowing = { header: false, hyd: 0, leak: 0 };
  let dash = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    dash -= dt * 60;
    for (const k of Object.keys(parts)) {
      const p = parts[k];
      p.angle = (p.angle + speeds[k] * dt * 900) % 360;
      p.imp.setAttribute('transform', `rotate(${p.angle} ${p.x} ${y})`);
      p.water.style.opacity = speeds[k] > 0.05 ? 0.9 : 0;
      p.water.style.strokeDashoffset = dash;
    }
    headerWater.style.opacity = flowing.header ? 0.9 : 0;
    headerWater.style.strokeDashoffset = dash;
    hydWater.style.opacity = flowing.hyd > 0 ? 0.9 : 0;
    hydWater.style.strokeDashoffset = dash;
    spray.querySelectorAll('circle').forEach((c, i) => { c.style.opacity = flowing.hyd > 0 ? (0.35 + 0.5 * Math.abs(Math.sin(now / 160 + i))) * Math.min(1, flowing.hyd / 30 + 0.2) : 0; });
    leak.querySelectorAll('circle').forEach((c, i) => { c.style.opacity = flowing.leak > 0 ? 0.3 + 0.6 * Math.abs(Math.sin(now / 300 + i * 1.3)) : 0; });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return function update(sim) {
    speeds = { jockey: sim.jockeySpeed, main1: sim.ssw[0].speed, main2: sim.ssw[1].speed };
    flowing = { header: speeds.jockey + speeds.main1 + speeds.main2 > 0.05 || sim.process.hydrant > 0, hyd: sim.pressure > 0.05 ? sim.process.hydrant : 0, leak: sim.process.leak };
    for (const k of Object.keys(parts)) {
      parts[k].body.classList.toggle('on', speeds[k] > 0.05);
      parts[k].spd.textContent = speeds[k] > 0.01 ? `${Math.round(speeds[k] * 100)} %${k === 'jockey' && sim.jockeyLink?.reverse ? ' ↺ invertida' : ''}` : '';
    }
    ps.PJ.classList.toggle('on', sim.pressostats.PJ.closed);
    ps.PB.classList.toggle('on', sim.pressostats.PB.closed);
  };
}

export function createGauge(host) {
  host.innerHTML = '';
  const MAX = 16, cx = 110, cy = 110, R = 92;
  const ang = (v) => -135 + (v / MAX) * 270;
  const pt = (v, rad) => { const a = (ang(v) - 90) * Math.PI / 180; return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)]; };
  const r = svg('svg', { viewBox: '0 0 220 220', role: 'img', 'aria-label': 'Manômetro da rede' }, host);
  svg('circle', { cx, cy, r: R + 8, class: 'g-face' }, r);
  const arc = (v0, v1, rad, color, w) => {
    const [x0, y0] = pt(v0, rad), [x1, y1] = pt(v1, rad);
    const large = (v1 - v0) / MAX * 270 > 180 ? 1 : 0;
    return svg('path', { d: `M${x0} ${y0} A${rad} ${rad} 0 ${large} 1 ${x1} ${y1}`, stroke: color, 'stroke-width': w, fill: 'none' }, r);
  };
  const bandMain = arc(0, 4, R - 4, '#e3a6a3', 6);
  const bandJk = arc(6, 10, R - 4, '#a9cfeb', 6);
  for (let v = 0; v <= MAX; v += 0.5) {
    const major = Number.isInteger(v);
    const [x0, y0] = pt(v, R); const [x1, y1] = pt(v, R - (major ? 12 : 6));
    svg('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: 'g-tick' + (major ? '' : ' minor') }, r);
    if (major && v % 2 === 0) {
      const [tx, ty] = pt(v, R - 24);
      svg('text', { x: tx, y: ty + 4, class: 'g-num' }, r).textContent = v;
    }
  }
  for (let k = 0; k <= 16; k += 4) {
    const [tx, ty] = pt(k / KGF, R - 42);
    svg('text', { x: tx, y: ty + 3, class: 'g-num2' }, r).textContent = k;
  }
  svg('text', { x: cx, y: cy + 36, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 600 }, r).textContent = 'bar';
  svg('text', { x: cx, y: cy + 49, 'text-anchor': 'middle', 'font-size': 9, fill: '#a51e22' }, r).textContent = 'kgf/cm²';
  const needle = svg('line', { x1: cx, y1: cy + 14, x2: cx, y2: cy - R + 16, class: 'g-needle' }, r);
  svg('circle', { cx, cy, r: 7, fill: '#3c444a' }, r);

  let shown = 0;
  let target = 0;
  (function tick() {
    shown += (target - shown) * 0.25;
    needle.setAttribute('transform', `rotate(${ang(Math.max(0, Math.min(MAX, shown)))} ${cx} ${cy})`);
    requestAnimationFrame(tick);
  })();

  const setArc = (path, v0, v1, rad) => {
    const [x0, y0] = pt(v0, rad), [x1, y1] = pt(v1, rad);
    const large = (v1 - v0) / MAX * 270 > 180 ? 1 : 0;
    path.setAttribute('d', `M${x0} ${y0} A${rad} ${rad} 0 ${large} 1 ${x1} ${y1}`);
  };
  return function update(sim) {
    target = sim.pressure;
    setArc(bandMain, 0, Math.max(0.01, sim.pressostats.PB.cutIn), R - 4);
    setArc(bandJk, sim.pressostats.PJ.cutIn, sim.pressostats.PJ.range, R - 4);
  };
}

export function createTrend(canvas) {
  const SPAN = 120000;
  let data = [];
  let lastSample = 0;
  let ref = null;
  const ctx = canvas.getContext('2d');
  const FONT = 'Bahnschrift, Arial Narrow, Arial, sans-serif';

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  new ResizeObserver(resize).observe(canvas);

  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    const LANE = 13, LANES = 3;
    const L = 70, R = 150, T = 14, B = 26 + LANE * LANES + 10;
    const plotW = w - L - R, plotH = h - T - B;
    const yv = (v) => T + plotH - (v / 16) * plotH;
    const now = Date.now();
    const xt = (t) => L + plotW - ((now - t) / SPAN) * plotW;
    // grade de pressão
    ctx.font = `12px ${FONT}`; ctx.textBaseline = 'middle';
    for (let v = 0; v <= 16; v += 2) {
      ctx.strokeStyle = v % 4 ? '#f0f1ec' : '#e0e2dc'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(L, yv(v)); ctx.lineTo(L + plotW, yv(v)); ctx.stroke();
      if (v % 4 === 0) { ctx.fillStyle = '#5d666c'; ctx.textAlign = 'right'; ctx.fillText(String(v), L - 8, yv(v)); }
    }
    ctx.save(); ctx.translate(14, T + plotH / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillStyle = '#5d666c'; ctx.fillText('pressão (bar)', 0, 0); ctx.restore();
    // grade de tempo (a cada 20 s)
    ctx.textAlign = 'center';
    for (let s2 = 0; s2 <= 120; s2 += 20) {
      const x = L + plotW - (s2 / 120) * plotW;
      ctx.strokeStyle = '#f0f1ec'; ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + plotH); ctx.stroke();
      ctx.fillStyle = '#5d666c'; ctx.fillText(s2 ? `−${s2} s` : 'agora', x, h - 10);
    }
    // limites dos pressostatos, com rótulo à direita
    if (ref) {
      ctx.setLineDash([5, 5]); ctx.lineWidth = 1.2; ctx.textAlign = 'left';
      [[ref.PJ.cutIn, '#1d6fb0', 'PJ liga jockey'], [ref.PJ.range, '#1d6fb0', 'PJ/PB abrem'], [ref.PB.cutIn, '#a51e22', 'PB liga principal']].forEach(([v, c, t]) => {
        ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(L, yv(v)); ctx.lineTo(L + plotW, yv(v)); ctx.stroke();
        ctx.fillStyle = c; ctx.fillText(`${t} · ${v.toFixed(1).replace('.', ',')}`, L + plotW + 6, yv(v));
      });
      ctx.setLineDash([]);
    }
    // faixas de funcionamento das bombas, com nome
    const lanes = [['j', '#1d6fb0', 'Jockey'], ['b1', '#a51e22', 'Bomba 01'], ['b2', '#d96a1f', 'Bomba 02']];
    lanes.forEach(([k, c, name], i) => {
      const yy = T + plotH + 12 + i * LANE;
      ctx.fillStyle = '#eef0ea'; ctx.fillRect(L, yy, plotW, LANE - 4);
      ctx.fillStyle = c;
      for (let n = 1; n < data.length; n++) {
        if (data[n][k]) ctx.fillRect(xt(data[n - 1].t), yy, Math.max(1, xt(data[n].t) - xt(data[n - 1].t) + 1), LANE - 4);
      }
      ctx.textAlign = 'right'; ctx.font = `11px ${FONT}`; ctx.fillStyle = '#5d666c'; ctx.fillText(name, L - 6, yy + (LANE - 4) / 2);
      ctx.font = `12px ${FONT}`;
    });
    // pressão
    if (data.length) {
      ctx.strokeStyle = '#1b2125'; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.beginPath();
      data.forEach((d, i) => { const X = xt(d.t), Y = yv(d.p); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
      ctx.stroke();
      const last = data[data.length - 1];
      ctx.fillStyle = '#1b2125'; ctx.beginPath(); ctx.arc(xt(last.t), yv(last.p), 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.textAlign = 'left'; ctx.font = `600 13px ${FONT}`;
      ctx.fillText(`${last.p.toFixed(2).replace('.', ',')} bar`, L + plotW + 6, Math.min(T + plotH - 8, Math.max(T + 8, yv(last.p) - 14)));
    }
  }

  return {
    push(sim) {
      const now = Date.now();
      ref = sim.pressostats;
      if (now - lastSample < 250) return;
      lastSample = now;
      data.push({ t: now, p: sim.pressure, j: sim.jockeySpeed > 0.05, b1: sim.ssw[0].speed > 0.05, b2: sim.ssw[1].speed > 0.05 });
      data = data.filter((d) => now - d.t <= SPAN);
      draw();
    },
    clear() { data = []; draw(); },
  };
}
