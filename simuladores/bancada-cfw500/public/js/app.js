/* Bancada CFW500 - interface. Tudo roda no navegador; o estado fica no localStorage (sem cadastro, sem nome). */
(async function (g) {
  'use strict';
  const SIM = g.SIM, $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const { LISTA, MAPA, OPC, FALHAS, ALARMES, CONFIG, fmt, nomeP } = SIM.params;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const br = (v, d) => Number(v).toFixed(d).replace('.', ',');
  // ---------------------------------------------------------------- sessões independentes
  // Cada aba do navegador tem a SUA bancada (sessão). Vários alunos ao mesmo tempo, no mesmo PC ou pela rede, não se
  // misturam: a simulação roda em cada navegador e cada sessão grava em uma chave própria. Sem nome e sem cadastro.
  const BASE = 'bancada-cfw500/v2', kS = (id) => `${BASE}/s/${id}`, kV = (id) => `${BASE}/vivo/${id}`, EU = Math.random().toString(36).slice(2);
  const arm = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } }, del(k) { try { localStorage.removeItem(k); } catch (_) { /* nada */ } },
    chaves() { try { return Object.keys(localStorage); } catch (_) { return []; } } };
  const novaId = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let id; do { id = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (arm.get(kS(id))); return id; };
  const emUso = (id) => { const v = (arm.get(kV(id)) || '').split(':'); return v.length === 2 && v[0] !== EU && Date.now() - Number(v[1]) < 6000; };
  function sessoes() {
    return arm.chaves().filter((k) => k.startsWith(BASE + '/s/')).map((k) => { try { const d = JSON.parse(arm.get(k)); return { id: k.slice(BASE.length + 3), t: d.t || 0, fios: (d.b && d.b.fios || []).length, feitas: Object.keys(d.feitas || {}).length }; } catch (_) { return null; } }).filter(Boolean).sort((a, b) => b.t - a.t);
  }
  const canal = g.BroadcastChannel ? new BroadcastChannel(BASE) : null;
  const abertaEmOutraAba = (id) => new Promise((ok) => {                 // pergunta às outras abas (pega até aba duplicada, que copia a sessão)
    if (!canal) return ok(emUso(id)); let achou = false;
    const ouvir = (e) => { if (e.data && e.data.t === 'eu' && e.data.id === id) achou = true; };
    canal.addEventListener('message', ouvir); canal.postMessage({ t: 'quem', id });
    setTimeout(() => { canal.removeEventListener('message', ouvir); ok(achou || emUso(id)); }, 180);
  });
  let SID = null, avisoSessao = '';
  {
    let daAba = null; try { daAba = sessionStorage.getItem(BASE + '/id'); } catch (_) { /* sem armazenamento */ }
    let pedida = null; try { const u = new URL(location.href); pedida = (u.searchParams.get('sessao') || '').toUpperCase(); if (pedida) { u.searchParams.delete('sessao'); history.replaceState(null, '', u.pathname + u.search + u.hash); } } catch (_) { /* endereço sem URL */ }
    const quer = /^[A-Z0-9]{2,12}$/.test(pedida || '') ? pedida : daAba;
    if (quer && await abertaEmOutraAba(quer)) { SID = novaId(); avisoSessao = `A sessão ${quer} já está aberta em outra aba. Esta aba ficou com a sessão ${SID}, independente.`; }
    else if (quer) SID = quer;
    else { const livre = sessoes().find((x) => !emUso(x.id)); SID = livre ? livre.id : novaId(); }      // aba nova: continua a última bancada que não está em uso
    try { sessionStorage.setItem(BASE + '/id', SID); } catch (_) { /* sem armazenamento */ }
    const bate = () => arm.set(kV(SID), `${EU}:${Date.now()}`); bate(); setInterval(bate, 2000);
    addEventListener('pagehide', () => arm.del(kV(SID)));
    if (canal) canal.addEventListener('message', (e) => { if (e.data && e.data.t === 'quem' && e.data.id === SID) canal.postMessage({ t: 'eu', id: SID }); });
    const todas = sessoes(), limite = Date.now() - 60 * 864e5;          // faxina: guarda as 12 mais recentes e nada com mais de 60 dias
    todas.forEach((x, i) => { if (x.id !== SID && !emUso(x.id) && (i >= 12 || x.t < limite)) arm.del(kS(x.id)); });
    arm.chaves().filter((k) => k.startsWith(BASE + '/vivo/') && Date.now() - Number((arm.get(k) || ':0').split(':')[1]) > 60000).forEach((k) => arm.del(k));
  }
  let salvo = null; try { salvo = JSON.parse(arm.get(kS(SID)) || 'null'); } catch (_) { /* dado estragado: começa do zero */ }
  const est = { feitas: (salvo && salvo.feitas) || {}, mem: {}, aba: 'missoes', aberta: null, resp: {} };
  let tGravar = null, banc = null, cena = null;
  let semGravar = false;
  function gravarJa() { clearTimeout(tGravar); tGravar = null; if (!semGravar) arm.set(kS(SID), JSON.stringify({ t: Date.now(), b: banc.salvar(), feitas: est.feitas })); }
  function gravar() { clearTimeout(tGravar); tGravar = setTimeout(gravarJa, 500); }
  banc = new SIM.Bancada({ salvo: salvo && salvo.b, aoGravar: gravar });
  SIM.banc = banc;

  // ---------------------------------------------------------------- avisos
  let tToast = null;
  function toast(m) { const e = $('#toast'); e.textContent = m; e.hidden = false; clearTimeout(tToast); tToast = setTimeout(() => { e.hidden = true; }, 2600); }
  function janela(html) { $('#jCorpo').onclick = null; $('#jCorpo').innerHTML = html; $('#janela').hidden = false; }
  $('#jFechar').onclick = () => { $('#janela').hidden = true; };
  $('#janela').addEventListener('pointerdown', (e) => { if (e.target.id === 'janela') $('#janela').hidden = true; });
  const INFO = {
    rede: 'Tomada trifásica da bancada: 220 V entre fases e 127 V entre fase e neutro, 60 Hz. A chave geral tem proteção: curto-circuito ou 220 V em borne de comando desarmam a bancada e o motivo aparece na tela. Para rearmar, corrija a ligação e gire a chave de novo.',
    disj: 'Disjuntor tripolar (curva C, 10 A). Entra entre a rede e o inversor: bornes 1-3-5 em cima (entrada) e 2-4-6 embaixo (saída). Clique na alavanca para ligar e desligar.',
    cfw: 'Inversor WEG CFW500A04P3B2 (200-240 V, 4,3 A, mecânica A) com o módulo plug-in CFW500-IOS: 4 entradas digitais, 1 entrada analógica, 1 saída analógica, 1 saída a relé, 1 saída a transistor e RS-485. Os bornes da placa têm a mesma numeração do produto. As teclas da HMI funcionam no 3D e na aba Inversor. De fábrica as DIs são NPN: ficam ativas quando ligadas ao GND (bornes 4 ou 16).',
    motor: 'Motor de indução trifásico WEG W22, 0,75 kW (1 cv), 4 polos, já fechado em triângulo para 220 V. Placa: 2,98 A, 1725 rpm, 60 Hz, cos φ 0,80, rendimento 82,6 %, FS 1,25. No eixo há um disco com freio de carga (aba Bancada) e um volante de inércia opcional. Trocar duas fases inverte o sentido.',
    bot: 'Botão pulsador de 22 mm com um contato NA (13-14) e um NF (21-22). Fica acionado só enquanto você segura.',
    chave: 'Chave seletora de 2 posições fixas com um contato NA (13-14) e um NF (21-22). Clique para mudar de posição.',
    emerg: 'Botão de emergência tipo cogumelo com trava: NF (11-12) e NA (23-24). Clique para acionar e clique de novo para destravar.',
    pot: 'Potenciômetro linear de 5 kΩ. Bornes 1 e 3 são os extremos e o 2 é o cursor. Arraste o botão (ou use a roda do mouse sobre ele). Ligação típica: 3 no +10 V, 2 na AI1 e 1 no GND.',
    sinal: 'Sinaleiro LED de 24 Vcc (cerca de 10 mA). X1 é o positivo e X2 o negativo. Acende acima de uns 15 V.',
    gerador: 'Gerador de sinal para testar a entrada analógica: 0 a 10 V ou 0 a 24 mA. O botão azul troca entre V e mA e o botão giratório ajusta o valor. Em mA, lembre da chave S1.1 do plug-in (aba Bancada) e de P0233.',
    multi: 'Multímetro digital: clique no seletor para trocar a função (V~, V⎓, Ω, continuidade). Arraste cada ponta até um borne, ou toque na ponta e depois no borne. Resistência e continuidade só com o circuito desenergizado.',
  };
  function info(id) {
    const c = banc.comp(id); if (!c) return; const d = SIM.TIPOS[c.tipo];
    janela(`<h2>${esc(c.id)} · ${esc(d.nome)}</h2><p>${esc(INFO[c.tipo] || '')}</p>` +
      (d.term.length ? `<table class="leit">${d.term.map((t) => `<tr><td>${esc(t.nome)}</td><td colspan="2" style="text-align:left;font-family:inherit">${esc(t.desc)}</td></tr>`).join('')}</table>` : '') +
      (d.unico ? '' : `<div class="linha"><button class="botao perigo" id="jRemover">Remover ${esc(c.id)} da bancada</button></div>`));
    const b = $('#jRemover'); if (b) b.onclick = () => { banc.remover(id); cena.reconstruir(); $('#janela').hidden = true; toast(`${id} removido`); };
  }
  $('#btnAjuda').onclick = () => janela(`<h2>Como usar a bancada</h2><ul>
    <li><b>Fio:</b> clique num borne e depois no outro (ou arraste de um borne ao outro). <kbd>Esc</kbd> cancela.</li>
    <li><b>Remover fio:</b> clique no fio e em “Remover fio” (ou <kbd>Delete</kbd>); duplo clique ou botão direito no fio também remove.</li>
    <li><b>Arrumar o fio:</b> o cabo é maleável. Arraste qualquer ponto dele para puxar; ao soltar, o ponto fica preso numa presilha. Arraste a presilha para mudar de lugar; duplo clique ou botão direito nela solta o cabo.</li>
    <li><b>Mover componente:</b> arraste pela placa. O motor e o multímetro andam sobre a mesa.</li>
    <li><b>Acionar:</b> clique na chave geral, na alavanca do disjuntor, nas chaves e no cogumelo; segure os botões pulsadores e as teclas do inversor; arraste o potenciômetro.</li>
    <li><b>Multímetro:</b> clique no seletor para trocar a função e arraste as pontas até os bornes.</li>
    <li><b>Câmera:</b> arraste o fundo para girar, botão direito (ou dois dedos) para deslocar, roda do mouse (ou pinça) para aproximar. Os botões embaixo levam a cada parte.</li>
    <li><b>Explicação de um componente:</b> botão direito nele.</li></ul>
    <p>Nada aqui pede cadastro. Cada aba do navegador é uma <b>sessão independente</b>, guardada neste navegador (botão “Sessão”, no topo).</p>`);

  // ---------------------------------------------------------------- cena 3D
  cena = SIM.criaCena($('#cena3d'), banc, {
    toast, mudou: gravar, info, abreHMI: () => aba('inversor'),
    dica(t, x, y) { const e = $('#dicaT'); e.hidden = !t; if (t) { e.textContent = t; e.style.left = Math.min(x + 14, innerWidth - 330) + 'px'; e.style.top = (y + 16) + 'px'; } },
    modo(t) { const e = $('#modo'); e.hidden = !t; e.textContent = t; },
    selecao(s) { $('#btnRemover').hidden = !(s && s.fio); },
  });
  SIM.cena = cena;
  $('#btnRemover').onclick = () => cena.removerSel();
  $('#vistas').onclick = (e) => { const v = e.target.dataset.vista; if (v) cena.vista(v); };

  // ---------------------------------------------------------------- abas
  function aba(n) { est.aba = n; $$('#abas button').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === n)); $$('.painel').forEach((p) => { p.hidden = p.id !== 'aba-' + n; }); if (n === 'parametros') desenhaParams(); atualiza(true); }
  $('#abas').onclick = (e) => { if (e.target.dataset.aba) aba(e.target.dataset.aba); };

  // ---------------------------------------------------------------- missões
  function desenhaMissoes() {
    $('#listaMissoes').innerHTML = SIM.MISSOES.map((m) => {
      const ab = est.aberta === m.id, feita = !!est.feitas[m.id];
      return `<li class="${feita ? 'feita' : ''}" data-id="${m.id}"><button class="cab"><b>${esc(m.titulo)}</b></button>` + (ab ? `<div class="det"><p>${esc(m.texto)}</p><ol>${m.passos.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>
        <div class="acoes"><button class="botao" data-ac="fios">Montar os fios para mim</button>${m.params ? '<button class="botao" data-ac="resp">Ver parâmetros</button>' : ''}${feita ? '<button class="botao" data-ac="refazer">Refazer</button>' : ''}</div>
        <div class="resp"></div>${feita ? '<div class="ok">✓ Missão concluída</div>' : ''}</div>` : '') + '</li>';
    }).join('');
    atualizaResp();
  }
  function atualizaResp() {
    const li = est.aberta && $(`#listaMissoes li[data-id="${est.aberta}"]`), m = SIM.MISSOES.find((x) => x.id === est.aberta); if (!li || !m) return;
    const box = $('.resp', li); if (!est.resp[m.id] || !m.params) { box.innerHTML = ''; box.dataset.h = ''; return; }
    const h = `<table class="tresp">${m.params.map(([n, v]) => { const at = banc.inv.P[n], ok = at === v; return `<tr><td>${nomeP(n)} ${esc(MAPA[n].nome)}</td><td class="${ok ? 'c' : 'e'}">${fmt(n, at)}</td><td>→ ${fmt(n, v)}</td></tr>`; }).join('')}</table>
      <div class="acoes" style="margin-top:8px"><button class="botao" data-ac="gravar">Gravar estes parâmetros</button></div>`;
    if (box.dataset.h !== h) { box.dataset.h = h; box.innerHTML = h; }
  }
  $('#listaMissoes').onclick = (e) => {
    const li = e.target.closest('li[data-id]'); if (!li) return; const id = li.dataset.id, m = SIM.MISSOES.find((x) => x.id === id), ac = e.target.dataset.ac;
    if (e.target.closest('.cab')) { est.aberta = est.aberta === id ? null : id; return desenhaMissoes(); }
    if (ac === 'fios') { banc.montagem(m.montagem); cena.sincFios(); toast('Fios montados: ' + SIM.MONTAGENS[m.montagem].nome); }
    else if (ac === 'resp') { est.resp[id] = !est.resp[id]; atualizaResp(); }
    else if (ac === 'refazer') { delete est.feitas[id]; est.mem[id] = {}; gravar(); desenhaMissoes(); }
    else if (ac === 'gravar') { const ruins = m.params.map(([n, v]) => [n, banc.inv.set(n, v)]).filter((r) => !r[1].ok); toast(ruins.length ? `${nomeP(ruins[0][0])}: ${ruins[0][1].msg}` : 'Parâmetros gravados no inversor'); atualizaResp(); }
  };
  function confereMissoes() {
    let mudou = false;
    for (const m of SIM.MISSOES) { if (est.feitas[m.id]) continue; const mem = est.mem[m.id] || (est.mem[m.id] = {}); let ok = false; try { ok = m.check(banc, mem); } catch (_) { ok = false; } if (ok) { est.feitas[m.id] = true; mudou = true; toast('✓ Missão concluída: ' + m.titulo); } }
    if (mudou) { gravar(); desenhaMissoes(); }
  }

  // ---------------------------------------------------------------- aba Inversor (HMI grande)
  const hmiCtx = $('#hmiLcd').getContext('2d');
  $$('#teclado button').forEach((b) => {
    const t = b.dataset.t, solta = () => { if (b.classList.contains('ap')) { b.classList.remove('ap'); banc.inv.hmi.tecla(t, false); } };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('ap'); banc.inv.hmi.tecla(t, true); });
    b.addEventListener('pointerup', solta); b.addEventListener('pointercancel', solta); b.addEventListener('lostpointercapture', solta);
  });
  const LEIT = [1, 2, 3, 4, 5, 7, 9, 10, 18, 14, 12, 13, 37, 30, 47];
  function atualizaInversor() {
    const inv = banc.inv, P = inv.P, d = inv.hmi.display();
    $('#hmiMsg').hidden = !d.msg; if (d.msg) $('#hmiMsg').textContent = d.msg;
    let h;
    if (!inv.vivo) h = '<b>Inversor desenergizado.</b> Leve a rede até R/L1, S/L2 e T/L3, feche o disjuntor e ligue a chave geral.';
    else {
      h = `<b>Estado (P0006): ${P[6]} = ${esc(OPC[6][P[6]])}</b> · ${inv.loc ? 'LOCAL' : 'REMOTO'}`;
      if (inv.falhaCod) h += `<br><span class="f">F${String(inv.falhaCod).padStart(4, '0')} ${esc((FALHAS[inv.falhaCod] || [''])[0])}.</span> ${esc((FALHAS[inv.falhaCod] || ['', ''])[1])} Reset: tecla O.`;
      if (P[47]) h += `<br><span class="a">CONF (P0047 = ${P[47]}):</span> ${esc(CONFIG[P[47]] || '')}.`;
      if (inv.alarme) h += `<br><span class="a">A${String(inv.alarme).padStart(4, '0')} ${esc((ALARMES[inv.alarme] || [''])[0])}.</span> ${esc((ALARMES[inv.alarme] || ['', ''])[1])}`;
      if (inv.estado === 2) h += '<br><span class="a">Subtensão:</span> o link DC está abaixo de 200 V. Confira se chegam 220 V entre duas entradas.';
      if (inv.limit) h += `<br><span class="a">Rampa segurada pela ${inv.limit === 'corrente' ? 'limitação de corrente (P0135)' : 'regulação do link DC (P0151)'}.</span>`;
    }
    $('#invSituacao').innerHTML = h;
    $('#invLeituras').innerHTML = LEIT.map((n) => `<tr><td>${nomeP(n)} ${esc(MAPA[n].nome)}</td><td>${inv.vivo ? (n === 1 || n === 2 ? inv.hmi._fmt(n, P[n]).txt.replace('.', ',') : n === 12 || n === 13 ? P[n].toString(2).padStart(n === 12 ? 4 : 2, '0') : fmt(n, P[n])) : '—'}</td><td>${n === 1 || n === 2 ? esc(inv.hmi._fmt(n, 0).un) : n === 12 ? 'DI4…DI1' : n === 13 ? 'DO2 DO1' : esc(MAPA[n].un)}</td></tr>`).join('');
  }

  // ---------------------------------------------------------------- aba Parâmetros
  function filtro() {
    const q = $('#pBusca').value.trim().toLowerCase(), gp = $('#pGrupo').value, P = banc.inv.P;
    return LISTA.filter((p) => (gp === 'PARAM' || (gp === 'SIM' ? !p.guardado : gp === 'MODIF' ? !p.ro && p.n !== 0 && P[p.n] !== p.def : p.grupos.includes(gp))) &&
      (!q || nomeP(p.n).toLowerCase().includes(q) || String(p.n) === q || p.nome.toLowerCase().includes(q)));
  }
  const textoValor = (p, v) => fmt(p.n, v, true) + (p.opc && p.opc[v] !== undefined ? ' · ' + p.opc[v] : '');
  function desenhaParams() {
    $('#pCorpo').innerHTML = filtro().map((p) => `<tr data-n="${p.n}" class="${p.ro ? 'ro' : ''}${p.guardado ? ' g' : ''}"><td class="pn">${nomeP(p.n)}</td><td class="pd">${esc(p.nome)}${p.ro ? ' <i class="gd">ro</i>' : ''}${p.cfg ? ' <i>cfg</i>' : ''}${p.guardado ? ' <i class="gd">guardado</i>' : ''}</td><td class="pv"></td></tr>`).join('');
    atualizaParams();
  }
  function atualizaParams() {
    const P = banc.inv.P;
    for (const tr of $$('#pCorpo tr')) { const p = MAPA[tr.dataset.n], c = tr.lastChild; if (c.firstElementChild) continue; const t = (p.n === 1 || p.n === 2) ? banc.inv.hmi._fmt(p.n, P[p.n]).txt.replace('.', ',') + ' ' + banc.inv.hmi._fmt(p.n, 0).un : textoValor(p, P[p.n]); if (c.textContent !== t) c.textContent = t; tr.classList.toggle('mod', !p.ro && P[p.n] !== p.def); }
  }
  $('#pBusca').oninput = desenhaParams; $('#pGrupo').onchange = desenhaParams;
  $('#pCorpo').onclick = (e) => {
    const td = e.target.closest('td.pv'), tr = td && td.parentNode; if (!td || td.firstElementChild || tr.classList.contains('ro')) return;
    const p = MAPA[tr.dataset.n], v = banc.inv.P[p.n]; let ed;
    const lista = p.opc && p.n !== 200;
    if (lista) { ed = document.createElement('select'); for (let i = p.min; i <= p.max; i++) if (p.opc[i] !== undefined) ed.add(new Option(`${i} · ${p.opc[i]}`, i)); ed.value = v; }
    else { ed = document.createElement('input'); ed.type = 'number'; ed.min = p.min; ed.max = p.max; ed.step = Math.pow(10, -p.dec); ed.value = v; ed.title = `${fmt(p.n, p.min)} a ${fmt(p.n, p.max)} ${p.un}`; }
    td.textContent = ''; td.appendChild(ed); ed.focus(); if (ed.select) ed.select();
    let fim = false; const fecha = (grava) => { if (fim) return; fim = true; if (grava && ed.value !== '') { const r = banc.inv.set(p.n, +ed.value); toast(r.ok ? `${nomeP(p.n)} = ${textoValor(p, banc.inv.P[p.n])}` : `${nomeP(p.n)}: ${r.msg}`); } td.textContent = ''; atualizaParams(); if ($('#pGrupo').value === 'MODIF') desenhaParams(); };
    ed.onchange = () => fecha(true); ed.onblur = () => fecha(!lista); ed.onkeydown = (k) => { if (k.key === 'Enter') fecha(true); else if (k.key === 'Escape') fecha(false); };
  };

  // ---------------------------------------------------------------- aba Medições
  const mmCtx = $('#mmLcd').getContext('2d');
  $('#mmModos').innerHTML = SIM.MODOS_MULTI.map((m, i) => `<button data-m="${i}">${m}</button>`).join('');
  $('#mmModos').onclick = (e) => { if (e.target.dataset.m !== undefined) banc.acao(banc.porTipo('multi').id, { modo: +e.target.dataset.m }); };
  $('#mmPontas').onclick = (e) => { const k = e.target.dataset.k; if (k) banc.acao(banc.porTipo('multi').id, { [k]: null }); };
  const nomeRef = (r) => { if (!r) return 'solta'; const i = banc.infoTerm(r); return i ? `${i.comp.id}:${i.term.nome}` : 'solta'; };
  function atualizaMedicoes() {
    const mm = banc.porTipo('multi'), inv = banc.inv, P = inv.P, cfw = banc.porTipo('cfw'), A = cfw.id + '.';
    SIM.desenhaMulti(mmCtx, 400, 180, banc.leitura); $$('#mmModos button').forEach((b) => b.classList.toggle('ativa', +b.dataset.m === mm.st.modo));
    $('#mmPontas').innerHTML = `Ponta vermelha (VΩ): <b>${esc(nomeRef(mm.st.pv))}</b> ${mm.st.pv ? '<button class="botao" data-k="pv" style="padding:1px 7px">soltar</button>' : ''}<br>Ponta preta (COM): <b>${esc(nomeRef(mm.st.pc))}</b> ${mm.st.pc ? '<button class="botao" data-k="pc" style="padding:1px 7px">soltar</button>' : ''}` +
      (banc.leitura.erro ? '<br><span class="f">Há tensão entre as pontas: resistência e continuidade só com o circuito desligado.</span>' : '');
    const fn = [263, 264, 265, 266], ln = [];
    [1, 3, 5, 7].forEach((b, i) => ln.push([`DI${i + 1} (borne ${b}) · ${OPC[263][P[fn[i]]]}`, inv.vivo ? br(banc.vcc(A + 'c' + b) - banc.vcc(A + 'c4'), 1) + ' V' : '—', inv.vivo ? (inv.di[i] ? '<span class="on">ativa</span>' : '<span class="off">inativa</span>') + (inv.diPnp(i) ? ' PNP' : ' NPN') : '']));
    ln.push(['AI1 (borne 6)', inv.vivo ? (cfw.st.s1 ? br(inv.ent.aiV / 500 * 1000, 2) + ' mA' : br(inv.ent.aiV, 2) + ' V') : '—', inv.vivo ? `P0018 = ${fmt(18, P[18])} %` : '']);
    ln.push([`AO1 (borne 2) · ${OPC[251][P[251]]}`, inv.vivo ? br(banc.vcc(A + 'c2') - banc.vcc(A + 'c4'), 2) + ' V' : '—', inv.vivo ? `P0014 = ${fmt(14, P[14])} %` : '']);
    ln.push([`DO1 relé · ${OPC[275][P[275]]}`, inv.vivo && inv.sai.do1 ? '11–13' : '11–15', inv.vivo && inv.sai.do1 ? '<span class="on">acionado</span>' : '<span class="off">repouso</span>']);
    ln.push([`DO2 transistor · ${OPC[276][P[276]]}`, inv.vivo && inv.sai.do2 ? 'fechado' : 'aberto', inv.vivo && inv.sai.do2 ? '<span class="on">conduz ao GND</span>' : '<span class="off">desligado</span>']);
    $('#tabIO').innerHTML = ln.map((l) => `<tr><td>${esc(l[0])}</td><td>${l[1]}</td><td>${l[2]}</td></tr>`).join('');
    const m = banc.motor, al = banc.alim;
    $('#tabMotor').innerHTML = [['Rotação', br(m.rpm, 0), 'rpm ' + (m.rpm > 1 ? '(horário)' : m.rpm < -1 ? '(anti-horário)' : '')], ['Corrente', br(m.i, 2), 'A (placa 2,98 A)'], ['Conjugado', br(m.torque / 4.152 * 100, 0), '% do nominal'],
      ['Alimentação', al.via === 'inv' ? 'inversor' : al.via === 'rede' ? 'REDE' : 'nenhuma', al.fases === 2 ? '<span class="f">só 2 fases!</span>' : al.via === 'rede' ? 'partida direta' : al.fases === 3 ? '3 fases' : '']].map((l) => `<tr><td>${l[0]}</td><td>${l[1]}</td><td>${l[2]}</td></tr>`).join('');
  }

  // ---------------------------------------------------------------- aba Bancada
  $('#bMontagem').innerHTML = Object.keys(SIM.MONTAGENS).map((k) => `<option value="${k}">${esc(SIM.MONTAGENS[k].nome)}</option>`).join('');
  $('#bTipo').innerHTML = [['bot:verde', 'Botão pulsador verde'], ['bot:vermelho', 'Botão pulsador vermelho'], ['bot:preto', 'Botão pulsador preto'], ['chave', 'Chave seletora 2 posições'], ['emerg', 'Botão de emergência'], ['pot', 'Potenciômetro 5 kΩ'],
    ['sinal:verde', 'Sinaleiro verde 24 Vcc'], ['sinal:vermelho', 'Sinaleiro vermelho 24 Vcc'], ['sinal:amarelo', 'Sinaleiro amarelo 24 Vcc'], ['disj', 'Disjuntor tripolar'], ['gerador', 'Gerador de sinal V / mA']].map(([v, n]) => `<option value="${v}">${n}</option>`).join('');
  $('#bCor').onchange = (e) => { cena.corFio = e.target.value; };
  $('#bMontar').onclick = () => { banc.montagem($('#bMontagem').value); cena.sincFios(); toast('Fios montados'); };
  $('#bLimpar').onclick = () => { banc.limparFios(); cena.sincFios(); toast('Todos os fios foram removidos'); };
  $('#bAdd').onclick = () => { const [t, cor] = $('#bTipo').value.split(':'); const n = banc.comps.filter((c) => c.tipo === t).length; const c = banc.add(t, 0.45 + (n % 5) * 0.11, 0.2 + (n % 3) * 0.05, cor); if (c) { cena.reconstruir(); toast(`${c.id} adicionado: arraste para onde quiser`); } };
  $('#bCarga').oninput = (e) => { banc.motor.carga = e.target.value / 100; $('#bCargaV').textContent = e.target.value + ' %'; gravar(); };
  $('#bVolante').onchange = (e) => { banc.motor.volante = e.target.checked; gravar(); };
  $('#bTravado').onchange = (e) => { banc.motor.travado = e.target.checked; };
  $('#bS1').onchange = (e) => banc.acao(banc.porTipo('cfw').id, { s1: e.target.checked });
  $('#bRepor').onclick = () => { banc.padrao(); cena.reconstruir(); gravar(); toast('Componentes de volta ao lugar e fios removidos (parâmetros mantidos)'); };
  $('#bZerar').onclick = () => { semGravar = true; clearTimeout(tGravar); arm.del(kS(SID)); location.reload(); };
  // ---- janela de sessões
  const trocaSessao = (id) => { gravarJa(); semGravar = true; arm.del(kV(SID)); try { sessionStorage.setItem(BASE + '/id', id); } catch (_) { /* nada */ } location.reload(); };
  const quando = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} dia(s)`; };
  function janelaSessoes() {
    gravarJa(); const L = sessoes();
    janela(`<h2>Sessões independentes</h2><p>Cada aba do navegador tem a sua própria bancada: componentes, fios, parâmetros do inversor e missões. Vários alunos podem usar ao mesmo tempo, no mesmo PC (uma aba para cada um) ou cada um no seu, sem um mexer na bancada do outro. Não precisa de nome nem cadastro.</p>
      <table class="leit"><tr><td><b>Sessão</b></td><td style="text-align:left;font-family:inherit"><b>Uso</b></td><td></td></tr>${L.map((x) => `<tr><td><b>${x.id}</b>${x.id === SID ? ' · esta aba' : ''}</td><td style="text-align:left;font-family:inherit;width:44%">${quando(x.t)} · ${x.fios} fio(s) · ${x.feitas} missão(ões)</td>
        <td style="text-align:right">${x.id === SID ? '' : emUso(x.id) ? 'aberta em outra aba' : `<button class="botao" data-abrir="${x.id}" style="padding:2px 8px">Abrir aqui</button> <button class="botao perigo" data-apagar="${x.id}" style="padding:2px 8px">Apagar</button>`}</td></tr>`).join('')}</table>
      <div class="linha"><button class="botao destaque" id="jNova">Nova sessão em branco nesta aba</button></div><p class="dica">Uma aba nova continua a última bancada que não estiver aberta; se todas estiverem em uso, começa uma em branco. As sessões ficam guardadas neste navegador.</p>`);
    $('#jNova').onclick = () => trocaSessao(novaId());
    $('#jCorpo').onclick = (e) => { const a = e.target.dataset.abrir, d = e.target.dataset.apagar; if (a) { if (emUso(a)) return toast('Essa sessão acabou de ser aberta em outra aba.'); trocaSessao(a); } else if (d) { arm.del(kS(d)); janelaSessoes(); } };
  }
  $('#chSessao').textContent = 'Sessão ' + SID; $('#chSessao').onclick = janelaSessoes;
  addEventListener('pagehide', () => { if (tGravar) gravarJa(); });
  if (avisoSessao) setTimeout(() => toast(avisoSessao), 800);
  SIM.sessao = SID;
  function sincControles() { $('#bCarga').value = Math.round(banc.motor.carga * 100); $('#bCargaV').textContent = Math.round(banc.motor.carga * 100) + ' %'; $('#bVolante').checked = banc.motor.volante; $('#bS1').checked = !!banc.porTipo('cfw').st.s1; }

  // ---------------------------------------------------------------- bip de continuidade
  let ac = null, osc = null, ganho = null;
  addEventListener('pointerdown', () => { if (ac) return; try { ac = new (g.AudioContext || g.webkitAudioContext)(); osc = ac.createOscillator(); ganho = ac.createGain(); osc.frequency.value = 2400; ganho.gain.value = 0; osc.connect(ganho).connect(ac.destination); osc.start(); } catch (_) { ac = null; } }, { once: false, passive: true });

  // ---------------------------------------------------------------- atualização periódica
  const chip = (id, t, c) => { const e = $(id); if (e.textContent !== t) e.textContent = t; e.className = 'chip' + (e.classList.contains('num') ? ' num' : '') + (c ? ' ' + c : ''); };
  let nEv = -1;
  function atualiza(forca) {
    const inv = banc.inv, r = banc.porTipo('rede'), P = inv.P;
    chip('#chRede', r.st.desarmada ? 'Bancada DESARMADA' : r.st.ligada ? 'Rede ligada' : 'Rede desligada', r.st.desarmada ? 'er' : r.st.ligada ? 'ok' : '');
    chip('#chEstado', !inv.vivo ? 'Inversor apagado' : inv.falhaCod ? `Falha F${String(inv.falhaCod).padStart(4, '0')}` : P[47] ? `CONF ${P[47]}` : `${OPC[6][inv.estado].split(' ')[0]} · ${inv.loc ? 'LOC' : 'REM'}`, !inv.vivo ? '' : inv.falhaCod ? 'er' : P[47] || inv.estado === 2 || inv.alarme ? 'al' : 'ok');
    chip('#chHz', br(inv.vivo ? Math.abs(inv.fOut) : 0, 1) + ' Hz'); chip('#chA', br(banc.motor.i, 1) + ' A'); chip('#chRpm', br(banc.motor.rpm, 0) + ' rpm');
    const al = $('#alerta'); if (r.st.desarmada && banc.erros.length) { al.hidden = false; al.className = 'alerta'; al.innerHTML = `<b>A proteção da bancada desarmou</b>${esc(banc.erros[0])}<br>Corrija a ligação e gire a chave geral de novo.`; }
    else if (banc.avisos.length) { al.hidden = false; al.className = 'alerta av'; al.innerHTML = `<b>Atenção</b>${esc(banc.avisos[0])}`; } else al.hidden = true;
    const mt = banc.porTipo('motor'), p = cena.tela(mt.x - 0.06, 0.80 + 0.31, mt.y), rot = $('#rotMotor'); rot.style.left = p.x + 'px'; rot.style.top = p.y + 'px'; rot.textContent = `${mt.id} · ${br(banc.motor.rpm, 0)} rpm · ${br(banc.motor.i, 1)} A`; rot.hidden = !p.visivel;
    if (ganho) ganho.gain.value = banc.leitura.bip ? 0.05 : 0;
    confereMissoes();
    if (est.aba === 'inversor') atualizaInversor(); else if (est.aba === 'parametros') atualizaParams(); else if (est.aba === 'medicoes') atualizaMedicoes(); else if (est.aba === 'missoes' && est.aberta && est.resp[est.aberta]) atualizaResp();
    if (est.aba === 'bancada' && (forca || nEv !== banc.eventos.length)) { nEv = banc.eventos.length; $('#bEventos').innerHTML = banc.eventos.slice(-14).reverse().map((e) => `<li>${esc(e.m)}</li>`).join('') || '<li>Nada ainda.</li>'; sincControles(); }
  }
  let ult = performance.now(), acum = 0, tUI = 0;
  function quadro(agora) {
    const dt = Math.min(0.25, (agora - ult) / 1000); ult = agora; acum += dt; let n = 0;          // PC lento: a simulação continua em tempo real até ~4 quadros/s
    while (acum >= 0.002 && n < 140) { banc.passo(0.002); acum -= 0.002; n++; } if (n >= 140) acum = 0;
    cena.quadro(dt);
    if (est.aba === 'inversor') SIM.desenhaHMI(hmiCtx, 648, 400, banc.inv.hmi.display());
    tUI += dt; if (tUI >= 0.1) { tUI = 0; atualiza(false); }
    requestAnimationFrame(quadro);
  }
  est.aberta = (SIM.MISSOES.find((m) => !est.feitas[m.id]) || {}).id || null;
  desenhaMissoes(); sincControles(); banc.resolver(); requestAnimationFrame(quadro);
})(typeof globalThis !== 'undefined' ? globalThis : this);
