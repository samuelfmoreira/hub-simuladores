// Display LCD de 7 segmentos da HMI do CFW500 (desenhado em SVG).
// Os segmentos "apagados" ficam levemente visíveis, como num LCD real.

const NS = 'http://www.w3.org/2000/svg';
const MAPA = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
  A: 'abcefg', B: 'cdefg', b: 'cdefg', C: 'adef', c: 'deg', d: 'bcdeg', D: 'bcdeg', E: 'adefg', F: 'aefg', H: 'bcefg', h: 'cefg',
  L: 'def', n: 'ceg', N: 'abcef', o: 'cdeg', O: 'abcdef', P: 'abefg', r: 'eg', R: 'eg', t: 'defg', T: 'defg', U: 'bcdef', u: 'cde',
  '-': 'g', ' ': '', S: 'acdfg', s: 'acdfg', y: 'bcdfg', Y: 'bcdfg', J: 'bcde', i: 'c', I: 'bc', G: 'acdef', g: 'abcdfg', q: 'abcfg',
};

function poligono(pts) {
  const p = document.createElementNS(NS, 'polygon');
  p.setAttribute('points', pts.map((x) => x.join(',')).join(' '));
  p.setAttribute('class', 'p');
  return p;
}

function digito(svg, x0, y0, w, h, t) {
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('transform', `translate(${x0},${y0}) skewX(-7)`);
  const hor = (y) => poligono([[t / 2 + 1, y], [t + 1, y - t / 2], [w - t - 1, y - t / 2], [w - t / 2 - 1, y], [w - t - 1, y + t / 2], [t + 1, y + t / 2]]);
  const ver = (x, y1, y2) => poligono([[x, y1 + t / 2 + 1], [x + t / 2, y1 + t + 1], [x + t / 2, y2 - t - 1], [x, y2 - t / 2 - 1], [x - t / 2, y2 - t - 1], [x - t / 2, y1 + t + 1]]);
  const segs = {
    a: hor(t / 2), g: hor(h / 2), d: hor(h - t / 2),
    b: ver(w - t / 2, 0, h / 2), c: ver(w - t / 2, h / 2, h), e: ver(t / 2, h / 2, h), f: ver(t / 2, 0, h / 2),
  };
  Object.values(segs).forEach((s) => g.appendChild(s));
  const dp = document.createElementNS(NS, 'circle');
  dp.setAttribute('cx', w + t * 0.35); dp.setAttribute('cy', h - t / 2); dp.setAttribute('r', t * 0.55); dp.setAttribute('class', 'p');
  g.appendChild(dp);
  svg.appendChild(g);
  return { segs, dp };
}

export class Display7 {
  constructor(svg, n, { w, h, t, passo, x0 = 0, y0 = 2, sinal = false }) {
    this.n = n;
    this.cel = [];
    if (sinal) {
      const g = poligono([[2, y0 + h / 2], [5, y0 + h / 2 - t / 2], [x0 - 6, y0 + h / 2 - t / 2], [x0 - 3, y0 + h / 2], [x0 - 6, y0 + h / 2 + t / 2], [5, y0 + h / 2 + t / 2]]);
      svg.appendChild(g); this.menos = g;
    }
    for (let i = 0; i < n; i++) this.cel.push(digito(svg, x0 + i * passo, y0, w, h, t));
  }

  mostrar(txt) {
    txt = String(txt ?? '');
    let neg = false;
    if (this.menos && txt.startsWith('-') && txt.length > 1) { neg = true; txt = txt.slice(1); }
    // separa caracteres e pontos decimais
    const cel = [];
    for (const ch of txt) {
      if ((ch === '.' || ch === ',') && cel.length) cel[cel.length - 1].dp = true;
      else cel.push({ ch, dp: false });
    }
    const vis = cel.slice(-this.n);
    const off = this.n - vis.length;
    this.cel.forEach((c, i) => {
      const item = i >= off ? vis[i - off] : { ch: ' ', dp: false };
      const on = MAPA[item.ch] ?? MAPA[item.ch.toUpperCase()] ?? '';
      for (const [k, s] of Object.entries(c.segs)) s.classList.toggle('on', on.includes(k));
      c.dp.classList.toggle('on', item.dp);
    });
    if (this.menos) this.menos.classList.toggle('on', neg);
  }
}
