// =====================================================================
//  Interface web do simulador CFW500 (cliente Socket.IO)
// =====================================================================
import { Display7 } from './lcd.js';
import { iniciarEsteira, atualizarEsteira, registrarIHM3D, focarIHM, atualizarTexturaIHM, projetarIHM, posicionarCamera } from './esteira3d.js';
import { IHMTela } from './ihm.js';
import { Grafico } from './grafico.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const socket = io();
const nf = (v, d = 1) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pn = (n) => 'P' + String(n).padStart(4, '0');
const hx = (v) => (v & 0xFFFF).toString(16).toUpperCase().padStart(4, '0') + 'h';
const s16 = (v) => (v > 32767 ? v - 65536 : v);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------------
//  Diálogos (sucesso, erro, confirmação) e avisos rápidos (toasts)
// ---------------------------------------------------------------------
const ICONES = { ok: '✓', erro: '✕', aviso: '!', pergunta: '?' };
function dialogo({ tipo = 'ok', titulo, texto = '', itens = [], ok = 'OK', cancelar = null, perigo = false }) {
  const d = $('#dlg');
  d.className = 'dlg ' + tipo;
  $('#dlgIcone').textContent = ICONES[tipo] || 'i';
  $('#dlgTitulo').textContent = titulo;
  $('#dlgTexto').innerHTML = texto;
  $('#dlgItens').innerHTML = itens.map((i) => `<li>${esc(i)}</li>`).join('');
  const bOk = $('#dlgOk'); const bCan = $('#dlgCancelar');
  bOk.textContent = ok; bOk.className = perigo ? 'perigo' : '';
  bCan.hidden = !cancelar; if (cancelar) bCan.textContent = cancelar;
  return new Promise((res) => {
    const fim = (v) => { bOk.onclick = bCan.onclick = d.oncancel = null; if (d.open) d.close(); res(v); };
    bOk.onclick = () => fim(true);
    bCan.onclick = () => fim(false);
    d.oncancel = (e) => { e.preventDefault(); fim(false); };   // Esc
    d.showModal();
    (cancelar && perigo ? bCan : bOk).focus();
  });
}
const confirmar = (o) => dialogo({ tipo: 'pergunta', ok: 'Confirmar', cancelar: 'Cancelar', ...o });
function aviso(texto, tipo = 'ok', ms = 3200) {
  const t = document.createElement('div');
  t.className = 'toast ' + tipo;
  t.innerHTML = `<b>${tipo === 'erro' ? '✕' : tipo === 'info' ? 'i' : '✓'}</b><span>${esc(texto)}</span>`;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.classList.add('sai'); setTimeout(() => t.remove(), 300); }, ms);
}
const pedir = (evento, ...args) => new Promise((res) => {
  const t = setTimeout(() => res({ erro: 'o simulador não respondeu' }), 8000);
  socket.emit(evento, ...args, (r) => { clearTimeout(t); res(r || { ok: true }); });
});

const meta = { params: [], map: new Map(), falhas: {}, alarmes: {} };
let ultimo = null;
// o assistente de comunicação (js/assistente-cfw500.js) grava parâmetros e lê o estado por aqui
window.CFW = { pedir: (...a) => pedir(...a), estado: () => ultimo };
let abaAtiva = 'rede';

const NOMES_P0801 = ['Setup', 'Init', 'Wait Comm', 'Idle', 'Data Active', 'Error', 'Reservado', 'Exception', 'Erro de Acesso'];
const BITS_684 = ['Gira/Para', 'Habilita Geral', 'Girar Horário', 'Habilita JOG', 'Remoto', '2ª Rampa', 'Parada Rápida', 'Reset de Falha'];
const BITS_680 = ['STO', 'Comando Gira', 'Fire Mode', 'Reservado', 'Parada Rápida', '2ª Rampa', 'Modo Config.', 'Alarme', 'Girando', 'Habilitado', 'Horário', 'JOG', 'Remoto', 'Subtensão', 'Automático (PID)', 'Falha'];

function formatar(n, v) {
  const p = meta.map.get(n);
  if (!p || v === undefined) return '—';
  if (p.hex) return hx(v);
  if (n === 1 || n === 2) {
    const d = ultimo ? ultimo.vals[210] : 1; const un = p && ultimo ? (meta.map.get(209).op[ultimo.vals[209]] || '') : '';
    return `${nf(v / 10 ** d, d)} ${un}`;
  }
  return p.dec ? nf(v / 10 ** p.dec, p.dec) : String(v);
}
function opcao(n, v) { const p = meta.map.get(n); return p && p.op && p.op[v] !== undefined ? p.op[v] : null; }

// =====================================================================
//  HMI
// =====================================================================
const lcdPri = new Display7($('#lcdPri'), 5, { w: 30, h: 54, t: 6.5, passo: 41, x0: 24, y0: 4, sinal: true });
const lcdSec = new Display7($('#lcdSec'), 5, { w: 20, h: 32, t: 4.2, passo: 28.5, x0: 5, y0: 3 });
const GRUPOS = ['PARAM', 'READ', 'MODIF', 'BASIC', 'MOTOR', 'I/O', 'NET', 'HMI', 'SPLC', 'STARTUP'];
$('#lcdMenu').innerHTML = GRUPOS.map((g) => `<span data-g="${g}">${g}</span>`).join('');
$('#lcdBarra').innerHTML = '<i></i>'.repeat(10);

// Piscar do valor em edição: um relógio único para o display inteiro (todos os segmentos em fase)
// e uma pausa depois de cada mudança, para dar para ler o número enquanto se ajusta com ▲▼.
const PISCA_MS = 450;      // meia piscada
const SEGURA_MS = 1500;    // tempo aceso e parado depois de mudar o valor
let piscaFase = false; let piscaSeguraAte = 0; let piscaUltimo = null;
setInterval(() => {
  const el = $('#lcdPri');
  if (!el.classList.contains('piscar') || Date.now() < piscaSeguraAte) { piscaFase = false; el.classList.remove('fraco'); return; }
  piscaFase = !piscaFase;
  el.classList.toggle('fraco', piscaFase);
}, PISCA_MS);

function renderHMI(h) {
  const lcd = $('#lcd');
  if (h.principal !== piscaUltimo) {   // valor mudou: mostra firme por um instante
    piscaUltimo = h.principal;
    piscaSeguraAte = Date.now() + SEGURA_MS;
    $('#lcdPri').classList.remove('fraco');
  }
  lcd.classList.toggle('apagado', !h.ligado);
  lcd.classList.toggle('sem-luz', h.ligado && !h.backlight);
  $$('#lcdMenu span').forEach((s) => s.classList.toggle('on', h.menu === 'TODOS' || s.dataset.g === h.menu));
  const st = { loc: h.loc, rem: h.rem, conf: h.conf, sub: h.sub, run: h.run, giro: h.ligado && (h.giroAtivo || h.run || h.boot) };
  $$('.lcd-estados span').forEach((s) => s.classList.toggle('on', !!(h.ligado && (h.boot || st[s.dataset.st]))));
  $('.lcd-estados .giro').classList.toggle('ah', h.giro === 'AH');
  lcdPri.mostrar(h.ligado ? h.principal : '');
  lcdSec.mostrar(h.ligado ? h.secundario : '');
  $('#lcdPri').classList.toggle('piscar', !!h.piscar);
  $('#lcdUn').textContent = h.ligado ? (h.unidade || '') : '';
  const nb = h.ligado ? Math.round((h.barra || 0) * 10) : 0;
  $$('#lcdBarra i').forEach((b, i) => b.classList.toggle('on', i < nb));
  let aj = '';
  if (!h.ligado) aj = 'Inversor desenergizado.';
  else if (h.ajuda) aj = `<b>${esc(h.ajuda)}</b>${h.opcao ? ` — ${esc(h.opcao)}` : ''}`;
  else if (h.nivel === 'menu') aj = 'Nível 1: ▲▼ escolhem o grupo, ENTER entra.';
  else aj = 'Monitoração: ENTER/MENU abre os parâmetros.';
  if (h.msgDet) aj += `<br>${esc(h.msgDet)}`;
  $('#hmiAjuda').innerHTML = aj;
}

for (const b of $$('.tc')) {
  const k = b.dataset.k;
  const enviar = (p) => { socket.emit('tecla', { tecla: k, pressionada: p }); b.classList.toggle('apertada', p); };
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); enviar(true); });
  b.addEventListener('pointerup', () => enviar(false));
  b.addEventListener('pointercancel', () => enviar(false));
  b.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); enviar(true); } });
  b.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') enviar(false); });
}

$('#btnEnergia').addEventListener('click', () => {
  const lig = !(ultimo && ultimo.drive.ligado);
  socket.emit('energia', lig);
  aviso(lig ? 'Inversor energizado' : 'Inversor desenergizado', 'info');
});
$('#chkCabo').addEventListener('change', (e) => socket.emit('injecao', { nome: 'cabo', v: !e.target.checked }));

// =====================================================================
//  BORNES
// =====================================================================
function montarBornes() {
  $('#borneDI').innerHTML = [0, 1, 2, 3, 4, 5].map((i) => `
    <div class="borne"><button class="chave" data-di="${i}" aria-pressed="false" ${i > 3 ? 'disabled' : ''} aria-label="DI${i + 1}"></button>
    <span><b>DI${i + 1}</b> <small data-difn="${i}"></small></span><small>${i === 4 ? 'sensor S1' : i === 5 ? 'sensor S2' : ''}</small></div>`).join('');
  $('#borneDO').innerHTML = [0, 1].map((i) => `
    <div class="borne"><i class="lamp" data-do="${i}"></i><span><b>DO${i + 1}</b> <small data-dofn="${i}"></small></span><small>${i === 0 ? 'relé' : 'transistor'}</small></div>`).join('');
  $$('#borneDI .chave').forEach((b) => b.addEventListener('click', () => {
    const v = b.getAttribute('aria-pressed') !== 'true';
    socket.emit('di', { i: +b.dataset.di, v });
  }));
}
montarBornes();
$('#ai1').addEventListener('input', (e) => socket.emit('ai1', +e.target.value));

function renderBornes(e) {
  const v = e.vals;
  $$('#borneDI .chave').forEach((b) => b.setAttribute('aria-pressed', String(!!e.drive.di[+b.dataset.di])));
  $$('[data-difn]').forEach((s) => { const n = 263 + +s.dataset.difn; s.textContent = `${opcao(n, v[n]) || v[n]} (${pn(n)})`; });
  $$('[data-do]').forEach((l) => l.classList.toggle('on', ((v[13] >> +l.dataset.do) & 1) === 1));
  $$('[data-dofn]').forEach((s) => { const n = 275 + +s.dataset.dofn; s.textContent = `${opcao(n, v[n]) || v[n]} (${pn(n)})`; });
  $('#ai1Val').textContent = `${nf(e.drive.ai1, 1)} V`;
  $('#ai1Func').textContent = `P0018 = ${nf(v[18] / 10, 1)} % · ${opcao(231, v[231]) || ''}`;
  $('#borneAO').textContent = `AO1 (${opcao(251, v[251]) || v[251]}): ${nf(v[14] / 100, 2)} V  ·  AO2 (${opcao(254, v[254]) || v[254]}): ${nf(v[15] / 100, 2)} V`;
}

// =====================================================================
//  ESTEIRA 3D
// =====================================================================
// a IHM do painel precisa existir antes da cena (a tela dela é a textura da IHM 3D)
const canvasIhm = document.createElement('canvas');
const ihmTela = new IHMTela(canvasIhm, (id, valor) => new Promise((res) => {
  const t = setTimeout(() => res({ erro: 'sem resposta do simulador' }), 4000);
  socket.emit('ihmCmd', { id, valor }, (r) => { clearTimeout(t); res(r); });
}));
registrarIHM3D(canvasIhm, { tocar: (x, y, tipo) => ihmTela.toque(x, y, tipo), apontar: (x, y) => ihmTela.apontar(x, y) });
iniciarEsteira($('#cena'));
window.__sim = { projetarIHM, posicionarCamera };   // apoio a testes automáticos
$('#btnCaixa').addEventListener('click', () => socket.emit('esteira', { acao: 'caixa', massa: +$('#massa').value }));
$('#btnLimpar').addEventListener('click', () => socket.emit('esteira', { acao: 'limpar' }));
$('#chkAuto').addEventListener('change', (e) => socket.emit('esteira', { acao: 'auto', v: e.target.checked }));
$('#chkTrava').addEventListener('change', (e) => socket.emit('esteira', { acao: 'travar', v: e.target.checked }));
$('#massa').addEventListener('input', (e) => { $('#massaV').textContent = `${e.target.value} kg`; socket.emit('esteira', { acao: 'massa', v: +e.target.value }); });
$('#incl').addEventListener('input', (e) => { $('#inclV').textContent = `${e.target.value}°`; socket.emit('esteira', { acao: 'inclinacao', v: +e.target.value }); });

function renderHud(e) {
  const pl = e.drive.planta;
  $('#hudVel').textContent = nf(pl.vel, 2);
  $('#hudRpm').textContent = nf(e.drive.rpm, 0);
  $('#hudI').textContent = nf(e.drive.i, 1);
  $('#hudCx').textContent = pl.entregues;
  $('#chkAuto').checked = pl.alimentador.auto;
  $('#chkTrava').checked = pl.travada;
}

// =====================================================================
//  TOPO
// =====================================================================
function renderTopo(e) {
  const p801 = e.vals[801];
  const c = $('#chipP0801');
  c.textContent = `P0801 ${NOMES_P0801[p801] || p801}`;
  c.className = 'chip ' + (p801 === 4 ? 'ok' : p801 === 5 || p801 === 8 ? 'erro' : p801 === 3 ? 'alerta' : '');
  $('#chipLocRem').textContent = e.drive.ligado ? `${e.drive.locRem} · ${e.drive.falha ? 'F' + String(e.drive.falha).padStart(4, '0') : e.drive.pwm ? 'RUN' : 'Ready'}` : 'desligado';
  $('#chipLocRem').className = 'chip ' + (e.drive.falha ? 'erro' : e.drive.alarmes.length ? 'alerta' : '');
  $('#chipIp').textContent = `IP ${e.eip.ipEfetivo}`;
  const b = $('#btnEnergia');
  b.textContent = e.drive.ligado ? 'Desenergizar' : 'Energizar';
  b.setAttribute('aria-pressed', String(e.drive.ligado));
  const leds = e.eip.leds;
  const t = Date.now();
  const cor = (estado, rapido) => {
    if (estado === 'off') return '';
    if (estado === 'teste') return ['verde', 'vermelho', ''][Math.floor(t / 250) % 3];
    const [c0, pisca] = estado.split('-');
    if (pisca && Math.floor(t / (rapido ? 90 : 500)) % 2) return '';
    return c0;
  };
  $('#ledMS').className = 'led ' + cor(leds.ms);
  $('#ledNS').className = 'led ' + cor(leds.ns);
  $('#ledLink').className = 'led-link ' + cor(leds.link, true);
}

// =====================================================================
//  ABAS
// =====================================================================
$$('.abas button').forEach((b) => b.addEventListener('click', () => {
  abaAtiva = b.dataset.aba;
  $$('.abas button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  $$('.painel').forEach((p) => { p.hidden = p.id !== 'aba-' + abaAtiva; });
  if (abaAtiva === 'param') renderParametros(true);
  socket.emit('ihmLog', abaAtiva === 'ihm');
  if (abaAtiva === 'ihm' && ultimo) renderAbaIhm(ultimo);
}));

// =====================================================================
//  ABA REDE
// =====================================================================
const topo = $('#topo');
topo.innerHTML = `
  <defs><marker id="seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#2b3134"/></marker></defs>
  <style>
    .no rect{fill:#f3f4f1;stroke:#2b3134;stroke-width:1.5}
    .no text{font:600 17px 'Barlow Condensed',sans-serif;fill:#2b3134}
    .no .s{font:400 13px Barlow,sans-serif;fill:#596165}
    .lig{stroke:#2b3134;stroke-width:2;fill:none}
    .fluxo{stroke-dasharray:6 8;animation:corre .6s linear infinite}
    .fluxo.parado{animation:none;stroke:#a9ada6}
    .rot{font:500 13px Barlow,sans-serif;fill:#2b3134}
    @keyframes corre{to{stroke-dashoffset:-14}}
    @media (prefers-reduced-motion: reduce){.fluxo{animation:none}}
  </style>
  <g class="no"><rect x="10" y="20" width="230" height="80" rx="4"/><text x="24" y="47">Scanner (originator)</text><text class="s" x="24" y="69" id="tpScan">nenhum CLP conectado</text><text class="s" x="24" y="87">abre a conexão, define o RPI</text></g>
  <g class="no"><rect x="400" y="35" width="100" height="50" rx="4"/><text x="425" y="66">Switch</text></g>
  <g class="no"><rect x="660" y="20" width="230" height="80" rx="4" style="fill:#dfe7f4"/><text x="674" y="47">CFW500 (adapter / target)</text><text class="s" x="674" y="69" id="tpAdp">—</text><text class="s" x="674" y="87">só responde; produz e consome I/O</text></g>
  <path class="lig fluxo" id="tpOT" d="M240 48 H400 M500 48 H660" marker-end="url(#seta)"/>
  <path class="lig fluxo" id="tpTO" d="M660 74 H500 M400 74 H240" marker-end="url(#seta)"/>
  <text class="rot" x="10" y="128" id="tpOTt">O→T saídas</text>
  <text class="rot" x="10" y="148" id="tpTOt">T→O entradas</text>
  <text class="rot" x="890" y="128" text-anchor="end">TCP 44818: sessão, Forward Open, explícitas</text>
  <text class="rot" x="890" y="148" text-anchor="end">UDP 2222: I/O cíclico (implícito)</text>`;

function linhaPalavra(i, n, valor, dir) {
  const p = meta.map.get(n);
  const sig = p && p.min < 0;
  const dec = valor === null ? '—' : sig ? s16(valor) : valor;
  return `<tr><td>${i + 1}</td><td>${pn(n)}</td><td>${esc(p ? p.nome : '?')}</td><td class="num"><code>${valor === null ? '—' : hx(valor)}</code></td><td class="num">${dec}</td><td>${dir}</td></tr>`;
}
function bitsHtml(v, nomes, falhaBit) {
  return nomes.map((nm, i) => `<span class="bit ${(v >> i) & 1 ? 'on' : ''} ${i === falhaBit ? 'falha' : ''}"><b>${i}</b>${nm}</span>`).join('');
}

function renderRede(e) {
  const r = e.eip;
  const con = r.conexoes;
  const dono = con.find((c) => c.tipo === 'Exclusive Owner');
  $('#tpScan').textContent = dono ? `${dono.ip} · RPI ${dono.rpiOT} ms` : con.length ? `${con[0].ip} (${con[0].tipo})` : 'nenhum CLP conectado';
  $('#tpAdp').textContent = `${r.ipEfetivo} · P0801 = ${r.p0801} (${NOMES_P0801[r.p0801]})`;
  $('#tpOT').classList.toggle('parado', !(dono && dono.run));
  $('#tpTO').classList.toggle('parado', !dono);
  $('#tpOTt').textContent = dono ? `O→T assembly ${dono.pontoOT} · ${dono.tamOT} B · ${dono.run ? 'RUN' : 'IDLE'}` : 'O→T saídas';
  $('#tpTOt').textContent = dono ? `T→O assembly ${dono.pontoTO} · ${dono.tamTO} B · ${dono.multicast ? 'multicast' : 'unicast'}` : 'T→O entradas';

  const nS = r.ioCfg.escrita.length; const nE = r.ioCfg.leitura.length;
  $('#cfgClp').innerHTML = [
    ['Comm format', 'Data – INT (16 bits)'],
    ['Input (T→O) – assembly', `<b>150</b> · ${nE} palavras (${nE * 2} bytes)`],
    ['Output (O→T) – assembly', `<b>100</b> · ${nS} palavras (${nS * 2} bytes)`],
    ['Configuration – assembly', '<b>1</b> · 0 bytes'],
    ['RPI permitido', '4 a 3200 ms (padrão 10 ms)'],
    ['Tamanho no Forward Open', `O→T ${6 + nS * 2} B (2 seq + 4 Run/Idle + dados) · T→O ${2 + nE * 2} B`],
    ['Alternativas (EDS)', '120/170 CIP Basic Speed · 121/171 CIP Ext. Speed · 199 Listen Only'],
  ].map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
  $('#avisoPend').hidden = !r.ioPendente;

  const id = r.identidade;
  $('#identidade').innerHTML = [
    ['Vendor ID', `${id.vendor} (WEG)`], ['Device Type', `${id.tipo} (Generic Device, keyable)`], ['Product Code', id.produto],
    ['Revisão', `${id.revMaior}.${String(id.revMenor).padStart(3, '0')}`], ['Número de série', '0x' + id.serie.toString(16).toUpperCase()],
    ['Status (Identity attr 5)', hx(id.status)], ['MAC', r.mac], ['IP efetivo', `${r.ipEfetivo} / ${r.mascara}`],
    ['P0810 / IP nos parâmetros', `${opcao(810, r.modoIp)} / ${r.ipParametros}`], ['Multicast T→O', r.multicast],
    ['Sessões TCP', r.sessoes.length ? r.sessoes.map((s) => `${s.ip} (0x${s.handle})`).join(', ') : 'nenhuma'],
  ].map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');

  $('#tabConexoes').innerHTML = con.length
    ? `<tr><th>Tipo</th><th>Originador</th><th>O→T (ID)</th><th>T→O (ID)</th><th>RPI</th><th>Tamanhos</th><th>Destino T→O</th><th>Estado</th><th>Rx/Tx</th><th>Timeout</th></tr>` +
      con.map((c) => `<tr><td>${c.tipo}</td><td>${c.ip}</td><td>${c.pontoOT ?? 'MR'} · 0x${c.idOT}</td><td>${c.pontoTO ?? '—'} · 0x${c.idTO}</td>
        <td>${c.rpiOT}/${c.rpiTO} ms</td><td>${c.tamOT ?? '—'}/${c.tamTO ?? '—'} B</td><td>${c.destino ? `${c.destino.ip}:${c.destino.porta}` : 'TCP'}</td>
        <td>${c.classe === 3 ? 'aberta' : c.run === null ? 'aguardando' : c.run ? 'RUN' : 'IDLE'}</td><td>${c.rx}/${c.tx}</td><td>${c.timeoutMs} ms</td></tr>`).join('')
    : '<tr><td class="vazio">Nenhuma conexão. O adapter aguarda um Forward Open do scanner (LED NS verde piscando).</td></tr>';

  const cab = '<tr><th>#</th><th>Parâm.</th><th>Descrição</th><th>Hex</th><th>Dec</th><th></th></tr>';
  $('#tabSaidas').innerHTML = cab + r.ioCfg.escrita.map((n, i) => linhaPalavra(i, n, r.saidas ? r.saidas[i] ?? null : null, i < 2 ? 'fixa' : pn(835 + i - 2))).join('');
  $('#tabEntradas').innerHTML = cab + r.ioCfg.leitura.map((n, i) => linhaPalavra(i, n, r.entradas[i] ?? null, i < 2 ? 'fixa' : pn(820 + i - 2))).join('');
  const txtIp = (ip) => (ip === '0.0.0.0' ? 'todas as placas de rede' : ip);
  $('#ipAtual').innerHTML = `Respondendo em <b>${txtIp(r.bindIp)}</b> · origem: ${esc(r.origemIp)}${r.bindIni !== r.bindIp ? ` · IP de inicialização: ${txtIp(r.bindIni)}` : ''}`;
  $('#bits684').innerHTML = bitsHtml(e.vals[684], BITS_684);
  $('#bits680').innerHTML = bitsHtml(e.vals[680], BITS_680, 15);
}

// =====================================================================
//  ABA CLP VIRTUAL
// =====================================================================
$('#scBits').innerHTML = BITS_684.map((n, i) => `<label data-b="${i}"><input type="checkbox" data-bit="${i}"> <b>${i}</b> ${n}</label>`).join('');
let cwLocal = 0; let refHz = 0;
function enviarSaidas() {
  const p403 = (ultimo && ultimo.scanner.p0403) || 60;
  const r13 = Math.max(-32768, Math.min(32767, Math.round((refHz * 8192) / p403)));
  $('#scRefHz').textContent = `${nf(refHz, 1)} Hz`;
  $('#scRef13').textContent = `${r13} (${hx(r13)})`;
  socket.emit('scanner', { acao: 'saidas', v: [cwLocal, r13 & 0xFFFF] });
}
$$('#scBits input').forEach((c) => c.addEventListener('change', () => {
  const b = +c.dataset.bit;
  cwLocal = c.checked ? cwLocal | (1 << b) : cwLocal & ~(1 << b);
  c.parentElement.classList.toggle('on', c.checked);
  enviarSaidas();
}));
$('#scRef').addEventListener('input', (e) => { refHz = +e.target.value; enviarSaidas(); });
$('#scRun').addEventListener('change', (e) => socket.emit('scanner', { acao: 'run', v: e.target.checked }));
$('#scCon').addEventListener('click', async () => {
  const r = await pedir('scanner', { acao: 'conectar', host: $('#scHost').value, rpi: +$('#scRpi').value, extraSaida: +$('#scExS').value, extraEntrada: +$('#scExE').value, multicast: $('#scMc').checked });
  setTimeout(enviarSaidas, 300);
  if (r.erro) dialogo({ tipo: 'erro', titulo: 'CLP virtual não conectou', texto: esc(r.erro) });
  else dialogo({ titulo: 'CLP virtual conectado', texto: 'A conexão de I/O com o CFW500 está aberta.',
    itens: [`IP do adapter: ${$('#scHost').value}`, 'RegisterSession e Forward Open aceitos', `RPI: ${r.rpi} ms`, 'Agora marque os bits da P0684 e ajuste a referência'] });
});
$('#scDes').addEventListener('click', async () => {
  const r = await pedir('scanner', { acao: 'desconectar' });
  aviso(r.erro ? r.erro : 'CLP virtual desconectado (Forward Close enviado)', r.erro ? 'erro' : 'ok');
});
$('#scCut').addEventListener('click', async () => {
  const r = await pedir('scanner', { acao: 'cortar' });
  aviso(r.erro ? r.erro : 'Cabo do CLP cortado: o inversor vai detectar o timeout (A0149)', r.erro ? 'erro' : 'info', 4500);
});
$('#btnPreset').addEventListener('click', async () => {
  const sim = await confirmar({ titulo: 'Parametrizar para comando via rede?', texto: 'O inversor passa a obedecer à EtherNet/IP (P0684/P0685). O motor precisa estar parado.',
    itens: ['P0220 = 1 · P0222 = 11 · P0226 = 9 · P0227 = 4', 'P0228 = 5 · P0105 = 5 · P0313 = 1'], ok: 'Aplicar' });
  if (!sim) return;
  const r = await pedir('presetRede');
  if (r.erro) dialogo({ tipo: 'erro', titulo: 'Parametrização não aplicada', texto: esc(r.erro) });
  else dialogo({ titulo: 'Configurações realizadas com sucesso', texto: 'O inversor agora é comandado pela rede. Para desfazer, use <b>Restaurar padrão de fábrica</b> ou <b>P0204 = 5</b> na HMI do inversor.', itens: r.itens });
});
$('#btnPresetTutorial').addEventListener('click', async () => {
  const sim = await confirmar({ titulo: 'Preparar o inversor para o tutorial?', texto: 'Grava tudo o que o projeto do Guia (IHM Modbus + CODESYS) precisa. O motor precisa estar parado.',
    itens: ['P0220 = 1 · P0222 = 11 · P0226 = 9 · P0227 = 4', 'P0228 = 5 · P0105 = 5 · P0313 = 1', 'P0820 = 3 (corrente na 3ª palavra de entrada)', 'P0810 = 0 e P0811…P0815: IP fixo (o IP reservado pelo HUB, máscara 24)', 'P0849 = 1 (aplica a configuração Ethernet)'], ok: 'Aplicar' });
  if (!sim) return;
  const r = await pedir('presetTutorial');
  if (r.erro) dialogo({ tipo: 'erro', titulo: 'Configuração não aplicada', texto: esc(r.erro) });
  else {
    const exE = $('#scExE'); if (exE) exE.value = 1;   // o CLP virtual passa a pedir a 3ª palavra de entrada também
    dialogo({ titulo: 'Pronto para o tutorial', texto: 'O inversor agora é comandado pela rede e manda a corrente na 3ª palavra. No CODESYS: O→T 4 bytes e T→O 6 bytes. Para desfazer, use <b>Restaurar padrão de fábrica</b> ou <b>P0204 = 5</b> na HMI.', itens: r.itens });
  }
});
async function restaurarFabrica() {
  const sim = await confirmar({ titulo: 'Restaurar o padrão de fábrica?', perigo: true, ok: 'Restaurar',
    texto: 'Equivale a programar <b>P0204 = 5</b> na HMI (padrão WEG 60 Hz). Todos os parâmetros voltam ao valor de fábrica. O motor precisa estar parado.',
    itens: ['Comando volta para a HMI e as entradas digitais (LOC)', 'Rampas, limites, motor e I/O voltam ao padrão', 'IP volta para DHCP (vale na próxima energização ou com P0849 = 1)', 'Histórico de falhas é mantido'] });
  if (!sim) return;
  const r = await pedir('fabrica', 60);
  if (r.erro) dialogo({ tipo: 'erro', titulo: 'Padrão de fábrica não carregado', texto: esc(r.erro) });
  else { dialogo({ titulo: 'Padrão de fábrica restaurado', texto: 'P0204 = 5 executado: o inversor está como saiu da fábrica (60 Hz).' }); renderParametros(true); }
}
$('#btnFabrica').addEventListener('click', restaurarFabrica);
$('#btnFabrica2').addEventListener('click', restaurarFabrica);

function renderCLP(e) {
  const s = e.scanner;
  const el = $('#scEstado');
  if (!s.ativo) { el.textContent = 'Desconectado.'; el.className = 'estado-sc'; }
  else if (s.conectado) {
    el.innerHTML = `Conectado: O→T 0x${s.conn.idOT}, T→O 0x${s.conn.idTO}${s.conn.grupo ? ` (multicast ${s.conn.grupo})` : ''}, RPI ${s.conn.rpi} ms · enviados ${s.conn.tx}, recebidos ${s.conn.rx}${s.erro ? `<br>${esc(s.erro)}` : ''}`;
    el.className = 'estado-sc ' + (s.erro ? 'erro' : 'ok');
  } else { el.textContent = s.erro || 'Conectando…'; el.className = 'estado-sc erro'; }
  const saidas = s.saidas || [];
  $('#scPalavras').innerHTML = saidas.map((v, i) => `<div class="palavra">Saída ${i + 1}${i === 0 ? ' · P0684' : i === 1 ? ' · P0685' : ''}<b>${hx(v)}</b>${i === 1 ? s16(v) : v}</div>`).join('');
  const ent = s.entradas || [];
  $('#scEntradas').innerHTML = ent.length ? ent.map((v, i) => `<div class="palavra">Entrada ${i + 1}${i === 0 ? ' · P0680' : i === 1 ? ' · P0681' : ''}<b>${hx(v)}</b>${i === 1 ? `${s16(v)} → ${nf((s16(v) * (s.p0403 || 60)) / 8192, 1)} Hz` : v}</div>`).join('') : '<p class="vazio">Sem dados.</p>';
  $('#scBits680').innerHTML = ent.length ? bitsHtml(ent[0], BITS_680, 15) : '';
}

// =====================================================================
//  ABA PARÂMETROS
// =====================================================================
let tabParamMontada = false;
function montarParametros() {
  $('#tabParam').innerHTML = '<thead><tr><th>Parâm.</th><th>Descrição</th><th>Valor</th><th>Unid.</th><th>Padrão</th><th>Faixa</th><th>Prop.</th></tr></thead><tbody>' +
    meta.params.map((p) => `<tr data-n="${p.n}"><td>${pn(p.n)}</td><td>${esc(p.nome)}</td><td class="val" tabindex="0"></td><td>${esc(p.un)}</td>
      <td>${formatar(p.n, p.def)}</td><td>${p.hex ? hx(p.min) + '–' + hx(p.max) : `${formatar(p.n, p.min)} a ${formatar(p.n, p.max)}`}</td>
      <td class="prop">${[p.ro && 'ro', p.cfg && 'cfg', p.net && 'rede', ...p.g].filter(Boolean).join(' ')}</td></tr>`).join('') + '</tbody>';
  tabParamMontada = true;
  $('#tabParam').addEventListener('click', (ev) => { const td = ev.target.closest('td.val'); if (td) editar(td); });
  $('#tabParam').addEventListener('keydown', (ev) => { const td = ev.target.closest('td.val'); if (td && ev.key === 'Enter' && !td.querySelector('input,select')) editar(td); });
}
function editar(td) {
  const n = +td.parentElement.dataset.n; const p = meta.map.get(n);
  if (td.querySelector('input,select')) return;
  if (p.ro || p.net) { $('#pMsg').textContent = `${pn(n)} é ${p.net ? 'escrito somente pela rede' : 'somente leitura'}.`; return; }
  const v = ultimo.vals[n];
  td.dataset.editando = '1';
  let campo;
  if (p.op && Object.keys(p.op).length > 1 && p.max - p.min < 60) {
    campo = document.createElement('select');
    for (let k = p.min; k <= p.max; k++) { const o = document.createElement('option'); o.value = k; o.textContent = `${k} = ${p.op[k] ?? '(sem função)'}`; campo.appendChild(o); }
    campo.value = v;
  } else {
    campo = document.createElement('input');
    campo.value = p.hex ? (v & 0xFFFF).toString(16).toUpperCase() : p.dec ? (v / 10 ** p.dec).toFixed(p.dec) : v;
  }
  const ok = document.createElement('button'); ok.textContent = 'Gravar';
  const box = document.createElement('div'); box.className = 'ed'; box.append(campo, ok);
  td.textContent = ''; td.appendChild(box); campo.focus();
  const fechar = () => { delete td.dataset.editando; td.textContent = formatar(n, ultimo.vals[n]); };
  const gravar = () => {
    let bruto;
    const t = String(campo.value).trim().replace(',', '.');
    if (p.hex) bruto = parseInt(t.replace(/h$/i, '').replace(/^0x/i, ''), 16);
    else bruto = Math.round(parseFloat(t) * 10 ** p.dec);
    if (Number.isNaN(bruto)) { $('#pMsg').textContent = 'Valor inválido.'; return; }
    socket.emit('param', { n, valor: bruto }, (r) => {
      $('#pMsg').textContent = r ? `${pn(n)}: ${r.msg}` : `${pn(n)} gravado.`;
      aviso(r ? `${pn(n)} não gravado: ${r.msg}` : `${pn(n)} gravado com sucesso`, r ? 'erro' : 'ok');
    });
    fechar();
  };
  ok.addEventListener('click', gravar);
  campo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') gravar(); if (ev.key === 'Escape') fechar(); });
  campo.addEventListener('blur', () => setTimeout(() => { if (td.dataset.editando && !box.contains(document.activeElement)) fechar(); }, 150));
}
$('#pBusca').addEventListener('input', () => renderParametros(true));
$('#pGrupo').addEventListener('change', () => renderParametros(true));
function renderParametros(filtro) {
  if (!ultimo || !tabParamMontada) return;
  const q = $('#pBusca').value.trim().toLowerCase();
  const g = $('#pGrupo').value;
  for (const tr of $$('#tabParam tbody tr')) {
    const n = +tr.dataset.n; const p = meta.map.get(n); const v = ultimo.vals[n];
    if (filtro) {
      const okQ = !q || String(n).includes(q.replace(/^p0*/, '')) || p.nome.toLowerCase().includes(q);
      const okG = !g || (g === 'MODIF' ? (!p.ro && !p.net && v !== p.def) : p.g.includes(g));
      tr.hidden = !(okQ && okG);
    }
    if (tr.hidden) continue;
    const td = tr.children[2];
    if (!td.dataset.editando) { const o = opcao(n, v); td.textContent = formatar(n, v) + (o ? ` – ${o}` : ''); }
    tr.classList.toggle('mod', !p.ro && !p.net && v !== p.def);
  }
}

// =====================================================================
//  ABA FALHAS
// =====================================================================
$('#redeVac').addEventListener('input', (e) => { $('#redeV').textContent = `${e.target.value} V`; socket.emit('injecao', { nome: 'rede', v: +e.target.value }); });
$$('[data-inj]').forEach((c) => c.addEventListener('change', () => socket.emit('injecao', { nome: c.dataset.inj, v: c.checked })));
function renderFalhas(e) {
  const d = e.drive;
  let h = '';
  if (d.falha) { const f = meta.falhas[d.falha] || {}; h += `<div class="f"><span class="cod">F${String(d.falha).padStart(4, '0')}</span> ${esc(f.nome || '')}</div><p>${esc(f.causa || '')}</p>`; }
  for (const a of d.alarmes) { const al = meta.alarmes[a] || {}; h += `<div class="a"><span class="cod">A${String(a).padStart(4, '0')}</span> ${esc(al.nome || '')}</div><p>${esc(al.causa || '')}</p>`; }
  if (!h) h = '<p class="vazio">Sem falhas nem alarmes.</p>';
  $('#falhaAtual').innerHTML = h;
  const v = e.vals;
  $('#tabHist').innerHTML = '<tr><th></th><th>Falha</th><th>Corrente</th><th>Ud</th><th>Frequência</th><th>Temp.</th><th>P0680</th></tr>' +
    [[50, 'Última'], [60, '2ª'], [70, '3ª']].map(([b, nm]) => `<tr><td>${nm}</td><td>${v[b] ? 'F' + String(v[b]).padStart(4, '0') : '—'}</td><td>${nf(v[b + 1] / 10, 1)} A</td><td>${v[b + 2]} V</td><td>${nf(v[b + 3] / 10, 1)} Hz</td><td>${v[b + 4]} °C</td><td>${hx(v[b + 5])}</td></tr>`).join('');
  $('#redeVac').value = d.redeVac; $('#redeV').textContent = `${d.redeVac} V`;
  $$('[data-inj]').forEach((c) => { c.checked = !!d.inj[c.dataset.inj]; });
}

// =====================================================================
//  GRÁFICO
// =====================================================================
const graf = new Grafico($('#grafico'), $('#legenda'));
(function loopGraf() { if (abaAtiva === 'graf') graf.desenhar(); requestAnimationFrame(loopGraf); })();

// =====================================================================
//  LOG
// =====================================================================
const logEl = $('#log');
function filtroOk(cat) { const c = $(`[data-f="${cat}"]`); return !c || c.checked; }
function addLog(l) {
  if ($('#logPausa').checked) return;
  const cat = l.proto === 'UDP' || l.proto === 'TCP' || l.proto === 'IF' ? 'ENCAP' : l.proto;
  if (!filtroOk(cat)) return;
  const d = document.createElement('div'); d.className = 'l';
  const hora = new Date(l.t).toLocaleTimeString('pt-BR', { hour12: false }) + '.' + String(l.t % 1000).padStart(3, '0');
  const seta = { rx: '◀ rx', tx: '▶ tx', erro: '✖', info: '•', cip: '◆' }[l.dir] || '';
  d.innerHTML = `<span class="t">${hora}</span> <span class="${l.dir === 'cip' ? 'tx' : l.dir}">${seta} [${l.proto}]</span> ${esc(l.txt)}${l.hex ? `<span class="h">${l.hex}</span>` : ''}`;
  const embaixo = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 30;
  logEl.appendChild(d);
  while (logEl.children.length > 800) logEl.firstChild.remove();
  if (embaixo) logEl.scrollTop = logEl.scrollHeight;
}
$('#logLimpar').addEventListener('click', () => { logEl.innerHTML = ''; });
socket.on('proto', addLog);
socket.on('evento', (e) => addLog({ t: e.t, dir: e.tipo === 'falha' || e.tipo === 'erro' ? 'erro' : 'info', proto: 'EVT', txt: e.txt }));

// =====================================================================
//  SOCKET
// =====================================================================
socket.on('init', (d) => {
  meta.params = d.params; meta.map = new Map(d.params.map((p) => [p.n, p]));
  meta.falhas = d.falhas; meta.alarmes = d.alarmes;
  logEl.innerHTML = '';
  d.proto.forEach(addLog);
  d.eventos.forEach((e) => addLog({ t: e.t, dir: e.tipo === 'falha' || e.tipo === 'erro' ? 'erro' : 'info', proto: 'EVT', txt: e.txt }));
  if (!tabParamMontada) montarParametros();
  if (d.ihm) receberInfoIhm(d.ihm);
  if (d.ips) montarListaIps(d.ips);
});
socket.on('ihmInfo', receberInfoIhm);

let cont = 0;
socket.on('estado', (e) => {
  ultimo = e; window.__estados = (window.__estados || 0) + 1;
  renderHMI(e.hmi);
  renderTopo(e);
  renderHud(e);
  atualizarEsteira(e);
  graf.adicionar(e);
  if (++cont % 3 === 0) {
    renderBornes(e);
    if (abaAtiva === 'rede') renderRede(e);
    if (abaAtiva === 'clp') renderCLP(e);
    if (abaAtiva === 'falhas') renderFalhas(e);
    if (abaAtiva === 'ihm') renderAbaIhm(e);
  }
  if (abaAtiva === 'param' && cont % 12 === 0) renderParametros(false);
});
socket.on('estado', (e) => ihmTela.atualizar(e.ihm));
socket.on('disconnect', () => { $('#chipP0801').textContent = 'servidor desconectado'; $('#chipP0801').className = 'chip erro'; });

// =====================================================================
//  IHM DO PAINEL (cliente Modbus TCP) — tela, IHM ampliada e aba
// =====================================================================
const ihmMeta = { info: null, sujo: false };
(function loopIhm() {
  ihmTela.desenhar();
  const ok = !!(ultimo && ultimo.ihm && ultimo.ihm.comOk);
  atualizarTexturaIHM(ok);
  $('#ledIhm2d').className = 'led-ihm' + (ok ? '' : ' alerta');
  setTimeout(() => requestAnimationFrame(loopIhm), 66);   // ~15 quadros/s bastam para a tela
})();

// ---- câmera e IHM ampliada ----
$('#btnVerIHM').addEventListener('click', () => focarIHM(true));
$('#btnVistaGeral').addEventListener('click', () => focarIHM(false));
const janela = $('#janelaIhm');
const JAN_CHAVE = 'cfw500.janelaIhm';
let janEst = { w: 640, x: null, y: null, min: false };
try { Object.assign(janEst, JSON.parse(localStorage.getItem(JAN_CHAVE) || '{}')); } catch { /* sem armazenamento */ }
const salvarJanela = () => { try { localStorage.setItem(JAN_CHAVE, JSON.stringify(janEst)); } catch { /* ok */ } };
let ihmFoco = false;
function posicionarJanela() {
  const vw = window.innerWidth; const vh = window.innerHeight;
  janEst.w = Math.max(340, Math.min(janEst.w, vw - 16));
  if (janEst.x === null) { janEst.x = vw - janEst.w - 24; janEst.y = 70; }   // canto direito, sobre a cena
  const h = janela.offsetHeight || 300;
  janEst.x = Math.max(8 - janEst.w + 120, Math.min(janEst.x, vw - 120));    // sempre sobra um pedaço visível
  janEst.y = Math.max(0, Math.min(janEst.y, vh - 40));
  janela.style.width = janEst.w + 'px';
  janela.style.transform = `translate(${janEst.x}px, ${janEst.y}px)`;
  janela.classList.toggle('min', !!janEst.min);
  void h;
}
function abrirIhm() {
  $('#ihmMoldura').appendChild(canvasIhm);
  janela.hidden = false; janEst.min = false; posicionarJanela();
  janela.classList.add('ativa'); ihmFoco = true;
  $('#btnAmpliar').setAttribute('aria-pressed', 'true');
}
function fecharIhm() {
  janela.hidden = true; ihmTela.teclado = null; canvasIhm.remove(); ihmFoco = false;
  $('#btnAmpliar').setAttribute('aria-pressed', 'false'); $('#btnAmpliar').focus();
}
$('#btnAmpliar').addEventListener('click', () => (janela.hidden ? abrirIhm() : fecharIhm()));
$('#fecharIhm').addEventListener('click', fecharIhm);
$('#ihmMin').addEventListener('click', () => { janEst.min = !janEst.min; posicionarJanela(); salvarJanela(); });
window.addEventListener('resize', () => { if (!janela.hidden) posicionarJanela(); });
// foco: o teclado do PC só vai para a IHM quando a janela foi a última coisa clicada
document.addEventListener('pointerdown', (e) => { ihmFoco = !janela.hidden && janela.contains(e.target); janela.classList.toggle('ativa', ihmFoco); }, true);
// arrastar pela barra de título
(() => {
  const barra = $('#janelaBarra'); let ini = null;
  barra.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    ini = { px: e.clientX, py: e.clientY, x: janEst.x, y: janEst.y }; barra.setPointerCapture(e.pointerId);
  });
  barra.addEventListener('pointermove', (e) => { if (!ini) return; janEst.x = ini.x + e.clientX - ini.px; janEst.y = ini.y + e.clientY - ini.py; posicionarJanela(); });
  const solta = () => { if (ini) { ini = null; salvarJanela(); } };
  barra.addEventListener('pointerup', solta); barra.addEventListener('pointercancel', solta);
  barra.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) { janEst.min = !janEst.min; posicionarJanela(); salvarJanela(); } });
})();
// redimensionar pela alça (a altura acompanha a proporção da tela da IHM)
(() => {
  const alca = $('#janelaAlca'); let ini = null;
  alca.addEventListener('pointerdown', (e) => { e.preventDefault(); ini = { px: e.clientX, w: janEst.w }; alca.setPointerCapture(e.pointerId); });
  alca.addEventListener('pointermove', (e) => { if (!ini) return; janEst.w = ini.w + e.clientX - ini.px; posicionarJanela(); });
  const solta = () => { if (ini) { ini = null; salvarJanela(); } };
  alca.addEventListener('pointerup', solta); alca.addEventListener('pointercancel', solta);
})();
const xy = (e) => { const r = canvasIhm.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * canvasIhm.width, ((e.clientY - r.top) / r.height) * canvasIhm.height]; };
canvasIhm.addEventListener('pointerdown', (e) => { e.preventDefault(); canvasIhm.setPointerCapture(e.pointerId); ihmTela.toque(...xy(e), 'down'); });
canvasIhm.addEventListener('pointerup', (e) => ihmTela.toque(...xy(e), 'up'));
canvasIhm.addEventListener('pointercancel', () => ihmTela.toque(-1, -1, 'cancel'));
canvasIhm.addEventListener('pointermove', (e) => { if (!janela.hidden) canvasIhm.style.cursor = ihmTela.apontar(...xy(e)) ? 'pointer' : 'default'; });
document.addEventListener('keydown', (e) => {
  if (janela.hidden || !ihmFoco || $('#dlg').open) return;
  if (e.target.matches && e.target.matches('input, select, textarea')) return;
  if (ihmTela.tecla(e.key)) e.preventDefault();
});

// ---- aba IHM Modbus ----
const AREA_NOME = { coil: 'Coil (0x)', di: 'Discrete Input (1x)', ir: 'Input Register (3x)', hr: 'Holding Register (4x)' };
const AREA_CURTA = { coil: 'Coil', di: 'DI', ir: 'IR', hr: 'HR' };
const PREF = { coil: 0, di: 1, ir: 3, hr: 4 };
const modicon = (a, n) => `${PREF[a]}${String(+n + 1).padStart(5, '0')}`;

function receberInfoIhm(info) {
  ihmMeta.info = info;
  ihmTela.atualizar(ultimo ? ultimo.ihm : null, info.cfg);
  if (!ihmMeta.sujo) montarFormIhm(info.cfg);
}

function montarFormIhm(cfg) {
  const info = ihmMeta.info;
  $('#ihmIp').value = cfg.ip; $('#ihmPorta').value = cfg.porta; $('#ihmUnit').value = cfg.unitId;
  $('#ihmVarr').value = cfg.varredura; $('#ihmTimeout').value = cfg.timeout; $('#ihmOrdem').value = cfg.ordem32; $('#ihmTitulo').value = cfg.titulo;
  const opts = (lista, v) => lista.map(([k, t]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${t}</option>`).join('');
  $('#ihmTags').innerHTML = `<thead><tr><th>Elemento da tela</th><th>Ativa</th><th>Nome da tag</th><th>Área Modbus</th><th>Endereço</th><th>Ref.</th><th>Tipo</th><th>Bit</th>
    <th>Fator</th><th>Offset</th><th>Dec.</th><th>Unid.</th><th>Mín.</th><th>Máx.</th><th>Botão</th><th>Valor no CLP</th></tr></thead><tbody>` +
    info.papeis.map((p) => {
      const t = cfg.tags[p.id];
      const areas = Object.keys(AREA_NOME).filter((a) => (p.dir === 'esc' ? info.areas[a].escrita : true) && !(p.num && info.areas[a].bits));
      const tipos = info.tipos.filter((x) => (p.num ? !['BOOL', 'BIT'].includes(x) : ['BOOL', 'BIT'].includes(x)));
      const bits = info.areas[t.area].bits;
      return `<tr data-id="${p.id}" class="${t.ativo ? '' : 'off'}">
        <td><span class="papel">${esc(p.desc)}</span><span class="dir">${p.dir === 'esc' ? 'IHM escreve no CLP' : 'IHM lê do CLP'}</span></td>
        <td><input type="checkbox" data-k="ativo" ${t.ativo ? 'checked' : ''} aria-label="Tag ativa"></td>
        <td><input class="nome" data-k="nome" value="${esc(t.nome)}" spellcheck="false"></td>
        <td><select data-k="area">${opts(areas.map((a) => [a, AREA_NOME[a]]), t.area)}</select></td>
        <td><input type="number" data-k="end" min="0" max="65535" value="${t.end}"></td>
        <td class="ref"><code>${modicon(t.area, t.end)}</code></td>
        <td>${bits ? 'BOOL' : `<select data-k="tipo">${opts(tipos.map((x) => [x, x === 'BOOL' ? 'BOOL (0/≠0)' : x === 'BIT' ? 'BIT de palavra' : x]), t.tipo)}</select>`}</td>
        <td>${!bits && t.tipo === 'BIT' ? `<input type="number" class="peq" data-k="bit" min="0" max="15" value="${t.bit}">` : '—'}</td>
        ${p.num ? `<td><input type="number" step="any" class="peq" data-k="fator" value="${t.fator}"></td><td><input type="number" step="any" class="peq" data-k="offset" value="${t.offset}"></td>
          <td><input type="number" class="peq" data-k="dec" min="0" max="4" value="${t.dec}"></td><td><input class="un" data-k="un" value="${esc(t.un)}"></td>
          <td><input type="number" step="any" class="peq" data-k="min" value="${t.min}"></td><td><input type="number" step="any" class="peq" data-k="max" value="${t.max}"></td>`
        : '<td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>'}
        <td>${p.modos ? `<select data-k="modo">${opts(p.modos.map((m) => [m, m === 'alternar' ? 'Alternar (retentivo)' : 'Pulso']), t.modo)}</select>${t.modo === 'pulso' ? ` <input type="number" class="peq" data-k="pulsoMs" min="50" max="5000" value="${t.pulsoMs}" aria-label="Duração do pulso (ms)"> ms` : ''}` : '—'}</td>
        <td class="vivo" data-vivo="${p.id}">—</td></tr>`;
    }).join('') + '</tbody>';
  renderMapaIhm(cfg);
}

function lerFormIhm() {
  const cfg = JSON.parse(JSON.stringify(ihmMeta.info.cfg));
  Object.assign(cfg, { ip: $('#ihmIp').value.trim(), porta: +$('#ihmPorta').value, unitId: +$('#ihmUnit').value, varredura: +$('#ihmVarr').value,
    timeout: +$('#ihmTimeout').value, ordem32: $('#ihmOrdem').value, titulo: $('#ihmTitulo').value });
  for (const tr of $$('#ihmTags tbody tr')) {
    const t = cfg.tags[tr.dataset.id];
    for (const el of $$('[data-k]', tr)) {
      const k = el.dataset.k;
      t[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? t[k] : +el.value) : el.value;
    }
  }
  return cfg;
}

function marcarSujo(ev) {
  ihmMeta.sujo = true; $('#ihmSujo').hidden = false;
  const el = ev && ev.target;
  const cfg = lerFormIhm();
  ihmMeta.info = { ...ihmMeta.info, cfg };
  // área, tipo, modo e "ativa" mudam as colunas da linha: redesenha; nos campos de texto só atualiza a referência
  if (el && (el.tagName === 'SELECT' || el.type === 'checkbox')) {
    const tr = el.closest('tr'); const k = el.dataset.k;
    montarFormIhm(cfg);
    const novo = tr && $(`#ihmTags tr[data-id="${tr.dataset.id}"] [data-k="${k}"]`); if (novo) novo.focus();
  } else {
    for (const tr of $$('#ihmTags tbody tr')) { const t = cfg.tags[tr.dataset.id]; $('.ref code', tr).textContent = modicon(t.area, t.end); }
    renderMapaIhm(cfg);
  }
}
$('#ihmTags').addEventListener('change', marcarSujo);
$('#ihmTags').addEventListener('input', (ev) => { if (ev.target.tagName === 'INPUT' && ev.target.type !== 'checkbox') marcarSujo(ev); });
for (const id of ['#ihmIp', '#ihmPorta', '#ihmUnit', '#ihmVarr', '#ihmTimeout', '#ihmOrdem', '#ihmTitulo']) $(id).addEventListener('input', () => { ihmMeta.sujo = true; $('#ihmSujo').hidden = false; });
$('#ihmSalvar').addEventListener('click', async () => {
  const cfg = lerFormIhm();
  await pedir('ihmCfg', cfg);
  ihmMeta.sujo = false; $('#ihmSujo').hidden = true;
  const ativas = Object.values(cfg.tags).filter((t) => t.ativo).length;
  dialogo({ titulo: 'Configurações realizadas com sucesso', texto: 'A configuração da IHM foi salva e já está valendo.',
    itens: [`Servidor Modbus (CLP): ${cfg.ip}:${cfg.porta}`, `Unit ID ${cfg.unitId} · varredura ${cfg.varredura} ms · timeout ${cfg.timeout} ms`, `${ativas} tags ativas`,
      ultimo && ultimo.ihm && ultimo.ihm.ativo ? 'A comunicação foi reiniciada com os novos dados' : 'A comunicação está desativada: clique em Ativar comunicação'] });
});
$('#ihmLigar').addEventListener('click', async () => {
  const ativo = ultimo && ultimo.ihm && ultimo.ihm.ativo;
  if (!ativo && ihmMeta.sujo) { await pedir('ihmCfg', lerFormIhm()); ihmMeta.sujo = false; $('#ihmSujo').hidden = true; }
  const r = await pedir('ihmCom', !ativo);
  aviso(ativo ? 'Comunicação da IHM parada' : `Comunicação da IHM ativada → ${r.alvo || ''}`, ativo ? 'info' : 'ok');
});
$('#ihmPadrao').addEventListener('click', async () => {
  const sim = await confirmar({ titulo: 'Restaurar o mapa padrão da IHM?', perigo: true, ok: 'Restaurar',
    texto: 'As tags e a conexão voltam ao padrão. O que você mudou na tabela será perdido.',
    itens: ['Botões em Coils 0, 1 e 2 · sinais em Discrete Inputs 0, 1 e 2', 'Set point em HR 0 · velocidade em IR 0 · corrente em IR 1', 'CLP em 192.168.100.10:502, Unit ID 1'] });
  if (!sim) return;
  ihmMeta.sujo = false; $('#ihmSujo').hidden = true;
  await pedir('ihmPadrao');
  dialogo({ titulo: 'Mapa padrão restaurado', texto: 'As tags e a conexão da IHM voltaram ao padrão.' });
});
$('#ihmCopiar').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#ihmST').textContent); $('#ihmCopiar').textContent = 'Copiado'; aviso('Programa ST copiado'); } catch { $('#ihmCopiar').textContent = 'Selecione e copie'; }
  setTimeout(() => { $('#ihmCopiar').textContent = 'Copiar'; }, 1500);
});

function renderAbaIhm(e) {
  const s = e.ihm; const info = ihmMeta.info; if (!s || !info) return;
  const cfg = info.cfg;
  $('#arqMb').textContent = `→ ${cfg.ip}:${cfg.porta} · Unit ${cfg.unitId}`;
  $('#ihmLigar').textContent = s.ativo ? 'Parar comunicação' : 'Ativar comunicação';
  $('#ihmLigar').className = s.ativo ? 'sec perigo' : '';
  const el = $('#ihmEstado');
  if (!s.ativo) { el.textContent = 'Comunicação desativada. A IHM não está consultando o CLP.'; el.className = 'estado-sc'; }
  else if (s.comOk) { el.textContent = `Comunicando com ${cfg.ip}:${cfg.porta} · ${s.ciclos} varreduras completas`; el.className = 'estado-sc ok'; }
  else { el.textContent = s.erro ? `Sem comunicação: ${s.erro}` : `Conectando a ${cfg.ip}:${cfg.porta}…`; el.className = 'estado-sc erro'; }
  const st = s.stats;
  $('#ihmStats').innerHTML = st ? [['Requisições', st.tx], ['Respostas', st.rx], ['Timeouts', st.timeouts], ['Exceções', st.excecoes],
    ['Tempo de resposta', `${nf(st.tResp, 1)} ms`], ['Pior tempo', `${nf(st.tRespMax, 1)} ms`], ['Conexões TCP', st.conexoes]]
    .map(([a, b]) => `<div class="palavra">${a}<b>${b}</b></div>`).join('') : '<p class="vazio">Sem estatísticas (comunicação parada).</p>';
  for (const td of $$('#ihmTags [data-vivo]')) {
    const id = td.dataset.vivo; const v = s.valores[id]; const t = cfg.tags[id];
    td.classList.toggle('erro', !!(v && !v.ok));
    if (!t.ativo) td.textContent = 'desabilitada';
    else if (!v) td.textContent = '—';
    else if (!v.ok) td.textContent = v.erro;
    else if (typeof v.v === 'boolean') td.textContent = v.v ? 'TRUE (1)' : 'FALSE (0)';
    else td.textContent = `${nf(v.v, t.dec || 0)} ${t.un}` + (v.raw !== undefined && (t.fator !== 1 || t.offset) ? `  (bruto ${v.raw})` : '');
  }
}

// ---- tabela de mapeamento e código ST para o CODESYS ----
function renderMapaIhm(cfg) {
  const info = ihmMeta.info;
  const LADO = { hr: 'Holding Register → canal de ENTRADA do CLP (%IW)', ir: 'Input Register ← canal de SAÍDA do CLP (%QW)', coil: 'Coil → entrada de bit (%IX)', di: 'Discrete Input ← saída de bit (%QX)' };
  $('#ihmMapa').innerHTML = '<tr><th>Tag</th><th>Área / endereço</th><th>No CODESYS (Modbus TCP Slave Device)</th></tr>' +
    info.papeis.filter((p) => cfg.tags[p.id].ativo).map((p) => {
      const t = cfg.tags[p.id];
      return `<tr><td><b>${esc(t.nome)}</b></td><td>${AREA_CURTA[t.area]} ${t.end}${t.tipo === 'BIT' ? `.${t.bit}` : ''} <small>(${modicon(t.area, t.end)})</small></td><td>${LADO[t.area]}</td></tr>`;
    }).join('');
  $('#ihmST').textContent = gerarST(cfg);
}

function gerarST(cfg) {
  const T = cfg.tags; const ativo = (id) => T[id].ativo;
  const decl = []; const palavras = new Map();
  const TIPO_CDS = { INT: 'INT', UINT: 'UINT', DINT: 'DINT', UDINT: 'UDINT', REAL: 'REAL', BOOL: 'UINT' };
  const ref = (id) => {
    const t = T[id];
    if (t.area === 'coil' || t.area === 'di') return { ler: t.nome, esc: (x) => `${t.nome} := ${x};` };
    if (t.tipo === 'BIT') { const w = `W_${AREA_CURTA[t.area]}${t.end}`; palavras.set(w, `${AREA_CURTA[t.area]} ${t.end}`); return { ler: `${w}.${t.bit}`, esc: (x) => `${w}.${t.bit} := ${x};` }; }
    if (t.tipo === 'BOOL') return { ler: `(${t.nome} <> 0)`, esc: (x) => `${t.nome} := BOOL_TO_UINT(${x});` };
    return { ler: t.nome, esc: (x) => `${t.nome} := ${x};` };
  };
  for (const p of ihmMeta.info.papeis) {
    const t = T[p.id]; if (!t.ativo) continue;
    if (t.tipo === 'BIT' && !['coil', 'di'].includes(t.area)) continue;
    const tipo = ['coil', 'di'].includes(t.area) ? 'BOOL' : TIPO_CDS[t.tipo];
    decl.push(`  ${t.nome.padEnd(16)}: ${tipo.padEnd(6)}; // ${AREA_NOME[t.area]} ${t.end}${['DINT', 'UDINT', 'REAL'].includes(t.tipo) ? ' e ' + (t.end + 1) + ` (${cfg.ordem32 === 'baixaPrimeiro' ? 'palavra baixa primeiro' : 'palavra alta primeiro'})` : ''}`);
  }
  const L = [];
  const sp = ativo('setpoint') && T.setpoint; const vel = ativo('velocidade') && T.velocidade;
  const eng = (t, v) => (t.fator === 1 && !t.offset ? v : `(${v} * ${t.fator}${t.offset ? ` + ${t.offset}` : ''})`);
  const brutoDe = (t, e) => (t.fator === 1 && !t.offset ? e : `(${e}${t.offset ? ` - ${t.offset}` : ''}) / ${t.fator}`);
  L.push('// ---------- IHM -> inversor ----------');
  L.push('P0684 := 16#0012;            // bit1 Habilita Geral + bit4 Remoto (sempre)');
  let fbs = '';
  for (const [id, bit, inv, txt] of [['liga', 0, false, 'Gira/Para'], ['reverso', 2, true, 'Sentido (1 = horário)']]) {
    if (!ativo(id)) continue;
    const r = ref(id).ler;
    if (T[id].modo === 'pulso') {
      fbs += `  rt_${id} : R_TRIG;  x_${id} : BOOL;   // pulso da IHM alterna o estado\n`;
      L.push(`rt_${id}(CLK := ${r});`, `IF rt_${id}.Q THEN x_${id} := NOT x_${id}; END_IF`);
      L.push(`P0684.${bit} := ${inv ? 'NOT ' : ''}x_${id};${' '.repeat(Math.max(1, 13 - id.length))}// ${txt}`);
    } else L.push(`P0684.${bit} := ${inv ? 'NOT ' : ''}${r};${' '.repeat(Math.max(1, 18 - r.length))}// ${txt}`);
  }
  if (ativo('reset')) L.push(`P0684.7 := ${ref('reset').ler};   // Reset de falha (borda de subida)`);
  if (sp) {
    const e = sp.fator === 1 && !sp.offset && sp.tipo !== 'REAL' ? (sp.tipo === 'DINT' ? sp.nome : `${sp.tipo}_TO_DINT(${sp.nome})`) : null;
    if (e) L.push(`P0685 := DINT_TO_INT(${e} * 8192 / 1800);   // ${sp.un}: 8192 = P0403 = 60 Hz = 1800 rpm`);
    else L.push(`P0685 := REAL_TO_INT(${eng(sp, `${sp.tipo === 'REAL' ? '' : sp.tipo + '_TO_REAL('}${sp.nome}${sp.tipo === 'REAL' ? '' : ')'}`)} * 8192.0 / 1800.0);`);
  }
  L.push('', '// ---------- inversor -> IHM ----------');
  if (vel) {
    if (vel.fator === 1 && !vel.offset && ['INT', 'DINT'].includes(vel.tipo)) L.push(`${vel.nome} := DINT_TO_${vel.tipo}(INT_TO_DINT(P0681) * 1800 / 8192);   // ${vel.un}`);
    else L.push(`${vel.nome} := REAL_TO_${vel.tipo === 'REAL' ? 'REAL' : vel.tipo}(${brutoDe(vel, 'INT_TO_REAL(P0681) * 1800.0 / 8192.0')});`);
  }
  for (const [id, expr, txt] of [['operando', 'P0680.8', 'girando'], ['sentidoRev', 'NOT P0680.10', 'anti-horário'], ['falha', 'P0680.15', 'em falha']]) {
    if (ativo(id)) L.push(`${ref(id).esc(expr)}${' '.repeat(Math.max(1, 30 - ref(id).esc(expr).length))}// ${txt}`);
  }
  if (ativo('corrente')) {
    const c = T.corrente;
    if (Math.abs(c.fator - 0.1) < 1e-9 && !c.offset && c.tipo === 'UINT') L.push(`${c.nome} := INT_TO_UINT(P0003);   // P0003 já vem em 0,1 A (3ª palavra de entrada, P0820 = 3)`);
    else L.push(`${c.nome} := REAL_TO_${c.tipo === 'REAL' ? 'REAL' : c.tipo}(${brutoDe(c, 'INT_TO_REAL(P0003) * 0.1')});   // P0820 = 3`);
  }
  for (const [w, o] of palavras) decl.push(`  ${w.padEnd(16)}: WORD;   // ${o} (bits de estado)`);
  return `PROGRAM IHM_CFW500
VAR
  // ---- Modbus TCP Slave Device (tags da IHM) ----
${decl.join('\n')}
  // ---- Scanner EtherNet/IP: CFW500 (assemblies 100/150) ----
  P0684 : WORD;   // saída palavra 1 - controle
  P0685 : INT;    // saída palavra 2 - referência 13 bits
  P0680 : WORD;   // entrada palavra 1 - estado
  P0681 : INT;    // entrada palavra 2 - velocidade 13 bits
${ativo('corrente') ? '  P0003 : INT;    // entrada palavra 3 - corrente (P0820 = 3)\n' : ''}${fbs}END_VAR

${L.join('\n')}
`;
}

// ---- telegramas ----
const ihmLogEl = $('#ihmLog');
const FC_NOME = { 1: 'Read Coils', 2: 'Read Discrete Inputs', 3: 'Read Holding Registers', 4: 'Read Input Registers', 5: 'Write Single Coil', 6: 'Write Single Register', 16: 'Write Multiple Registers' };
function descreverQuadro(q) {
  if (q.dir === 'erro') return q.txt;
  const b = q.hex.match(/../g).map((x) => parseInt(x, 16));
  const fc = b[7]; const u16 = (i) => (b[i] << 8) | b[i + 1];
  if (fc & 0x80) return `Exceção ${b[8]} em ${FC_NOME[fc & 0x7f] || 'FC ' + (fc & 0x7f)}`;
  if (q.dir === 'tx') {
    if (fc <= 4) return `${FC_NOME[fc]} · início ${u16(8)} · qtd ${u16(10)}`;
    if (fc === 5) return `${FC_NOME[fc]} · ${u16(8)} ← ${u16(10) ? 'ON' : 'OFF'}`;
    if (fc === 6) return `${FC_NOME[fc]} · ${u16(8)} ← ${u16(10)}`;
    if (fc === 16) return `${FC_NOME[fc]} · início ${u16(8)} · qtd ${u16(10)}`;
  } else {
    if (fc === 3 || fc === 4) { const v = []; for (let i = 0; i < b[8] / 2; i++) v.push(u16(9 + i * 2)); return `${FC_NOME[fc]} · [${v.join(', ')}] · ${nf(q.ms, 1)} ms`; }
    if (fc === 1 || fc === 2) return `${FC_NOME[fc]} · bytes ${b.slice(9).map((x) => x.toString(2).padStart(8, '0')).join(' ')} · ${nf(q.ms, 1)} ms`;
    return `${FC_NOME[fc] || 'FC ' + fc} OK · ${nf(q.ms, 1)} ms`;
  }
  return '';
}
socket.on('ihmQuadros', (lista) => {
  if ($('#ihmLogPausa').checked) return;
  const leituras = $('#ihmLogLeitura').checked;
  const frag = document.createDocumentFragment();
  for (const q of lista) {
    const fc = q.fc & 0x7f;
    if (!leituras && fc >= 1 && fc <= 4 && q.dir !== 'erro' && !(q.fc & 0x80)) continue;
    const d = document.createElement('div'); d.className = 'l';
    const hora = new Date(q.t).toLocaleTimeString('pt-BR', { hour12: false }) + '.' + String(q.t % 1000).padStart(3, '0');
    d.innerHTML = `<span class="t">${hora}</span> <span class="${q.dir}">${q.dir === 'tx' ? '▶ tx' : q.dir === 'rx' ? '◀ rx' : '✖'}</span> ${esc(descreverQuadro(q))}${q.hex ? `<span class="h">${q.hex.match(/../g).join(' ')}</span>` : ''}`;
    frag.appendChild(d);
  }
  const embaixo = ihmLogEl.scrollTop + ihmLogEl.clientHeight >= ihmLogEl.scrollHeight - 30;
  ihmLogEl.appendChild(frag);
  while (ihmLogEl.children.length > 400) ihmLogEl.firstChild.remove();
  if (embaixo) ihmLogEl.scrollTop = ihmLogEl.scrollHeight;
});
$('#ihmLogLimpar').addEventListener('click', () => { ihmLogEl.innerHTML = ''; });

// =====================================================================
//  IP DO INVERSOR (P0810..P0815 + P0849)
// =====================================================================
function montarListaIps(ips) {
  const sel = $('#ipLista'); const atual = sel.value;
  sel.innerHTML = '<option value="">— escolha —</option>' + ips.filter((i) => !i.interno || i.ip === '127.0.0.1')
    .map((i) => {
      const nota = i.ip === '192.168.100.20' ? ' — CFW500 (recomendado)' : i.ip === '192.168.100.10' ? ' — reservado ao CODESYS' : i.ip === '127.0.0.1' ? ' — só este PC' : '';
      return `<option value="${esc(i.ip)}">${esc(i.ip)} · ${esc(i.nome)}${nota}</option>`;
    }).join('');
  if (atual) sel.value = atual;
}
$('#ipLista').addEventListener('change', (e) => { if (e.target.value) $('#ipManual').value = e.target.value; });
$('#ipAtualizar').addEventListener('click', () => socket.emit('ips', montarListaIps));
$('#ipAplicar').addEventListener('click', async () => {
  const ip = $('#ipManual').value.trim() || $('#ipLista').value;
  if (!ip) { dialogo({ tipo: 'aviso', titulo: 'Escolha um IP', texto: 'Escolha um IP da lista ou digite um.' }); return; }
  if (ip === '192.168.100.10') {
    const seguir = await dialogo({ tipo: 'aviso', titulo: 'Esse é o IP do CODESYS', ok: 'Usar mesmo assim', cancelar: 'Escolher outro',
      texto: 'Na rede virtual, <b>192.168.100.10</b> é do CLP (CODESYS) e <b>192.168.100.20</b> é do CFW500. Se os dois usarem o mesmo IP, as portas EtherNet/IP conflitam e a conexão não abre.' });
    if (!seguir) return;
  }
  const sim = await confirmar({ titulo: `Mudar o IP do inversor para ${esc(ip)}?`, ok: 'Aplicar',
    texto: 'A interface Ethernet reinicializa: as conexões do CLP caem e ele precisa reconectar no novo IP.',
    itens: ['P0810 = 0 (IP por parâmetros)', `P0811…P0814 = ${ip}`, `P0815 = ${+$('#ipCidr').value || 24}`, 'P0849 = 1 (aplica)'] });
  if (!sim) return;
  const r = await pedir('eipIp', { ip, cidr: +$('#ipCidr').value });
  $('#ipMsg').textContent = '';
  if (r.erro) { dialogo({ tipo: 'erro', titulo: 'IP não aplicado', texto: esc(r.erro) }); return; }
  setTimeout(() => {
    const atual = ultimo && ultimo.eip.bindIp;
    if (atual === ip) dialogo({ titulo: 'Configurações realizadas com sucesso', texto: `O CFW500 agora responde em <b>${esc(ip)}</b>. Aponte o CLP para esse IP.` });
    else dialogo({ tipo: 'aviso', titulo: 'Parâmetros gravados, IP não mudou', texto: `O IP ${esc(ip)} não existe neste computador, então o inversor continua em ${esc(atual === '0.0.0.0' ? 'todas as placas' : atual)}. Crie o IP (2-criar-rede-virtual.bat) ou escolha um da lista.` });
  }, 900);
});
$('#ipPadrao').addEventListener('click', async () => {
  const r = await pedir('eipIp', { padrao: true });
  if (r.erro) dialogo({ tipo: 'erro', titulo: 'Não aplicado', texto: esc(r.erro) });
  else dialogo({ titulo: 'Configurações realizadas com sucesso', texto: 'P0810 = 1 (DHCP) e P0849 = 1: o inversor volta ao IP de inicialização.' });
});
