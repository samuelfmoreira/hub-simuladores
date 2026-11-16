// Sinótico 2D do processo simplificado: reservatório -> B-01 (CFW500) -> TQ-01 (LT-01) -> HV-01 consumo.
import { svg, fmt } from './util.js';

const C = { pipe: '#2272b8', steel: '#3c444a', water: '#2b84d6', ok: '#2b8a45', bad: '#c0392b', tag: '#f6f6f1' };

export function createSinotico(host, { onAction } = {}) {
  host.innerHTML = '';
  const r = svg('svg', { viewBox: '0 0 1000 500', role: 'img', 'aria-label': 'Sinótico da estação' }, host);
  svg('style', {}, r).textContent = `
    .pp { fill: none; stroke: ${C.pipe}; stroke-width: 8; stroke-linejoin: round; }
    .pf { fill: none; stroke: #bfe0ff; stroke-width: 3; stroke-dasharray: 10 14; stroke-linecap: round; opacity: 0; }
    .eq { fill: #e9ebe5; stroke: ${C.steel}; stroke-width: 2; }
    .tt { font-size: 11px; fill: #1b2125; } .tt.b { font-weight: 600; font-size: 12px; }
    .val { font-family: Consolas, monospace; font-size: 12px; fill: #1b2125; }
    .inst { fill: #fff; stroke: ${C.steel}; stroke-width: 2; } .lamp { stroke: #84887f; stroke-width: 2; } .click { cursor: pointer; }
  `;
  const text = (x, y, t, cls, anchor) => { const e = svg('text', { x, y, class: cls, 'text-anchor': anchor || 'start' }, r); e.textContent = t; return e; };
  const path = (d, cls) => svg('path', { d, class: cls }, r);
  const instr = (x, y, tag) => { svg('circle', { cx: x, cy: y, r: 16, class: 'inst' }, r); text(x, y + 4, tag, 'tt b', 'middle'); return text(x, y + 32, '—', 'val', 'middle'); };
  const sw = (x, y, tag) => { const c = svg('circle', { cx: x, cy: y, r: 7, fill: '#555', class: 'lamp' }, r); text(x + 12, y + 4, tag, 'tt'); return c; };
  // reservatório
  svg('rect', { x: 60, y: 300, width: 150, height: 120, class: 'eq', rx: 4 }, r); svg('rect', { x: 63, y: 340, width: 144, height: 77, fill: C.water, opacity: .75 }, r);
  text(135, 322, 'Reservatório', 'tt b', 'middle');
  // sucção, bomba, recalque
  path('M210 400 H300', 'pp'); const fS = path('M210 400 H300', 'pf');
  svg('circle', { cx: 330, cy: 400, r: 30, class: 'eq' }, r);
  const rotor = svg('path', { d: 'M330 400 l0 -22 M330 400 l19 11 M330 400 l-19 11', stroke: C.steel, 'stroke-width': 4, 'stroke-linecap': 'round', fill: 'none' }, r);
  text(330, 448, 'B-01 · CFW500', 'tt b', 'middle'); const invTxt = text(330, 464, '—', 'val', 'middle'); const refTxt = text(330, 480, '—', 'val', 'middle');
  path('M330 370 V120 H560 V150', 'pp'); const fD = path('M330 370 V120 H560 V150', 'pf');
  svg('path', { d: 'M320 310 L340 290 M320 290 L340 290 L340 310', fill: 'none', stroke: C.steel, 'stroke-width': 2.5 }, r); text(312, 296, 'VR-01', 'tt', 'end');
  // tanque
  svg('rect', { x: 490, y: 150, width: 140, height: 240, class: 'eq', rx: 6 }, r);
  const tqWater = svg('rect', { x: 493, y: 387, width: 134, height: 0, fill: C.water, opacity: .85 }, r);
  text(560, 142, 'TQ-01 · 2 m² · 3 m', 'tt b', 'middle');
  const lt01 = instr(680, 180, 'LT-01'); path('M630 180 H664', 'pp');
  const lshh = sw(640, 220, 'LSHH 2,8 m'); const lsll = sw(640, 365, 'LSLL 0,3 m');
  // saída, HV-01, consumo
  path('M560 390 V430 H760 V455', 'pp'); const fO = path('M560 390 V430 H760 V455', 'pf');
  const hv = svg('g', { class: 'click' }, r); hv.onclick = () => onAction?.({ tipo: 'cons', valor: consAtual > 0.05 ? 0 : 0.6 });
  svg('path', { d: 'M648 420 L672 440 L672 420 L648 440 Z', fill: '#e9ebe5', stroke: C.steel, 'stroke-width': 2 }, hv);
  svg('circle', { cx: 660, cy: 405, r: 7, fill: 'none', stroke: C.steel, 'stroke-width': 2.5 }, hv);
  const hvFill = svg('path', { d: 'M648 420 L672 440 L672 420 L648 440 Z', fill: C.ok, opacity: 0 }, hv);
  text(660, 462, 'HV-01 consumo', 'tt b', 'middle'); const consTxt = text(660, 478, '—', 'val', 'middle');
  svg('rect', { x: 735, y: 455, width: 50, height: 10, fill: '#3c444a' }, r); text(760, 480, 'dreno', 'tt', 'middle');
  // quadro
  svg('rect', { x: 60, y: 40, width: 250, height: 110, class: 'eq', rx: 4 }, r); text(185, 60, 'Quadro de comando · CLP · CFW500', 'tt b', 'middle');
  const lamps = {}; [['H1', 90, '#46e36d'], ['H2', 130, '#ffb81c'], ['H3', 170, '#ff3b2f']].forEach(([n, x, col]) => { const c = svg('circle', { cx: x, cy: 95, r: 10, fill: '#444', class: 'lamp' }, r); c.dataset.col = col; text(x, 119, n, 'tt', 'middle'); lamps[n] = c; });
  const k1 = text(250, 99, 'Q1', 'tt b', 'middle'); k1.classList.add('click'); k1.onclick = () => onAction?.({ tipo: 'disjuntor' }); const estado = text(185, 138, 'sem CLP', 'val', 'middle');
  let phase = 0, consAtual = 0.6;
  const flow = (el, on, speed) => { el.setAttribute('opacity', on ? 1 : 0); if (on) el.setAttribute('stroke-dashoffset', String(-phase * speed)); };
  return function update(s) {
    phase = (phase + 1) % 100000; consAtual = s.cons;
    tqWater.setAttribute('height', Math.max(0, s.h / 3) * 234); tqWater.setAttribute('y', 387 - Math.max(0, s.h / 3) * 234);
    lt01.textContent = `${fmt(s.h, 2)} m · ${fmt(s.sensores['LT-01'].sinal, 1)} mA · ${s.sensores['LT-01'].raw}`;
    lshh.setAttribute('fill', s.di[7] ? '#ff3b2f' : '#555'); lsll.setAttribute('fill', s.di[8] ? '#ff3b2f' : '#555');
    const run = s.inv.rodando;
    rotor.setAttribute('transform', run ? `rotate(${(phase * s.inv.fHz * 0.8) % 360} 330 400)` : ''); rotor.setAttribute('stroke', run ? C.ok : s.inv.falha ? C.bad : C.steel);
    invTxt.textContent = `${fmt(s.inv.fHz, 1)} Hz · ${fmt(s.iMot, 1)} A · ${s.inv.power ? (s.inv.falha ? 'FALHA ' + s.inv.codFalha : run ? 'rodando' : 'parado') : 'sem alimentação'}`;
    const sig = s.ao.sinais && s.ao.sinais.ref; refTxt.textContent = sig ? `SA0 ${fmt(sig.valor, 2)} ${sig.tipo} · ${fmt(s.qIn, 1)} m³/h` : '';
    hvFill.setAttribute('opacity', s.cons > 0.05 ? 0.25 + 0.75 * s.cons : 0); consTxt.textContent = `${Math.round(s.cons * 100)} % · ${fmt(s.qOut, 1)} m³/h`;
    flow(fS, s.qIn > 0.5, s.qIn / 8); flow(fD, s.qIn > 0.5, s.qIn / 8); flow(fO, s.qOut > 0.3, s.qOut / 6);
    for (const k of ['H1', 'H2', 'H3']) lamps[k].setAttribute('fill', s.quadro[k] ? lamps[k].dataset.col : '#444');
    k1.setAttribute('fill', s.quadro.q1 ? C.ok : C.bad); k1.textContent = s.quadro.q1 ? 'Q1 ●' : 'Q1 ○';
    estado.textContent = s.comm.clpConectado ? `CLP conectado · ${s.quadro.S4 === 'auto' ? 'automático' : 'manual'}${s.quadro.S0 ? ' · EMERGÊNCIA' : ''}` : 'sem CLP';
  };
}
