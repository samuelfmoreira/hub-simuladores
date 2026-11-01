/* =====================================================================
   SIMULADOR CV-X400 — FRONT-END
   Tela do equipamento (modo execução e modo programação) + painel do
   simulador (etiqueta, falhas, sinais, bytes, eventos).
   ===================================================================== */

"use strict";

const socket = io();
const $ = (id) => document.getElementById(id);

let geral = null;        // dados gerais (rede, CLPs)
let estado = null;       // sessão do CLP selecionado
let ferramentaSel = "T100";
let vistaDetalhe = "detalhe";   // detalhe | lista | historico
let abaProg = "ferramenta";     // ferramenta | saida | programa
let editandoEtiqueta = false;
let editandoDisco = false;
let tipoMostrado = null;
let editandoRede = false;
let editandoProg = false;
let zoom = 1;
let mostrarRoi = true;
let sessaoMostrada = null;

const FERRAMENTAS_PADRAO = [
  { id: "T100", nome: "Leitor de Código 2D", tipo: "codigo", qr: 0 },
  { id: "T101", nome: "Leitor de Código 2D", tipo: "codigo", qr: 1 },
  { id: "T102", nome: "Leitor de Código 2D", tipo: "codigo", qr: 2 },
  { id: "T103", nome: "Leitor de Código 2D", tipo: "codigo", qr: 3 },
  { id: "T104", nome: "Leitor de Código 2D", tipo: "codigo", qr: 4 },
  { id: "T105", nome: "Leitor de Código 2D", tipo: "codigo", qr: 5 },
  { id: "T106", nome: "Pos de padrão de perf", tipo: "posicao" },
];

// =====================================================================
// ESCALA DA TELA (1280 x 960 cabendo no espaço disponível)
// =====================================================================
function ajustarEscala() {
  const palco = $("palco");
  const w = palco.clientWidth;
  const h = palco.clientHeight;
  const k = Math.min(w / 1280, h / 960);
  $("tela").style.transform = `translate(${(w - 1280 * k) / 2}px, ${(h - 960 * k) / 2}px) scale(${k})`;
}
new ResizeObserver(ajustarEscala).observe($("palco"));

// =====================================================================
// CENA DA CÂMERA (SVG em tons de cinza, como a imagem do CV-X)
// =====================================================================
function hashTexto(t) {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function aleatorio(semente) {
  let a = semente || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const cacheQr = new Map();
// Desenho no estilo QR (ilustrativo, não legível) em unidades de módulo
function qrPath(texto, n) {
  const chave = n + "|" + texto;
  if (cacheQr.has(chave)) return cacheQr.get(chave);
  const rnd = aleatorio(hashTexto(texto || "vazio"));
  const q = [];
  const m = (x, y) => q.push(`M${x} ${y}h1v1h-1z`);
  const zona = (x, y) => (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
  [[0, 0], [n - 7, 0], [0, n - 7]].forEach(([ox, oy]) => {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      if (x === 0 || y === 0 || x === 6 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4)) m(ox + x, oy + y);
    }
  });
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (zona(x, y)) continue;
    if (x === 6 || y === 6) { if ((x + y) % 2 === 0) m(x, y); }
    else if (rnd() < 0.5) m(x, y);
  }
  const d = q.join("");
  cacheQr.set(chave, d);
  return d;
}

// Bandeja interna da caixa (perspectiva da foto): fundo em cima, frente embaixo
const BANDEJA = { BL: [378, 260], BR: [642, 264], FL: [314, 489], FR: [706, 493] };
function P(u, v) {
  const { BL, BR, FL, FR } = BANDEJA;
  const t = [BL[0] + (BR[0] - BL[0]) * u, BL[1] + (BR[1] - BL[1]) * u];
  const b = [FL[0] + (FR[0] - FL[0]) * u, FL[1] + (FR[1] - FL[1]) * u];
  return [t[0] + (b[0] - t[0]) * v, t[1] + (b[1] - t[1]) * v];
}
const pts = (lista) => lista.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");

// Geometria de cada peça (pos 1 = frente/embaixo ... pos 5 = fundo/em cima)
const PECAS = {};
for (let pos = 1; pos <= 5; pos++) {
  const k = 5 - pos;
  const v0 = 0.02 + k * 0.196;
  const v1 = v0 + 0.186;
  const c = P(0.5, v0 + (v1 - v0) * 0.45);
  const tam = (P(0.5, v1)[1] - P(0.5, v0)[1]) * 0.82;
  const xs = [P(0.03, v0)[0], P(0.015, v1)[0], P(0.97, v0)[0], P(0.985, v1)[0]];
  PECAS[pos] = {
    corpo: [P(0.03, v0), P(0.97, v0), P(0.985, v1 - 0.03), P(0.015, v1 - 0.03)],
    aba: [P(0.015, v1 - 0.03), P(0.985, v1 - 0.03), P(0.985, v1), P(0.015, v1)],
    etq: { x: c[0] - tam / 2, y: c[1] - tam / 2, s: tam },
    roi: { x: Math.min(...xs) - 6, y: P(0.5, v0)[1] - 7, w: Math.max(...xs) - Math.min(...xs) + 12, h: P(0.5, v1)[1] - P(0.5, v0)[1] + 14 },
  };
}
const ETQ_MAIOR = { x: 435, y: 558, w: 150, h: 122, qr: 100 };

function roiDe(id) {
  if (id === "T100") return { x: 416, y: 542, w: 188, h: 154 };
  if (id === "T106") return { x: 390, y: 526, w: 240, h: 192 };
  const pos = Number(id.slice(3));          // T101..T105 -> peça 1..5
  return PECAS[pos].roi;
}
function achadoDe(id) {
  if (id === "T100") {
    const q = ETQ_MAIOR;
    return { x: q.x + (q.w - q.qr) / 2 - 4, y: q.y + (q.h - q.qr) / 2 - 4, w: q.qr + 8, h: q.qr + 8 };
  }
  if (id === "T106") return { x: ETQ_MAIOR.x - 4, y: ETQ_MAIOR.y - 4, w: ETQ_MAIOR.w + 8, h: ETQ_MAIOR.h + 8 };
  const e = PECAS[Number(id.slice(3))].etq;
  return { x: e.x - 3, y: e.y - 3, w: e.s + 6, h: e.s + 6 };
}

function desenharQrEtiqueta(texto, x, y, s, n, coberto) {
  const k = s / n;
  let g = `<rect x="${x - k}" y="${y - k}" width="${s + 2 * k}" height="${s + 2 * k}" fill="#e6e6e6"/>`;
  g += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${k.toFixed(4)})"><path d="${qrPath(texto, n)}" fill="#1b1b1b" opacity="${coberto ? 0.18 : 1}"/></g>`;
  if (coberto) {
    // Código danificado/coberto: mancha que impede a leitura
    g += `<ellipse cx="${x + s * 0.5}" cy="${y + s * 0.52}" rx="${s * 0.46}" ry="${s * 0.34}" fill="#6d6d6d" opacity="0.75"/>`;
    g += `<ellipse cx="${x + s * 0.38}" cy="${y + s * 0.4}" rx="${s * 0.22}" ry="${s * 0.16}" fill="#4a4a4a" opacity="0.7"/>`;
  }
  return g;
}

/**
 * Monta a imagem da câmera.
 * @param e    estado da sessão (etiqueta, falhas)
 * @param op   { id: prefixo único, roi: ferramenta destacada, r: resultado dela, viewBox }
 */
function cenaEtiqueta(e, op = {}) {
  const idp = op.id || "c";
  const textos = [e.peca.maior, ...e.peca.menores];
  const f = e.falhas;
  const foraPosicao = f[6];

  let s = `<svg viewBox="${op.viewBox || "0 0 1000 800"}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="${idp}vin" cx="50%" cy="55%" r="65%"><stop offset="0" stop-color="#1c1c1c"/><stop offset="1" stop-color="#030303"/></radialGradient>
    <linearGradient id="${idp}fr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dedede"/><stop offset="1" stop-color="#b9b9b9"/></linearGradient>
    <linearGradient id="${idp}pc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f4f4"/><stop offset="1" stop-color="#cfcfcf"/></linearGradient>
    <linearGradient id="${idp}cil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a9a9a"/><stop offset=".45" stop-color="#d9d9d9"/><stop offset="1" stop-color="#6e6e6e"/></linearGradient>
    <filter id="${idp}bl"><feGaussianBlur stdDeviation="3"/></filter>
  </defs>
  <rect width="1000" height="800" fill="url(#${idp}vin)"/>
  <g opacity=".55" filter="url(#${idp}bl)">
    <rect x="20" y="330" width="210" height="150" rx="10" fill="#3b3b3b"/>
    <rect x="40" y="360" width="170" height="14" fill="#555"/><rect x="40" y="392" width="170" height="14" fill="#555"/>
    <rect x="40" y="424" width="170" height="14" fill="#555"/>
    <rect x="0" y="470" width="240" height="120" rx="8" fill="#2c2c2c"/>
    <rect x="830" y="300" width="170" height="380" fill="#151515"/>
  </g>
  <polygon points="262,705 758,705 800,800 220,800" fill="#232323"/>
  <polygon points="350,716 670,716 684,770 336,770" fill="#191919"/>
  <g>
    <rect x="752" y="455" width="96" height="100" rx="12" fill="url(#${idp}cil)"/>
    <ellipse cx="754" cy="505" rx="16" ry="50" fill="#e3e3e3"/>
    <rect x="846" y="493" width="70" height="22" fill="#6a6a6a"/>
    <path d="M856 493v22M866 493v22M876 493v22M886 493v22M896 493v22" stroke="#4a4a4a" stroke-width="3"/>
  </g>`;

  // Caixa (deslocada e girada quando a peça está fora de posição)
  s += `<g ${foraPosicao ? 'transform="rotate(8 510 500) translate(85 18)"' : ""}>
    <polygon points="298,501 722,506 708,738 312,734" fill="url(#${idp}fr)"/>
    <line x1="311" y1="716" x2="709" y2="719" stroke="#9c9c9c" stroke-width="2"/>
    <polygon points="365,248 655,252 722,506 298,501" fill="#ededed"/>
    <polygon points="298,501 722,506 722,514 298,509" fill="#fafafa"/>
    <polygon points="${pts([BANDEJA.BL, BANDEJA.BR, BANDEJA.FR, BANDEJA.FL])}" fill="#8e8e8e"/>`;

  for (let pos = 5; pos >= 1; pos--) {
    const p = PECAS[pos];
    s += `<polygon points="${pts(p.corpo)}" fill="url(#${idp}pc)" stroke="#b0b0b0" stroke-width="1.5" stroke-linejoin="round"/>
      <polygon points="${pts(p.aba)}" fill="#a9a9a9"/>
      ${desenharQrEtiqueta(textos[pos], p.etq.x, p.etq.y, p.etq.s, 21, f[pos])}`;
  }
  // Etiqueta maior na face frontal
  const q = ETQ_MAIOR;
  s += `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="#e2e2e2" stroke="#9a9a9a"/>
    ${desenharQrEtiqueta(textos[0], q.x + (q.w - q.qr) / 2, q.y + (q.h - q.qr) / 2, q.qr, 29, f[0])}
  </g>`;

  // Gráficos da ferramenta (região azul, código encontrado em verde, NG em vermelho)
  if (op.roi && op.mostrarRoi !== false) {
    const r = roiDe(op.roi);
    const res = op.r;
    const corRoi = res && !res.ok ? "#ff3030" : "#2f7bff";
    s += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="${corRoi}" stroke-width="4"/>`;
    if (res && res.ok) {
      const a = achadoDe(op.roi);
      s += `<rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="none" stroke="#2ee82e" stroke-width="3.5"/>`;
      const cx = a.x + a.w / 2;
      const cy = a.y + a.h / 2;
      s += `<path d="M${cx - 10} ${cy}h20M${cx} ${cy - 10}v20" stroke="#2ee82e" stroke-width="3"/>`;
    }
  }
  return s + "</svg>";
}

// =====================================================================
// CENA DO PROGRAMA "DISCO COM FUROS"
// Flange vista de cima: 4 px por mm, centro em (500, 400).
// Ø externo 80 mm -> raio 160 px; furo central Ø40 -> raio 80;
// 6 furos Ø10 (raio 20) no diâmetro primitivo de 60 mm (raio 120).
// =====================================================================
const DISCO = { cx: 500, cy: 400, pxmm: 4, rPrimitivo: 120, rFuro: 20, nominal: 6 };

function posFuros(n) {
  const lista = [];
  for (let k = 0; k < 6; k++) {
    const a = (k * 60 - 90) * Math.PI / 180;
    lista.push({ x: DISCO.cx + DISCO.rPrimitivo * Math.cos(a), y: DISCO.cy + DISCO.rPrimitivo * Math.sin(a), real: k < n });
  }
  // Furos a mais que o nominal: entre os nominais
  for (let k = 0; k < Math.max(0, n - 6); k++) {
    const a = (k * 60 - 60) * Math.PI / 180;
    lista.push({ x: DISCO.cx + DISCO.rPrimitivo * Math.cos(a), y: DISCO.cy + DISCO.rPrimitivo * Math.sin(a), real: true });
  }
  return lista;
}

function cenaDisco(e, op = {}) {
  const idp = op.id || "d";
  const pc = e.peca;
  const { cx, cy } = DISCO;
  const rExt = pc.diamExt * DISCO.pxmm / 2;
  const rInt = pc.diamInt * DISCO.pxmm / 2;
  const furos = posFuros(pc.furos);

  let s = `<svg viewBox="${op.viewBox || "0 0 1000 800"}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="${idp}vin" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="#2a2a2a"/><stop offset="1" stop-color="#060606"/></radialGradient>
    <radialGradient id="${idp}aco" cx="42%" cy="38%" r="70%"><stop offset="0" stop-color="#ececec"/><stop offset=".6" stop-color="#c4c4c4"/><stop offset="1" stop-color="#9a9a9a"/></radialGradient>
    <radialGradient id="${idp}fur" cx="50%" cy="50%" r="50%"><stop offset=".6" stop-color="#050505"/><stop offset="1" stop-color="#2b2b2b"/></radialGradient>
    <pattern id="${idp}usin" width="1000" height="800" patternUnits="userSpaceOnUse">
      ${Array.from({ length: 18 }, (_, i) => `<circle cx="${cx}" cy="${cy}" r="${90 + i * 4}" fill="none" stroke="#fff" stroke-opacity=".08"/>`).join("")}
    </pattern>
  </defs>
  <rect width="1000" height="800" fill="url(#${idp}vin)"/>
  <rect x="250" y="150" width="500" height="500" rx="18" fill="#262626" stroke="#3a3a3a" stroke-width="3"/>
  <circle cx="${cx}" cy="${cy}" r="215" fill="none" stroke="#1a1a1a" stroke-width="14"/>
  ${[[cx - 186, cy + 92], [cx + 186, cy + 92], [cx, cy - 206]].map(([x, y]) =>
    `<circle cx="${x}" cy="${y}" r="13" fill="#7a7a7a"/><circle cx="${x - 3}" cy="${y - 3}" r="5" fill="#bdbdbd"/>`).join("")}`;

  if (pc.presente) {
    const mov = pc.foraPosicao ? `transform="translate(118 74) rotate(17 ${cx} ${cy})"` : "";
    s += `<g ${mov}>
      <circle cx="${cx + 6}" cy="${cy + 8}" r="${rExt}" fill="#000" opacity=".55"/>
      <circle cx="${cx}" cy="${cy}" r="${rExt}" fill="url(#${idp}aco)"/>
      <circle cx="${cx}" cy="${cy}" r="${rExt}" fill="url(#${idp}usin)"/>
      <circle cx="${cx}" cy="${cy}" r="${rExt - 4}" fill="none" stroke="#f7f7f7" stroke-width="3" opacity=".7"/>
      <circle cx="${cx}" cy="${cy}" r="${rInt + 7}" fill="none" stroke="#e9e9e9" stroke-width="6"/>
      <circle cx="${cx}" cy="${cy}" r="${rInt}" fill="url(#${idp}fur)"/>
      ${furos.map((f) => f.real
        ? `<circle cx="${f.x}" cy="${f.y}" r="${DISCO.rFuro + 4}" fill="none" stroke="#f2f2f2" stroke-width="3"/>
           <circle cx="${f.x}" cy="${f.y}" r="${DISCO.rFuro}" fill="url(#${idp}fur)"/>`
        : `<circle cx="${f.x}" cy="${f.y}" r="4" fill="#8a8a8a"/><circle cx="${f.x}" cy="${f.y}" r="9" fill="none" stroke="#9a9a9a" stroke-opacity=".6"/>`).join("")}
    </g>`;
  }

  // Gráficos da ferramenta
  if (op.roi && op.mostrarRoi !== false) {
    const res = op.r;
    const f = (e.ferramentas || []).find((x) => x.id === op.roi) || {};
    const azul = "#2f7bff";
    const verde = "#2ee82e";
    const verm = "#ff3030";
    const corRoi = res && !res.ok && (res.valor === null || res.valor === undefined) ? verm : azul;
    const texto = (x, y, t, cor) => `<text x="${x}" y="${y}" fill="${cor}" font-size="30" font-family="Consolas, monospace" font-weight="700"
      paint-order="stroke" stroke="#000" stroke-width="5">${t}</text>`;

    if (f.tipo === "posicao") {
      s += `<rect x="290" y="190" width="420" height="420" fill="none" stroke="${res && !res.ok ? verm : azul}" stroke-width="4"/>`;
      if (res && res.ok) {
        s += `<rect x="${cx - rExt - 6}" y="${cy - rExt - 6}" width="${2 * rExt + 12}" height="${2 * rExt + 12}" fill="none" stroke="${verde}" stroke-width="3.5"/>
          <path d="M${cx - 26} ${cy}h52M${cx} ${cy - 26}v52" stroke="${verde}" stroke-width="4"/>
          <path d="M${cx} ${cy}L${cx} ${cy - DISCO.rPrimitivo}" stroke="${verde}" stroke-width="2.5" stroke-dasharray="8 6"/>`;
      }
    } else if (f.tipo === "diametro") {
      const rRef = f.alvo === "ext" ? 160 : 80;
      const faixa = f.alvo === "ext" ? 22 : 16;
      s += `<circle cx="${cx}" cy="${cy}" r="${rRef + faixa}" fill="none" stroke="${corRoi}" stroke-width="3.5"/>
        <circle cx="${cx}" cy="${cy}" r="${rRef - faixa}" fill="none" stroke="${corRoi}" stroke-width="3.5"/>`;
      if (res && res.valor !== null && res.valor !== undefined) {
        const r = res.valor * DISCO.pxmm / 2;
        const cor = res.ok ? verde : verm;
        s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${cor}" stroke-width="3.5"/>
          <path d="M${cx - r} ${cy}H${cx + r}" stroke="${cor}" stroke-width="2.5"/>
          <path d="M${cx - r} ${cy - 10}v20M${cx + r} ${cy - 10}v20M${cx - 12} ${cy}h24M${cx} ${cy - 12}v24" stroke="${cor}" stroke-width="3"/>
          ${texto(cx - 105, f.alvo === "ext" ? cy - rExt - 34 : cy - 18, "Ø" + res.valor.toFixed(3), cor)}`;
      }
    } else if (f.tipo === "contagem") {
      s += `<circle cx="${cx}" cy="${cy}" r="${DISCO.rPrimitivo + 30}" fill="none" stroke="${res && !res.ok ? verm : azul}" stroke-width="3.5"/>
        <circle cx="${cx}" cy="${cy}" r="${DISCO.rPrimitivo - 30}" fill="none" stroke="${res && !res.ok ? verm : azul}" stroke-width="3.5"/>`;
      if (res && res.valor !== null && res.valor !== undefined) {
        const reais = furos.filter((x) => x.real);
        s += reais.map((x, i) => `<circle cx="${x.x}" cy="${x.y}" r="${DISCO.rFuro + 6}" fill="none" stroke="${verde}" stroke-width="3"/>
          ${texto(x.x + 22, x.y - 18, i + 1, verde)}`).join("");
        s += texto(cx - 46, cy + 12, "N=" + res.valor, res.ok ? verde : verm);
      }
    }
  }
  return s + "</svg>";
}

const VIEWBOX_THUMB = { etiqueta: "180 190 700 580", furos: "230 130 540 540" };
function cena(e, op = {}) {
  return e.tipo === "furos" ? cenaDisco(e, op) : cenaEtiqueta(e, op);
}

// =====================================================================
// DESENHO DA TELA
// =====================================================================
const resultadoDe = (id) => estado && estado.ultimaLeitura && estado.ultimaLeitura.resultados
  ? estado.ultimaLeitura.resultados.find((r) => r.id === id) : null;
const ferramentas = () => (estado && estado.ferramentas) || FERRAMENTAS_PADRAO;
const fmtMs = (v) => (v === null || v === undefined ? "---.-" : v >= 100000 ? ">99999" : v.toFixed(1)) + "\u00a0\u00a0ms";

let chaveThumbs = "";
function desenharThumbs() {
  const lista = ferramentas();
  const r = (id) => resultadoDe(id);
  const chave = JSON.stringify([estado && estado.tipo, estado && estado.peca, estado && estado.falhas, ferramentaSel,
    lista.map((f) => (r(f.id) ? [r(f.id).ok, r(f.id).valor] : null))]);
  if (chave === chaveThumbs) return;
  chaveThumbs = chave;

  $("thumbs").innerHTML = lista.map((f) => {
    const res = r(f.id);
    const img = estado ? cena(estado, { id: "t" + f.id, roi: f.id, r: res, viewBox: VIEWBOX_THUMB[estado.tipo] }) : "";
    return `<button type="button" class="thumb" role="tab" data-id="${f.id}" aria-selected="${f.id === ferramentaSel}"
        data-r="${res ? (res.ok ? "ok" : "ng") : "nenhum"}" title="${f.id} ${f.nome}">
      <div class="thumb-img">${img}</div>
      <div class="thumb-nome">${f.nome}</div>
    </button>`;
  }).join("");
}

let chaveCena = "";
function desenharImagem() {
  const img = $("cena");
  if (!estado) { img.innerHTML = ""; chaveCena = ""; return; }
  const res = resultadoDe(ferramentaSel);
  const chave = JSON.stringify([estado.tipo, estado.peca, estado.falhas, ferramentaSel, res && [res.ok, res.valor], mostrarRoi]);
  if (chave !== chaveCena) {
    chaveCena = chave;
    img.innerHTML = cena(estado, { id: "m", roi: ferramentaSel, r: res, mostrarRoi });
  }
  const svg = img.querySelector("svg");
  if (svg) svg.style.transform = `scale(${zoom})`;
}

function aplicarFiltroImagem() {
  const brt = Number($("selBrt").value);
  const modo = document.querySelector(".cv-img-modos .ativo").dataset.filtro;
  const extra = modo === "binaria" ? " grayscale(1) contrast(7)" : modo === "cor" ? " sepia(1) saturate(5) hue-rotate(170deg)" : "";
  $("cena").style.filter = `brightness(${brt})${extra}`;
}

// ---- Painel de detalhe ----
const ICONE_CODIGO = `<svg viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" fill="#fff" stroke="#3fd43f" stroke-width="2"/>
  <path d="${qrPath("icone", 21)}" transform="translate(2.5 2.5) scale(.9)" fill="#222"/></svg>`;
const ICONE_POSICAO = `<svg viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" fill="#fff" stroke="#3fd43f" stroke-width="2"/>
  <rect x="5" y="6" width="14" height="12" fill="none" stroke="#2f7bff" stroke-width="2"/><path d="M12 3v18M3 12h18" stroke="#222" stroke-width="1.5"/></svg>`;

const ICONE_DIAMETRO = `<svg viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" fill="#fff" stroke="#3fd43f" stroke-width="2"/>
  <circle cx="12" cy="12" r="7.5" fill="none" stroke="#2f7bff" stroke-width="2"/><path d="M4.5 12h15M4.5 10v4M19.5 10v4" stroke="#222" stroke-width="1.5"/></svg>`;
const ICONE_CONTAGEM = `<svg viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" fill="#fff" stroke="#3fd43f" stroke-width="2"/>
  <circle cx="7.5" cy="8" r="2.6" fill="#222"/><circle cx="16.5" cy="8" r="2.6" fill="#222"/><circle cx="7.5" cy="16" r="2.6" fill="#222"/>
  <circle cx="16.5" cy="16" r="2.6" fill="#222"/></svg>`;
const ICONES = { codigo: ICONE_CODIGO, posicao: ICONE_POSICAO, diametro: ICONE_DIAMETRO, contagem: ICONE_CONTAGEM };

function cabecalhoFerramenta(f, res) {
  return `<div class="det-cab" data-r="${res ? (res.ok ? "ok" : "ng") : "nenhum"}">
    <div class="det-id">${f.id}</div>
    <div class="det-titulo">${f.nome}</div>
    <div class="det-ico">${ICONES[f.tipo] || ICONE_POSICAO}</div>
    <div class="det-sub">${f.nome}</div>
    <div class="det-tempo">${res ? res.tempoMs.toFixed(1) + "ms" : ""}</div>
  </div>`;
}

const linha = (rot, val, cls = "") => `<div class="det-rot">${rot}</div><div class="det-val ${cls}">${val}</div>`;

function paginacao() {
  const lista = ferramentas();
  const i = lista.findIndex((f) => f.id === ferramentaSel);
  return `<div class="det-pag"><span>${i + 1}/${lista.length}</span>
    <div class="setas"><button type="button" data-pag="-1" aria-label="Ferramenta anterior">&#9664;</button>
    <button type="button" data-pag="1" aria-label="Próxima ferramenta">&#9654;</button></div></div>`;
}

function detalheExecucao() {
  const f = ferramentas().find((x) => x.id === ferramentaSel);
  const res = resultadoDe(f.id);
  let h = cabecalhoFerramenta(f, res) + '<div class="det-linhas">';
  if (f.tipo === "codigo") {
    h += linha("Dados&nbsp;&nbsp;lidos", res ? (res.ok ? esc(res.dados) : "") : "", res && !res.ok ? "ng" : "");
    h += linha("Padrão&nbsp;&nbsp;de&nbsp;&nbsp;ref", "", "vazio");
    h += linha("Resit&nbsp;&nbsp;do&nbsp;&nbsp;confrt", res ? (res.ok ? "OK" : "NG") : "", res && !res.ok ? "ng" : "");
    h += linha("Tx&nbsp;&nbsp;de&nbsp;&nbsp;corr&nbsp;&nbsp;de&nbsp;&nbsp;erro&nbsp;&nbsp;não&nbsp;&nbsp;usada",
      res ? (res.ok ? res.taxaErro + "%" : "-----") : "", "num");
    h += linha("Resol&nbsp;&nbsp;do&nbsp;&nbsp;cód", res ? (res.ok ? res.resolucao.toFixed(3) : "-----") : "", "num");
  } else if (f.tipo === "diametro" || f.tipo === "contagem") {
    const tem = res && res.valor !== null && res.valor !== undefined;
    const lim = (res && res.limites) || (estado.config.limites || {})[f.alvo || "furos"] || {};
    const fmt = (v) => (f.tipo === "diametro" ? Number(v).toFixed(3) : String(v));
    h += linha(f.tipo === "diametro" ? "Diâmetro&nbsp;&nbsp;(mm)" : "Contagem",
      res ? (tem ? fmt(res.valor) : "-----") : "", "grande" + (res && !res.ok ? " ng" : ""));
    h += linha("Limite&nbsp;&nbsp;superior", lim.max !== undefined ? fmt(lim.max) : "", "lim");
    h += linha("Limite&nbsp;&nbsp;inferior", lim.min !== undefined ? fmt(lim.min) : "", "lim");
    h += linha("Julgamento", res ? (res.ok ? "OK" : "NG") : "", res && !res.ok ? "ng" : "");
    if (f.tipo === "diametro") {
      h += linha("Centro&nbsp;&nbsp;X&nbsp;&nbsp;/&nbsp;&nbsp;Y", tem ? `${res.centroX.toFixed(3)} / ${res.centroY.toFixed(3)}` : res ? "-----" : "", "num");
    } else {
      h += linha("Área&nbsp;&nbsp;média&nbsp;&nbsp;(px)", tem ? String(res.areaMedia) : res ? "-----" : "", "num");
    }
  } else {
    h += linha("Correlação", res ? String(res.correlacao) : "", res && !res.ok ? "ng" : "");
    h += linha("Julgamento", res ? (res.ok ? "OK" : "NG") : "", res && !res.ok ? "ng" : "");
    h += linha("Posição&nbsp;&nbsp;X", res && res.ok ? res.x.toFixed(3) : res ? "-----" : "", "num");
    h += linha("Posição&nbsp;&nbsp;Y", res && res.ok ? res.y.toFixed(3) : res ? "-----" : "", "num");
    h += linha("Ângulo", res && res.ok ? res.angulo.toFixed(2) + "°" : res ? "-----" : "", "num");
  }
  return h + "</div>" + paginacao();
}

function detalheLista() {
  const linhas = ferramentas().map((f) => {
    const r = resultadoDe(f.id);
    const dado = !r ? ""
      : f.tipo === "posicao" ? `Correlação ${r.correlacao}`
      : f.tipo === "diametro" ? (r.valor !== null && r.valor !== undefined ? `Ø ${r.valor.toFixed(3)} mm` : "sem medição")
      : f.tipo === "contagem" ? (r.valor !== null && r.valor !== undefined ? `${r.valor} furos` : "sem medição")
      : r.ok ? esc(r.dados) : "";
    return `<tr data-ir="${f.id}"><td>${f.id}</td>
      <td class="${r ? (r.ok ? "ok" : "ng") : ""}">${r ? (r.ok ? "OK" : "NG") : "-"}</td>
      <td class="dados">${dado}</td></tr>`;
  }).join("");
  return `<div class="det-titulo-sec">Lista de resultados</div>
    <table class="det-tabela"><thead><tr><th>Ferr.</th><th>Julg.</th><th>Dados</th></tr></thead><tbody>${linhas}</tbody></table>`;
}

function detalheHistorico() {
  const hist = (estado && estado.historico) || [];
  const linhas = hist.map((h) => `<tr><td>${new Date(h.quando).toLocaleTimeString("pt-BR")}</td>
    <td>${h.teste ? "teste" : h.totalCount}</td><td>${h.progHoraMs.toFixed(1)} ms</td>
    <td class="${h.ok ? "ok" : "ng"}">${h.ok ? "OK" : "NG"}</td></tr>`).join("");
  return `<div class="det-titulo-sec">Histórico (últimas ${hist.length})</div>
    <table class="det-tabela"><thead><tr><th>Hora</th><th>Cont</th><th>Prog. Hora</th><th>Status</th></tr></thead>
    <tbody>${linhas || '<tr><td colspan="4">Nenhuma inspeção ainda</td></tr>'}</tbody></table>`;
}

// ---- Modo programação ----
function detalheProgramacao() {
  const abas = [["ferramenta", "Ferramenta"], ["saida", "Saída EtherNet/IP"], ["programa", "Programa"]];
  let h = `<div class="prog-abas" role="tablist">${abas.map(([k, t]) =>
    `<button type="button" role="tab" data-aba="${k}" aria-selected="${k === abaProg}">${t}</button>`).join("")}</div>`;

  const e = estado;
  if (abaProg === "ferramenta") {
    const f = ferramentas().find((x) => x.id === ferramentaSel);
    h += cabecalhoFerramenta(f, resultadoDe(f.id));
    h += '<div class="prog-form">';
    if (f.tipo === "codigo") {
      const m = e.mapa[f.qr];
      h += `<div class="prog-campo">Tipo de código<span class="info">QR Code</span></div>
        <div class="prog-campo">Nº de caracteres<span class="info">${m.tamanho}</span></div>
        <div class="prog-campo">Saída EtherNet/IP<span class="info">${m.nome}: bytes ${m.byteInicial} a ${m.byteFinal} (1 caractere por INT32)</span></div>
        <div class="prog-campo">Atribuição de saída<span class="info">${atribuicoesDe(f.id)}</span></div>`;
    } else if (f.tipo === "diametro" || f.tipo === "contagem") {
      const alvo = f.alvo || "furos";
      const lim = e.config.limites[alvo];
      const passo = f.tipo === "diametro" ? "0.001" : "1";
      const m = e.mapa.find((x) => x.ferramenta === f.id);
      h += `</div><form class="prog-form" id="formLimites" data-alvo="${alvo}">
        <div class="prog-limites">
          <label class="prog-campo">Limite inferior${f.tipo === "diametro" ? " (mm)" : ""}<input id="limMin" type="number" step="${passo}" value="${lim.min}"></label>
          <label class="prog-campo">Limite superior${f.tipo === "diametro" ? " (mm)" : ""}<input id="limMax" type="number" step="${passo}" value="${lim.max}"></label>
        </div>
        <div class="prog-campo">Saída EtherNet/IP<span class="info">${m ? `${m.nome}: bytes ${m.byteInicial} a ${m.byteFinal}, ${m.tipoDado}` : "-"}</span></div>
        <div class="prog-campo">Atribuição de saída<span class="info">${atribuicoesDe(f.id)}</span></div>
        <button type="submit" class="prog-btn">Aplicar tolerância</button>`;
    } else {
      const modelo = e.tipo === "furos" ? "Contorno do disco" : "Etiqueta frontal da caixa";
      const efeito = e.tipo === "furos" ? "Se NG, as ferramentas de medição não medem (valor 0 na saída)." : "Se NG, todos os leitores dão NG.";
      h += `<div class="prog-campo">Modelo<span class="info">${modelo}</span></div>
        <div class="prog-campo">Limite de correlação<span class="info">60</span></div>
        <div class="prog-campo">Atribuição de saída<span class="info">${atribuicoesDe(f.id)}. ${efeito}</span></div>`;
    }
    h += `<p class="prog-nota">Selecione a ferramenta na faixa acima. A peça na frente da câmera é definida
      no Painel do simulador. Exec faz uma medição de teste, sem atualizar a saída para o CLP.</p>${
      f.tipo === "diametro" || f.tipo === "contagem" ? "</form>" : "</div>"}`;
  } else if (abaProg === "saida") {
    const c = e.config;
    h += `<form class="prog-form" id="formSaida">
      <div class="prog-linha">
        <label class="prog-campo">Byte inicial dos dados<input id="pOffset" type="number" min="24" max="1432" value="${c.offsetDados}"></label>
        ${e.tipo === "furos"
          ? `<label class="prog-campo">Formato das medidas<select id="pFormato">
               <option value="DINT" ${c.formato === "DINT" ? "selected" : ""}>DINT (mm x 1000)</option>
               <option value="REAL" ${c.formato === "REAL" ? "selected" : ""}>REAL (mm)</option></select></label>`
          : `<label class="prog-campo">Formato<input type="text" value="INT32 por caractere" disabled></label>`}
      </div>
      <div class="prog-campo">${e.tipo === "furos" ? "Sem medição (peça ausente ou fora de posição)" : "Na falha de leitura"}
        <div class="prog-radio">
          <label><input type="radio" name="pFalha" value="zerar" ${c.falhaZera ? "checked" : ""}> ${e.tipo === "furos" ? "Enviar zero" : "Zerar caracteres"}</label>
          <label><input type="radio" name="pFalha" value="manter" ${!c.falhaZera ? "checked" : ""}> Manter dado anterior</label>
        </div>
      </div>
      <div class="prog-campo">Atribuição de saída (bytes 4 a 11)
        <table class="atrib"><thead><tr><th>Endereço</th><th>Item a trans</th><th>Tempor da sd</th><th></th></tr></thead>
          <tbody id="atribLinhas">${e.config.saidas.map(linhaAtrib).join("")}</tbody></table>
        <button type="button" class="prog-btn-sec" id="btnAddAtrib">Adicionar linha</button>
      </div>
      <table class="prog-tab"><thead><tr><th>Dado</th><th>Bytes</th><th>Tipo</th><th>Ferr.</th></tr></thead><tbody>
        ${e.mapa.map((m) => `<tr><td>${m.nome}</td><td>${m.byteInicial} a ${m.byteFinal}</td><td>${m.tipoDado}</td><td>${m.ferramenta}</td></tr>`).join("")}
      </tbody></table>
      <button type="submit" class="prog-btn">Aplicar</button>
    </form>`;
  } else {
    h += `<form class="prog-form" id="formPrograma">
      <div class="prog-linha">
        <label class="prog-campo">Nº do programa<input id="pNum" type="number" min="0" max="999" value="${e.programa.numero}"></label>
        <label class="prog-campo">Nome<input id="pNome" type="text" maxlength="24" value="${esc(e.programa.nome)}"></label>
      </div>
      <label class="prog-campo">Tempo de processamento (BUSY), ms<input id="pTempo" type="number" min="20" max="10000" step="10" value="${e.config.tempoInspecaoMs}"></label>
      <p class="prog-nota">O BUSY precisa durar mais que o ciclo da tarefa do CLP que lê os sinais.</p>
      <button type="submit" class="prog-btn">Aplicar</button>
    </form>`;
  }
  return h;
}

// ---- Atribuição de saída (bytes 4..11), como a tabela do CV-X ----
const itensSaida = () => [["STATUS", "Status Total"], ...ferramentas().map((f) => [f.id, `${f.id} (${f.rotulo || f.nome})`])];
const endTexto = (byte, bit) => `${String(byte).padStart(4, "0")}:bit${bit}`;

function linhaAtrib(l) {
  let ends = "";
  for (let by = 4; by <= 11; by++) for (let bi = 0; bi <= 7; bi++) {
    const v = `${by}:${bi}`;
    ends += `<option value="${v}" ${by === l.byte && bi === l.bit ? "selected" : ""}>${endTexto(by, bi)}</option>`;
  }
  return `<tr>
    <td><select class="a-end" aria-label="Endereço">${ends}</select></td>
    <td><select class="a-item" aria-label="Item a transmitir">${itensSaida().map(([v, t]) =>
      `<option value="${v}" ${v === l.item ? "selected" : ""}>${t}</option>`).join("")}</select></td>
    <td><select class="a-tempo" aria-label="Temporização da saída">
      <option value="NG" ${l.tempo === "NG" ? "selected" : ""}>No estado NG</option>
      <option value="OK" ${l.tempo === "OK" ? "selected" : ""}>No estado OK</option></select></td>
    <td><button type="button" class="a-rem" aria-label="Remover linha">×</button></td>
  </tr>`;
}

function atribuicoesDe(id) {
  const l = estado.config.saidas.filter((x) => x.item === id);
  return l.length ? l.map((x) => `${endTexto(x.byte, x.bit)} no estado ${x.tempo}`).join(", ") : "Não atribuída na saída";
}

function desenharDetalhe() {
  const corpo = $("detCorpo");
  if (!estado) {
    corpo.innerHTML = `<div class="det-titulo-sec">Nenhum CLP conectado</div>
      <div class="det-linhas">${linha("Status", "Aguardando conexão EtherNet/IP", "num")}</div>`;
    return;
  }
  if (editandoProg) return;      // não redesenha formulário em edição
  if (estado.modo === "programacao" && vistaDetalhe === "detalhe") corpo.innerHTML = detalheProgramacao();
  else if (vistaDetalhe === "lista") corpo.innerHTML = detalheLista();
  else if (vistaDetalhe === "historico") corpo.innerHTML = detalheHistorico();
  else corpo.innerHTML = detalheExecucao();
}

// ---- Topo ----
function desenharTopo() {
  const tela = $("tela");
  tela.dataset.vazio = String(!estado);
  tela.dataset.modo = estado ? estado.modo : "execucao";
  tela.dataset.carregando = String(!!(estado && estado.sinais.carregando));
  if (!estado) {
    $("txtPrograma").innerHTML = "Conf. ---&nbsp;&nbsp;----";
    ["txtCont", "txtContNg"].forEach((i) => { $(i).textContent = "-"; });
    $("txtProgHora").textContent = fmtMs(null);
    $("txtInterv").textContent = fmtMs(null);
    $("cvStatus").dataset.r = "nenhum";
    $("txtStatus").textContent = "---";
    $("btnModo").innerHTML = "Modo<br>Programação";
    return;
  }
  const s = estado.sinais;
  $("txtPrograma").innerHTML = `Conf. ${String(estado.programa.numero).padStart(3, "0")}&nbsp;&nbsp;${esc(estado.programa.nome)}`;
  $("txtCont").textContent = s.totalCount;
  $("txtContNg").textContent = s.contNg;
  $("txtProgHora").textContent = fmtMs(s.progHoraMs);
  $("txtInterv").textContent = fmtMs(s.intervaloMs);
  const u = estado.ultimaLeitura;
  $("cvStatus").dataset.r = !u ? "nenhum" : u.ok ? "ok" : "ng";
  $("txtStatus").textContent = !u ? "---" : u.ok ? "OK" : "NG";
  $("btnModo").innerHTML = estado.modo === "programacao" ? "Modo<br>Execução" : "Modo<br>Programação";
}

function relogio() {
  const d = new Date();
  $("txtData").textContent = d.toLocaleDateString("pt-BR");
  $("txtHora").textContent = d.toLocaleTimeString("pt-BR");
}
setInterval(relogio, 1000);
relogio();

// =====================================================================
// PAINEL DO SIMULADOR
// =====================================================================
const camposMenores = [];
for (let j = 1; j <= 5; j++) {
  const l = document.createElement("label");
  l.className = "campo";
  l.innerHTML = `<span>QR menor ${j} (T10${j}) <small>0/10</small></span>
    <input type="text" maxlength="10" spellcheck="false" inputmode="numeric">`;
  $("camposMenores").appendChild(l);
  camposMenores.push({ input: l.querySelector("input"), cont: l.querySelector("small") });
}

let chaveFalhas = "";
let chaveCenarios = "";
function atualizarContadores() {
  const m = $("inpMaior").value.length;
  $("contMaior").textContent = `${m}/54`;
  $("contMaior").classList.toggle("erro", m !== 54);
  camposMenores.forEach((c) => {
    const n = c.input.value.length;
    c.cont.textContent = `${n}/10`;
    c.cont.classList.toggle("erro", n !== 10);
  });
}

function desenharPainel() {
  if (!estado) return;
  $("gaveta").dataset.tipo = estado.tipo;
  $("txtProgPainel").textContent =
    `Conf. ${String(estado.programa.numero).padStart(3, "0")} ${estado.programa.nome}: ${estado.descricaoTipo}`;
  $("tituloPeca").textContent = estado.tipo === "furos" ? "Disco na frente da câmera" : "Etiqueta na frente da câmera";

  const kc = JSON.stringify(estado.cenarios);
  if (kc !== chaveCenarios) {
    chaveCenarios = kc;
    $("listaCenarios").innerHTML = estado.cenarios.map((c) =>
      `<button type="button" class="btn" data-cenario="${c.id}">${esc(c.rotulo)}</button>`).join("");
  }
  const kf = JSON.stringify(estado.nomesFalha);
  if (kf !== chaveFalhas) {
    chaveFalhas = kf;
    $("listaFalhas").innerHTML = estado.nomesFalha.map((n, i) =>
      `<label data-falha="${i}"><input type="checkbox" data-falha="${i}"> ${esc(n)}</label>`).join("");
  }

  if (estado.tipo === "etiqueta" && !editandoEtiqueta) {
    $("inpMaior").value = estado.peca.maior;
    camposMenores.forEach((c, j) => { c.input.value = estado.peca.menores[j]; });
    atualizarContadores();
  }
  if (estado.tipo === "furos" && !editandoDisco) {
    const pc = estado.peca;
    $("inpDiamExt").value = pc.diamExt;
    $("inpDiamInt").value = pc.diamInt;
    $("inpFuros").value = pc.furos;
    $("inpRuido").value = pc.ruido;
    $("chkPresente").checked = pc.presente;
    $("chkForaPos").checked = pc.foraPosicao;
    $("avisoDisco").textContent = "";
  }
  document.querySelectorAll("#listaFalhas label").forEach((l) => {
    const i = Number(l.dataset.falha);
    l.classList.toggle("on", estado.falhas[i]);
    l.querySelector("input").checked = estado.falhas[i];
  });
  if (document.activeElement !== $("inpAutoIntervalo")) $("inpAutoIntervalo").value = estado.config.autoIntervaloMs;
  $("chkAuto").checked = estado.config.autoDisparo;
  desenharSinais();
  desenharMapa();
}

const led = (rot, on, cls = "") => `<li class="${cls}${on ? " on" : ""}">${rot}</li>`;
function desenharSinais() {
  const s = estado.sinais;
  const c = estado.clp;
  $("ledsClp").innerHTML = led("RUN", c.conectado && c.run) + led("TRG1", c.trg1) +
    led("Result ack", c.resultAck) + led("Error reset", c.errorReset);
  $("ledsCam").innerHTML = led("READY1", s.run && s.ready1) + led("ACK1", s.ack1) + led("BUSY", s.busy, "atencao") +
    led("Result ready", s.resultReady) + led("Result OR", s.resultOR, "ng") + led("ERROR", s.erro, "ng") + led("RUN", s.run);
  $("ledsJulg").innerHTML = estado.config.saidas.length
    ? estado.config.saidas.map((l) => {
        const on = (estado.bitsSaida[l.byte - 4] >> l.bit) & 1;
        return led(`${endTexto(l.byte, l.bit)} ${l.item === "STATUS" ? "Status Total" : l.item} ${l.tempo}`,
          on === 1, l.tempo === "NG" ? "ng" : "");
      }).join("")
    : "<li>nenhuma linha</li>";

  const box = $("conexaoIO");
  const cx = estado.conexoes || [];
  if (!cx.length) {
    box.className = "conexao-io";
    box.innerHTML = "Sem conexão de I/O aberta por este CLP.";
    return;
  }
  box.className = "conexao-io ativa";
  box.innerHTML = cx.map((k) => `<h3>Conexão: ${k.tipo}</h3><dl class="dados">
      <dt>Scanner</dt><dd>${k.ipOrigem}</dd>
      <dt>RPI</dt><dd>${k.rpiMs} ms / ${k.rpiO2TMs} ms</dd>
      <dt>Tamanhos</dt><dd>entrada ${k.tamanhoT2O} B, saída ${k.tamanhoO2T} B</dd>
      <dt>T->O</dt><dd>${k.multicast ? "multicast" : "ponto a ponto"} ${k.destino}</dd>
      <dt>Pacotes</dt><dd>${k.rx} rx / ${k.tx} tx</dd>
      <dt>Timeout CLP</dt><dd>${k.timeoutClpMs} ms (x${k.multiplicador})</dd>
      <dt>Maior intervalo</dt><dd>${k.maxIntervaloMs} ms${k.atrasos ? `, ${k.atrasos} atraso(s) acima do timeout` : ""}</dd></dl>
      ${k.timeoutClpMs < 1000 ? `<span class="aviso">Timeout do CLP de ${k.timeoutClpMs} ms é curto para um PC com Windows: use RPI 20 ms e multiplicador x64 (1,28 s).</span>` : ""}
      ${k.tamanhoT2O < estado.bytesNecessarios
        ? `<span class="aviso">Entrada com ${k.tamanhoT2O} bytes: aumente para pelo menos ${estado.bytesNecessarios} no scanner.</span>` : ""}`).join("");
}

let assinaturaBytes = "";
function regiao(o, mapa) {
  if (o <= 3) return { cls: "r-status", nome: "Bits de status" };
  if (o <= 11) return { cls: "r-julg", nome: "Atribuição de saída (Status Total e ferramentas)" };
  if (o <= 23) return { cls: "r-cont", nome: "Erro / Total count / Command result" };
  const i = mapa.findIndex((m) => o >= m.byteInicial && o <= m.byteFinal);
  if (i >= 0) {
    const m = mapa[i];
    return { cls: i % 2 ? "r-qr-b" : "r-qr-a",
      nome: m.porCaractere ? `${m.nome}[${Math.floor((o - m.byteInicial) / 4)}]` : `${m.nome} (${m.tipoDado})` };
  }
  return { cls: "", nome: "Não usado" };
}
function desenharMapa() {
  const e = estado;
  const ass = e.bytes.join(",") + "|" + e.config.offsetDados + "|" + e.tipo + "|" + e.config.formato;
  if (ass === assinaturaBytes) return;
  assinaturaBytes = ass;
  $("txtTamanho").textContent = `Mínimo no scanner: ${e.bytesNecessarios} bytes (dados até o byte ${e.bytesNecessarios - 1}).`;
  $("legenda").innerHTML =
    '<span><i style="background:var(--m-status)"></i>Status 0..3</span>' +
    '<span><i style="background:var(--m-julg)"></i>Atribuição 4..11</span>' +
    '<span><i style="background:var(--m-cont)"></i>Cont. 12..23</span>' +
    e.mapa.map((m, i) => `<span><i style="background:var(${i % 2 ? "--m-qr-b" : "--m-qr-a"})"></i>${m.nome} ${m.byteInicial}..${m.byteFinal}</span>`).join("");
  const total = Math.ceil(e.bytes.length / 16) * 16;
  let h = "<thead><tr><th>Byte</th>";
  for (let c = 0; c < 16; c++) h += `<th>${c.toString(16).toUpperCase()}</th>`;
  h += "<th>ASCII</th></tr></thead><tbody>";
  for (let l = 0; l < total; l += 16) {
    h += `<tr><td class="off">${l}</td>`;
    let a = "";
    for (let c = 0; c < 16; c++) {
      const o = l + c;
      const v = e.bytes[o];
      if (v === undefined) { h += "<td></td>"; continue; }
      const r = regiao(o, e.mapa);
      h += `<td class="${r.cls}${v ? " nz" : ""}" title="Byte ${o}: ${r.nome} = ${v}">${v.toString(16).padStart(2, "0").toUpperCase()}</td>`;
      a += v >= 32 && v <= 126 ? String.fromCharCode(v) : "·";
    }
    h += `<td class="ascii">${esc(a)}</td></tr>`;
  }
  $("tabelaHex").innerHTML = h + "</tbody>";
}

// =====================================================================
// DADOS GERAIS: abas dos CLPs, status EtherNet/IP, Utilidade
// =====================================================================
function desenharGeral(g) {
  geral = g;
  const online = g.sessoes.filter((x) => x.online);
  const emRun = online.filter((x) => x.run);
  $("statusEip").dataset.estado = !online.length ? "aguardando" : emRun.length ? "run" : "idle";
  $("statusEipTexto").textContent = !online.length ? "AGUARDANDO CLP"
    : `${online.length} de ${g.sessoes.length} câmera${g.sessoes.length > 1 ? "s" : ""} com CLP`;

  // Uma aba por câmera: nome, IP, CLP dono, programa e último resultado
  $("listaSessoes").innerHTML = g.sessoes.map((x) => `
    <div class="aba" role="tab" tabindex="0" data-id="${x.id}" aria-selected="${x.id === g.sessaoId}"
         data-estado="${!x.online ? "offline" : x.run ? "run" : "idle"}"
         title="${esc(x.nome)}: ${x.ip === "0.0.0.0" ? "todos os IPs" : x.ip}${x.clp ? ", CLP " + x.clp : ""}">
      <span class="led" aria-hidden="true"></span>
      <span>${esc(x.nome)}</span>
      <span class="aba-ip">${x.ip === "0.0.0.0" ? "todos os IPs" : x.ip}</span>
      ${x.erroRede ? '<span class="aba-erro">ERRO DE REDE</span>'
        : x.reaberturas ? '<span class="aba-erro" title="O CLP reabriu a conexão: não recebe os dados da câmera. Veja Utilidade.">CLP SEM T->O</span>'
        : `<span class="aba-info">${!x.online ? "sem CLP" : x.modo === "programacao" ? "PROG" : x.run ? "RUN" : "IDLE"} · ${String(x.programa).padStart(3, "0")}</span>`}
      ${x.ultimo ? `<span class="aba-ult ${x.ultimo}">${x.ultimo === "ok" ? "OK" : "NG"}</span>` : ""}
      ${!x.online && g.sessoes.length > 1 ? `<button type="button" class="aba-remover" data-remover="${x.id}" aria-label="Remover ${esc(x.nome)}">×</button>` : ""}
    </div>`).join("");

  desenharRede(g);

  if (g.sessaoId !== sessaoMostrada) {
    sessaoMostrada = g.sessaoId;
    editandoEtiqueta = false;
    editandoProg = false;
    assinaturaBytes = "";
    chaveCena = "";
    chaveThumbs = "";
  }
  estado = g.sessao ? { ...g.sessao, conexoes: g.eip.conexoes } : null;

  // Programa de outro tipo carregado: volta para a primeira ferramenta
  const tipo = estado ? estado.tipo + "|" + estado.programa.numero : null;
  if (tipo !== tipoMostrado) {
    tipoMostrado = tipo;
    if (estado && !estado.ferramentas.some((f) => f.id === ferramentaSel)) ferramentaSel = estado.ferramentas[0].id;
    if (estado && tipo) ferramentaSel = estado.ferramentas.some((f) => f.id === ferramentaSel) ? ferramentaSel : "T100";
    editandoProg = false;
    editandoEtiqueta = false;
    editandoDisco = false;
    chaveCena = "";
    chaveThumbs = "";
    assinaturaBytes = "";
  }
  desenharProgramas();

  desenharTopo();
  desenharThumbs();
  desenharImagem();
  desenharDetalhe();
  desenharPainel();
}

function desenharRede(g) {
  const ips = g.rede.ips.map((i) => i.ip).join(", ") || "nenhum IP de rede";
  const id = g.rede.identidade;
  $("dadosRede").innerHTML = `
    <dt>IPs deste PC</dt><dd>${ips}</dd>
    <dt>Atendendo em</dt><dd>${g.eip.ipEscuta === "0.0.0.0" ? "todos os IPs" : g.eip.ipEscuta}</dd>
    <dt>Portas</dt><dd>TCP 44818 / UDP ${g.camera ? g.camera.portaUdp : 2222} (I/O)</dd>
    <dt>Identidade</dt><dd>${id.nome} (vendor ${id.vendorId}, produto ${id.productCode}, rev ${id.revMajor}.${id.revMinor})</dd>
    <dt>Sessões TCP</dt><dd>${g.eip.sessoes}</dd>`;
  const cam = g.camera;
  // Erro de rede ou diagnóstico de "CLP não recebe o T->O"
  const reab = g.eip && g.eip.reaberturas;
  const msgs = [];
  if (cam && cam.erroRede) msgs.push(`Erro de rede: ${cam.erroRede}`);
  const atrasos = ((g.eip && g.eip.conexoes) || []).filter((k) => k.atrasos);
  if (atrasos.length) {
    const k = atrasos[0];
    msgs.push(`${k.atrasos} atraso(s) no envio para o CLP: houve intervalo de até ${k.maxIntervaloMs} ms entre pacotes, ` +
      `mas o CLP só tolera ${k.timeoutClpMs} ms (RPI x${k.multiplicador}). No CV_X400_Series, aba Connections, ` +
      "use RPI de 20 ms e multiplicador de timeout x64 (1,28 s).");
  }
  if (reab) {
    msgs.push(`O CLP reabriu a conexão ${reab} vez(es): ele não está recebendo os dados desta câmera (T->O). ` +
      "No mesmo PC do CODESYS, a causa mais comum é a disputa da porta UDP 2222: mude a \"Porta UDP de I/O\" " +
      "abaixo para 2223, aplique, e reinicie a aplicação no CODESYS.");
  }
  $("erroRede").hidden = !msgs.length;
  $("erroRede").textContent = msgs.join(" | ");
  const outrasUsam = (ip) => cam && ip !== cam.ip && g.ipsEmUso.includes(ip);
  if (!editandoRede && cam) {
    const op = [{ v: "0.0.0.0", t: "Todos os IPs (só com 1 câmera)" },
      ...g.rede.ips.map((i) => ({ v: i.ip, t: `${i.ip} (${i.interface})${outrasUsam(i.ip) ? " - em uso" : ""}`, off: outrasUsam(i.ip) }))];
    if (cam.ip !== "0.0.0.0" && !g.rede.ips.some((i) => i.ip === cam.ip)) op.push({ v: cam.ip, t: `${cam.ip} (não existe neste PC)` });
    $("selEscuta").innerHTML = op.map((o) => `<option value="${o.v}" ${o.off ? "disabled" : ""}>${esc(o.t)}</option>`).join("");
    $("selEscuta").value = cam.ip;
    $("inpIpClp").value = cam.ipClp || "";
    $("inpNomeCam").value = cam.nome;
    $("inpPortaUdp").value = cam.portaUdp;
  }
  if (!editandoNovaCam) {
    const livres = g.rede.ips.filter((i) => !g.ipsEmUso.includes(i.ip));
    $("novaCamIp").innerHTML = livres.length
      ? livres.map((i) => `<option value="${i.ip}">${i.ip} (${esc(i.interface)})</option>`).join("")
      : '<option value="">nenhum IP livre</option>';
  }
}

function esc(t) {
  return String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// =====================================================================
// AÇÕES
// =====================================================================
// Abas dos CLPs
$("listaSessoes").addEventListener("click", (ev) => {
  const rem = ev.target.closest("[data-remover]");
  if (rem) {
    ev.stopPropagation();
    if (confirm("Remover esta câmera do simulador?")) socket.emit("remover_sessao", rem.dataset.remover);
    return;
  }
  const aba = ev.target.closest(".aba");
  if (aba) socket.emit("selecionar_sessao", aba.dataset.id);
});
$("listaSessoes").addEventListener("keydown", (ev) => {
  const aba = ev.target.closest(".aba");
  if (aba && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); socket.emit("selecionar_sessao", aba.dataset.id); }
});

// Painel do simulador (abre/fecha)
$("btnGaveta").addEventListener("click", () => {
  const g = $("gaveta");
  g.hidden = !g.hidden;
  $("btnGaveta").setAttribute("aria-expanded", String(!g.hidden));
  ajustarEscala();
});

// Ferramentas
function selecionarFerramenta(id) {
  ferramentaSel = id;
  if (vistaDetalhe !== "detalhe") definirVista("detalhe");
  editandoProg = false;
  desenharThumbs();
  desenharImagem();
  desenharDetalhe();
}
$("thumbs").addEventListener("click", (ev) => {
  const t = ev.target.closest(".thumb");
  if (t) selecionarFerramenta(t.dataset.id);
});

$("detCorpo").addEventListener("click", (ev) => {
  const pag = ev.target.closest("[data-pag]");
  if (pag) {
    const lista = ferramentas();
    const i = lista.findIndex((f) => f.id === ferramentaSel);
    selecionarFerramenta(lista[(i + Number(pag.dataset.pag) + lista.length) % lista.length].id);
    return;
  }
  const tr = ev.target.closest("[data-ir]");
  if (tr) { selecionarFerramenta(tr.dataset.ir); return; }
  const aba = ev.target.closest("[data-aba]");
  if (aba) { abaProg = aba.dataset.aba; editandoProg = false; desenharDetalhe(); return; }
  if (ev.target.closest("#btnAddAtrib")) {
    // Próximo endereço livre
    const usados = new Set([...document.querySelectorAll("#atribLinhas .a-end")].map((s2) => s2.value));
    let livre = null;
    for (let by = 4; by <= 11 && !livre; by++) for (let bi = 0; bi <= 7 && !livre; bi++) {
      if (!usados.has(`${by}:${bi}`)) livre = { byte: by, bit: bi };
    }
    if (livre) {
      $("atribLinhas").insertAdjacentHTML("beforeend", linhaAtrib({ ...livre, item: "STATUS", tempo: "NG" }));
      editandoProg = true;
    }
    return;
  }
  const rem = ev.target.closest(".a-rem");
  if (rem) { rem.closest("tr").remove(); editandoProg = true; }
});
$("detCorpo").addEventListener("input", () => { editandoProg = true; });
$("detCorpo").addEventListener("change", () => { editandoProg = true; });
$("detCorpo").addEventListener("submit", (ev) => {
  ev.preventDefault();
  editandoProg = false;
  if (ev.target.id === "formSaida") {
    socket.emit("set_config", {
      offsetDados: Number($("pOffset").value),
      falhaZera: document.querySelector('input[name="pFalha"]:checked').value === "zerar",
      ...($("pFormato") ? { formato: $("pFormato").value } : {}),
    });
    const linhas = [...document.querySelectorAll("#atribLinhas tr")].map((tr) => {
      const [byte, bit] = tr.querySelector(".a-end").value.split(":").map(Number);
      return { byte, bit, item: tr.querySelector(".a-item").value, tempo: tr.querySelector(".a-tempo").value };
    });
    socket.emit("set_saidas", linhas);
  } else if (ev.target.id === "formLimites") {
    const alvo = ev.target.dataset.alvo;
    socket.emit("set_limites", { [alvo]: { min: Number($("limMin").value), max: Number($("limMax").value) } });
  } else if (ev.target.id === "formPrograma") {
    socket.emit("set_programa", { numero: Number($("pNum").value), nome: $("pNome").value });
    socket.emit("set_config", { tempoInspecaoMs: Number($("pTempo").value) });
  }
});

function definirVista(v) {
  vistaDetalhe = vistaDetalhe === v ? "detalhe" : v;
  $("btnLista").setAttribute("aria-pressed", String(vistaDetalhe === "lista"));
  $("btnHistorico").setAttribute("aria-pressed", String(vistaDetalhe === "historico"));
  editandoProg = false;
  desenharDetalhe();
}
$("btnLista").addEventListener("click", () => definirVista("lista"));
$("btnHistorico").addEventListener("click", () => definirVista("historico"));

// Exec (execução: dispara; programação: medição de teste)
$("btnExec").addEventListener("click", () => socket.emit("disparar", false));

// Modo
$("btnModo").addEventListener("click", () => {
  if (!estado) return;
  editandoProg = false;
  socket.emit("set_modo", estado.modo === "programacao" ? "execucao" : "programacao");
});
// =====================================================================
// PROGRAMAS: lista, carregar, criar, duplicar, excluir
// =====================================================================
function desenharProgramas() {
  if (!estado) return;
  $("listaProgramas").innerHTML = estado.programas.map((p) => {
    const atual = p.numero === estado.programa.numero;
    return `<tr class="${atual ? "atual" : ""}">
      <td class="num">${String(p.numero).padStart(3, "0")}</td><td>${esc(p.nome)}</td><td>${esc(p.descricao)}</td>
      <td class="acoes">${atual
        ? '<span class="tag">Carregado</span>'
        : `<button type="button" class="btn-escuro" data-carregar="${p.numero}" ${estado.sinais.busy || estado.sinais.carregando ? "disabled" : ""}>Carregar</button>
           <button type="button" class="btn-escuro sec" data-excluir="${p.numero}">Excluir</button>`}</td></tr>`;
  }).join("");
  if (!$("novoTipo").options.length) {
    $("novoTipo").innerHTML = estado.tipos.map((t) => `<option value="${t.tipo}">${esc(t.descricao)}</option>`).join("");
  }
}

$("btnPrograma").addEventListener("click", () => {
  if (!estado) return;
  desenharProgramas();
  $("modalProgramas").hidden = false;
});
$("modalProgramas").addEventListener("click", (ev) => {
  if (ev.target === $("modalProgramas") || ev.target.closest("[data-fechar]")) { $("modalProgramas").hidden = true; return; }
  const c = ev.target.closest("[data-carregar]");
  if (c) {
    socket.emit("carregar_programa", Number(c.dataset.carregar));
    $("modalProgramas").hidden = true;
    return;
  }
  const x = ev.target.closest("[data-excluir]");
  if (x && confirm(`Excluir o programa ${x.dataset.excluir.padStart(3, "0")}?`)) socket.emit("excluir_programa", Number(x.dataset.excluir));
});
$("formNovoProg").addEventListener("submit", (ev) => {
  ev.preventDefault();
  socket.emit("novo_programa", { numero: Number($("novoNum").value), nome: $("novoNome").value, tipo: $("novoTipo").value });
  ev.target.reset();
});
$("btnDuplicar").addEventListener("click", () => {
  if (!$("novoNum").value || !$("novoNome").value) { $("formNovoProg").reportValidity(); return; }
  socket.emit("novo_programa", { numero: Number($("novoNum").value), nome: $("novoNome").value, duplicar: true });
  $("formNovoProg").reset();
});

// Imagem
$("selBrt").addEventListener("change", aplicarFiltroImagem);
document.querySelectorAll(".cv-img-modos button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".cv-img-modos button").forEach((x) => x.classList.toggle("ativo", x === b));
  aplicarFiltroImagem();
}));
function definirGraficos(on) {
  mostrarRoi = on;
  document.querySelectorAll(".cv-img-onoff button").forEach((x) => x.classList.toggle("ativo", (x.dataset.graf === "on") === on));
  $("btnRoi").setAttribute("aria-pressed", String(on));
  desenharImagem();
}
document.querySelectorAll(".cv-img-onoff button").forEach((b) => b.addEventListener("click", () => definirGraficos(b.dataset.graf === "on")));
$("btnRoi").addEventListener("click", () => definirGraficos(!mostrarRoi));

function definirZoom(z) {
  zoom = Math.min(8, Math.max(0.5, z));
  $("txtZoom").textContent = Math.round(49 * zoom) + "%";
  desenharImagem();
}
$("btnZoomMais").addEventListener("click", () => definirZoom(zoom * 1.25));
$("btnZoomMenos").addEventListener("click", () => definirZoom(zoom / 1.25));
$("btnZoomAjuste").addEventListener("click", () => definirZoom(1));
$("btnAmpliar").addEventListener("click", () => $("tela").classList.toggle("img-ampliada"));

// Utilidade
function abrirUtil() { $("modalUtil").hidden = false; }
$("btnUtil").addEventListener("click", abrirUtil);
$("btnEngrenagem").addEventListener("click", abrirUtil);
$("modalUtil").addEventListener("click", (ev) => {
  if (ev.target === $("modalUtil") || ev.target.closest("[data-fechar]")) {
    $("modalUtil").hidden = true; editandoRede = false; editandoNovaCam = false;
  }
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") { $("modalUtil").hidden = true; $("modalProgramas").hidden = true; }
});
$("formRede").addEventListener("input", () => { editandoRede = true; });
$("formRede").addEventListener("change", () => { editandoRede = true; });
$("formRede").addEventListener("submit", (ev) => {
  ev.preventDefault();
  editandoRede = false;
  socket.emit("set_rede", { ipEscuta: $("selEscuta").value, ipClp: $("inpIpClp").value, nome: $("inpNomeCam").value,
    portaUdp: Number($("inpPortaUdp").value) });
});

// Adicionar câmera
let editandoNovaCam = false;
$("formNovaCamera").addEventListener("input", () => { editandoNovaCam = true; });
$("formNovaCamera").addEventListener("change", () => { editandoNovaCam = true; });
$("formNovaCamera").addEventListener("submit", (ev) => {
  ev.preventDefault();
  editandoNovaCam = false;
  if (!$("novaCamIp").value) return;
  socket.emit("adicionar_camera", { nome: $("novaCamNome").value, ip: $("novaCamIp").value, ipClp: $("novaCamClp").value });
  ev.target.reset();
  $("modalUtil").hidden = true;
});
$("btnNovaCamera").addEventListener("click", () => {
  abrirUtil();
  $("tituloNovaCamera").scrollIntoView({ block: "start" });
  $("novaCamNome").focus();
});
$("btnZerar").addEventListener("click", () => socket.emit("zerar_contagem"));

// Painel: etiqueta, cenários, falhas, disparo
$("listaCenarios").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-cenario]");
  if (!b) return;
  editandoEtiqueta = false;
  editandoDisco = false;
  socket.emit("cenario", b.dataset.cenario, $("chkTodos").checked);
});
$("formDisco").addEventListener("input", () => {
  editandoDisco = true;
  $("avisoDisco").textContent = "Alterações ainda não aplicadas";
});
$("formDisco").addEventListener("submit", (ev) => {
  ev.preventDefault();
  editandoDisco = false;
  socket.emit("set_peca", {
    diamExt: Number($("inpDiamExt").value), diamInt: Number($("inpDiamInt").value),
    furos: Number($("inpFuros").value), ruido: Number($("inpRuido").value),
    presente: $("chkPresente").checked, foraPosicao: $("chkForaPos").checked,
  });
});
$("formEtiqueta").addEventListener("input", () => {
  editandoEtiqueta = true;
  atualizarContadores();
  $("avisoEtiqueta").textContent = "Alterações ainda não aplicadas";
});
$("formEtiqueta").addEventListener("submit", (ev) => {
  ev.preventDefault();
  editandoEtiqueta = false;
  socket.emit("set_peca", { maior: $("inpMaior").value, menores: camposMenores.map((c) => c.input.value) });
  $("avisoEtiqueta").textContent = "";
});
$("listaFalhas").addEventListener("change", () => {
  const lista = [...document.querySelectorAll("#listaFalhas input")].map((i) => i.checked);
  socket.emit("set_falhas", lista);
});
function enviarAuto() {
  socket.emit("set_config", { autoDisparo: $("chkAuto").checked, autoIntervaloMs: Number($("inpAutoIntervalo").value) });
}
$("chkAuto").addEventListener("change", enviarAuto);
$("inpAutoIntervalo").addEventListener("change", enviarAuto);
$("btnDispararTodos").addEventListener("click", () => socket.emit("disparar", true));
$("btnLimparLog").addEventListener("click", () => { $("logLista").innerHTML = ""; });

// =====================================================================
// SERVIDOR
// =====================================================================
socket.on("estado", desenharGeral);

// ---------------------------------------------------------------------
// FLASH DA ILUMINAÇÃO
// A cada trigger a câmera dispara a iluminação. Para não virar um pisca
// rápido (triggers muito seguidos), no máximo 2 flashes por segundo.
// ---------------------------------------------------------------------
let ultimoFlash = 0;
function flashIluminacao() {
  if (!$("chkFlash").checked || !estado) return;
  const agora = performance.now();
  if (agora - ultimoFlash < 500) return;
  ultimoFlash = agora;
  const f = $("cvFlash");
  const img = $("cvImg");
  f.classList.remove("ativo");
  void f.offsetWidth;               // reinicia a animação
  f.classList.add("ativo");
  img.classList.add("flash");
  setTimeout(() => img.classList.remove("flash"), 180);
}
socket.on("flash", flashIluminacao);
socket.on("log", ({ linha: l }) => {
  const li = document.createElement("li");
  li.textContent = l;
  if (/erro|recusado|timeout|NG|ignorado/i.test(l)) li.classList.add("erro");
  const lista = $("logLista");
  lista.prepend(li);
  while (lista.children.length > 200) lista.lastElementChild.remove();
});
socket.on("disconnect", () => {
  $("statusEip").dataset.estado = "aguardando";
  $("statusEipTexto").textContent = "SERVIDOR PARADO";
});

aplicarFiltroImagem();
ajustarEscala();
