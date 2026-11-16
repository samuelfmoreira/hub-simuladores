// Laboratório de histerese: comparação simulada (servidor) e acompanhamento ao vivo do programa do aluno.
const $ = (id) => document.getElementById(id);
const fmt = (v, d = 2) => Number(v).toFixed(d).replace('.', ',');
// tempo legível: 0,1 s · 35 s · 2 min 10 s
const tempo = (s) => { if (!s) return '—'; if (s < 10) return `${fmt(s, 1)} s`; if (s < 60) return `${Math.round(s)} s`; const m = Math.floor(s / 60), r = Math.round(s - m * 60); return r ? `${m} min ${r} s` : `${m} min`; };
const COR = { real: '#1b5e9e', medido: '#9aa3ab', sp: '#2b8a45', banda: '#e08a00', on: '#46e36d', grade: '#e2e4de', texto: '#5d666c' };

function ligar(id, out, f) { const i = $(id), o = $(out); const up = () => { o.textContent = f(Number(i.value)); }; i.addEventListener('input', up); up(); return i; }
ligar('sp', 'oSp', (v) => `${fmt(v)} m`);
ligar('h', 'oH', (v) => `± ${v} cm`);
ligar('cons', 'oCons', (v) => `${v} %`);
ligar('vel', 'oVel', (v) => `${v} %`);
ligar('filtro', 'oFiltro', (v) => (v ? `${v} s` : 'sem filtro'));
ligar('tmin', 'oTmin', (v) => `${v} s`);
ligar('min', 'oMin', (v) => `${v} min`);
ligar('hv', 'oHv', (v) => `± ${v} cm`);
ligar('conf', 'oConf', (v) => `${v} s`);

// desenha um gráfico: nível real, medido, SP, banda e faixa de bomba ligada
function grafico(canvas, pontos, { sp, h, janelaS, inicioS }) {
  const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr; const c = canvas.getContext('2d'); c.scale(dpr, dpr);
  c.clearRect(0, 0, W, H);
  const m = { l: 46, r: 10, t: 10, b: 44 }, faixa = 14;
  const gw = W - m.l - m.r, gh = H - m.t - m.b - faixa - 6;
  if (!pontos.length) return;
  const tFim = pontos[pontos.length - 1][0];
  const t0 = janelaS ? Math.max(pontos[0][0], tFim - janelaS) : pontos[0][0], t1 = janelaS ? Math.max(t0 + janelaS, tFim) : Math.max(t0 + 1, tFim);
  pontos = pontos.filter((p) => p[0] >= t0);
  if (!pontos.length) return;
  const meia = Math.max(0.15, (h || 0) * 2.2, 0.08);
  let y0 = sp - meia, y1 = sp + meia;
  for (const p of pontos) { y0 = Math.min(y0, p[1] - 0.02); y1 = Math.max(y1, p[1] + 0.02); }
  y0 = Math.max(y0, sp - 1.2); y1 = Math.min(y1, sp + 1.2);
  const X = (t) => m.l + (t - t0) / (t1 - t0) * gw, Y = (v) => m.t + (1 - (v - y0) / (y1 - y0)) * gh;
  // grade e escala
  c.strokeStyle = COR.grade; c.lineWidth = 1; c.fillStyle = COR.texto; c.font = '11px system-ui, sans-serif';
  const passo = (y1 - y0) > 1 ? 0.25 : (y1 - y0) > 0.5 ? 0.1 : 0.05;
  for (let v = Math.ceil(y0 / passo) * passo; v <= y1; v += passo) { c.beginPath(); c.moveTo(m.l, Y(v)); c.lineTo(W - m.r, Y(v)); c.stroke(); c.fillText(`${fmt(v)} m`, 2, Y(v) + 4); }
  // eixo de tempo: passo escolhido para dar ~6 a 12 marcas; abaixo de 1 min mostra mm:ss
  const dur = t1 - t0, passos = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800];
  const pt = passos.find((x) => dur / x <= 12) || 1800;
  const rotulo = (t) => { if (pt >= 60) return `${Math.round(t / 60)} min`; const mm = Math.floor(t / 60), ss = Math.round(t - mm * 60); return `${mm}:${String(ss).padStart(2, '0')}`; };
  for (let t = Math.ceil(t0 / pt) * pt; t <= t1; t += pt) { c.beginPath(); c.moveTo(X(t), m.t); c.lineTo(X(t), m.t + gh); c.stroke(); c.fillText(rotulo(t), X(t) - 12, H - 4); }
  // setpoint e banda
  const linha = (v, cor, tracejado) => { c.strokeStyle = cor; c.lineWidth = 1.6; c.setLineDash(tracejado ? [6, 5] : []); c.beginPath(); c.moveTo(m.l, Y(v)); c.lineTo(W - m.r, Y(v)); c.stroke(); c.setLineDash([]); };
  if (h > 0) { linha(sp + h, COR.banda, true); linha(sp - h, COR.banda, true); c.fillStyle = COR.banda; c.fillText('SP + H', W - m.r - 44, Y(sp + h) - 3); c.fillText('SP − H', W - m.r - 44, Y(sp - h) + 12); }
  linha(sp, COR.sp, true); c.fillStyle = COR.sp; c.fillText('SP', m.l + 4, Y(sp) - 3);
  // curvas
  const curva = (k, cor, lw) => { c.strokeStyle = cor; c.lineWidth = lw; c.beginPath(); pontos.forEach((p, i) => { const x = X(p[0]), y = Y(Math.min(y1, Math.max(y0, p[k]))); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); };
  curva(2, COR.medido, 1); curva(1, COR.real, 2.2);
  // faixa: bomba ligada
  const fy = m.t + gh + 6; c.fillStyle = '#eceee9'; c.fillRect(m.l, fy, gw, faixa); c.fillStyle = COR.on;
  for (let i = 0; i < pontos.length - 1; i++) if (pontos[i][3]) c.fillRect(X(pontos[i][0]), fy, Math.max(1, X(pontos[i + 1][0]) - X(pontos[i][0])), faixa);
  c.fillStyle = COR.texto; c.fillText('bomba', 4, fy + 11);
}
function stats(el, r) {
  el.innerHTML = '';
  const add = (v, t, cls) => { const d = document.createElement('div'); d.className = `stat ${cls || ''}`; d.innerHTML = `<b>${v}</b><span>${t}</span>`; el.appendChild(d); };
  // classificação pelas partidas por hora: motor pequeno aguenta ~10 a 20 por hora
  const cls = r.partidasHora <= 20 ? 'bom' : r.partidasHora <= 60 ? 'medio' : 'ruim';
  add(r.partidas, 'comandos de partida', cls);
  add(r.partidasHora, 'partidas por hora', cls);
  add(tempo(r.cicloMedio), 'liga de novo a cada', cls);
  add(tempo(r.tLigadoMedio), 'fica ligada (média)');
  add(tempo(r.tDesligadoMedio), 'fica desligada (média)');
  add(`${fmt((r.hMax - r.hMin) * 100, 0)} cm`, `faixa do nível (${fmt(r.hMin)}–${fmt(r.hMax)} m)`);
}
let ultimo = null;
async function rodar() {
  $('btnRodar').disabled = true; $('msg').textContent = 'simulando…';
  const q = new URLSearchParams({ sp: $('sp').value, histerese: $('h').value, consumo: $('cons').value, velocidade: $('vel').value, filtro: $('filtro').value, tempoMin: $('tmin').value, minutos: $('min').value, ruido: $('ruido').checked ? '1' : '0', confirma: $('conf').value, emCm: $('emCm').checked ? '1' : '0' });
  try {
    const r = await (await fetch(`/api/histerese?${q}`)).json(); ultimo = r;
    const H = r.params.histerese;
    $('tCom').textContent = `Com histerese ± ${Math.round(H * 100)} cm — liga abaixo de ${fmt(r.params.sp - H)} m, desliga acima de ${fmt(r.params.sp + H)} m${r.params.confirmaS ? ` · TON ${r.params.confirmaS} s` : ''}${r.params.emCm ? ' · nível em cm' : ''}`;
    desenhar();
    stats($('sSem'), r.sem); stats($('sCom'), r.com);
    const fator = r.com.partidas ? Math.round(r.sem.partidas / r.com.partidas) : r.sem.partidas;
    $('conclusao').innerHTML = `Em ${r.params.duracaoS / 60} minutos, <b class="tag-sem">sem histerese o CLP mandou a bomba partir ${r.sem.partidas} vezes — uma a cada ${tempo(r.sem.cicloMedio)}</b>, ficando ${tempo(r.sem.tLigadoMedio)} ligada e ${tempo(r.sem.tDesligadoMedio)} desligada de cada vez (${r.sem.partidasHora} partidas por hora). ` +
      `<b class="tag-com">Com ± ${Math.round(H * 100)} cm, partiu ${r.com.partidas} vezes — uma a cada ${tempo(r.com.cicloMedio)}</b>, ${tempo(r.com.tLigadoMedio)} ligada e ${tempo(r.com.tDesligadoMedio)} desligada (${r.com.partidasHora} por hora). ` +
      `${fator > 1 ? `São <b>${fator}× menos partidas</b>. ` : ''}O preço é o nível variar mais: ${fmt((r.com.hMax - r.com.hMin) * 100, 0)} cm com histerese contra ${fmt((r.sem.hMax - r.sem.hMin) * 100, 0)} cm sem. ` +
      `Um motor de 1,5 kW aguenta da ordem de 10 a 20 partidas por hora; acima disso aquece, e o contator e o inversor desgastam. ` +
      (r.com.partidasHora > 20 ? `<b>Com ± ${Math.round(H * 100)} cm ainda são ${r.com.partidasHora} partidas por hora — aumente a banda até a bomba ligar no máximo a cada 3 a 6 minutos.</b>` : `Com ± ${Math.round(H * 100)} cm a bomba liga a cada ${tempo(r.com.cicloMedio)}, dentro do que o motor aguenta.`) +
      ` Experimente também o filtro e o tempo mínimo no lado sem histerese.`;
    $('msg').textContent = '';
  } catch (e) { $('msg').textContent = `erro: ${e.message}`; }
  $('btnRodar').disabled = false;
}
function desenhar() {
  if (!ultimo) return;
  const sp = ultimo.params.sp;
  const j = Number(document.querySelector('#zoomSim [aria-pressed="true"]')?.dataset.s || 0) || 0;
  grafico($('cSem'), ultimo.sem.pontos, { sp, h: 0, janelaS: j }); grafico($('cCom'), ultimo.com.pontos, { sp, h: ultimo.params.histerese, janelaS: j });
}
$('btnRodar').onclick = rodar;
// botões de escala de tempo (zoom)
function zoom(id, aoMudar) {
  document.querySelectorAll(`#${id} button`).forEach((b) => { b.onclick = () => { document.querySelectorAll(`#${id} button`).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); aoMudar(); }; });
}
zoom('zoomSim', () => desenhar()); zoom('zoomVivo', () => desenharVivo());
// copia as condições atuais da estação (consumo da HV-01, velocidade e setpoint da IHM)
$('btnEstacao').onclick = () => {
  if (!vivo.ultimoEstado) { $('msg').textContent = 'sem dados da estação ainda'; return; }
  const s = vivo.ultimoEstado, ajusta = (id, v) => { const i = $(id); i.value = v; i.dispatchEvent(new Event('input')); };
  ajusta('cons', Math.round(s.cons * 100 / 5) * 5);
  if (s.ihm) { ajusta('vel', Math.max(60, Math.round(s.ihm.vel / 5) * 5)); ajusta('sp', Math.round(s.ihm.sp * 20) / 20); }
  $('msg').textContent = `consumo ${Math.round(s.cons * 100)} %, velocidade ${s.ihm ? s.ihm.vel : '—'} %, setpoint ${s.ihm ? fmt(s.ihm.sp) : '—'} m copiados da estação`;
};
window.addEventListener('resize', () => { desenhar(); desenharVivo(); });
rodar();

// ---------------------------------------------------------------- ao vivo
const vivo = { pontos: [], partidas: 0, tInicio: null, anterior: null, ligado: 0, ultimoT: 0, inicios: [], tOn: null, tOff: null, ligadas: [], desligadas: [], eventos: [] };
function zerar() { vivo.pontos = []; vivo.partidas = 0; vivo.tInicio = null; vivo.ligado = 0; vivo.inicios = []; vivo.ligadas = []; vivo.desligadas = []; vivo.eventos = []; vivo.tOn = null; vivo.tOff = null; }
$('btnZerar').onclick = zerar;
function desenharVivo() {
  const sp = vivo.sp || 2; const t = vivo.pontos.length ? vivo.pontos[vivo.pontos.length - 1][0] : 0;
  const janela = Number(document.querySelector('#zoomVivo [aria-pressed="true"]')?.dataset.s || 600);
  grafico($('cVivo'), vivo.pontos, { sp, h: Number($('hv').value) / 100, janelaS: janela });
  const dur = vivo.tInicio === null ? 0 : (t - vivo.tInicio);
  const el = $('sVivo'); el.innerHTML = '';
  const add = (v, txt) => { const d = document.createElement('div'); d.className = 'stat'; d.innerHTML = `<b>${v}</b><span>${txt}</span>`; el.appendChild(d); };
  add(vivo.partidas, 'partidas desde zerar'); add(dur > 30 ? Math.round(vivo.partidas / (dur / 3600)) : '—', 'partidas por hora');
  const ci = vivo.inicios; const ciclo = ci.length > 1 ? (ci[ci.length - 1] - ci[0]) / (ci.length - 1) : 0;
  const lig = vivo.ligadas.length ? vivo.ligadas.reduce((a, b) => a + b, 0) / vivo.ligadas.length : 0;
  const desl = vivo.desligadas.length ? vivo.desligadas.reduce((a, b) => a + b, 0) / vivo.desligadas.length : 0;
  add(tempo(ciclo), 'liga de novo a cada'); add(tempo(lig), 'fica ligada (média)'); add(tempo(desl), 'fica desligada (média)');
  add(`${fmt(dur / 60, 1)} min`, 'tempo observado'); add(vivo.estado || '—', 'Inv_Gira agora');
  // últimos ciclos, um por um (dá para conferir com o cronômetro)
  const ult = vivo.eventos.slice(-8).map(([k, d]) => `<span class="ev ${k}">${k} ${fmt(d, 1)} s</span>`).join('');
  $('ciclosVivo').innerHTML = ult ? `Últimos períodos: ${ult}` : 'Últimos períodos: aguardando a bomba ligar e desligar…';
}
function conectar() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onmessage = (ev) => {
    const s = JSON.parse(ev.data).estado; if (!s) return;
    vivo.ultimoEstado = s;
    const tg = s.tags || {}; const gira = !!tg.Inv_Gira; const t = s.t;
    vivo.sp = typeof tg.IHM_Setpoint === 'number' ? tg.IHM_Setpoint : (s.ihm && s.ihm.sp) || 2;
    if (vivo.tInicio === null) vivo.tInicio = t;
    if (vivo.anterior === false && gira) { vivo.partidas++; vivo.inicios.push(t); if (vivo.tOff !== null) { vivo.desligadas.push(t - vivo.tOff); vivo.eventos.push(['desligada', t - vivo.tOff]); } vivo.tOn = t; vivo.tOff = null; }
    if (vivo.anterior === true && !gira) { if (vivo.tOn !== null) { vivo.ligadas.push(t - vivo.tOn); vivo.eventos.push(['ligada', t - vivo.tOn]); } vivo.tOn = null; vivo.tOff = t; }
    vivo.anterior = gira; vivo.estado = s.comm && s.comm.clpConectado ? (gira ? 'ligada' : 'desligada') : 'sem CLP';
    const medido = s.sensores && s.sensores['LT-01'] ? s.sensores['LT-01'].eng : s.h;
    if (t - vivo.ultimoT >= 0.2 || t < vivo.ultimoT) { vivo.pontos.push([t, s.h, medido, gira ? 1 : 0]); vivo.ultimoT = t; if (vivo.pontos.length > 12000) vivo.pontos.splice(0, 2000); }
  };
  ws.onclose = () => setTimeout(conectar, 1500);
}
conectar();
setInterval(desenharVivo, 500);
