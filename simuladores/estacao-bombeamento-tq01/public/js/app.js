// Tela da estação de bombeamento TQ-01 — mesma linguagem visual dos simuladores do HUB.
import { el, svg, fmt } from './util.js';
import { createProcess3D } from './process3d.js';
import { createSinotico } from './sinotico.js';
import { createTrend, createLevelGauge, createPressureGauge } from './medidores.js';
import { createCFW } from './cfw-view.js';
import { createIHM } from './ihm-view.js';
import { createSirene } from './sirene.js';

const $ = (id) => document.getElementById(id);
let state = null;
let ws = null;
let diagLines = [];

// ------------------------------------------------------------------ WebSocket
function connectWs() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  window.__ws = ws;   // acesso de depuração (testes da tela)
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.log) { addLog(msg.log); return; }
    if (msg.logs) { diagLines = msg.logs.slice(); renderLog(); return; }
    if (msg.clp) { onClpReply(msg); return; }
    if (msg.comissionar) { const r = msg.comissionar; toast(r.erros.length ? `Inversor: ${r.erros.join('; ')}` : r.aplicados.length ? `Inversor parametrizado: ${r.aplicados.join(', ')}` : 'Inversor já estava parametrizado para a bancada'); return; }
    if (msg.erro) { toast(msg.erro); return; }
    if (msg.estado) onState(msg.estado);
  };
  ws.onclose = () => { setTimeout(connectWs, 1500); $('clpBadge').textContent = 'simulador fechado'; $('clpBadge').className = 'badge off'; };
}
const send = (c) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(c)); };

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3500);
}
function addLog(l) { diagLines.push(l); if (diagLines.length > 400) diagLines.shift(); renderLog(); }
function renderLog() { const b = $('diagBox'); b.value = diagLines.join('\n'); b.scrollTop = b.scrollHeight; }

// ------------------------------------------------------------------ Painel de operação (porta)
const DOOR = {
  S1: { tipo: 'pb', kind: 'go', text: 'Liga B-01', sub: 'S1 · NA · ED00' },
  S2: { tipo: 'pb', kind: 'stop', text: 'Desliga B-01', sub: 'S2 · NF · ED01' },
  S3: { tipo: 'pb', kind: 'reset', text: 'Reset de falhas', sub: 'S3 · NA · ED02' },
};
function buildDoor() {
  const host = $('doorHost'); host.innerHTML = '';
  const lamps = {}, buttons = {};
  el('div', { class: 'door-title' }, host).textContent = 'ESTAÇÃO DE BOMBEAMENTO TQ-01 — PAINEL DE OPERAÇÃO';
  const ihmRow = el('div', { class: 'door-ihm', id: 'ihmHost' }, host); ihmRow.title = 'IHM do operador montada na porta';
  const lamp = (parent, color, text, sub) => {
    const d = el('div', { class: 'device' }, parent);
    const l = el('div', { class: `lamp ${color}`, role: 'img', 'aria-label': text }, d);
    const t = el('div', { class: 'tagplate' }, d); t.textContent = text; const s = el('small', {}, t); s.textContent = sub;
    return l;
  };
  const push = (parent, name, kind, text, sub) => {
    const d = el('div', { class: 'device' }, parent);
    const b = el('button', { class: `pb ${kind}`, 'aria-label': `${text} (${name})` }, d);
    b.textContent = kind === 'go' ? 'I' : kind === 'stop' ? 'O' : 'R';
    const t = el('div', { class: 'tagplate' }, d); t.textContent = text; const sm = el('small', {}, t); sm.textContent = sub;
    let down = false;
    const press = (v) => { if (down === v) return; down = v; b.classList.toggle('down', v); send({ tipo: 'btn', id: name, down: v }); };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture?.(e.pointerId); } catch (_) { /* sem ponteiro ativo */ } press(true); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => b.addEventListener(ev, () => press(false)));
    b.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(true); } });
    b.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') press(false); });
    buttons[name] = b; return b;
  };
  // Coluna 1: sinalização
  const c0 = el('div', { class: 'door-col' }, host);
  el('h3', {}, c0).textContent = 'Sinalização';
  lamps.H1 = lamp(c0, 'green', 'Em operação', 'H1 · SD00');
  lamps.H2 = lamp(c0, 'amber', 'Alarme', 'H2 · SD01');
  lamps.H3 = lamp(c0, 'red', 'Falha', 'H3 · SD02');
  const dSir = el('div', { class: 'device' }, c0);
  const sirene = el('div', { class: 'sirene', role: 'img', 'aria-label': 'Sirene' }, dSir);
  const tS = el('div', { class: 'tagplate' }, dSir); tS.textContent = 'Sirene'; el('small', {}, tS).textContent = 'H4 · SD03';
  // Coluna 2: comando
  const c1 = el('div', { class: 'door-col' }, host);
  el('h3', {}, c1).textContent = 'Bomba B-01';
  const dSel = el('div', { class: 'device' }, c1);
  const sel = el('div', { class: 'selector two', role: 'radiogroup', 'aria-label': 'Manual / automático' }, dSel);
  const knob = el('div', { class: 'knob', tabindex: 0, role: 'button', title: 'Clique à esquerda ou à direita do knob para girar' }, sel);
  const pos = [['manual', 'Man'], ['auto', 'Auto']];
  const selBtns = pos.map(([v, label], i) => { const b = el('button', { class: `p${i * 2}`, role: 'radio', 'aria-pressed': 'false' }, sel); b.textContent = label; b.onclick = () => send({ tipo: 'seletor', pos: v }); return b; });
  const tSel = el('div', { class: 'tagplate' }, dSel); tSel.textContent = 'Manual / automático'; el('small', {}, tSel).textContent = 'S4 · NA · ED03';
  knob.onclick = (e) => { const r = knob.getBoundingClientRect(); send({ tipo: 'seletor', pos: e.clientX < r.left + r.width / 2 ? 'manual' : 'auto' }); };
  for (const [name, d] of Object.entries(DOOR)) push(c1, name, d.kind, d.text, d.sub);
  // Coluna 3: emergência
  const c2 = el('div', { class: 'door-col' }, host);
  el('h3', {}, c2).textContent = 'Emergência';
  const dM = el('div', { class: 'device' }, c2);
  const mush = el('button', { class: 'pb mush', 'aria-label': 'Emergência S0 (trava)', title: 'Clique para acionar; clique de novo para destravar' }, dM);
  const tM = el('div', { class: 'tagplate' }, dM); tM.textContent = 'Parada de emergência'; el('small', {}, tM).textContent = 'S0 · NF · ED04 · corta a DI1';
  mush.onclick = () => send({ tipo: 'cogumelo' });
  el('p', { class: 'muted', style: 'text-align:center;max-width:180px;font-size:12px' }, c2).textContent = 'Um segundo contato NF do cogumelo está em série com a DI1 do inversor: a bomba para mesmo que o CLP mande girar.';

  return function update(s) {
    const q = s.quadro;
    lamps.H1.classList.toggle('on', q.H1); lamps.H2.classList.toggle('on', q.H2); lamps.H3.classList.toggle('on', q.H3);
    sirene.classList.toggle('on', q.H4);
    const idx = q.S4 === 'auto' ? 1 : 0;
    knob.style.setProperty('--rot', `${idx ? 25 : -25}deg`);
    selBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === idx)));
    mush.classList.toggle('latched', q.S0);
  };
}

// ------------------------------------------------------------------ XP325 e quadro
let q1Btn = null;
function buildElec() {
  const host = $('xpHost'); host.innerHTML = '';
  const cpu = el('div', { class: 'cpu' }, host);
  const head = el('div', { class: 'cpu-head' }, cpu);
  el('b', {}, head).textContent = 'XP325';
  const st = el('span', {}, head); st.textContent = 'Nexto Xpress · 16 ED · 16 SD · EA0 em uso · SA0 em uso';
  const NOMES_DI = ['S1', 'S2', 'S3', 'S4', 'S0', 'RUN', 'OK', 'LSHH', 'LSLL', '', '', '', '', '', '', ''];
  const NOMES_DO = ['H1', 'H2', 'H3', 'H4', 'DI1', 'DI3', '', '', '', '', '', '', '', '', '', ''];
  el('div', { class: 'leds-title' }, cpu).textContent = 'Entradas digitais ED00–ED15';
  const gDI = el('div', { class: 'leds' }, cpu);
  const ledsDI = NOMES_DI.map((n, i) => { const d = el('div', { class: 'led', title: `ED${String(i).padStart(2, '0')} ${n}` }, gDI); d.textContent = n || String(i).padStart(2, '0'); return d; });
  el('div', { class: 'leds-title' }, cpu).textContent = 'Saídas digitais SD00–SD15';
  const gDO = el('div', { class: 'leds' }, cpu);
  const ledsDO = NOMES_DO.map((n, i) => { const d = el('div', { class: 'led', title: `SD${String(i).padStart(2, '0')} ${n}` }, gDO); d.textContent = n || String(i).padStart(2, '0'); return d; });
  const ana = el('div', { class: 'cpu-head', style: 'margin-top:8px' }, cpu);
  const anaTxt = el('span', {}, ana);
  const brk = $('brkHost'); brk.innerHTML = '';
  [['Q0', 'Geral'], ['Q2', 'Fonte 24 V'], ['Q3', 'Comando']].forEach(([id, t]) => { const b = el('div', { class: 'brk' }, brk); const sw = el('div', { class: 'sw on' }, b); el('i', {}, sw); b.append(`${id}`); el('div', {}, b).textContent = t; });
  q1Btn = $('q1Btn'); q1Btn.onclick = () => send({ tipo: 'disjuntor' });
  return function update(s) {
    s.di.forEach((v, i) => ledsDI[i].classList.toggle('on', v));
    s.do.forEach((v, i) => ledsDO[i].classList.toggle('on', v));
    anaTxt.textContent = `EA0 (LT-01) bruto ${s.sensores['LT-01'].raw} · SA0 (referência) bruto ${s.ao.raw[0]}`;
    q1Btn.classList.toggle('on', s.quadro.q1); q1Btn.setAttribute('aria-pressed', String(s.quadro.q1));
    $('q1Txt').textContent = s.quadro.q1 ? (s.falhas.disjuntor ? 'desarmado' : 'ligado — CFW500 alimentado') : (s.falhas.disjuntor ? 'DESARMADO (falha do instrutor) — religue' : 'desligado — CFW500 sem alimentação');
  };
}

// ------------------------------------------------------------------ Instrumentação
function buildInst() {
  const tb = $('tblInst').querySelector('tbody'); tb.innerHTML = '';
  const mk = () => { const tr = el('tr', {}, tb); return ['tag', 'nome', 'canal', 'modo', 'eng', 'sinal', 'raw', 'st'].map((k) => el('td', { class: ['eng', 'sinal', 'raw'].includes(k) ? 'num' : '' }, tr)); };
  const lt = mk(); lt[0].textContent = 'LT-01'; lt[1].textContent = 'Nível TQ-01 — ultrassônico, 0–3,5 m'; lt[2].textContent = 'EA0';
  const ref = mk(); ref[0].textContent = 'SA0'; ref[1].textContent = 'Referência de velocidade → AI1 do CFW500'; ref[2].textContent = 'SA0';
  const cur = mk(); cur[0].textContent = 'B-01'; cur[1].textContent = 'Corrente do motor (do modelo do CFW500; não vai ao CLP)'; cur[2].textContent = '—'; cur[3].textContent = '—'; cur[5].textContent = '—'; cur[6].textContent = '—'; cur[7].textContent = '';
  return function update(s) {
    const m = s.sensores['LT-01']; const c = s.canais.ea[0];
    lt[3].textContent = c.modo === '0-10V' ? '0–10 V' : `${c.modo} mA`;
    lt[4].textContent = `${fmt(m.eng, 3)} m`; lt[5].textContent = `${fmt(m.sinal, 2)} mA`; lt[6].textContent = m.raw;
    const st = m.st === 'ok' ? 'normal' : m.st === 'fioRompido' ? 'fio rompido (0 mA)' : m.st === 'travado' ? 'sensor travado' : m.st;
    lt[7].textContent = st; lt[7].className = m.st === 'ok' ? 'st-ok' : m.st === 'subfaixa' || m.st === 'sobrefaixa' ? 'st-warn' : 'st-bad';
    const sa = s.canais.sa[0], sig = s.ao.sinais && s.ao.sinais.ref;
    ref[3].textContent = sa.modo === '0-10V' ? '0–10 V' : `${sa.modo} mA`;
    ref[4].textContent = `${fmt(s.ao.raw[0] / s.canais.fundoEscala * 100, 1)} % → ${fmt(s.inv.fHz, 1)} Hz`;
    ref[5].textContent = sig ? `${fmt(sig.valor, 2)} ${sig.tipo}` : '—'; ref[6].textContent = s.ao.raw[0];
    ref[7].textContent = !s.inv.power ? 'inversor sem alimentação' : s.inv.locRem === 'LOC' ? 'inversor em LOC: ignora a SA0' : 'normal'; ref[7].className = s.inv.power && s.inv.locRem === 'REM' ? 'st-ok' : 'st-warn';
    cur[4].textContent = `${fmt(s.iMot, 2)} A`;
  };
}

// ------------------------------------------------------------------ Bancada
function buildBench() {
  const host = $('benchHost'); host.innerHTML = '';
  let built = false;
  return function update(s) {
    if (built) return;
    built = true;
    const sel = (lbl, grupo, ch, modo) => {
      const l = el('label', {}, host); l.textContent = `${lbl} `;
      const se = el('select', {}, l);
      ['4-20', '0-20', '0-10V'].forEach((m) => { const o = el('option', { value: m }, se); o.textContent = m === '0-10V' ? '0–10 V' : `${m} mA`; if (m === modo) o.selected = true; });
      se.onchange = () => send({ tipo: 'canal', grupo, ch, modo: se.value });
    };
    s.canais.ea.filter((c) => c.tag !== 'reserva').forEach((c) => sel(`EA${c.ch} ${c.tag}`, 'ea', c.ch, c.modo));
    s.canais.sa.filter((c) => c.tag !== 'reserva').forEach((c) => sel(`SA${c.ch} ${c.tag}`, 'sa', c.ch, c.modo));
    const lf = el('label', {}, host); lf.textContent = 'Fundo de escala do A/D ';
    const inF = el('input', { type: 'number', value: s.canais.fundoEscala, style: 'width:90px' }, lf);
    inF.onchange = () => send({ tipo: 'canal', fundoEscala: Number(inF.value) });
    el('p', { class: 'muted', style: 'font-size:12px;margin:6px 0 0' }, host).textContent = 'O CLP troca as contagens do canal, como no hardware: LT01_Bruto (A/D da EA0) e Ref_Bruto (D/A da SA0). O escalonamento é feito no programa.';
  };
}

// ------------------------------------------------------------------ Variáveis e endereços
// Geradas da mesma tabela do servidor (server/tags.js): uma variável por sinal, com o valor ao vivo de cada uma
function buildIo() {
  let linhas = [];
  const celulas = {};
  const montar = (tbl, dir) => {
    const tb = $(tbl).querySelector('tbody'); tb.innerHTML = '';
    for (const l of linhas.filter((x) => x.dir === dir)) {
      const tr = el('tr', {}, tb);
      el('td', { class: 'nome' }, tr).textContent = l.nome;
      el('td', {}, tr).textContent = l.tipo;
      el('td', {}, tr).textContent = `${l.tabela} ${l.endereco}`;
      el('td', { class: 'mono' }, tr).textContent = l.codesys;
      el('td', { class: 'mono' }, tr).textContent = l.classico;
      el('td', { class: 'desc' }, tr).textContent = l.desc;
      celulas[l.nome] = { td: el('td', {}, tr), l };
    }
  };
  fetch('/api/tags').then((r) => r.json()).then((x) => {
    linhas = x; montar('tblIn', 'sim'); montar('tblOut', 'clp');
    $('btnCopiarMapa').onclick = () => {
      const txt = ['Variável\tSentido\tTipo\tTabela Modbus\tEndereço (base 0)\tEscala\tCODESYS\tClássico\tSignificado', ...linhas.map((l) => [l.nome, l.sentido, l.tipo, l.tabela, l.endereco, l.escala, l.codesys, l.classico, l.desc].join('\t'))].join('\n');
      navigator.clipboard.writeText(txt).then(() => toast('Tabela copiada'));
    };
  }).catch(() => {});
  return function update(s) {
    const v = s.tags || {};
    for (const [nome, { td, l }] of Object.entries(celulas)) {
      const x = v[nome];
      if (x === undefined || x === null) { td.textContent = '—'; continue; }
      if (l.tipo === 'BOOL') td.innerHTML = `<span class="bit ${x ? 'on' : ''}">${x ? '1' : '0'}</span>`;
      else if (l.escala > 1) td.textContent = `${Math.round(x * l.escala)}  (${fmt(x, 2)} ${l.un})`;
      else td.textContent = String(x);
    }
  };
}

// ------------------------------------------------------------------ Instrutor
const FALHAS = [['fioRompidoLT01', 'Fio rompido no LT-01'], ['travadoLT01', 'LT-01 travado'], ['inversor', 'Falha no inversor'], ['disjuntor', 'Disjuntor Q1 desarmado'], ['vazamento', 'Vazamento no tanque'], ['comunicacao', 'Perda de comunicação']];
function buildInstructor() {
  const host = $('falhasHost'); host.innerHTML = '';
  const boxes = {};
  for (const [id, t] of FALHAS) { const l = el('label', {}, host); const c = el('input', { type: 'checkbox' }, l); l.append(` ${t}`); c.onchange = () => send({ tipo: 'falha', nome: id, on: c.checked }); boxes[id] = c; }
  $('rngCons').oninput = () => { $('oCons').textContent = `${$('rngCons').value} %`; send({ tipo: 'cons', valor: Number($('rngCons').value) / 100 }); };
  $('chkConsAuto').onchange = () => send({ tipo: 'consAuto', on: $('chkConsAuto').checked });
  document.querySelectorAll('[data-vel]').forEach((b) => { b.onclick = () => send({ tipo: 'sim', velocidade: Number(b.dataset.vel) }); });
  $('btnReset').onclick = () => send({ tipo: 'reset' });
  return function update(s) {
    for (const [id] of FALHAS) if (document.activeElement !== boxes[id]) boxes[id].checked = !!s.falhas[id];
    if (document.activeElement !== $('rngCons')) { $('rngCons').value = Math.round(s.cons * 100); $('oCons').textContent = `${Math.round(s.cons * 100)} %`; }
    $('chkConsAuto').checked = s.consAuto;
    document.querySelectorAll('[data-vel]').forEach((b) => b.classList.toggle('go', Number(b.dataset.vel) === s.sim.velocidade));
  };
}

// ------------------------------------------------------------------ Comunicação
function setupComm() {
  const show = (v) => { $('commPanel').hidden = !v; $('btnComm').setAttribute('aria-expanded', String(v)); $('layout').classList.toggle('no-comm', !v); };
  $('btnComm').onclick = () => show($('commPanel').hidden);
  $('btnCommHide').onclick = () => show(false);
  show(false);
  const f = $('connForm');
  const proto = () => f.querySelector('input[name=protocolo]:checked').value;
  const cfg = () => proto() === 'opcda'
    ? { protocolo: 'opcda', progId: f.progId.value.trim(), prefixo: f.prefixoDa.value.trim() }
    : proto() === 'modbus'
      ? { protocolo: 'modbus', host: f.mbHost.value.trim(), port: Number(f.mbPort.value) || 502, unitId: Number(f.mbUnit.value) || 1 }
      : { protocolo: 'opcua', endpoint: `${f.host.value.trim()}:${f.port.value || 4840}`, prefixo: f.prefixo.value.trim(), user: f.user.value.trim(), senha: f.senha.value };
  const mostrarProto = () => { const pr = proto(); f.querySelectorAll('.so-opcua').forEach((e) => { e.hidden = pr !== 'opcua'; }); f.querySelectorAll('.so-opcda').forEach((e) => { e.hidden = pr !== 'opcda'; }); f.querySelectorAll('.so-modbus').forEach((e) => { e.hidden = pr !== 'modbus'; }); $('btnTestPlc').textContent = pr === 'modbus' ? 'Ligar CLP Modbus de demonstração' : 'Ligar XP325 de demonstração (OPC UA)'; };
  f.querySelectorAll('input[name=protocolo]').forEach((r) => r.addEventListener('change', mostrarProto));
  mostrarProto();
  $('btnConnect').onclick = () => { setStatus('Conectando…', 's-conectando'); send({ tipo: 'clp', acao: 'conectar', ...cfg() }); };
  $('btnDisconnect').onclick = () => send({ tipo: 'clp', acao: 'desconectar' });
  $('btnTestPlc').onclick = () => { setStatus('Subindo o CLP de demonstração…', 's-conectando'); send({ tipo: 'clp', acao: 'demo', protocolo: proto() === 'modbus' ? 'modbus' : 'opcua' }); };
  $('btnClearLog').onclick = () => { diagLines = []; renderLog(); };
  f.host.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnConnect').click(); });
}
function setStatus(txt, cls) { const s = $('connStatus'); s.textContent = txt; s.className = `status ${cls}`; }
function onClpReply(msg) {
  if (msg.clp === 'ok') { if (msg.acao !== 'desconectar') toast('CLP conectado'); }
  else { setStatus('Falhou', 's-desconectado'); toast(`CLP: ${msg.erro}`); }
}
let formFilled = false;
function updateComm(c) {
  const on = c.clpConectado;
  setStatus(on ? (c.protocolo === 'opcda' ? 'Conectado (OPC DA)' : c.protocolo === 'modbus' ? 'Conectado (Modbus TCP)' : c.polling ? 'Conectado (polling)' : 'Conectado') : c.desejado ? (c.conectando ? 'Conectando…' : 'Reconectando…') : 'Desconectado', on ? 's-conectado' : c.desejado ? 's-conectando' : 's-desconectado');
  $('btnDisconnect').disabled = !c.desejado;
  $('commDot').className = `cdot ${on ? 'ok' : c.desejado ? 'busy' : ''}`;
  $('commTxt').textContent = on ? `CLP ${c.clpParado ? '· programa parado' : 'conectado'}` : 'Conectar ao CLP';
  const badge = $('clpBadge');
  badge.textContent = on ? (c.clpParado ? 'CLP sem heartbeat' : `CLP ${c.protocolo === 'opcda' ? 'OPC DA' : c.protocolo === 'modbus' ? 'Modbus TCP' : 'OPC UA'} · ${c.stats ? c.stats.lat : 0} ms`) : c.desejado ? 'CLP desconectado' : 'sem CLP';
  badge.className = `badge ${on && !c.clpParado ? '' : 'off'}`;
  $('tpState').textContent = c.endpoint && /127\.0\.0\.1:(48(4\d|50)|15(0[2-9]|10))\b/.test(c.endpoint) && on ? 'CLP de demonstração ligado' : 'CLP de demonstração desligado';
  if (!formFilled && c.desejado) {
    formFilled = true;
    const f = $('connForm');
    if (c.desejado.protocolo === 'opcda') {
      f.querySelector('input[name=protocolo][value=opcda]').checked = true;
      if (c.desejado.progId) f.progId.value = c.desejado.progId; if (c.desejado.prefixo) f.prefixoDa.value = c.desejado.prefixo;
    } else if (c.desejado.protocolo === 'modbus') {
      f.querySelector('input[name=protocolo][value=modbus]').checked = true;
      if (c.desejado.host) f.mbHost.value = c.desejado.host; if (c.desejado.port) f.mbPort.value = c.desejado.port; if (c.desejado.unitId) f.mbUnit.value = c.desejado.unitId;
    } else {
      f.querySelector('input[name=protocolo][value=opcua]').checked = true;
      const m = /^opc\.tcp:\/\/([^:/]+)(?::(\d+))?/.exec(c.desejado.endpoint || '');
      if (m) { f.host.value = m[1]; f.port.value = m[2] || 4840; }
      f.prefixo.value = c.desejado.prefixo || ''; f.user.value = c.desejado.user || '';
    }
    f.querySelector('input[name=protocolo]:checked').dispatchEvent(new Event('change'));
  }
  const fila = c.fila || { 0: 0, 1: 0, 2: 0 };
  for (let p = 0; p < 3; p++) { $(`qn${p}`).textContent = fila[p]; $(`qb${p}`).style.width = `${Math.min(100, fila[p] * 20)}%`; }
  $('qRate').textContent = c.stats ? `${c.stats.eps} escr/s${c.lento ? ' · modo lento' : ''}` : '0 escr/s';
  const kv = $('commStats');
  const a = c.assinaturas || {};
  const rows = [
    ['Endpoint', c.endpoint || '—'], ['Latência média / máx.', c.stats ? `${c.stats.lat} / ${c.stats.latMax} ms` : '—'], ['Escritas · nós', c.stats ? `${c.stats.escritas} · ${c.stats.nos}` : '—'],
    ['Erros · reconexões', `${c.stats ? c.stats.erros : 0} · ${c.reconexoes || 0}`], ['Assinatura rápida', a.rapida ? `${a.rapida.publish} / ${a.rapida.sampling} ms · ${a.rapida.itens} itens` : '—'], ['Assinatura lenta', a.lenta ? `${a.lenta.publish} / ${a.lenta.sampling} ms` : '—'],
    ['Heartbeat sim / CLP', `${c.hbSim} / ${c.hbClp}`], ['Último erro', c.ultimoErro || '—'],
  ];
  if (kv.childElementCount !== rows.length * 2) { kv.innerHTML = ''; rows.forEach(() => { el('dt', {}, kv); el('dd', {}, kv); }); }
  rows.forEach(([k, v], i) => { kv.children[i * 2].textContent = k; kv.children[i * 2 + 1].textContent = v; });
}

// ------------------------------------------------------------------ Processo (3D, sinótico, medidores, tendência)
let p3d = null, sin = null, trend = null, levelG = null, pressG = null;
function bindProcess() {
  try { p3d = createProcess3D($('p3dHost'), { onAction: (a) => { if (a.tipo === 'ui' && a.acao === 'ihm') floatIHM?.abrir(); else send(a); } }); }
  catch (e) { $('p3dHost').innerHTML = `<p class="p3d-fallback">A cena 3D não pôde ser criada neste navegador (${e.message}). Use a vista Sinótico.</p>`; }
  sin = createSinotico($('sinHost'), { onAction: (a) => send(a) });
  levelG = createLevelGauge($('levelHost'));
  pressG = createPressureGauge($('gaugeHost'));
  trend = createTrend($('trend'), $('trendLegend'), [
    { k: 'h', nome: 'Nível TQ-01', cor: '#2272b8', max: 3.5, un: 'm' },
    { k: 'ref', nome: 'Referência SA0', cor: '#2b8a45', max: 100, un: '%' },
    { k: 'f', nome: 'Inversor', cor: '#c98a00', max: 60, un: 'Hz' },
    { k: 'qIn', nome: 'Entrada', cor: '#c0392b', max: 20, un: 'm³/h' },
    { k: 'qOut', nome: 'Consumo', cor: '#5d666c', max: 20, un: 'm³/h' },
  ]);
  document.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => setView(b.dataset.view));
  document.querySelectorAll('[data-cam]').forEach((b) => b.onclick = () => p3d?.setCamera(b.dataset.cam));
  $('btnLabels').onclick = () => { const v = $('btnLabels').getAttribute('aria-pressed') !== 'true'; $('btnLabels').setAttribute('aria-pressed', String(v)); p3d?.setLabels(v); };
}
function setView(v) {
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  $('p3dHost').hidden = v !== '3d'; $('sinHost').hidden = v !== '2d'; $('camBtns').style.visibility = v === '3d' ? 'visible' : 'hidden';
  if (v === '3d') p3d?.resize();
}

// ------------------------------------------------------------------ Janelas flutuantes (inversor e IHM)
function setupFloating(col, btnIds, titulo, msgVazio, pos0) {
  const home = col.parentElement;
  const placeholder = el('div', { class: 'cfw-vazio' }); placeholder.textContent = msgVazio;
  const win = el('div', { class: 'float-win', role: 'dialog', 'aria-label': titulo }, document.body); win.hidden = true; if (pos0.w) win.style.width = `${pos0.w}px`;
  const bar = el('div', { class: 'fw-bar' }, win); const title = el('span', {}, bar); title.textContent = titulo; title.title = 'Arraste pela barra para posicionar';
  const bMini = el('button', { title: 'Encolher / expandir' }, bar); bMini.textContent = '—';
  const bClose = el('button', { title: 'Fechar e devolver à seção' }, bar); bClose.textContent = 'Fechar ✕';
  const body = el('div', { class: 'fw-body' }, win);
  const btns = btnIds.map((id) => $(id)).filter(Boolean);
  // alça de redimensionar (canto inferior direito): muda a largura; a IHM se escala sozinha pela largura
  if (pos0.redim) {
    const grip = el('div', { class: 'fw-grip', title: 'Arraste para redimensionar' }, win);
    let rz = null;
    grip.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); rz = { x0: e.clientX, w0: win.getBoundingClientRect().width }; grip.setPointerCapture(e.pointerId); win.classList.add('resizing'); });
    grip.addEventListener('pointermove', (e) => {
      if (!rz) return;
      const max = Math.min(pos0.redim.max, window.innerWidth - pos.x - 8);
      const w = Math.max(pos0.redim.min, Math.min(max, rz.w0 + (e.clientX - rz.x0)));
      win.style.width = `${Math.round(w)}px`;
    });
    const fim = () => { if (!rz) return; rz = null; win.classList.remove('resizing'); try { localStorage.setItem(`fw-largura-${titulo}`, win.style.width); } catch (_) { /* sem storage */ } };
    grip.addEventListener('pointerup', fim); grip.addEventListener('pointercancel', fim);
    grip.addEventListener('dblclick', () => { win.style.width = `${pos0.w}px`; fim(); });
    try { const w = localStorage.getItem(`fw-largura-${titulo}`); if (w) win.style.width = w; } catch (_) { /* sem storage */ }
  }
  let pos = { x: Math.max(0, window.innerWidth - pos0.dx), y: pos0.y };
  function abrir() { if (!win.hidden) return; home.insertBefore(placeholder, col); body.appendChild(col); win.hidden = false; win.style.left = `${pos.x}px`; win.style.top = `${pos.y}px`; btns.forEach((b) => b.setAttribute('aria-pressed', 'true')); }
  function fechar() { if (win.hidden) return; home.insertBefore(col, placeholder); placeholder.remove(); win.hidden = true; btns.forEach((b) => b.setAttribute('aria-pressed', 'false')); }
  btns.forEach((b) => { b.onclick = () => (win.hidden ? abrir() : fechar()); });
  bClose.onclick = fechar; bMini.onclick = () => win.classList.toggle('mini');
  let drag = null;
  bar.addEventListener('pointerdown', (e) => { if (e.target.tagName === 'BUTTON') return; drag = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; bar.setPointerCapture(e.pointerId); });
  bar.addEventListener('pointermove', (e) => { if (!drag) return; pos.x = Math.max(0, Math.min(window.innerWidth - 120, e.clientX - drag.dx)); pos.y = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - drag.dy)); win.style.left = `${pos.x}px`; win.style.top = `${pos.y}px`; });
  bar.addEventListener('pointerup', () => { drag = null; }); bar.addEventListener('pointercancel', () => { drag = null; });
  window.addEventListener('resize', () => { if (win.hidden) return; pos.x = Math.min(pos.x, window.innerWidth - 120); win.style.left = `${pos.x}px`; });
  return { abrir, fechar };
}
let floatIHM = null;
function setupFloatingInverter() { setupFloating(updaters.cfw.col, ['btnInvFloat', 'btnInvFloat2'], 'Inversor CFW500 — B-01', 'O inversor está destacado em uma janela flutuante. Feche a janela para trazê-lo de volta para cá.', { dx: 400, y: 90 }); }
function setupFloatingIHM() { floatIHM = setupFloating(updaters.ihm.col, ['btnIhmFloat', 'btnIhmFloat2'], 'IHM do operador', 'A IHM está destacada em uma janela flutuante. Feche a janela para trazê-la de volta para cá.', { dx: 640, y: 90, w: 600, redim: { min: 300, max: 1100 } }); }

// ------------------------------------------------------------------ Estado
const updaters = {};
function onState(s) {
  state = s;
  updaters.door(s); updaters.elec(s); updaters.inst(s); updaters.bench(s); updaters.io(s); updaters.instr(s); updaters.cfw(s); updaters.ihm(s); updaters.sirene(s.quadro.H4);
  updateComm(s.comm);
  $('rNivel').textContent = fmt(s.h, 2); $('rNivelPct').textContent = `${Math.round(s.h / 3 * 100)} % de TQ-01 · LT-01 ${fmt(s.sensores['LT-01'].sinal, 2)} mA · ${s.sensores['LT-01'].raw}`;
  $('rPress').textContent = fmt(s.inv.fHz, 1); $('rVazao').textContent = `SA0 ${s.ao.sinais && s.ao.sinais.ref ? fmt(s.ao.sinais.ref.valor, 2) + ' ' + s.ao.sinais.ref.tipo : '—'} · entra ${fmt(s.qIn, 1)} m³/h · sai ${fmt(s.qOut, 1)} m³/h`;
  levelG?.(s); pressG?.(s); trend?.(s); p3d?.update(s); sin?.(s);
}

updaters.door = buildDoor();   // cria também o lugar da IHM na porta
updaters.elec = buildElec();
updaters.inst = buildInst();
updaters.bench = buildBench();
updaters.io = buildIo();
updaters.instr = buildInstructor();
updaters.cfw = createCFW($('cfwHost'), { send });
updaters.ihm = createIHM($('ihmHost'), { send });
updaters.sirene = createSirene($('btnSom'));
setupFloatingInverter();
setupFloatingIHM();
setupComm();
bindProcess();
connectWs();
