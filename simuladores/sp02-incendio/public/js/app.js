// Simulador Sistema de Incêndio — interface do navegador.
import { el, fmt } from './util.js';
import { createSSW05 } from './ssw05-view.js';
import { createKP } from './kp-view.js';
import { createPID, createGauge, createTrend } from './process-view.js';

const $ = (id) => document.getElementById(id);
let meta = null;
let mineId = null; // sessão deste PC
let sessionId = null;
let es = null;
let state = null;
const views = {};

// ------------------------------------------------------------------ API
async function api(path, method = 'GET', body) {
  const r = await fetch(`/api/${path}`, {
    method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Erro ${r.status}`);
  return data;
}
const send = (action) => api(`sessions/${sessionId}/action`, 'POST', action).catch((e) => toast(e.message));

let toastT;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 4500);
}

// ------------------------------------------------------------------ Sessões
async function refreshTabs() {
  let list;
  try { list = await api('sessions'); } catch { return; }
  const host = $('sessionTabs');
  host.innerHTML = '';
  for (const s of list) {
    const tab = el('div', { class: 'tab', role: 'tab', 'aria-selected': String(s.id === sessionId), tabindex: 0, title: `${s.host}:${s.port} — duplo clique para renomear` }, host);
    const dot = el('span', { class: 'dot' }, tab);
    if (s.status === 'conectado') dot.classList.add('on');
    else if (s.status === 'reconectando' || s.status === 'erro') dot.classList.add('err');
    el('span', {}, tab).textContent = s.name;
    if (s.id === mineId) { const m = el('span', { class: 'mine', title: 'Sessão deste computador' }, tab); m.textContent = 'este PC'; }
    const x = el('button', { class: 'x', 'aria-label': `Excluir sessão ${s.name}`, title: 'Excluir sessão' }, tab);
    x.textContent = '×';
    tab.addEventListener('click', (e) => { if (e.target !== x) selectSession(s.id); });
    tab.addEventListener('keydown', (e) => { if (e.key === 'Enter') selectSession(s.id); });
    tab.addEventListener('dblclick', async () => {
      const name = prompt('Nome da sessão:', s.name);
      if (name && name.trim()) { await api(`sessions/${s.id}`, 'PATCH', { name: name.trim() }); refreshTabs(); }
    });
    x.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Excluir a sessão "${s.name}"? A conexão com o CLP dela será encerrada.`)) return;
      try {
        await api(`sessions/${s.id}`, 'DELETE');
        if (s.id === sessionId) { const l = await api('sessions'); selectSession(l[0].id); } else refreshTabs();
      } catch (err) { toast(err.message); }
    });
  }
  if (!list.find((s) => s.id === sessionId) && list.length) selectSession(list[0].id);
}

$('btnNewSession').addEventListener('click', async () => {
  const name = prompt('Nome da nova sessão (ex.: Bancada 02):');
  if (name === null) return;
  const s = await api('sessions', 'POST', { name: name.trim() || undefined });
  selectSession(s.id);
});

function selectSession(id) {
  sessionId = id;
  location.hash = id;
  $('lnkDiagram').href = `diagrama.html#${id}/1`;
  formLoadedFor = null;
  $('diagBox').value = '';
  views.trend?.clear();
  if (es) es.close();
  es = new EventSource(`/api/sessions/${id}/stream`);
  es.addEventListener('state', (e) => onState(JSON.parse(e.data)));
  es.addEventListener('logs', (e) => { $('diagBox').value = ''; JSON.parse(e.data).forEach(addLog); });
  es.addEventListener('log', (e) => addLog(JSON.parse(e.data)));
  es.addEventListener('deleted', () => refreshTabs());
  refreshTabs();
}

// ------------------------------------------------------------------ Conexão
const form = $('connForm');
let formLoadedFor = null;
function loadForm(cfg) {
  for (const [k, v] of Object.entries(cfg)) {
    const f = form.elements[k];
    if (!f) continue;
    if (f.type === 'checkbox') f.checked = !!v; else f.value = v;
  }
  $('chkFrames').checked = !!cfg.showFrames;
  $('chkVerify').checked = !!cfg.verify;
}
function readForm() {
  const o = {};
  for (const f of form.elements) {
    if (!f.name) continue;
    o[f.name] = f.type === 'checkbox' ? f.checked : f.value;
  }
  return o;
}
$('btnConnect').addEventListener('click', async () => {
  try {
    await api(`sessions/${sessionId}/config`, 'POST', readForm());
    await api(`sessions/${sessionId}/connect`, 'POST', {});
  } catch (e) { toast(e.message); }
});
$('btnDisconnect').addEventListener('click', () => api(`sessions/${sessionId}/disconnect`, 'POST', {}).catch((e) => toast(e.message)));
$('chkFrames').addEventListener('change', (e) => api(`sessions/${sessionId}/config`, 'POST', { showFrames: e.target.checked }).catch((er) => toast(er.message)));
$('chkVerify').addEventListener('change', (e) => api(`sessions/${sessionId}/config`, 'POST', { verify: e.target.checked }).catch((er) => toast(er.message)));
$('btnClearLog').addEventListener('click', () => api(`sessions/${sessionId}/clear-log`, 'POST', {}));

// ------------------------------------------------------------------ CLP virtual de teste
let testPlc = { running: false, port: null };
function renderTestPlc() {
  $('tpState').textContent = testPlc.running ? `CLP virtual ligado na porta ${testPlc.port}` : 'CLP virtual desligado';
  $('btnTestPlc').textContent = testPlc.running ? 'Desligar CLP virtual' : 'Ligar CLP virtual de teste';
}
$('btnTestPlc').addEventListener('click', async () => {
  try {
    if (testPlc.running) {
      testPlc = await api(`sessions/${sessionId}/test-plc/stop`, 'POST', {});
    } else {
      const port = form.elements.port.disabled ? 502 : (Number(form.elements.port.value) || 502);
      testPlc = await api(`sessions/${sessionId}/test-plc/start`, 'POST', { port });
      if (!form.elements.host.disabled) { form.elements.host.value = '127.0.0.1'; form.elements.port.value = testPlc.port; }
      toast(`CLP virtual desta sessão ligado em 127.0.0.1:${testPlc.port}. Clique em Conectar.`);
    }
    renderTestPlc();
  } catch (e) { toast(e.message); }
});
setInterval(async () => { if (!sessionId) return; try { testPlc = await api(`sessions/${sessionId}/test-plc`); renderTestPlc(); } catch { /* */ } }, 3000);

// ------------------------------------------------------------------ Diagnóstico
const LEVEL = { ok: 'OK ', erro: 'ERR', warn: 'AVS', info: '   ', frame: '   ' };
function addLog(l) {
  const box = $('diagBox');
  box.value += `${l.ts} ${LEVEL[l.level] || '   '} ${l.text}\n`;
  if (box.value.length > 120000) box.value = box.value.slice(-90000);
  if ($('chkAutoscroll').checked) box.scrollTop = box.scrollHeight;
}

// ------------------------------------------------------------------ Painel de operação
function buildDoor() {
  const host = $('doorHost');
  host.innerHTML = '';
  const lamps = [];
  const selectors = {};
  const buttons = {};

  const lamp = (parent, color, text, sub) => {
    const d = el('div', { class: 'device' }, parent);
    const l = el('div', { class: `lamp ${color}`, role: 'img', 'aria-label': text }, d);
    const t = el('div', { class: 'tagplate' }, d);
    t.textContent = text; if (sub) { const s = el('small', {}, t); s.textContent = sub; }
    return l;
  };
  const selector = (parent, name, positions, title) => {
    const d = el('div', { class: 'device' }, parent);
    const s = el('div', { class: 'selector', role: 'radiogroup', 'aria-label': title }, d);
    const knob = el('div', { class: 'knob', tabindex: 0, role: 'button', title: 'Clique à esquerda ou à direita do knob para girar' }, s);
    const btns = positions.map(([v, label], i) => {
      const b = el('button', { class: `p${i}`, role: 'radio', 'aria-pressed': 'false', title: `${title}: ${label}` }, s);
      b.textContent = label;
      b.addEventListener('click', () => send({ type: 'selector', name, value: v }));
      return b;
    });
    const t = el('div', { class: 'tagplate' }, d);
    t.textContent = title; const sm = el('small', {}, t); sm.textContent = name;
    selectors[name] = { knob, btns, values: positions.map((p) => p[0]) };
    // Girar clicando no próprio knob: metade esquerda gira para a esquerda, metade direita para a direita
    const turn = (dir) => {
      const vals = selectors[name].values;
      const i = Math.max(0, vals.indexOf(state?.sim.panel[name] ?? '0'));
      const j = Math.min(vals.length - 1, Math.max(0, i + dir));
      if (j !== i) send({ type: 'selector', name, value: vals[j] });
    };
    knob.addEventListener('click', (e) => { const r = knob.getBoundingClientRect(); turn(e.clientX < r.left + r.width / 2 ? -1 : 1); });
    knob.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); turn(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); turn(1); }
    });
  };
  const push = (parent, name, kind, text) => {
    const d = el('div', { class: 'device' }, parent);
    const b = el('button', { class: `pb ${kind}`, 'aria-label': `${text} (${name})` }, d);
    b.textContent = kind === 'go' ? 'I' : 'O';
    const t = el('div', { class: 'tagplate' }, d);
    t.textContent = text; const sm = el('small', {}, t); sm.textContent = `${name} · ${kind === 'go' ? 'NA' : 'NF'}`;
    let down = false;
    const press = (v) => { if (down === v) return; down = v; b.classList.toggle('down', v); send({ type: 'button', name, value: v }); };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); press(true); });
    b.addEventListener('pointerup', () => press(false));
    b.addEventListener('pointercancel', () => press(false));
    b.addEventListener('lostpointercapture', () => press(false));
    b.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); press(true); } });
    b.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') press(false); });
    buttons[name] = b;
  };

  // Coluna de seleção
  const c0 = el('div', { class: 'door-col' }, host);
  el('h3', {}, c0).textContent = 'Seleção de bombas';
  lamps[0] = lamp(c0, 'green', 'Bomba 01 selecionada', 'LB1_S');
  lamps[1] = lamp(c0, 'green', 'Bomba 02 selecionada', 'LB2_S');
  selector(c0, 'B_SEL', [['B1', 'B01'], ['0', '0'], ['B2', 'B02']], 'Seleção de bombas');

  const cols = [
    { t: 'Bomba 01', L: 2, D: 5, ma: 'B1_MA', on: 'B1_L', off: 'B1_D', sl: 'LB1_L', sd: 'LB1_D' },
    { t: 'Bomba 02', L: 3, D: 6, ma: 'B2_MA', on: 'B2_L', off: 'B2_D', sl: 'LB2_L', sd: 'LB2_D' },
    { t: 'Bomba jockey', L: 4, D: 7, ma: 'BJ_MA', on: 'BJ_L', off: 'BJ_D', sl: 'LBJ_L', sd: 'LBJ_D' },
  ];
  for (const c of cols) {
    const col = el('div', { class: 'door-col' }, host);
    el('h3', {}, col).textContent = c.t;
    lamps[c.L] = lamp(col, 'red', 'Em operação', c.sl);
    lamps[c.D] = lamp(col, 'green', 'Desligada', c.sd);
    selector(col, c.ma, [['A', 'Auto'], ['0', '0'], ['M', 'Man']], 'Manual / automático');
    push(col, c.on, 'go', 'Liga local');
    push(col, c.off, 'stop', 'Desliga local');
  }

  return function update(sim) {
    sim.lamps.forEach((on, i) => lamps[i]?.classList.toggle('on', on));
    for (const [name, s] of Object.entries(selectors)) {
      const idx = s.values.indexOf(sim.panel[name]);
      s.knob.style.setProperty('--rot', `${(idx - 1) * 45}deg`);
      s.btns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === idx)));
    }
  };
}

// ------------------------------------------------------------------ Quadro elétrico
const BREAKERS = [
  ['DG', 'Geral'], ['D1', 'Fonte 24 Vcc'], ['D4', 'Saída 24 Vcc'], ['D2', 'Controle SS_01'],
  ['D3', 'Controle SS_02'], ['DB1', 'Bomba 01'], ['DB2', 'Bomba 02'], ['DBJ', 'Jockey'],
];
function buildElec() {
  const host = $('elecHost');
  host.innerHTML = '';
  const rail = el('div', { class: 'rail' }, host);
  const cbs = {};
  for (const [n, t] of BREAKERS) {
    const w = el('div', { class: 'cb on' }, rail);
    const body = el('button', { class: 'cb-body', 'aria-label': `Disjuntor ${n} ${t}`, 'aria-pressed': 'true' }, w);
    el('span', { class: 'cb-flag' }, body);
    el('span', { class: 'cb-lever' }, body);
    const tag = el('div', { class: 'tagplate' }, w);
    tag.textContent = n; const s = el('small', {}, tag); s.textContent = t;
    body.addEventListener('click', () => send({ type: 'breaker', name: n, value: !w.classList.contains('on') }));
    cbs[n] = { w, body };
  }
  const card = el('div', { class: 'kcard' }, host);
  const row = (t) => { const r = el('div', { class: 'krow' }, card); el('span', {}, r).textContent = t; return el('i', { class: 'kled' }, r); };
  const led24 = row('24 Vcc no campo (LL+)');
  const kb1 = row('K-B1 → DI1 da SS_01');
  const kb2 = row('K-B2 → DI1 da SS_02');
  const kbj = row('K-BJ → motor jockey');
  const lbl = el('label', { class: 'krow check' }, card);
  const chk = el('input', { type: 'checkbox' }, lbl);
  lbl.append('Motor da jockey ligado ao painel');
  chk.addEventListener('change', () => send({ type: 'jockeyWired', value: chk.checked }));

  return function update(sim) {
    for (const [n, c] of Object.entries(cbs)) {
      const on = !!sim.breakers[n];
      c.w.classList.toggle('on', on); c.w.classList.toggle('off', !on);
      c.body.setAttribute('aria-pressed', String(on));
    }
    led24.classList.toggle('on', sim.v24);
    kb1.classList.toggle('on', sim.k.KB1);
    kb2.classList.toggle('on', sim.k.KB2);
    kbj.classList.toggle('on', sim.k.KBJ);
    chk.checked = sim.jockeyWired;
    $('v24Badge').textContent = sim.v24 ? '24 Vcc presente' : 'Sem 24 Vcc';
    $('v24Badge').classList.toggle('off', !sim.v24);
  };
}

// ------------------------------------------------------------------ Endereçamento Modbus
const XPVAR_IN = (i) => `GVL_SIM.xSimIn[${i}]`;
const XPVAR_OUT = (i) => `GVL_SIM.xSimOut[${i}]`;
const note0x = (a) => `0${String(a + 1).padStart(4, '0')}`;
const note1x = (a) => `1${String(a + 1).padStart(4, '0')}`;
function buildIo() {
  const mk = (tbl, list, kind) => {
    const tb = tbl.querySelector('tbody');
    tb.innerHTML = '';
    return list.map((d, i) => {
      const tr = el('tr', {}, tb);
      const inp = el('input', { class: 'addr', type: 'number', min: 0, max: 65535, 'aria-label': `Endereço Modbus de ${d.xp || d.addr}` }, el('td', {}, tr));
      const nt = el('td', { class: 'num' }, tr);
      el('td', {}, tr).textContent = d.xp ? `${d.xp} (${d.addr})` : d.addr;
      el('td', {}, tr).textContent = d.tag;
      el('code', {}, el('td', {}, tr)).textContent = kind === 'in' ? XPVAR_IN(i) : XPVAR_OUT(i);
      el('td', {}, tr).textContent = d.desc;
      const b = el('span', { class: 'bit' }, el('td', {}, tr));
      return { inp, nt, b };
    });
  };
  const rc = mk($('tblCoils'), meta.coils, 'in');
  const rd = mk($('tblDis'), meta.discreteInputs, 'out');
  let editing = false;
  [...rc, ...rd].forEach((r) => r.inp.addEventListener('input', () => { editing = true; }));
  $('addrMode').addEventListener('change', () => { editing = true; refreshHelp(); });
  function refreshHelp() {
    const table = $('addrMode').value === 'table';
    $('addrHelp').textContent = table
      ? 'Digite o endereço Modbus de cada ponto (0 a 65535, sem repetir) e clique em Aplicar. Pontos com endereços seguidos são lidos/escritos numa só mensagem.'
      : 'Os endereços seguem a 1ª coil e a 1ª entrada da seção Conexão. Para escolher ponto a ponto, mude o modo para Tabela.';
  }
  $('btnAddrApply').addEventListener('click', async () => {
    const mode = $('addrMode').value;
    const body = { addrMode: mode };
    if (mode === 'table') {
      const cm = rc.map((r, i) => (r.inp.value === '' ? (state.coilAddrs[i] ?? Math.max(...state.coilAddrs) + 1 + i - state.coilAddrs.length) : Number(r.inp.value)));
      body.coilMap = cm; body.diMap = rd.map((r) => Number(r.inp.value));
    }
    try { await api(`sessions/${sessionId}/config`, 'POST', body); editing = false; toast('Endereços aplicados.'); } catch (e) { toast(e.message); }
  });
  const rows = () => {
    const s = state;
    const head = ['Direção', 'Tipo Modbus', 'Endereço (0-based)', 'Notação', 'Borne XP325', 'Endereço SP02', 'Tag', 'Variável XP325', 'Descrição'];
    const out = [head];
    meta.coils.forEach((d, i) => { if (i < s.coilAddrs.length) out.push(['Simulador escreve → CLP lê', 'Coil (FC01/05/15)', s.coilAddrs[i], note0x(s.coilAddrs[i]), d.xp, d.addr, d.tag, XPVAR_IN(i), d.desc]); });
    meta.discreteInputs.forEach((d, i) => out.push(['CLP escreve → simulador lê', 'Discrete input (FC02)', s.diAddrs[i], note1x(s.diAddrs[i]), d.xp, d.addr, d.tag, XPVAR_OUT(i), d.desc]));
    return out;
  };
  const download = (name, text, type = 'text/csv') => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type: `${type};charset=utf-8` }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('btnAddrCopy').addEventListener('click', async () => {
    const text = rows().map((r) => r.join('\t')).join('\n');
    try { await navigator.clipboard.writeText(text); }
    catch { const t = el('textarea', {}, document.body); t.value = text; t.select(); document.execCommand('copy'); t.remove(); }
    toast('Tabela copiada. Cole no Excel ou no seu documento.');
  });
  $('btnAddrCsv').addEventListener('click', () => download(`enderecos-modbus-${state.name.replace(/\W+/g, '_')}.csv`, rows().map((r) => r.join(';')).join('\r\n')));
  $('btnAddrMt').addEventListener('click', () => {
    const s = state;
    const lines = [['Variável', 'Tipo de dado', 'Endereço inicial', 'Tamanho', 'Observação'].join(';')];
    meta.coils.forEach((d, i) => { if (i < s.coilAddrs.length) lines.push([XPVAR_IN(i), 'Coil', s.coilAddrs[i], 1, `${d.xp} ${d.tag}`].join(';')); });
    meta.discreteInputs.forEach((d, i) => lines.push([XPVAR_OUT(i), 'Input Status', s.diAddrs[i], 1, `${d.xp} ${d.tag}`].join(';')));
    lines.push('');
    lines.push('Se a sua versão do MasterTool numerar os endereços a partir de 1, some 1 em cada endereço (veja Guia, Passo 4C).');
    download(`mapeamento-mastertool-${state.name.replace(/\W+/g, '_')}.csv`, lines.join('\r\n'));
  });
  return function update(s) {
    const busy = s.status !== 'desconectado' && s.status !== 'erro';
    if (!editing || busy) {
      editing = false;
      if (document.activeElement !== $('addrMode')) $('addrMode').value = s.config.addrMode || 'base';
      refreshHelp();
    }
    const table = $('addrMode').value === 'table';
    $('addrMode').disabled = busy;
    $('btnAddrApply').disabled = busy;
    $('btnAddrApply').title = busy ? 'Desconecte para alterar os endereços' : '';
    rc.forEach((r, i) => {
      const off = i >= s.coilAddrs.length; // retorno das softs desligado
      r.inp.closest('tr').classList.toggle('off', off);
      if (off) { r.inp.value = ''; r.nt.textContent = 'não enviada'; r.inp.disabled = true; return; }
      if (!editing && document.activeElement !== r.inp) r.inp.value = s.coilAddrs[i];
      r.inp.disabled = busy || !table;
      r.nt.textContent = note0x(Number(r.inp.value) || 0);
      const v = s.coils[i]; r.b.textContent = v ? '1' : '0'; r.b.classList.toggle('on', v);
    });
    rd.forEach((r, i) => {
      if (!editing && document.activeElement !== r.inp) r.inp.value = s.diAddrs[i];
      r.inp.disabled = busy || !table;
      r.nt.textContent = note1x(Number(r.inp.value) || 0);
      const v = s.plc[i]; r.b.textContent = v ? '1' : '0'; r.b.classList.toggle('on', v);
    });
    const f = $('connForm');
    if (!busy) { f.elements.coilBase.disabled = table; f.elements.diBase.disabled = table; }
  };
}

// ------------------------------------------------------------------ Processo
function bindProcess() {
  const leak = $('rngLeak'), hyd = $('rngHyd');
  leak.addEventListener('input', () => { $('oLeak').textContent = fmt(Number(leak.value), 2); send({ type: 'process', name: 'leak', value: Number(leak.value) }); });
  hyd.addEventListener('input', () => { $('oHyd').textContent = `${hyd.value} %`; send({ type: 'process', name: 'hydrant', value: Number(hyd.value) }); });
  document.querySelectorAll('[data-hyd]').forEach((b) => b.addEventListener('click', () => send({ type: 'process', name: 'hydrant', value: Number(b.dataset.hyd) })));
  document.querySelectorAll('[data-press]').forEach((b) => b.addEventListener('click', () => send({ type: 'setPressure', value: Number(b.dataset.press) })));
  return function update(sim) {
    if (document.activeElement !== leak) { leak.value = sim.process.leak; $('oLeak').textContent = fmt(sim.process.leak, 2); }
    if (document.activeElement !== hyd) { hyd.value = sim.process.hydrant; $('oHyd').textContent = `${Math.round(sim.process.hydrant)} %`; }
    $('pBar').textContent = fmt(sim.pressure, 2);
    $('pKgf').textContent = `${fmt(sim.pressureKgf, 2)} kgf/cm²`;
  };
}

// ------------------------------------------------------------------ Estado recebido
const STATUS_CLASS = { desconectado: 's-desconectado', conectando: 's-conectando', conectado: 's-conectado', reconectando: 's-reconectando', erro: 's-erro' };
let lastStatus = null;

// ------------------------------------------------------------------ Vista 3D / P&ID
let view = 'p3d';
function setView(v) {
  view = v;
  $('p3dHost').hidden = v !== 'p3d';
  $('pidHost').hidden = v !== 'pid';
  $('camBtns').style.visibility = v === 'p3d' && views.p3d ? 'visible' : 'hidden';
  document.querySelectorAll('.view-bar [data-view]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.view === '3d' ? 'p3d' : 'pid') === v)));
  try { localStorage.setItem('sp02.view', v); } catch { /* */ }
}
async function setupProcessViews() {
  document.querySelectorAll('.view-bar [data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view === '3d' ? 'p3d' : 'pid')));
  document.querySelectorAll('#camBtns [data-cam]').forEach((b) => b.addEventListener('click', () => views.p3d?.goView(b.dataset.cam)));
  $('btnLabels').addEventListener('click', () => {
    const on = $('btnLabels').getAttribute('aria-pressed') !== 'true';
    $('btnLabels').setAttribute('aria-pressed', String(on));
    views.p3d?.setLabels(on);
  });
  let pref = 'p3d';
  try { pref = localStorage.getItem('sp02.view') || 'p3d'; } catch { /* */ }
  try {
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('sem WebGL');
    const mod = await import('./process3d.js');
    views.p3d = mod.createProcess3D($('p3dHost'), {
      onHydrantToggle: () => send({ type: 'process', name: 'hydrant', value: state && state.sim.process.hydrant > 0 ? 0 : 100 }),
      onAction: (a) => send(a),
    });
  } catch (e) {
    $('p3dHost').innerHTML = `<p class="p3d-fallback">A vista 3D não está disponível neste computador (${e.message}). Usando o P&amp;ID.</p>`;
    pref = 'pid';
  }
  setView(pref);
}

// ------------------------------------------------------------------ Painel de conexão recolhível
function setComm(show) {
  $('commPanel').hidden = !show;
  $('layout').classList.toggle('no-comm', !show);
  $('btnComm').setAttribute('aria-expanded', String(show));
  try { localStorage.setItem('sp02.comm', show ? '1' : '0'); } catch { /* */ }
}
function setupEnunciado() {
  const dlg = $('dlgEnunciado');
  $('btnEnunciado').addEventListener('click', () => dlg.showModal());
  $('btnEnunClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // clique fora fecha
}
function setupComm() {
  let show = false;
  try { show = localStorage.getItem('sp02.comm') === '1'; } catch { /* */ }
  setComm(show);
  $('btnComm').addEventListener('click', () => setComm($('commPanel').hidden));
  $('btnCommHide').addEventListener('click', () => setComm(false));
}
function commBadge(s) {
  const st = s.status;
  const cls = st === 'conectado' ? 'ok' : (st === 'conectando' || st === 'reconectando') ? 'busy' : st === 'erro' ? 'err' : '';
  $('commDot').className = 'cdot ' + cls;
  $('commTxt').textContent = st === 'conectado' ? `CLP conectado · ${s.config.host}` : st === 'erro' ? 'CLP com erro · configurar' : (st === 'conectando' || st === 'reconectando') ? 'Conectando ao CLP…' : 'Conectar ao CLP';
}

function onState(s) {
  commBadge(s);
  state = s;
  if (formLoadedFor !== s.id) { loadForm(s.config); formLoadedFor = s.id; }
  if (lastStatus !== s.status) {
    lastStatus = s.status;
    refreshTabs();
    if (s.status === 'desconectado' || s.status === 'erro') loadForm(s.config);
  }
  const st = $('connStatus');
  st.textContent = s.statusText;
  st.className = `status ${STATUS_CLASS[s.status] || ''}`;
  const busy = s.status !== 'desconectado' && s.status !== 'erro';
  for (const f of form.elements) f.disabled = busy;
  $('btnConnect').disabled = busy;
  $('btnDisconnect').disabled = !busy;

  // fila
  const c = s.comm;
  const maxQ = Math.max(4, ...c.queue);
  c.queue.forEach((n, i) => { $(`qn${i}`).textContent = n; $(`qb${i}`).style.width = `${(n / maxQ) * 100}%`; });
  $('qRate').textContent = `${fmt(c.rate, 1)} req/s`;
  const kv = $('commStats');
  const items = [
    ['Enviadas / respondidas', `${c.sent} / ${c.ok}`],
    ['Por prioridade (P0·P1·P2·P3)', c.sentByPriority.join(' · ')],
    ['Resposta última / média / máx', `${c.lastRtMs} / ${fmt(c.avgRtMs, 1)} / ${c.maxRtMs} ms`],
    ['Timeouts / novas tentativas', `${c.timeouts} / ${c.retries}`],
    ['Exceções Modbus', String(c.exceptions)],
    ['Última leitura do CLP', c.lastDiAgeMs === null ? '—' : `há ${c.lastDiAgeMs < 1000 ? c.lastDiAgeMs + ' ms' : fmt(c.lastDiAgeMs / 1000, 1) + ' s'}`],
  ];
  if (c.dropped) items.push(['Descartadas (fila cheia)', String(c.dropped)]);
  if (c.verifyMismatch) items.push(['Divergências FC01', String(c.verifyMismatch)]);
  kv.innerHTML = items.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');

  const sim = s.sim;
  views.pid(sim); views.gauge(sim); if (views.p3d) views.p3d.update(sim); views.trend.push(sim); views.proc(sim);
  views.door(sim); views.elec(sim); views.io(s);
  views.ssw0(sim.ssw[0]);
  views.ssw1(sim.ssw[1]);
  views.kpPJ(sim.pressostats.PJ);
  views.kpPB(sim.pressostats.PB);
}

// ------------------------------------------------------------------ Início
(async function init() {
  meta = await api('meta');
  document.title = `Simulador Sistema de Incêndio v${meta.version} · Modbus TCP`;
  setupComm();
  setupEnunciado();
  views.pid = createPID($('pidHost'));
  views.p3d = null;
  setupProcessViews();
  views.gauge = createGauge($('gaugeHost'));
  views.trend = createTrend($('trend'));
  views.proc = bindProcess();
  views.door = buildDoor();
  views.elec = buildElec();
  views.io = buildIo();
  views.ssw0 = createSSW05($('ssw0'), 0, meta, send);
  views.ssw1 = createSSW05($('ssw1'), 1, meta, send);
  views.kpPJ = createKP($('kpPJ'), 'PJ', meta, send);
  views.kpPB = createKP($('kpPB'), 'PB', meta, send);
  const list = await api('sessions');
  const want = location.hash.slice(1);
  let mine = null;
  try { mine = await api('sessions/mine'); mineId = mine.id; } catch { /* */ }
  selectSession(list.find((s) => s.id === want) ? want : (mine ? mine.id : list[0].id));
  setInterval(refreshTabs, 3000);
})().catch((e) => toast(`Falha ao iniciar a interface: ${e.message}`));
