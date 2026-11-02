/* =============================================================================
 *  Interface da bancada: transporte (WebSocket ou demonstração), painéis e missões
 * ===========================================================================*/
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const h4 = (w) => (w & 0xFFFF).toString(16).toUpperCase().padStart(4, '0') + 'h';
  const fmtN = (x, d = 1) => Number(x).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pad4 = (n) => String(n).padStart(4, '0');
  const RPM_TO_C = 32767 / 18750;

  const S = { defs: new Map(), P: {}, v: null, sc: null, conns: [], info: {}, codes: {}, logs: [], paused: false };

  // ------------------------------------------------------------------ transporte
  let backend;
  function connectBackend() {
    return new Promise((resolve) => {
      if (location.protocol === 'file:' || window.FORCE_DEMO) return resolve(useDemo());
      // Página servida pelo simulador: sempre conversa com o servidor (o drive que o CLP enxerga).
      // O modo demonstração é só para o arquivo aberto direto no navegador: aqui ele nunca entra,
      // mesmo que a bancada 3D demore para carregar; se a conexão falhar, tenta de novo.
      let resolvido = false, tentativas = 0;
      const tentar = () => {
        tentativas++;
        const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
        const pending = new Map(); let seq = 1; let aberto = false;
        ws.onopen = () => {
          aberto = true;
          if (tentativas > 1) setMsg('Conectado ao simulador.', false);
          if (resolvido) return;   // reconexão: a página já estava usando o servidor
          resolvido = true;
          resolve({ demo: false, request: (m) => new Promise((res, rej) => { const id = seq++; pending.set(id, { res, rej }); ws.send(JSON.stringify(Object.assign({ id }, m))); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('Sem resposta do servidor')); } }, 4000); }) });
        };
        ws.onmessage = (e) => {
          const m = JSON.parse(e.data);
          if (m.t === 'reply') { const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.rej(new Error(m.error)) : p.res(m); } return; }
          onMessage(m);
        };
        ws.onclose = () => {
          if (!aberto) { setMsg('Conectando ao simulador…', false); setTimeout(tentar, 1000); return; }
          setMsg('Servidor desconectado. Recarregue a página depois de iniciar o simulador.', true);
        };
      };
      tentar();
    });
  }
  function useDemo() { S.demo = true; const d = new window.DemoBackend(onMessage); return { demo: true, request: (m) => d.request(m) }; }
  // os comandos esperam a conexão ficar pronta (a bancada 3D pode segurar a página alguns segundos ao abrir)
  let backendPronto = null;
  // o assistente de comunicação (assistente-sca06.js) grava parâmetros e lê o estado por aqui
  window.SCA06App = { req: (m) => req(m), S, buildParams: () => buildParams() };
  const req = (m) => backend ? backend.request(m) : (backendPronto ? backendPronto.then((b) => b.request(m)) : Promise.reject(new Error('Iniciando…')));

  function onMessage(m) {
    if (m.t === 'init') {
      m.defs.forEach(d => S.defs.set(d.n, d)); Object.assign(S.P, m.params); S.info = m.info; S.codes = m.codes; S.diFuncs = m.diFuncs;
      buildParams(); renderNetInfo();
      $('#indSrc').textContent = m.info.backend ? 'servidor Node · rede real' : 'demonstração no navegador';
      return;
    }
    if (m.t === 'view') {
      Object.assign(S.P, m.params); S.v = m.v; S.sc = m.scanner; S.conns = m.conns; S.deviceIp = m.deviceIp; S.stats = m.stats;
      if (m.logs && m.logs.length) addLogs(m.logs);
      bench && bench.update(m.v);
      tick();
    }
  }

  // ------------------------------------------------------------------ 3D
  let bench;
  try {
    bench = new window.Bench3D($('#stage'), {
      lowPower: matchMedia('(max-width: 900px)').matches,
      onAction: (a) => {
        if (a.startsWith('hmi:')) req({ t: 'hmi', key: a.slice(4) });
        else if (a.startsWith('bench:')) { const k = a.slice(6); req({ t: 'bench', key: k, value: !(S.v && S.v.bench[k]) }); }
        else if (a.startsWith('tab:')) selectTab(a.slice(4));
      }
    });
  } catch (e) { $('#stage').insertAdjacentHTML('beforeend', `<p style="color:#fff;padding:60px 20px">WebGL indisponível: ${e.message}</p>`); }
  window.__bench = bench;   // acesso pelo console (F12) para aulas e gravação de vídeo
  $$('.views button[data-view]').forEach(b => b.onclick = () => bench && bench.view(b.dataset.view));
  $$('.views button[data-rot]').forEach(b => b.onclick = () => bench && bench.rotateRig(+b.dataset.rot));
  $$('.views button[data-rig]').forEach(b => b.onclick = () => bench && bench.resetRig());

  // ------------------------------------------------------------------ abas
  function selectTab(name) {
    $$('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === name));
    $$('.pane').forEach(p => p.hidden = p.dataset.pane !== name);
    S.tab = name;
    if (name === 'hmi' && bench) bench.view('drive');
    if (name === 'net') renderNetInfo();
  }
  $$('.tabs button').forEach(b => b.onclick = () => selectTab(b.dataset.tab));

  // ------------------------------------------------------------------ régua superior
  const P801 = ['Setup', 'Init', 'Wait Comm', 'Idle', 'Data Active', 'Error', 'Reservado', 'Exception', 'Access Error'];
  const P006 = ['Desabilitado', 'Servo ready', 'Falha', 'Sem potência', 'Autoajuste', 'Stop ativo', 'STO ativo'];
  function setMsg(t, err) { const e = $('#indMsg'); e.textContent = t || ''; e.classList.toggle('err', !!err); }
  function renderRail(v) {
    const led = $('#indNs .led'); led.className = 'led' + ({ green: ' g', 'green-blink': ' g blink', red: ' r', 'red-blink': ' r blink' }[v.ns] || '');
    $('#indP801').textContent = `${v.p801} ${P801[v.p801] || ''}`;
    $('#indP006').textContent = `${v.p006} ${P006[v.p006] || ''}`;
    $('#indMode').textContent = `${v.mode}`;
    $('#indRpm').textContent = Math.round(v.rpm);
    $('#indAng').textContent = fmtN((v.angle + 360) % 360, 1);
    $('#indIq').textContent = fmtN(v.iq, 1);
    if (v.fault) setMsg(`F${String(v.fault).padStart(5, '0')} ${S.codes[v.fault] || ''}`, true);
    else if (v.sto) setMsg('STO ativo — libere a emergência e habilite de novo');
    else if (v.alarm) setMsg(`A${String(v.alarm).padStart(5, '0')} ${S.codes[v.alarm] || ''}`);
    else if (v.mode !== 6 && S.sc && S.sc.state === 'io') setMsg('I/O ativo, mas P0202 ≠ 6: a palavra de controle é ignorada');
    else setMsg('');
  }

  // ------------------------------------------------------------------ MESTRE (scanner)
  const OUT = { cw: 0, rpm: 0, tq: 0, mode: 1, extra: [] };
  let pulse7 = false;
  function outWords() {
    const n = S.sc && S.sc.io ? S.sc.io.outWords : 4;
    const w = [OUT.cw | (pulse7 ? 0x80 : 0), Math.round(OUT.rpm * RPM_TO_C), Math.round(OUT.tq * 10), OUT.mode];
    for (let i = 4; i < n; i++) w.push(OUT.extra[i - 4] | 0);
    return w.map(x => Math.max(-32768, Math.min(32767, x)));
  }
  // ---- painel Posição (aba Mestre): palavras 5 a 8 = P1100 comando, P1101 alvo/incremento, P1102 velocidade, P1103 tipo ----
  const TIPOS_POS = ['0 · menor caminho (absoluto)', '1 · horário (absoluto)', '2 · anti-horário (absoluto)', '3 · relativo (cada pulso anda o ângulo)'];
  function posPainelHtml() {
    if (!OUT.extra[2]) { OUT.extra[1] = 450; OUT.extra[2] = 60; OUT.extra[3] = 3; }   // valores iniciais: pulsos de 45,0° a 60 rpm
    return `<div class="pos-painel">
      <div class="wh"><span>Posição pelo aplicativo Ladder (palavras 5 a 8)</span></div>
      <div class="row pos-bot">
        <button id="posHab" class="small">Habilitar</button>
        <button id="posPulso" class="primary" title="Bit 1 do P1100 de 0 para 1: inicia um movimento">Pulso ▶</button>
        <button id="posStop" class="small">STOP</button>
        <button id="posReset" class="small" title="Bit 3: reset de falhas">Reset</button>
        <button id="posZero" class="small" title="Bit 4: a posição atual passa a ser 0,0°">Zerar posição</button>
      </div>
      <div class="row pos-campos">
        <label>Ângulo <input type="number" id="posAng" class="num" step="0.1" value="${(OUT.extra[1] / 10).toFixed(1)}"> °</label>
        <label>Velocidade <input type="number" id="posVel" class="num" min="1" max="3000" value="${OUT.extra[2]}"> rpm</label>
        <label>Tipo <select id="posTipo">${TIPOS_POS.map((t, k) => `<option value="${k}" ${OUT.extra[3] === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      </div>
      <p class="hint" id="posExpl"></p>
      <p class="hint pos-leitura" id="posLeitura"></p>
      <div class="pos-hex">Pela rede: 5ª P1100 = <code id="pxo0">0000h</code> · 6ª P1101 = <code id="pxo1">0000h</code> · 7ª P1102 = <code id="pxo2">0000h</code> · 8ª P1103 = <code id="pxo3">0000h</code></div>
    </div>`;
  }
  function posHex() {
    for (let k = 0; k < 4; k++) { const el = $('#pxo' + k); if (el) el.textContent = `${h4(OUT.extra[k] | 0)} (${OUT.extra[k] | 0})`; }
    const hab = $('#posHab'); if (hab) { const on = !!(OUT.extra[0] & 1); hab.classList.toggle('on', on); hab.textContent = on ? 'Habilitado ✓' : 'Habilitar'; }
    const stp = $('#posStop'); if (stp) { const on = !!(OUT.extra[0] & 4); stp.classList.toggle('on', on); stp.textContent = on ? 'STOP ativo' : 'STOP'; }
    const ex = $('#posExpl'); if (ex) {
      const ang = fmtN((OUT.extra[1] | 0) / 10, 1);
      ex.innerHTML = (OUT.extra[3] | 0) === 3 ? `<b>Relativo:</b> cada pulso anda <b>${ang}°</b> a partir de onde o disco está.`
        : `<b>Absoluto:</b> o pulso manda o disco para <b>${ang}°</b> (${['pelo menor caminho', 'girando no sentido horário', 'girando no sentido anti-horário'][OUT.extra[3] | 0]}).`;
    }
  }
  function posBit(bit, liga) { OUT.extra[0] = liga ? (OUT.extra[0] | bit) : (OUT.extra[0] & ~bit); posHex(); pushOut(); }
  function posPulsoBit(bit) { posBit(bit, true); setTimeout(() => posBit(bit, false), 300); }   // 300 ms em 1: o drive enxerga a subida mesmo com RPI alto
  function ligarPosPainel() {
    $('#posHab').onclick = () => posBit(1, !(OUT.extra[0] & 1));
    $('#posStop').onclick = () => posBit(4, !(OUT.extra[0] & 4));
    $('#posPulso').onclick = () => posPulsoBit(2);
    $('#posReset').onclick = () => posPulsoBit(8);
    $('#posZero').onclick = () => posPulsoBit(16);
    $('#posAng').onchange = () => { OUT.extra[1] = Math.max(-32768, Math.min(32767, Math.round(+$('#posAng').value * 10))); posHex(); pushOut(); };
    $('#posVel').onchange = () => { OUT.extra[2] = Math.max(1, Math.min(3000, Math.round(+$('#posVel').value))); $('#posVel').value = OUT.extra[2]; posHex(); pushOut(); };
    $('#posTipo').onchange = () => { OUT.extra[3] = +$('#posTipo').value; posHex(); pushOut(); };
    posHex(); pushOut();
  }
  function posAtualizarLeitura() {
    const el = $('#posLeitura'); if (!el) return;
    const iw = S.sc && S.sc.inputs; if (!iw || iw.length < 8) { el.textContent = ''; return; }
    const s5 = iw[4] & 0xFFFF;
    el.innerHTML = `Posição atual: <b>${fmtN(iw[5] / 10, 1)}°</b> · ${s5 & 2 ? '<b>movendo</b>' : s5 & 4 ? '<b>em posição</b>' : 'parado'} · movimentos concluídos: <b>${iw[7]}</b>${s5 & 8 ? ' · <b style="color:var(--bad,#C0392B)">falha</b>' : ''}`;
  }

  function pushOut() {
    const w = outWords();
    $('#cwHex').textContent = h4(w[0]); $('#w2Hex').textContent = h4(w[1]); $('#w3Hex').textContent = h4(w[2]); $('#w4Hex').textContent = h4(w[3]);
    $('#spdCalc').textContent = `${OUT.rpm} rpm × 32767 / 18750 = ${w[1]} (${h4(w[1])})`;
    req({ t: 'scanner', op: 'out', words: w }).catch(() => { });
  }
  const showErr = (e) => { $('#scErr').textContent = e ? (e.message || e) : ''; };
  $('#scConnect').onclick = async () => {
    showErr();
    try {
      const r = await req({ t: 'scanner', op: 'connect' }); const id = r.result.identity;
      $('#scIdent').innerHTML = `<dt>IP (ListIdentity)</dt><dd>${id.ip}</dd><dt>Vendor ID</dt><dd>${id.vendor} (WEG)</dd><dt>Device Type</dt><dd>${id.deviceType}</dd><dt>Product Code</dt><dd>${id.productCode}</dd><dt>Revisão</dt><dd>${id.revision}</dd><dt>Nome</dt><dd>${id.name}</dd>`;
    } catch (e) { showErr(e); }
  };
  $('#scDisconnect').onclick = () => { req({ t: 'scanner', op: 'disconnect' }); $('#scIdent').innerHTML = ''; };
  $('#scOpen').onclick = async () => {
    showErr();
    try { await req({ t: 'scanner', op: 'open', inWords: +$('#scIn').value, outWords: +$('#scOut').value, rpiMs: +$('#scRpi').value }); pushOut(); }
    catch (e) { showErr(e); }
  };
  $('#scClose').onclick = () => req({ t: 'scanner', op: 'close' }).catch(showErr);
  $('#scRun').onchange = (e) => req({ t: 'scanner', op: 'run', value: e.target.checked });
  $('#cwB3').onchange = (e) => { OUT.cw = e.target.checked ? OUT.cw | 8 : OUT.cw & ~8; pushOut(); };
  $('#cwB2').onchange = (e) => { OUT.cw = e.target.checked ? OUT.cw | 4 : OUT.cw & ~4; pushOut(); };
  $('#cwB7').onclick = () => { pulse7 = true; pushOut(); setTimeout(() => { pulse7 = false; pushOut(); }, 300); };
  const syncSpd = (v) => { OUT.rpm = Math.max(-18750, Math.min(18750, Math.round(+v || 0))); $('#spdSlider').value = OUT.rpm; $('#spdRpm').value = OUT.rpm; pushOut(); };
  $('#spdSlider').oninput = (e) => syncSpd(e.target.value); $('#spdRpm').onchange = (e) => syncSpd(e.target.value);
  const syncTq = (v) => { OUT.tq = Math.round((+v || 0) * 10) / 10; $('#tqSlider').value = Math.round(OUT.tq * 10); $('#tqA').value = OUT.tq.toFixed(1); pushOut(); };
  $('#tqSlider').oninput = (e) => syncTq(e.target.value / 10); $('#tqA').onchange = (e) => syncTq(e.target.value);
  $$('#modeSeg button').forEach(b => b.onclick = () => { OUT.mode = +b.dataset.m; $$('#modeSeg button').forEach(x => x.classList.toggle('on', x === b)); pushOut(); });

  const SBITS = [
    [0, 'Reserv.', 'res'], [1, 'Reserv.', 'res'], [2, 'Habilitado', ''], [3, 'Em falha', 'bad'], [4, 'Potência', ''], [5, 'Em STOP', 'warn'], [6, 'STO', 'bad'], [7, 'Alarme', 'warn'],
    [8, 'Reserv.', 'res'], [9, 'Reserv.', 'res'], [10, 'Reserv.', 'res'], [11, 'Reserv.', 'res'], [12, 'Reserv.', 'res'], [13, 'Reserv.', 'res'], [14, 'Fim curso hor.', 'warn'], [15, 'Fim curso anti', 'warn']];
  $('#statusBits').innerHTML = SBITS.slice().reverse().map(([b, n, c]) => `<div class="sb ${c}" data-b="${b}"><span class="n">${b}</span>${n}</div>`).join('');
  let extraBuiltFor = '';
  function renderScanner() {
    const v = S.v, sc = S.sc || {};
    const sizes = v.sizes;
    const open = sc.state === 'io';
    if (!open) {
      if (document.activeElement !== $('#scIn')) $('#scIn').value = sizes.inWords;
      if (document.activeElement !== $('#scOut')) $('#scOut').value = sizes.outWords;
    }
    $('#scSizeHint').textContent = `O SCA06 espera ${sizes.inWords} palavras de entrada (4 fixas + P0820…) e ${sizes.outWords} de saída (4 + P0835…). No Forward Open: T→O = ${sizes.inWords * 2 + 2} bytes, O→T = ${sizes.outWords * 2 + 6} bytes (seq. + header run/idle).`;
    $('#scConnect').disabled = sc.state !== 'offline'; $('#scDisconnect').disabled = sc.state === 'offline';
    $('#scOpen').disabled = sc.state !== 'session'; $('#scClose').disabled = !open;
    // palavras extras de saída (#5…)
    const wr = (v.applied && v.applied.wrWords) || [];
    const key = (sc.io ? sc.io.outWords : 4) + ':' + wr.join(',');
    if (key !== extraBuiltFor) {
      extraBuiltFor = key; const n = sc.io ? sc.io.outWords : 4;
      const posMap = n >= 8 && [1100, 1101, 1102, 1103].every((p, k) => wr[k] === p);
      $('#extraOut').innerHTML = (posMap ? posPainelHtml() : '') + Array.from({ length: Math.max(0, n - 4) }, (_, i) => {
        if (posMap && i < 4) return '';
        const pn = wr[i]; const d = S.defs.get(pn);
        return `<div class="word"><div class="wh"><span>${5 + i}ª → P${pad4(pn || 0)} ${d ? d.name : ''}</span><code id="xo${i}h">0000h</code></div><div class="row"><input type="number" class="num" data-xo="${i}" value="${OUT.extra[i] || 0}"> valor bruto${d && d.dec ? ` (${d.dec} casa${d.dec > 1 ? 's' : ''} decimal: ${d.unit})` : d && d.unit ? ' ' + d.unit : ''}</div></div>`;
      }).join('');
      $$('[data-xo]').forEach(inp => inp.onchange = () => { OUT.extra[+inp.dataset.xo] = +inp.value | 0; $(`#xo${inp.dataset.xo}h`).textContent = h4(+inp.value); pushOut(); });
      if (posMap) ligarPosPainel();
    }
    // nota: drive em modo posição -> as palavras 1 a 4 são ignoradas
    const notaM = $('#modoNota');
    if (notaM) { const emPos = S.P[202] === 4; notaM.hidden = !emPos; if (emPos) notaM.textContent = 'O drive está em modo posição (P0202 = 4): as palavras 1 a 4 acima são ignoradas. Quem comanda é o painel Posição.'; }
    posAtualizarLeitura();
    // entradas
    const iw = open && sc.inputs && sc.inputs.length ? sc.inputs : null;
    const st = iw ? iw[0] & 0xFFFF : 0;
    $('#swHex').textContent = iw ? h4(st) : '----';
    $$('#statusBits .sb').forEach(el => el.classList.toggle('on', !!iw && !!(st & (1 << +el.dataset.b))));
    const rd = (v.applied && v.applied.rdWords) || [];
    let html = '';
    if (iw) {
      html += `<span>2ª Velocidade</span><span class="v">${fmtN(iw[1] * 18750 / 32767, 1)} rpm</span><span class="h">${iw[1]}</span>`;
      html += `<span>3ª Corrente de torque</span><span class="v">${fmtN(iw[2] / 10, 1)} A</span><span class="h">${iw[2]}</span>`;
      html += `<span>4ª Modo de controle atual</span><span class="v">${['Torque', 'Velocidade', '–', 'Posição'][iw[3] & 0xF] || iw[3]}</span><span class="h">${iw[3]}</span>`;
      const posRd = [1110, 1111, 1112, 1113].every((p, k) => rd[k] === p);
      if (posRd && iw.length >= 8) {
        const s5 = iw[4] & 0xFFFF, nomes = ['habilitado', 'movendo', 'em posição', 'falha', 'fim de curso', 'STOP'];
        const ativos = nomes.filter((_, b) => s5 & (1 << b));
        html += `<span>5ª Status do posicionamento (P1110)</span><span class="v">${ativos.length ? ativos.join(', ') : 'desabilitado'}</span><span class="h">${h4(s5)}</span>`;
        html += `<span>6ª Posição atual (P1111)</span><span class="v">${fmtN(iw[5] / 10, 1)}°</span><span class="h">${iw[5]}</span>`;
        html += `<span>7ª Erro de posição (P1112)</span><span class="v">${fmtN(iw[6] / 10, 1)}°</span><span class="h">${iw[6]}</span>`;
        html += `<span>8ª Movimentos concluídos (P1113)</span><span class="v">${iw[7]}</span><span class="h">${iw[7]}</span>`;
      }
      for (let i = posRd && iw.length >= 8 ? 8 : 4; i < iw.length; i++) { const pn = rd[i - 4], d = S.defs.get(pn); html += `<span>${i + 1}ª P${pad4(pn || 0)} ${d ? d.name : ''}</span><span class="v">${d ? fmtVal(d, iw[i]) : iw[i]}</span><span class="h">${iw[i]}</span>`; }
    } else html = '<span style="grid-column:1/-1;color:var(--ink-3)">Sem conexão de I/O. Conecte e faça o Forward Open.</span>';
    $('#inDecode').innerHTML = html;
  }
  $('#exGet').onclick = async () => {
    const n = +$('#exN').value;
    try { const r = (await req({ t: 'scanner', op: 'get', n })).result; const d = S.defs.get(n); $('#exRes').textContent = r.ok ? `P${pad4(n)} = ${r.value}${d && d.dec ? ` → ${fmtVal(d, r.value)}` : ''}${d ? ' · ' + d.name : ''}` : `Erro CIP 0x${r.gs.toString(16).padStart(2, '0')} ${GS[r.gs] || ''}`; }
    catch (e) { $('#exRes').textContent = e.message + ' (conecte a sessão primeiro)'; }
  };
  $('#exSet').onclick = async () => {
    const n = +$('#exN').value, v = +$('#exV').value;
    try { const r = (await req({ t: 'scanner', op: 'set', n, v })).result; $('#exRes').textContent = r.ok ? `P${pad4(n)} ← ${v}: OK` : `Erro CIP 0x${r.gs.toString(16).padStart(2, '0')} ${GS[r.gs] || ''}`; }
    catch (e) { $('#exRes').textContent = e.message + ' (conecte a sessão primeiro)'; }
  };
  const GS = { 0x09: 'valor fora da faixa', 0x0E: 'parâmetro somente leitura', 0x10: 'exige drive desabilitado', 0x14: 'atributo não suportado', 0x16: 'parâmetro inexistente' };

  // ------------------------------------------------------------------ HMI 2D
  const d2 = new window.Drive2D($('#paneHost'), {
    onKey: (k) => req({ t: 'hmi', key: k }).catch(() => { }),
    onAction: (a) => req({ t: 'bench', key: a, value: !(S.v && S.v.bench[a]) }).catch(() => { })
  });
  window.__d2 = d2;
  const wideMq = matchMedia('(min-width: 1200px)');
  const placeFront = () => { d2.mount(wideMq.matches ? $('#frontHost') : $('#paneHost')); if (bench) setTimeout(() => bench.resize(), 0); };
  wideMq.addEventListener ? wideMq.addEventListener('change', placeFront) : wideMq.addListener(placeFront);
  placeFront();
  // teclado do computador = teclas da HMI (fora de campos de texto)
  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, select, textarea, button, [contenteditable]')) return;
    const k = { ArrowUp: 'up', ArrowDown: 'down', Enter: 'prog', ArrowLeft: 'shift' }[e.key];
    if (!k) return; e.preventDefault(); req({ t: 'hmi', key: k }).catch(() => { });
  });
  function renderHmi(v) {
    d2.update(v);
    const d = S.defs.get(v.hmi.param);
    const modeTxt = { busca: 'Modo busca', exibicao: 'Modo exibição', alteracao: 'Modo alteração' }[v.hmi.mode];
    const html = d ? `${modeTxt} · <b>P${String(d.n).padStart(5, '0')}</b> ${d.name}${S.P[0] !== 5 && S.P[200] === 1 && d.n !== 0 && !d.ro ? '<br><small>Senha não liberada: programe P00000 = 5 para alterar.</small>' : ''}` : '';
    if (html !== renderHmi.last) { renderHmi.last = html; $('#hmiState').innerHTML = html; $('#hmiStateF').innerHTML = html; }
  }

  // ------------------------------------------------------------------ parâmetros
  function fmtVal(d, raw) {
    if (raw === undefined) return '–';
    const val = d.dec ? (raw / Math.pow(10, d.dec)).toLocaleString('pt-BR', { minimumFractionDigits: d.dec, maximumFractionDigits: d.dec }) : String(raw);
    return val + (d.unit ? ' ' + d.unit : '');
  }
  let openParam = null;
  // ---- Preparar para EtherNet/IP (atalho) e padrão de fábrica: o mesmo que o aluno faria parâmetro por parâmetro
  const MOTIVO = { RO: 'somente leitura (A00122)', RANGE: 'fora da faixa (A00126)', ENABLED: 'desabilite o drive antes (A00124)', NOEXIST: 'parâmetro inexistente (A00125)' };
  const resPreset = (txt, ok) => { const el = $('#pPresetRes'); if (el) { el.textContent = txt; el.style.color = ok ? 'var(--ok, #2F9E44)' : 'var(--bad, #C0392B)'; el.style.fontWeight = '600'; } };
  async function gravarEmSequencia(passos) {
    for (const [n, v] of passos) {
      const r = (await req({ t: 'param', n, v })).result;
      if (!r.ok) return `P${pad4(n)} não foi gravado: ${MOTIVO[r.code] || r.code}.`;
    }
    return null;
  }
  // palavras extras: zeradas para velocidade/torque (conexão de 4 palavras), mapeadas no aplicativo de posição (8 palavras)
  const SEM_EXTRAS = [[820, 0], [821, 0], [822, 0], [823, 0], [835, 0], [836, 0], [837, 0], [838, 0]];
  const EXTRAS_POS = [[820, 1110], [821, 1111], [822, 1112], [823, 1113], [835, 1100], [836, 1101], [837, 1102], [838, 1103]];
  const btnPreset = $('#pPresetEip');
  if (btnPreset) btnPreset.onclick = async () => {
    if (!confirm('Preparar o SCA06 para velocidade e torque pela EtherNet/IP?\n\nGrava:\n  P0000 = 5  (senha)\n  P0202 = 6  (comando pela rede)\n  P0662 = 3  (erro de comunicação desabilita o drive)\n  P0820…P0823 e P0835…P0838 = 0  (sem palavras extras: conexão de 4 palavras)\n  P0849 = 1  (aplica a configuração de rede)\n\nO drive precisa estar desabilitado.')) return;
    const erro = await gravarEmSequencia([[0, 5], [202, 6], [662, 3], ...SEM_EXTRAS, [849, 1]]);
    resPreset(erro || 'Pronto para velocidade e torque: P0202 = 6, conexão de 4 palavras. No CODESYS, use a conexão "Exclusive Owner, 4 palavras".', !erro);
    buildParams();
  };
  const btnPos = $('#pPresetPos');
  if (btnPos) btnPos.onclick = async () => {
    if (!confirm('Preparar o SCA06 para posição pela EtherNet/IP?\n\nGrava:\n  P0000 = 5  (senha)\n  P0202 = 4  (modo Ladder: aplicativo de posicionamento)\n  P1020 = 1  (aplicativo em execução)\n  P0820…P0823 = 1110…1113  (status, posição, erro e contador nas palavras de entrada 5 a 8)\n  P0835…P0838 = 1100…1103  (comando, alvo, velocidade e tipo nas palavras de saída 5 a 8)\n  P0662 = 3  (erro de comunicação desabilita o drive)\n  P0849 = 1  (aplica a configuração de rede)\n\nO drive precisa estar desabilitado.')) return;
    const erro = await gravarEmSequencia([[0, 5], [202, 4], [1020, 1], ...EXTRAS_POS, [662, 3], [849, 1]]);
    resPreset(erro || 'Pronto para posição: P0202 = 4, conexão de 8 palavras. No CODESYS, use a conexão "Exclusive Owner, 8 palavras (posicao)".', !erro);
    buildParams();
  };
  const btnFab = $('#pFabrica');
  if (btnFab) btnFab.onclick = async () => {
    if (!confirm('Restaurar o padrão de fábrica do SCA06?\n\nEquivale a P0204 = 5: todos os parâmetros voltam ao valor de fábrica (P0202 = 2, comando pela HMI). O drive precisa estar desabilitado.')) return;
    const erro = await gravarEmSequencia([[0, 5], [204, 5]]);
    resPreset(erro || 'Padrão de fábrica carregado (P0204 = 5). O drive voltou a ser comandado pela HMI.', !erro);
    buildParams();
  };

  function buildParams() {
    const q = ($('#pSearch').value || '').toLowerCase().trim(), grp = $('#pGroup').value;
    const rows = [];
    for (const d of S.defs.values()) {
      if (d.n >= 1050 && !(d.n >= 1100 && d.n <= 1113) && grp !== 'changed' && !q) continue;
      if (grp === 'read' && !(d.n < 99)) continue;
      if (grp === 'cfg' && !(d.n >= 99 && d.n < 800)) continue;
      if (grp === 'eth' && !(d.n >= 800 && d.n <= 849) && d.n !== 662) continue;
      if (grp === 'lad' && !(d.n >= 1000 && d.n <= 1113)) continue;
      if (grp === 'changed' && (d.ro || S.P[d.n] === d.def)) continue;
      if (q && !(String(d.n).includes(q.replace(/^p0*/, '')) || d.name.toLowerCase().includes(q))) continue;
      rows.push(d);
    }
    $('#ptable').innerHTML = rows.map(d => `<div class="prow ${d.ro ? 'ro' : ''} ${!d.ro && S.P[d.n] !== d.def ? 'diff' : ''}" data-n="${d.n}"><span class="pn">P${pad4(d.n)}</span><span class="nm">${d.name}<span class="src ${d.src}">${d.src}</span>${d.ro ? '<small>RO</small>' : d.pp ? '<small>PP</small>' : ''}</span><span class="pv" id="pv${d.n}">${fmtVal(d, S.P[d.n])}</span></div>${openParam === d.n ? detailHtml(d) : ''}`).join('') || '<p class="hint">Nenhum parâmetro encontrado.</p>';
    $$('.prow').forEach(r => r.onclick = () => { openParam = openParam === +r.dataset.n ? null : +r.dataset.n; buildParams(); });
    const f = $('#pWriteForm');
    if (f) f.onsubmit = async (e) => {
      e.preventDefault(); const d = S.defs.get(openParam); const raw = Math.round(parseFloat(String($('#pWriteVal').value).replace(',', '.')) * Math.pow(10, d.dec));
      const r = (await req({ t: 'param', n: d.n, v: raw })).result;
      $('#pWriteRes').textContent = r.ok ? 'Gravado.' : ({ RO: 'Somente leitura (A00122).', RANGE: `Fora da faixa ${d.min}…${d.max} (A00126).`, ENABLED: 'Desabilite o drive antes (A00124).', NOEXIST: 'Inexistente (A00125).' }[r.code]);
    };
  }
  function detailHtml(d) {
    const opts = d.opts ? Object.entries(d.opts).map(([k, v]) => `${k} = ${v}`).join(' · ') : '';
    const rng = `Faixa ${fmtVal(Object.assign({}, d, { unit: '' }), d.min)} a ${fmtVal(d, d.max)} · padrão ${fmtVal(d, d.def)} · rede: valor bruto ${S.P[d.n]}`;
    let extra = '';
    if (d.n >= 300 && d.n <= 302) extra = `<div class="opts">${Object.entries(S.diFuncs || {}).map(([k, v]) => `${k} = ${v}`).join(' · ')}</div>`;
    return `<div class="pdetail" onclick="event.stopPropagation()"><div>${rng}</div>${opts ? `<div class="opts">${opts}</div>` : ''}${extra}${d.note ? `<div class="note">${d.note}</div>` : ''}
      ${d.ro ? '' : `<form class="row" id="pWriteForm"><input id="pWriteVal" class="num" value="${(S.P[d.n] / Math.pow(10, d.dec)).toFixed(d.dec)}"><span>${d.unit}</span><button class="primary">Gravar</button><span class="hint" id="pWriteRes"></span></form>`}</div>`;
  }
  $('#pSearch').oninput = buildParams; $('#pGroup').onchange = buildParams;
  function refreshParamValues() { for (const d of S.defs.values()) { const el = document.getElementById('pv' + d.n); if (el) el.textContent = fmtVal(d, S.P[d.n]); } }

  // ------------------------------------------------------------------ missões
  const mem = { t: {} };
  const hold = (id, cond, secs) => { const now = performance.now(); if (!cond) { mem.t[id] = 0; return false; } if (!mem.t[id]) mem.t[id] = now; return now - mem.t[id] >= secs * 1000; };
  const MISSIONS = [
    { id: 'm1', title: 'Abrir a sessão EtherNet/IP', text: 'No painel Mestre, clique em Conectar. O CLP manda RegisterSession e ListIdentity pela porta TCP 44818.',
      hint: 'Veja no monitor de pacotes o Vendor ID 853: é o código da WEG na ODVA.', check: c => c.sc && c.sc.state !== 'offline' },
    { id: 'm2', title: 'Comando pela rede: P0202 = 6', text: 'Sem isso o drive ignora a palavra de controle (manual Ethernet, P0202). Use uma mensagem explícita Set_Attribute_Single na classe 0xA2, instância 202.',
      hint: 'P0202 só muda com o drive desabilitado. Pela HMI, libere antes a senha P00000 = 5.', check: c => c.P[202] === 6 },
    { id: 'm3', title: 'Conexão de I/O em Data Active', text: 'Faça o Forward Open com o mesmo número de palavras que o drive espera. Objetivo: P0801 = 4 e LED NS verde fixo.',
      hint: 'Se aparecer 0x0109, o tamanho não confere: o erro informa quantos bytes o adapter espera.', live: c => `P0801 = ${c.v.p801}`, check: c => c.v.p801 === 4 && c.v.ns === 'green' },
    { id: 'm4', title: 'Habilitar pela palavra de controle', text: 'Ligue o bit 3 da 1ª palavra de saída (0008h). A palavra de estado deve mostrar o bit 2 (Habilitado).',
      hint: 'O bit 4 (Potência energizada) precisa estar em 1: confira o disjuntor e a emergência.', check: c => c.v.mode === 6 && c.v.enabled && (c.v.outWords[0] & 8) },
    { id: 'm5', title: 'Girar a 300 rpm no sentido horário', text: 'Calcule a 2ª palavra pela escala do manual: 7FFFh = 18750 rpm. Mantenha 300 rpm por 2 segundos.',
      hint: '300 × 32767 / 18750 ≈ 524 = 020Ch.', live: c => `n = ${Math.round(c.v.rpm)} rpm`, check: c => hold('m5', c.v.mode === 6 && Math.abs(c.v.rpm - 300) < 6, 2) },
    { id: 'm6', title: 'Inverter: 150 rpm anti-horário', text: 'Valores negativos giram no sentido anti-horário. Envie a referência em complemento de dois.',
      hint: '−150 rpm → −262 = FEFAh.', live: c => `n = ${Math.round(c.v.rpm)} rpm`, check: c => hold('m6', c.v.mode === 6 && Math.abs(c.v.rpm + 150) < 5, 2) },
    { id: 'm7', title: 'Parar com a função STOP', text: 'Com o disco girando acima de 100 rpm, ligue o bit 2 (Aciona STOP). O motor desacelera pela rampa P0105 e fica travado em zero.',
      hint: 'P0105 está em ms/krpm. Com 200, a parada de 300 rpm leva 60 ms. Teste 2000.', check: c => { if (Math.abs(c.v.rpm) > 100 && c.v.mode === 6 && !(c.v.status & 32)) mem.spun = performance.now(); return !!mem.spun && performance.now() - mem.spun < 15000 && (c.v.status & 32) && Math.abs(c.v.rpm) < 2; } },
    { id: 'm8', title: 'Ler a corrente do motor na 5ª palavra', text: 'Programe P0820 = 3 (P0003, corrente do motor), aplique com P0849 = 1 e refaça o Forward Open com 5 palavras de entrada.',
      hint: 'O valor chega sem casas decimais: 47 significa 4,7 A.', check: c => c.v.applied && c.v.applied.rdWords[0] === 3 && c.sc && c.sc.io && c.sc.io.inWords >= 5 && c.v.ioRun },
    { id: 'm9', title: 'Equilibrar o peso só com torque', text: 'Com o peso de 300 g no disco, use o modo de controle 0 (torque) e a 3ª palavra para deixar a seta entre 40° e 55°, parada por 3 s.',
      hint: 'I = m·g·r·sen(θ) / kt = 0,3·9,81·0,1·sen(47°) / 0,718 ≈ 0,3 A → envie 3. Cuidado: se o peso passar do topo, o disco dispara!', target: [47.5, 7.5],
      live: c => `θ = ${fmtN((c.v.angle + 360) % 360, 1)}°`, check: c => hold('m9', c.v.bench.weight && c.v.mode === 6 && c.v.ctlMode === 'torque' && c.v.enabled && c.v.angle >= 40 && c.v.angle <= 55 && Math.abs(c.v.rpm) < 1, 3) },
    { id: 'm10', title: 'Cabo rompido: diagnosticar F00047', text: 'Programe P0662 = 1 (gera falha). Com o motor habilitado, clique no cabo da porta XA171. Depois reconecte, refaça o Forward Open e resete pelo bit 7.',
      hint: 'Com P0662 = 0 o motor continua com a última referência: compare os dois casos.', check: c => { if (c.P[662] === 1 && c.v.fault === 47) mem.f47 = true; return !!mem.f47 && !c.v.fault && c.v.p801 === 4; } },
    { id: 'm11', title: 'Atingir um fim de curso', text: 'Monte as cames (clique numa chave de fim de curso) e gire devagar até a chave atuar. Observe o bit 14 ou 15 da palavra de estado.',
      hint: 'O fim de curso força a referência de velocidade a zero no sentido limitado. Ele não atua no modo torque.', check: c => c.v.bench.cams && (c.v.status & 0xC000) && c.v.mode === 6 },
    { id: 'm12', title: 'Posicionar em 135,0° pelo Ladder', text: 'O manual Ethernet manda usar o modo Ladder (P0202 = 4) para posicionamento. Mapeie P0835 = 1100 e P0836 = 1101, aplique com P0849 e comande: 5ª palavra = 1 (habilita), 6ª = 1350, depois 5ª = 3 (inicia).',
      hint: 'P1103 escolhe o caminho: 0 menor, 1 horário, 2 anti-horário, 3 relativo. Leia P1111 mapeando P0820 = 1111.', target: [135, 0.5],
      live: c => `posição = ${fmtN(c.v.userPosDeg, 1)}°`, check: c => c.P[202] === 4 && c.v.applied && c.v.applied.wrWords.includes(1100) && c.v.applied.wrWords.includes(1101) && c.v.lad.inPos && c.v.lad.count > 0 && Math.abs(c.v.userPosDeg - 135) < 0.3 },
    { id: 'm13', title: 'Posição pela rede: conexão de 8 palavras', text: 'Prepare o drive para posição: P0202 = 4 (aplicativo Ladder de posicionamento), P0820…P0823 = 1110…1113 e P0835…P0838 = 1100…1103, aplicados com P0849 = 1. Abra a conexão de 8 palavras e chegue a Data Active.',
      hint: 'O assistente "Comunicação com o CLP" (topo da tela), na opção Posição, faz a configuração explicando cada etapa. No CODESYS, escolha a conexão "Exclusive Owner, 8 palavras (posicao)". Sem o P0849 = 1 o mapeamento não vale e a conexão é recusada (0x0109).',
      check: c => c.P[202] === 4 && c.v.applied && c.v.applied.rdWords.length >= 4 && [1100, 1101, 1102, 1103].every(n => c.v.applied.wrWords.includes(n)) && c.v.p801 === 4 && c.v.ioRun },
    { id: 'm14', title: 'Pulso: cada pulso gira 45°', text: 'Com o movimento relativo (P1103 = 3) e incremento de 45,0° (P1101 = 450), dê 4 pulsos no bit 1 do comando (P1100): o disco deve dar meia volta, em 4 passos de 45°.',
      hint: 'O movimento começa na borda de subida do bit 1 (0 → 1): desligue o bit entre um pulso e outro. Cada movimento concluído soma 1 em P1113.',
      live: c => `posição = ${fmtN(c.v.userPosDeg, 1)}° · pulsos seguidos de ${c.v.lad.relInc == null ? '—' : fmtN(c.v.lad.relInc, 1) + '°'}: ${c.v.lad.relSeq}`,
      check: c => c.P[202] === 4 && c.v.lad.relInc === 45 && c.v.lad.relSeq >= 4 && c.v.lad.inPos },
    { id: 'm15', title: 'Posição absoluta: 90° e depois 270°', text: 'Com o tipo menor caminho (P1103 = 0), mande o disco para 90,0° (P1101 = 900) e, depois de parar, para 270,0° (P1101 = 2700).',
      hint: 'No modo absoluto, P1101 é a posição final, e não um incremento. Leia a posição atual em P1111 (décimos de grau).', target: [270, 0.5],
      live: c => `posição = ${fmtN(c.v.userPosDeg, 1)}°`,
      check: c => {
        const pos = c.v.userPosDeg, ok = c.P[202] === 4 && c.P[1103] === 0 && c.v.lad.inPos;
        if (ok && Math.abs(pos - 90) < 0.3) mem.p90 = true;
        return !!mem.p90 && ok && Math.abs(pos - 270) < 0.3;
      } },
    { id: 'm16', title: 'Sentido forçado: de 270° para 0° pelo anti-horário', text: 'Parado em 270,0°, mande o disco para 0,0° com P1103 = 2 (anti-horário): ele deve girar 270° para trás, e não 90° para a frente.',
      hint: 'Com P1103 = 0 o drive escolheria o menor caminho (90° no sentido horário). O sentido forçado serve para máquinas que não podem girar ao contrário.',
      live: c => `posição = ${fmtN(c.v.userPosDeg, 1)}°`,
      check: c => {
        const pos = c.v.userPosDeg;
        if (c.P[202] === 4 && c.v.lad.inPos && Math.abs(pos - 270) < 0.3) mem.c270 = c.v.lad.count;
        return mem.c270 !== undefined && c.P[202] === 4 && c.P[1103] === 2 && c.v.lad.inPos && c.v.lad.count > mem.c270 && (pos < 0.3 || pos > 359.7);
      } },
  ];
  let done = {}; try { done = JSON.parse(localStorage.getItem('sca06-missoes') || '{}'); } catch (_) { }
  function buildMissions() {
    $('#missions').innerHTML = MISSIONS.map(m => `<li id="${m.id}"><h4>${m.title}</h4><p>${m.text}</p><div class="live" id="${m.id}l"></div><details><summary>Dica</summary>${m.hint}</details></li>`).join('');
  }
  buildMissions();
  $('#mReset').onclick = () => { done = {}; mem.f47 = false; mem.spun = 0; mem.p90 = false; mem.c270 = undefined; try { localStorage.removeItem('sca06-missoes'); } catch (_) { } };
  function runMissions() {
    const c = { v: S.v, P: S.P, sc: S.sc };
    let current = null, n = 0;
    for (const m of MISSIONS) {
      if (!done[m.id]) { try { if (m.check(c)) { done[m.id] = true; try { localStorage.setItem('sca06-missoes', JSON.stringify(done)); } catch (_) { } } } catch (_) { } }
      const li = document.getElementById(m.id); li.classList.toggle('done', !!done[m.id]);
      if (done[m.id]) n++; else if (!current) current = m;
      li.classList.toggle('current', current === m);
      if (m.live) { try { document.getElementById(m.id + 'l').textContent = done[m.id] ? '' : m.live(c); } catch (_) { } }
    }
    $('#mBar').style.width = (n / MISSIONS.length * 100) + '%';
    $('#mScore').textContent = n === MISSIONS.length ? 'Todas as missões concluídas. A bancada é sua.' : `${n} de ${MISSIONS.length} missões concluídas. Próxima: ${current.title}.`;
    if (bench) bench.setTarget(current && current.target ? current.target[0] : null, current && current.target ? current.target[1] : 0);
  }

  // ------------------------------------------------------------------ rede
  function renderNetInfo() {
    const P = S.P, i = S.info || {}, id = i.identity || {};
    const applied = S.v && S.v.applied;
    $('#netInfo').innerHTML = `<table>
      <tr><td>IP do adapter</td><td class="mono">${S.deviceIp || i.deviceIp || '–'} ${applied ? (applied.dhcp ? '(P0810 = 1, DHCP)' : '(P0810 = 0, parâmetros)') : ''}</td></tr>
      <tr><td>Portas</td><td class="mono">TCP ${i.enip ? i.enip.tcp : 44818} · UDP ${i.enip ? i.enip.udp : 2222}${i.modbusPort ? ' · Modbus TCP ' + i.modbusPort : ''}</td></tr>
      <tr><td>Identidade</td><td class="mono">Vendor ${id.vendor} · Type ${id.deviceType} · Code ${id.productCode} · Rev ${id.major}.${id.minor}</td></tr>
      <tr><td>Assemblies</td><td class="mono">entrada 100 · saída 150 · config 1 (0 bytes)</td></tr>
      <tr><td>Formato I/O</td><td>O→T com header run/idle 32 bits; T→O sem header (modeless)</td></tr>
      <tr><td>Servidor WEB do ECO5</td><td>${i.backend ? '<a href="/webserver/" target="_blank" rel="noopener">abrir /webserver</a>' : 'só com o servidor Node'}</td></tr>
    </table>${i.backend ? '' : '<p class="hint">Modo demonstração: o scanner chama o modelo do drive diretamente, sem pacotes reais. Rode <code>npm start</code> para usar CLPs e softwares de verdade.</p>'}`;
  }
  function renderConns() {
    $('#connList').innerHTML = S.conns.length ? S.conns.map(c => c.kind === 'io'
      ? `<div class="conn"><b>I/O ${c.role === 'owner' ? 'Exclusive Owner' : c.role === 'listenOnly' ? 'Listen Only' : 'Input Only'}</b> de ${c.ip}<br>O→T ${c.otId} RPI ${c.otRpi} ms ${c.run ? 'RUN' : 'IDLE'} · T→O ${c.toId} RPI ${c.toRpi} ms → ${c.dest}<br>palavras ${c.inWords} in / ${c.outWords} out · timeout ${c.timeoutMs} ms · rx ${c.rxPk} · tx ${c.txPk}</div>`
      : `<div class="conn"><b>Explícita classe 3</b> de ${c.ip} · timeout ${c.timeoutMs} ms</div>`).join('') : '<p class="hint">Nenhuma conexão. O LED NS pisca em verde enquanto aguarda o mestre.</p>';
  }
  function addLogs(list) {
    if (S.paused) return;
    const box = $('#log'); const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
    const filt = {}; $$('.filters [data-f]').forEach(c => filt[c.dataset.f] = c.checked);
    const frag = document.createDocumentFragment();
    for (const e of list) {
      const cat = e.dir === 'drv' ? 'drv' : e.proto === 'UDP' ? 'UDP' : e.proto === 'MBTCP' ? 'MBTCP' : 'TCP';
      const div = document.createElement('div');
      div.className = `le ${e.dir} ${e.level || ''}`; div.dataset.cat = cat; if (!filt[cat]) div.hidden = true;
      const tm = new Date(e.t).toLocaleTimeString('pt-BR');
      const arrow = { rx: '←', tx: '→', drv: '◆', info: '·' }[e.dir] || '·';
      div.innerHTML = `<span class="t">${tm}</span> <span class="d">${arrow}</span><span class="p">${e.side === 'scanner' ? 'CLP ' : ''}${e.proto}</span> <span class="s"></span>${e.hex ? '<div class="hx"></div>' : ''}`;
      div.querySelector('.s').textContent = e.summary; if (e.hex) div.querySelector('.hx').textContent = `${e.len} bytes: ${e.hex}`;
      div.onclick = () => div.classList.toggle('open');
      frag.appendChild(div);
    }
    box.appendChild(frag);
    while (box.childElementCount > 500) box.firstElementChild.remove();
    if (atEnd) box.scrollTop = box.scrollHeight;
  }
  $$('.filters [data-f]').forEach(c => c.onchange = () => $$('#log .le').forEach(d => d.hidden = !$$('.filters [data-f]').find(x => x.dataset.f === d.dataset.cat).checked));
  $('#logPause').onclick = (e) => { S.paused = !S.paused; e.target.textContent = S.paused ? 'Continuar' : 'Pausar'; };
  $('#logClear').onclick = () => { $('#log').innerHTML = ''; };

  // ------------------------------------------------------------------ bancada
  const BENCH = [['power', 'Disjuntor de potência'], ['sto', 'Emergência (STO)'], ['cablePlugged', 'Cabo Ethernet XA171'], ['accessorySeated', 'ECO5 encaixado'], ['stopButton', 'Botoeira STOP (DI1)'], ['cams', 'Cames de fim de curso'], ['weight', 'Peso de desbalanceamento']];
  $('#benchToggles').innerHTML = BENCH.map(([k, n]) => `<button data-b="${k}"><i class="led"></i>${n}</button>`).join('');
  $$('#benchToggles button').forEach(b => b.onclick = () => req({ t: 'bench', key: b.dataset.b, value: !(S.v && S.v.bench[b.dataset.b]) }));
  function renderBench(v) {
    $$('#benchToggles button').forEach(b => { const on = v.bench[b.dataset.b]; const bad = (b.dataset.b === 'sto' || b.dataset.b === 'stopButton') ? on : !on && ['power', 'cablePlugged', 'accessorySeated'].includes(b.dataset.b); b.querySelector('.led').className = 'led' + (on ? (bad ? ' r' : ' g') : (bad ? ' r' : '')); });
  }

  // ------------------------------------------------------------------ laço da interface
  let lastSlow = 0;
  function tick() {
    const v = S.v; if (!v) return;
    renderRail(v);
    const now = performance.now();
    renderHmi(v);
    if (now - lastSlow < 120) return; lastSlow = now;
    if (!S.tab || S.tab === 'scanner') renderScanner();
    if (S.tab === 'params') refreshParamValues();
    if (S.tab === 'net') renderConns();
    if (S.tab === 'bench') renderBench(v);
    runMissions();
  }

  S.tab = 'scanner';
  backendPronto = connectBackend().then(b => { backend = b; return b; });
})();
