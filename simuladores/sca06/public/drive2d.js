/* =============================================================================
 *  SCA06 — VISTA FRONTAL 2D INTERATIVA
 *  Desenho vetorial (SVG) baseado na vista frontal do Manual do Usuário SCA06:
 *  tampa da potência no topo, slots de acessório à esquerda (slot 2 = ECO5),
 *  coluna direita com X1, X2 (resolver, DB9), X3 (USB), LEDs USB / POWER ON / FAULT
 *  e RESET; faixa da HMI com display de 6 dígitos e teclas ▲ P ▼ ◄; placa de fixação.
 *
 *  As teclas funcionam como no drive físico (inclusive segurar ▲/▼ para rolar rápido).
 *  O logotipo do fabricante NÃO é reproduzido.
 * ===========================================================================*/
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  // segmentos de 7 seg. (a..g) para cada caractere
  const SEG = {
    '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
    'P': 'abefg', 'A': 'abcefg', 'F': 'aefg', 'E': 'adefg', 'S': 'acdfg', 't': 'defg', 'o': 'cde', 'b': 'cdefg', 'd': 'bcdeg', 'n': 'ceg', 'r': 'eg',
    '-': 'g', ' ': '', 'u': 'cde', 'H': 'bcefg', 'L': 'def', 'C': 'adef'
  };

  function digitSvg(x, y, i) {
    // dígito de 12 × 20 (unidades do viewBox), levemente inclinado
    const w = 12, h = 20, t = 2.2, k = 0.12;
    const P = (px, py) => `${(x + px + k * (h - py)).toFixed(2)},${(y + py).toFixed(2)}`;
    const H = (yy) => [P(t * .9, yy), P(w - t * .9, yy), P(w - t * .3, yy + t / 2), P(w - t * .9, yy + t), P(t * .9, yy + t), P(t * .3, yy + t / 2)].join(' ');
    const V = (xx, y0, y1) => [P(xx + t / 2, y0), P(xx + t, y0 + t / 2), P(xx + t, y1 - t / 2), P(xx + t / 2, y1), P(xx, y1 - t / 2), P(xx, y0 + t / 2)].join(' ');
    const m = h / 2 - t / 2;
    const segs = { a: H(0), g: H(m), d: H(h - t), b: V(w - t, t * .3, h / 2), c: V(w - t, h / 2, h - t * .3), f: V(0, t * .3, h / 2), e: V(0, h / 2, h - t * .3) };
    let s = `<g class="dig" data-i="${i}">`;
    for (const [k2, pts] of Object.entries(segs)) s += `<polygon class="sg" data-s="${k2}" points="${pts}"/>`;
    s += `<circle class="sg dp" cx="${(x + w + 1.6).toFixed(2)}" cy="${(y + h - 1).toFixed(2)}" r="1.25"/></g>`;
    return s;
  }
  const hot = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0,-9 L9,7 L-9,7 Z" fill="#f4d000" stroke="#111" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M-4,4 q1.2,-2 0,-4 q-1.2,-2 0,-4 M0,4 q1.2,-2 0,-4 q-1.2,-2 0,-4 M4,4 q1.2,-2 0,-4 q-1.2,-2 0,-4" fill="none" stroke="#111" stroke-width=".9"/><line x1="-6" y1="5.3" x2="6" y2="5.3" stroke="#111" stroke-width=".9"/></g>`;
  const screw = (x, y, r = 4) => `<g><circle cx="${x}" cy="${y}" r="${r}" fill="#e9ecef" stroke="#555" stroke-width=".7"/><path d="M${x - r * .6},${y} h${r * 1.2} M${x},${y - r * .6} v${r * 1.2}" stroke="#555" stroke-width=".8"/></g>`;

  const STYLE = `<style>
    .sca06svg text { font-family: 'IBM Plex Sans Condensed', 'Arial Narrow', Arial, sans-serif; }
    .sca06svg .lb { font-size: 6.2px; font-weight: 600; fill: #222; }
    .sca06svg .lb2 { font-size: 4.6px; font-weight: 600; fill: #222; }
    .sca06svg .lb3 { font-size: 5.4px; font-weight: 700; fill: #1e2328; }
    .sca06svg .badge { font-size: 6px; font-weight: 700; fill: #fff; }
    .sca06svg .logo { font-size: 8.6px; font-weight: 700; font-style: italic; fill: #ffd400; }
    .sca06svg .logo2 { font-size: 4.1px; font-weight: 600; fill: #ffd400; }
    .sca06svg .pkey { font-size: 8.4px; font-weight: 700; fill: #fff; }
    .sca06svg .sg { fill: #3a0f0b; } .sca06svg .sg.on { fill: #ff2a1a; }
    .sca06svg .ledoff { fill: #4a4d55; stroke: #222; stroke-width: .5; }
    .sca06svg .led-g { fill: #3ddc6a; stroke: #1c7a3a; stroke-width: .5; } .sca06svg .led-r { fill: #ff3b2a; stroke: #8a1a10; stroke-width: .5; } .sca06svg .led-y { fill: #ffc61a; stroke: #8a6a00; stroke-width: .5; }
    .sca06svg .lkoff { fill: #24302a; } .sca06svg .lk-g { fill: #3ddc6a; } .sca06svg .lk-y { fill: #ffb000; }
  </style>`;
  function svgMarkup(o = {}) {
    // viewBox completo 200 × 545 (o.viewBox recorta; o.still = textura estática para o 3D)
    let d = STYLE;
    // ---- placa de fixação (fundo) e suporte inferior
    d += `<rect x="28" y="28" width="150" height="512" rx="4" fill="#f3f4f6" stroke="#9a9fa8" stroke-width=".8"/>`;
    d += `<path d="M96,470 h14 v14 a7,7 0 0 1 -14,0 Z" fill="#fff" stroke="#7d828a" stroke-width=".8"/>`;            // furo de fixação
    d += `<rect x="40" y="496" width="126" height="9" fill="#b9bdc4" stroke="#8a8f97" stroke-width=".6"/>`;           // barra de aterramento
    d += screw(56, 524) + screw(150, 524);
    d += `<rect x="86" y="514" width="34" height="18" rx="2" fill="#fff" stroke="#8a8f97" stroke-width=".6"/><rect x="95" y="517" width="16" height="12" fill="#d6d9de" stroke="#777" stroke-width=".5"/>`;
    d += `<g stroke="#333" stroke-width="1" fill="none"><path d="M168,514 v8 M162,522 h12 M164,525.5 h8 M166,529 h4"/></g>`;     // símbolo de terra
    // ---- tampa da potência (topo) com borne X9
    d += `<rect x="46" y="4" width="98" height="46" rx="2" fill="#c8d4e6" stroke="#8796ad" stroke-width=".8"/>`;
    d += `<rect x="56" y="30" width="62" height="12" rx="1" fill="#26282c" stroke="#111" stroke-width=".6"/>`;
    for (let i = 0; i < 5; i++) d += `<circle cx="${62 + i * 12.5}" cy="36" r="3.4" fill="#8d9298" stroke="#111" stroke-width=".6"/><line x1="${59.6 + i * 12.5}" y1="36" x2="${64.4 + i * 12.5}" y2="36" stroke="#222" stroke-width=".7"/>`;
    d += `<text x="122" y="40" class="lb">X9</text>`;
    d += hot(40, 46, .9);
    // ---- corpo
    d += `<rect x="30" y="50" width="146" height="398" rx="3" fill="#dcdde8" stroke="#7f8296" stroke-width="1"/>`;
    // ---- coluna direita
    d += `<rect x="144" y="56" width="28" height="13" rx="1.5" fill="#1f4fae"/><text x="158" y="65.4" class="badge" text-anchor="middle">SCA06</text>`;
    d += `<rect x="146" y="74" width="15" height="62" rx="1" fill="#2a2d33"/>`;
    for (let i = 0; i < 9; i++) d += `<rect x="148.5" y="${76.5 + i * 6.6}" width="10" height="4.6" fill="#c9ccd2"/>`;
    d += `<text x="164" y="82" class="lb">X1</text>`;
    d += `<circle cx="166" cy="142" r="3" fill="#d4d6dd" stroke="#666" stroke-width=".6"/>`;
    d += `<path d="M147,152 h22 l-2,40 h-18 Z" fill="#cfd2d9" stroke="#555" stroke-width=".8"/><path d="M151,157 h14 l-1.4,30 h-11.2 Z" fill="#33363c"/>`;
    for (let i = 0; i < 5; i++) d += `<circle cx="155" cy="${160 + i * 6}" r="1.1" fill="#c7a650"/>`;
    for (let i = 0; i < 4; i++) d += `<circle cx="160.5" cy="${163 + i * 6}" r="1.1" fill="#c7a650"/>`;
    d += `<text x="164" y="200" class="lb">X2</text>`;
    d += `<rect x="146" y="206" width="24" height="26" rx="3" fill="#e4e6ee" stroke="#8a8ea0" stroke-width=".7"/>`;
    d += `<g stroke="#333" stroke-width="1" fill="none" transform="translate(158 220)"><path d="M0,7 V-7 M0,-7 l-2,3 M0,-7 l2,3 M0,2 l-4,-3 v-2 M0,0 l4,-3 v-2"/><circle cx="0" cy="8" r="1.4" fill="#333"/></g>`;
    d += `<rect x="151" y="234" width="14" height="5" fill="#222"/><text x="167" y="240" class="lb">X3</text>`;
    const ledRow = (y, id, label) => `<circle id="${id}" cx="151" cy="${y}" r="3" class="ledoff"/><text x="157" y="${y + 2}" class="lb2">${label}</text>`;
    d += ledRow(252, 'l_usb', 'USB') + ledRow(263, 'l_pow', 'POWER') + `<text x="157" y="268.5" class="lb2">ON</text>` + ledRow(277, 'l_flt', 'FAULT');
    d += `<g class="hit" data-k="reset"><circle cx="151" cy="291" r="3.6" fill="#111" stroke="#666" stroke-width=".6"/><circle cx="151" cy="291" r="1.4" fill="#444"/><text x="157" y="293" class="lb2">RESET</text></g>`;
    // ---- slot 1: tampa cega
    const cover = (y, h) => `<rect x="34" y="${y}" width="106" height="${h}" rx="3" fill="#e2e3ed" stroke="#8c8fa3" stroke-width=".8"/>
      <path d="M${120},${y + 6} C${122},${y + h * .55} ${110},${y + h - 10} ${44},${y + h - 7}" fill="none" stroke="#a7aabd" stroke-width="1.6"/>
      <path d="M${124},${y + 6} C${126},${y + h * .6} ${112},${y + h - 5} ${44},${y + h - 3}" fill="none" stroke="#c4c6d4" stroke-width=".8"/>`;
    d += cover(56, 92);
    // ---- slot 2: ECO5 (EtherNet/IP)  [ETH Figura 3.1]
    d += `<g id="eco5"><rect x="34" y="152" width="106" height="98" rx="3" fill="#e8eaee" stroke="#7d8394" stroke-width=".9"/>`;
    for (const [i, x] of [[0, 46], [1, 92]].map(a => a)) {
      d += `<g class="${i === 0 ? 'hit' : ''}" ${i === 0 ? 'data-a="cablePlugged"' : ''}><rect x="${x - 2}" y="158" width="36" height="32" rx="1.5" fill="#cdd1d7" stroke="#7a7f88" stroke-width=".7"/>
        <path d="M${x + 4},164 h20 v15 h-4 v4 h-12 v-4 h-4 Z" fill="#26282d"/>
        <rect id="lk${i}a" x="${x + 1}" y="160" width="5" height="2.6" class="lkoff"/><rect id="lk${i}b" x="${x + 26}" y="160" width="5" height="2.6" class="lkoff"/></g>`;
    }
    if (!o.still) d += `<g id="plug" class="hit" data-a="cablePlugged"><rect x="49" y="146" width="26" height="30" rx="2" fill="#a9d3f5" stroke="#4f8fc8" stroke-width=".8" opacity=".95"/><rect x="56" y="112" width="12" height="36" fill="#2d7fd0"/><path d="M62,112 C62,90 80,70 110,62" stroke="#2d7fd0" stroke-width="7" fill="none" stroke-linecap="round"/></g>`;
    d += `<circle id="l_ns" cx="87" cy="198" r="2.6" class="ledoff"/>`;
    d += `<rect x="40" y="194" width="94" height="12" fill="#d7dbe0" stroke="#555" stroke-width=".6"/><text x="44" y="203.5" class="lb3">XA171</text><text x="91" y="202" class="lb3">NS</text><text x="111" y="203.5" class="lb3">XA172</text>`;
    for (let i = 0; i < 6; i++) d += `<rect x="${92 + i * 2}" y="${213 + i * 5.4}" width="${42 - i * 4}" height="2.6" fill="#9aa1a8"/>`;
    d += `<rect x="44" y="214" width="40" height="18" rx="1" fill="#f1f2f4" stroke="#aab" stroke-width=".5"/><text x="64" y="225.5" text-anchor="middle" class="lb3">ECO5</text>`;
    d += screw(50, 241, 3.6) + `</g>`;
    // ---- slot 3: tampa cega
    d += cover(254, 94);
    // ---- faixa da HMI
    d += `<rect x="34" y="352" width="30" height="18" rx="1.5" fill="#c3c6d0" stroke="#7f8290" stroke-width=".6"/><text x="49" y="363.5" text-anchor="middle" class="lb3">CMF</text>`;
    d += `<defs><linearGradient id="band" x1="0" x2="1"><stop offset="0" stop-color="#8b88c9"/><stop offset="1" stop-color="#b8b6e6"/></linearGradient></defs>`;
    d += `<rect x="66" y="352" width="74" height="18" rx="1.5" fill="url(#band)"/><text x="69" y="364.5" class="logo">SCA06</text><text x="98.5" y="364" class="logo2">DIGITAL AC SERVO</text>`;
    d += `<rect x="34" y="374" width="106" height="32" rx="2" fill="#2a0a08" stroke="#58201c" stroke-width=".8"/>`;
    for (let i = 0; i < 6; i++) d += digitSvg(38 + i * 16.6, 380, i);
    // teclas dentro da coluna direita do corpo (x 141…175), como na vista frontal do manual
    const key = (cx, cy, k, glyph, title) => `<g class="hit key" data-k="${k}" role="button" aria-label="${title}" tabindex="0"><circle cx="${cx}" cy="${cy}" r="7.4" fill="#2f5fb4" stroke="#1d3f7c" stroke-width=".9"/><circle cx="${cx}" cy="${cy - .8}" r="6.2" fill="#3a6fc6"/>${glyph}<title>${title}</title></g>`;
    const KX1 = 150, KX2 = 166.5, KY1 = 362, KY2 = 386;
    d += key(KX1, KY1, 'up', `<path d="M${KX1 - 3.6},${KY1 + 2.4} L${KX1},${KY1 - 2.9} L${KX1 + 3.6},${KY1 + 2.4} Z" fill="#fff"/>`, 'Incrementa (▲)');
    d += key(KX2, KY1, 'prog', `<text x="${KX2}" y="${KY1 + 3.1}" text-anchor="middle" class="pkey">P</text>`, 'PROG (P)');
    d += key(KX1, KY2, 'down', `<path d="M${KX1 - 3.6},${KY2 - 2.4} L${KX1},${KY2 + 2.9} L${KX1 + 3.6},${KY2 - 2.4} Z" fill="#fff"/>`, 'Decrementa (▼)');
    d += key(KX2, KY2, 'shift', `<path d="M${KX2 + 2.6},${KY2 - 3.6} L${KX2 - 2.9},${KY2} L${KX2 + 2.6},${KY2 + 3.6} Z" fill="#fff"/>`, 'SHIFT (◄)');
    // ---- conectores inferiores e advertência
    d += `<rect x="64" y="448" width="22" height="15" rx="1" fill="#26282c" stroke="#111" stroke-width=".6"/><text x="75" y="459" text-anchor="middle" class="lb3" fill="#fff" style="fill:#fff">X5</text>`;
    d += `<rect x="104" y="448" width="44" height="13" rx="1" fill="#26282c" stroke="#111" stroke-width=".6"/>`;
    for (let i = 0; i < 5; i++) d += `<circle cx="${109 + i * 8.5}" cy="454.5" r="2.6" fill="#8d9298" stroke="#111" stroke-width=".5"/>`;
    d += `<text x="151" y="459" class="lb">X4</text>`;
    d += hot(44, 458, .9);
    const vb = o.viewBox || '0 0 200 545';
    const size = o.width ? ` width="${o.width}" height="${o.height}"` : '';
    return `<svg viewBox="${vb}"${size} xmlns="${NS}" class="sca06svg" role="img" aria-label="Vista frontal do servoconversor SCA06 com HMI interativa">${d}</svg>`;
  }

  class Drive2D {
    constructor(host, { onKey, onAction }) {
      this.onKey = onKey; this.onAction = onAction;
      this.el = document.createElement('div'); this.el.className = 'drive2d';
      this.el.innerHTML = svgMarkup();
      host.appendChild(this.el);
      this.svg = this.el.querySelector('svg');
      this.digits = [...this.svg.querySelectorAll('.dig')].map(g => ({ segs: Object.fromEntries([...g.querySelectorAll('[data-s]')].map(p => [p.dataset.s, p])), dp: g.querySelector('.dp') }));
      this.led = (id) => this.svg.querySelector('#' + id);
      this.bindKeys();
    }
    mount(host) { if (this.el.parentNode !== host) host.appendChild(this.el); }
    bindKeys() {
      // segurar ▲/▼ repete como no drive físico: 450 ms de espera, depois a cada 90 ms e,
      // após 2 s, a cada 45 ms. Baseado no tempo decorrido (não perde passos em PC lento).
      let rep = null, t0 = 0, sent = 0, held = null;
      const due = (dt) => dt < 450 ? 0 : dt < 2000 ? 1 + Math.floor((dt - 450) / 90) : 1 + Math.floor(1550 / 90) + Math.floor((dt - 2000) / 45);
      const stop = () => { clearInterval(rep); rep = null; held = null; this.svg.querySelectorAll('.key.down').forEach(k => k.classList.remove('down')); };
      this.svg.querySelectorAll('[data-k]').forEach(g => {
        const k = g.dataset.k;
        g.addEventListener('pointerdown', (e) => {
          e.preventDefault(); stop(); g.classList.add('down'); this.onKey(k);
          if (k === 'up' || k === 'down') {
            held = k; t0 = performance.now(); sent = 0;
            rep = setInterval(() => { const n = Math.min(due(performance.now() - t0), sent + 8); while (sent < n) { sent++; this.onKey(held); } }, 30);
          }
        });
        g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.onKey(k); } });
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => this.svg.addEventListener(ev, stop));
      this.svg.querySelectorAll('[data-a]').forEach(g => g.addEventListener('click', () => this.onAction(g.dataset.a)));
    }
    /** posição (em px da página) de uma tecla — usada pelo vídeo para mostrar o toque */
    keyRect(k) { const g = this.svg.querySelector(`[data-k="${k}"] circle`); return g ? g.getBoundingClientRect() : null; }
    update(v) {
      const on = Math.floor(performance.now() / 300) % 2 === 0;
      v.hmi.cells.forEach((c, i) => {
        const D = this.digits[i]; if (!D) return;
        const lit = !(c.blink && !on); const segs = SEG[c.ch] || '';
        for (const [s, p] of Object.entries(D.segs)) p.classList.toggle('on', lit && segs.includes(s));
        D.dp.classList.toggle('on', lit && c.dp);
      });
      const set = (id, cls) => { const e = this.led(id); if (e) e.setAttribute('class', cls); };
      set('l_usb', v.hmi.leds.usb ? 'led-y' : 'ledoff');
      set('l_pow', v.hmi.leds.power ? 'led-g' : 'ledoff');
      set('l_flt', v.hmi.leds.fault ? 'led-r' : 'ledoff');
      const blink = Math.floor(performance.now() / 250) % 2 === 0, fast = Math.floor(performance.now() / 70) % 2 === 0;
      const ns = { green: 'led-g', 'green-blink': blink ? 'led-g' : 'ledoff', red: 'led-r', 'red-blink': blink ? 'led-r' : 'ledoff' }[v.ns] || 'ledoff';
      set('l_ns', ns);
      set('lk0a', v.link1 === 'on' || (v.link1 === 'blink' && fast) ? 'lk-g' : 'lkoff');
      set('lk0b', v.link1 !== 'off' ? 'lk-y' : 'lkoff');
      set('lk1a', 'lkoff'); set('lk1b', 'lkoff');
      const plug = this.svg.querySelector('#plug'); if (plug) plug.style.display = v.bench.cablePlugged ? '' : 'none';
      this.svg.querySelector('#eco5').style.transform = v.bench.accessorySeated ? '' : 'translate(0px, 0px) scale(1)';
      this.svg.querySelector('#eco5').style.opacity = v.bench.accessorySeated ? 1 : .45;
    }
  }
  /** SVG do frontal para virar textura do modelo 3D (mesmo desenho do 2D). */
  Drive2D.svg = svgMarkup;
  global.Drive2D = Drive2D;
})(typeof window !== 'undefined' ? window : this);
