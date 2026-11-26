/* Bancada CFW500 - displays desenhados em canvas (a mesma função serve a textura 3D e o painel lateral). */
(function (g) {
  'use strict';
  const SIM = g.SIM = g.SIM || {};
  // segmentos: a (topo), b, c, d (base), e, f, g (meio)
  const SEG = { '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '', A: 'abcefg', b: 'cdefg',
    C: 'adef', d: 'bcdeg', E: 'adefg', F: 'aefg', H: 'bcefg', L: 'def', n: 'ceg', o: 'cdeg', P: 'abefg', r: 'eg', S: 'acdfg', t: 'defg', u: 'cde', U: 'bcdef', O: 'abcdef', B: 'cdefg', D: 'bcdeg', c: 'deg' };

  function digito(ctx, ch, x, y, w, h, cor, fantasma) {
    const t = Math.max(2, w * 0.17), s = t * 0.35, on = SEG[ch] !== undefined ? SEG[ch] : SEG[ch.toUpperCase()] || SEG[ch.toLowerCase()] || '';
    const hz = (x0, y0, len) => { ctx.beginPath(); ctx.moveTo(x0 + s, y0); ctx.lineTo(x0 + t * 0.5 + s, y0 - t / 2); ctx.lineTo(x0 + len - t * 0.5 - s, y0 - t / 2); ctx.lineTo(x0 + len - s, y0); ctx.lineTo(x0 + len - t * 0.5 - s, y0 + t / 2); ctx.lineTo(x0 + t * 0.5 + s, y0 + t / 2); ctx.closePath(); ctx.fill(); };
    const vt = (x0, y0, len) => { ctx.beginPath(); ctx.moveTo(x0, y0 + s); ctx.lineTo(x0 + t / 2, y0 + t * 0.5 + s); ctx.lineTo(x0 + t / 2, y0 + len - t * 0.5 - s); ctx.lineTo(x0, y0 + len - s); ctx.lineTo(x0 - t / 2, y0 + len - t * 0.5 - s); ctx.lineTo(x0 - t / 2, y0 + t * 0.5 + s); ctx.closePath(); ctx.fill(); };
    const m = h / 2, des = { a: () => hz(x, y, w), g: () => hz(x, y + m, w), d: () => hz(x, y + h, w), f: () => vt(x, y, m), b: () => vt(x + w, y, m), e: () => vt(x, y + m, m), c: () => vt(x + w, y + m, m) };
    for (const k in des) { ctx.fillStyle = on.includes(k) ? cor : fantasma; if (on.includes(k) || fantasma) des[k](); }
  }
  /** Escreve um texto em 7 segmentos alinhado à direita em n casas; o ponto decimal fica entre os dígitos. */
  function sete(ctx, txt, x, y, w, h, n, cor, fantasma) {
    const chars = []; for (const ch of String(txt)) { if ((ch === '.' || ch === ',') && chars.length) chars[chars.length - 1].p = true; else chars.push({ ch }); }
    while (chars.length < n) chars.unshift({ ch: ' ' });
    const passo = w * 1.42, usa = chars.slice(-n);
    usa.forEach((c, i) => { digito(ctx, c.ch, x + i * passo, y, w, h, cor, fantasma); if (c.p) { ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(x + i * passo + w + w * 0.2, y + h + 1, Math.max(1.6, w * 0.1), 0, 7); ctx.fill(); } });
  }

  /** Display da HMI do CFW500, no arranjo do produto: grupo do menu e estados em cima à esquerda, display secundário em
   *  cima à direita, display principal grande no meio com a unidade à direita, barra de 0 a 100 embaixo.
   *  d = hmi.display(). Proporção 1,62 : 1 (desenho lógico de 324 x 200). */
  SIM.desenhaHMI = function (ctx, W, H, d) {
    ctx.save(); ctx.scale(W / 324, H / 200);
    const aceso = d.on && d.luz !== false;
    ctx.fillStyle = !d.on ? '#8f9673' : aceso ? '#d6e24a' : '#b7bf6c'; ctx.fillRect(0, 0, 324, 200);
    ctx.strokeStyle = !d.on ? '#747b5c' : '#a9b83a'; ctx.lineWidth = 4; ctx.strokeRect(0, 0, 324, 200);
    if (!d.on) { ctx.restore(); return; }
    const sombra = ctx.createLinearGradient(0, 0, 0, 22); sombra.addColorStop(0, 'rgba(0,0,0,0.10)'); sombra.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = sombra; ctx.fillRect(2, 2, 320, 22);
    const tinta = '#1b1d10', fant = 'rgba(27,29,16,0.045)';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const rot = (t, x, y, px, on) => { if (!on) return; ctx.font = `700 ${px}px Arial, Helvetica, sans-serif`; ctx.fillStyle = tinta; ctx.fillText(t, x, y); };
    const inclinado = (des) => { ctx.save(); ctx.transform(1, 0, -0.123, 1, 0, 0); des(); ctx.restore(); };          // dígitos levemente inclinados, como no LCD real
    const tudo = !!d.boot, pisc3 = Math.floor(Date.now() / 300) % 2 === 0;
    // grupo do menu (só o ativo aparece) e estados
    if (tudo) ['PARAM', 'READ', 'MODIF', 'BASIC'].forEach((m, i) => rot(m, 14, 16 + i * 12, 10, true));
    else if (d.menu !== null && d.menu !== undefined && !(d.menuPisca && Math.floor(Date.now() / 350) % 2 === 0)) rot(SIM.params.MENUS[d.menu], 14, 16, 11, true);
    rot('LOC', 92, 16, 10.5, tudo || d.loc); rot('REM', 92, 29, 10.5, tudo || d.rem); rot('CONF', 124, 16, 10.5, tudo || d.conf); rot('SUB', 124, 29, 10.5, tudo || d.sub); rot('RUN', 124, 43, 10.5, tudo || d.run);
    if (tudo || !(d.giroPisca && pisc3)) {                                   // seta do sentido de giro: horária ou espelhada
      const h = tudo || d.horario; ctx.save(); ctx.translate(101, 43); if (!h) ctx.scale(-1, 1);
      ctx.strokeStyle = ctx.fillStyle = tinta; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 5.2, -0.6, 4.1); ctx.stroke(); ctx.beginPath(); ctx.moveTo(1.6, -7.6); ctx.lineTo(7.6, -4.2); ctx.lineTo(2.6, -0.6); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    // display secundário (5 dígitos) e principal (5 dígitos)
    inclinado(() => sete(ctx, tudo ? '88888' : (d.sec === undefined ? '' : d.sec), 181, 15, 18.5, 29, 5, tinta, fant));
    inclinado(() => sete(ctx, tudo ? '88888' : (d.mainOculto || d.main === undefined ? '' : d.main), 78, 71, 28.5, 52, 5, tinta, fant));
    ctx.textAlign = 'right'; rot(tudo ? 'Hz' : (d.unMain || ''), 314, 82, 11, true);
    if (!tudo && d.unSec && d.modo === 'par') rot(d.unSec, 314, 54, 8.5, true);
    ctx.textAlign = 'left';
    // barra de 10 segmentos e escala
    const nb = tudo ? 10 : Math.round((d.barra || 0) * 10); for (let i = 0; i < 10; i++) { ctx.fillStyle = i < nb ? tinta : fant; ctx.fillRect(23 + i * 27.9, 163, 26, 6.5); }
    ctx.font = '700 8.5px Arial, Helvetica, sans-serif'; ctx.fillStyle = tinta; ctx.fillText('0', 23, 189); ctx.textAlign = 'center'; ctx.fillText('50', 162, 189); ctx.textAlign = 'right'; ctx.fillText('100', 301, 189);
    ctx.restore();
  };

  /** Display do multímetro. L = bancada.leitura */
  SIM.desenhaMulti = function (ctx, W, H, L) {
    ctx.fillStyle = L.modo === 'OFF' ? '#59625a' : '#b9c7a8'; ctx.fillRect(0, 0, W, H);
    if (L.modo === 'OFF') return;
    const k = W / 200; ctx.save(); ctx.scale(k, H / 90);
    const tinta = '#141a12', fant = 'rgba(20,26,18,0.07)';
    const neg = L.txt[0] === '-'; if (neg) { ctx.fillStyle = tinta; ctx.fillRect(6, 44, 12, 4); }
    sete(ctx, L.txt.replace('-', ''), 26, 16, 22, 54, 4, tinta, fant);
    ctx.fillStyle = tinta; ctx.font = '700 15px Arial'; ctx.textBaseline = 'alphabetic'; ctx.fillText(L.un || '', 158, 72);
    ctx.font = '700 9px Arial'; ctx.fillText(L.modo === 'V~' ? 'AC' : L.modo === 'V⎓' ? 'DC' : '', 160, 22); if (L.bip) ctx.fillText('•)))', 160, 36); if (L.erro) ctx.fillText('TENSÃO!', 150, 36);
    ctx.restore();
  };

  /** Display do gerador de sinal. */
  SIM.desenhaGerador = function (ctx, W, H, st) {
    ctx.fillStyle = '#c3d3b4'; ctx.fillRect(0, 0, W, H); const k = W / 160; ctx.save(); ctx.scale(k, H / 70);
    sete(ctx, st.valor.toFixed(st.modo === 'V' ? 2 : 1), 12, 12, 17, 42, 4, '#141a12', 'rgba(20,26,18,0.07)');
    ctx.fillStyle = '#141a12'; ctx.font = '700 15px Arial'; ctx.fillText(st.modo === 'V' ? 'V' : 'mA', 122, 54); ctx.restore();
  };
  // ---------------------------------------------------------------- osciloscópio
  const congelado = {};
  const txTempo = (t) => (t < 0.001 ? (t * 1e6).toFixed(0) + ' µs' : (t * 1000).toFixed(0) + ' ms'), txVolt = (v) => (v < 1 ? (v * 1000).toFixed(0) + ' mV' : v + ' V');
  /** Monta o que a tela do osciloscópio mostra: base de tempo, os dois canais (mínimo e máximo por coluna) e as medidas. */
  SIM.dadosOsc = function (banc, colunas) {
    const o = banc.porTipo('osc'); if (!o) return null; const s = o.st;
    if (s.parado && congelado[colunas]) return Object.assign(congelado[colunas], { parado: true });
    const tb = SIM.OSC_TB[s.tb], d = { tb, tbTxt: txTempo(tb), pos: s.pos || 0, filtro: !!s.filtro, parado: !!s.parado, canais: [] };
    [['a1', 'b1', 'v1'], ['a2', 'b2', 'v2']].forEach(([a, b, v], i) => { const c = banc.canal(s[a], s[b], tb * 10, colunas, s.filtro, -(s.pos || 0) * tb); c.vdiv = SIM.OSC_V[s[v]]; c.vTxt = txVolt(c.vdiv); c.n = i + 1; d.canais.push(c); });
    const dois = d.canais[0].ligado && d.canais[1].ligado; d.canais[0].zero = dois ? 2 : 0; d.canais[1].zero = dois ? -2 : 0;
    congelado[colunas] = d; return d;
  };
  /** Ajuste automático: 2 a 3 ciclos na tela e a onda ocupando boa parte da altura. */
  SIM.autoOsc = function (banc) {
    const o = banc.porTipo('osc'); if (!o) return {}; const s = o.st, r = {}, dois = !!(s.a1 && s.b1 && s.a2 && s.b2);
    let f = 0; [['a1', 'b1', 'v1'], ['a2', 'b2', 'v2']].forEach(([a, b, v]) => { const c = banc.canal(s[a], s[b], 0.05, 60, s.filtro); if (!c.ligado) return; if (c.freq > f) f = c.freq;
      const pico = Math.max(Math.abs(c.media) + c.vpp / 2, 0.2), alvo = pico / (dois ? 1.8 : 3.4); let k = SIM.OSC_V.findIndex((x) => x >= alvo); r[v] = k < 0 ? SIM.OSC_V.length - 1 : k; });
    const alvoT = f > 0.2 ? 2.5 / f / 10 : 0.005; let k = SIM.OSC_TB.findIndex((x) => x >= alvoT); r.tb = k < 0 ? SIM.OSC_TB.length - 1 : k; return r;
  };
  const COR_CH = ['#ffd400', '#35d0ff'];
  SIM.desenhaOsc = function (ctx, W, H, d) {
    ctx.save(); ctx.fillStyle = '#07110d'; ctx.fillRect(0, 0, W, H); if (!d) { ctx.restore(); return; }
    const dx = W / 10, dy = H / 8, px = Math.max(1, W / 300);
    ctx.strokeStyle = '#1f3a33'; ctx.lineWidth = px; ctx.beginPath(); for (let i = 1; i < 10; i++) { ctx.moveTo(i * dx, 0); ctx.lineTo(i * dx, H); } for (let j = 1; j < 8; j++) { ctx.moveTo(0, j * dy); ctx.lineTo(W, j * dy); } ctx.stroke();
    ctx.strokeStyle = '#34594f'; ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    const fonte = (t) => `600 ${Math.round(t * px)}px Arial, Helvetica, sans-serif`;
    d.canais.forEach((c, i) => {
      if (!c.ligado) return; const n = c.min.length, y0 = H / 2 - c.zero * dy, k = dy / c.vdiv, cw = W / n;
      ctx.fillStyle = COR_CH[i]; ctx.beginPath(); ctx.moveTo(0, y0 - 4 * px); ctx.lineTo(6 * px, y0); ctx.lineTo(0, y0 + 4 * px); ctx.closePath(); ctx.fill();      // marca do zero do canal
      ctx.strokeStyle = COR_CH[i]; ctx.lineWidth = 1.3 * px; ctx.lineJoin = 'round'; ctx.beginPath();
      for (let j = 0; j < n; j++) { const a = y0 - c.max[j] * k, b = y0 - c.min[j] * k, x = (j + 0.5) * cw; if (j === 0) ctx.moveTo(x, a); else ctx.lineTo(x, a); if (b - a > 0.6 * px) ctx.lineTo(x, b); }
      ctx.stroke();
    });
    { const xt = W / 10 * Math.max(0, Math.min(10, d.pos || 0)); ctx.fillStyle = '#ff9f43'; ctx.beginPath(); ctx.moveTo(xt - 4 * px, 14 * px); ctx.lineTo(xt + 4 * px, 14 * px); ctx.lineTo(xt, 20 * px); ctx.closePath(); ctx.fill(); }   // T: início do ciclo (disparo)
    ctx.textBaseline = 'top'; ctx.font = fonte(8.5);
    d.canais.forEach((c, i) => { ctx.fillStyle = COR_CH[i]; ctx.textAlign = 'left'; ctx.fillText(c.ligado ? `CH${c.n}  ${c.vTxt}/div` : `CH${c.n}  sem ponteira`, (4 + i * 96) * px, 3 * px); });
    ctx.fillStyle = '#e8f2ee'; ctx.textAlign = 'right'; ctx.fillText(`${d.tbTxt}/div${d.pos ? `  · pos ${d.pos > 0 ? '+' : ''}${String(d.pos).replace('.', ',')} div` : ''}${d.filtro ? '  · FILTRO' : ''}${d.parado ? '  · PARADO' : ''}`, W - 4 * px, 3 * px);
    ctx.textBaseline = 'bottom'; ctx.font = fonte(8);
    d.canais.forEach((c, i) => { if (!c.ligado) return; ctx.fillStyle = COR_CH[i]; ctx.textAlign = 'left';
      ctx.fillText(`CH${c.n}  ${c.freq > 0.2 ? c.freq.toFixed(1).replace('.', ',') + ' Hz  ' : ''}${c.rms.toFixed(c.rms < 30 ? 2 : 0).replace('.', ',')} V ef  ${c.vpp.toFixed(c.vpp < 30 ? 2 : 0).replace('.', ',')} Vpp`, 4 * px, H - (3 + (1 - i) * 11) * px); });
    ctx.restore();
  };
  SIM.sete = sete;
})(typeof globalThis !== 'undefined' ? globalThis : this);
