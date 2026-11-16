// Inversor WEG CFW500: frente e IHM do simulador CFW500 do HUB, alimentadas pelo modelo real no servidor.
import { el, fmt } from './util.js';
import { Display7 } from './lcd.js';

const GRUPOS = ['PARAM', 'READ', 'MODIF', 'BASIC', 'MOTOR', 'I/O', 'NET', 'HMI', 'SPLC', 'STARTUP'];
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export function createCFW(host, { send }) {
  host.innerHTML = '';
  host.classList.add('cfw-real');
  const col = el('div', {}, host);
  col.innerHTML = `
    <div class="inversor" id="inversor">
      <div class="inv-topo" aria-hidden="true"><span class="furo e"></span><span class="trava"></span><span class="furo d"></span></div>
      <div class="inv-grade" aria-hidden="true">${'<i></i>'.repeat(13)}</div>
      <div class="inv-frente">
        <div class="hmi">
          <div class="lcd" id="lcd" aria-live="polite">
            <div class="lcd-menu" id="lcdMenu"></div>
            <div class="lcd-estados">
              <span data-st="loc">LOC</span><span data-st="conf">CONF</span>
              <span data-st="rem">REM</span><span data-st="sub">SUB</span>
              <span data-st="giro" class="giro">↻</span><span data-st="run">RUN</span>
            </div>
            <svg class="seg seg-sec" id="lcdSec" viewBox="0 0 150 40"></svg>
            <svg class="seg seg-pri" id="lcdPri" viewBox="0 0 230 64"></svg>
            <div class="lcd-un" id="lcdUn"></div>
            <div class="lcd-barra" id="lcdBarra"></div>
            <div class="lcd-escala"><span>0</span><span>50</span><span>100</span></div>
          </div>
          <div class="teclado">
            <button class="tc tc-back" data-k="back">BACK<br>ESC</button>
            <div class="tc-setas">
              <button class="tc tc-up" data-k="up" aria-label="Seta para cima">▲</button>
              <button class="tc tc-down" data-k="down" aria-label="Seta para baixo">▼</button>
            </div>
            <button class="tc tc-enter" data-k="enter">MENU<br>ENTER</button>
            <button class="tc tc-red tc-giro" data-k="giro" aria-label="Sentido de giro">↻</button>
            <button class="tc tc-red tc-locrem" data-k="locrem">LOC<br>REM</button>
            <button class="tc tc-red tc-jog" data-k="jog">JOG</button>
            <button class="tc tc-stop" data-k="stop" aria-label="Para (O)">O</button>
            <button class="tc tc-start" data-k="start" aria-label="Gira (I)">I</button>
          </div>
        </div>
        <div class="inv-tampa">
          <div class="inv-marca"><span class="fab">WEG</span><span class="mod">CFW500<small>VECTOR INVERTER</small></span></div>
          <div class="inv-aviso">
            <svg class="tri" viewBox="0 0 40 36" aria-hidden="true"><path d="M20 2 38 34H2Z" fill="none" stroke="#6c7686" stroke-width="2.4" stroke-linejoin="round"/><path d="M22 11l-7 11h6l-3 9 8-12h-6z" fill="#6c7686"/></svg>
            <div>Remova a tampa frontal somente 10 min após desenergizar o equipamento. Leia o manual de instruções.<b>ATENÇÃO · WARNING · ATENCIÓN</b></div>
          </div>
        </div>
      </div>
      <div class="inv-base" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    </div>
    <div class="hmi-ajuda" id="hmiAjuda"></div>`;
  const $ = (sel) => col.querySelector(sel), $$ = (sel) => [...col.querySelectorAll(sel)];
  const lcdPri = new Display7($('#lcdPri'), 5, { w: 30, h: 54, t: 6.5, passo: 41, x0: 24, y0: 4, sinal: true });
  const lcdSec = new Display7($('#lcdSec'), 5, { w: 20, h: 32, t: 4.2, passo: 28.5, x0: 5, y0: 3 });
  $('#lcdMenu').innerHTML = GRUPOS.map((g) => `<span data-g="${g}">${g}</span>`).join('');
  $('#lcdBarra').innerHTML = '<i></i>'.repeat(10);
  // piscar do valor em edição (um relógio para o display inteiro, com pausa após mudança)
  let piscaFase = false, piscaSeguraAte = 0, piscaUltimo = null;
  setInterval(() => { const e = $('#lcdPri'); if (!e.classList.contains('piscar') || Date.now() < piscaSeguraAte) { piscaFase = false; e.classList.remove('fraco'); return; } piscaFase = !piscaFase; e.classList.toggle('fraco', piscaFase); }, 450);
  for (const b of $$('.tc')) {
    const k = b.dataset.k;
    const enviar = (p) => { send({ tipo: 'tecla', tecla: k, pressionada: p }); b.classList.toggle('apertada', p); };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) { /* ok */ } enviar(true); });
    b.addEventListener('pointerup', () => enviar(false));
    b.addEventListener('pointercancel', () => enviar(false));
    b.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); enviar(true); } });
    b.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') enviar(false); });
  }
  function renderHMI(h) {
    const lcd = $('#lcd');
    if (h.principal !== piscaUltimo) { piscaUltimo = h.principal; piscaSeguraAte = Date.now() + 1500; $('#lcdPri').classList.remove('fraco'); }
    lcd.classList.toggle('apagado', !h.ligado);
    lcd.classList.toggle('sem-luz', h.ligado && !h.backlight);
    $$('#lcdMenu span').forEach((s) => s.classList.toggle('on', h.menu === 'TODOS' || s.dataset.g === h.menu));
    const st = { loc: h.loc, rem: h.rem, conf: h.conf, sub: h.sub, run: h.run, giro: h.ligado && (h.giroAtivo || h.run || h.boot) };
    $$('.lcd-estados span').forEach((s) => s.classList.toggle('on', !!(h.ligado && (h.boot || st[s.dataset.st]))));
    $('.lcd-estados .giro').classList.toggle('ah', h.giro === 'AH');
    lcdPri.mostrar(h.ligado ? h.principal : ''); lcdSec.mostrar(h.ligado ? h.secundario : '');
    $('#lcdPri').classList.toggle('piscar', !!h.piscar);
    $('#lcdUn').textContent = h.ligado ? (h.unidade || '') : '';
    const nb = h.ligado ? Math.round((h.barra || 0) * 10) : 0;
    $$('#lcdBarra i').forEach((b, i) => b.classList.toggle('on', i < nb));
    let aj = '';
    if (!h.ligado) aj = 'Inversor desenergizado (disjuntor Q1 desligado).';
    else if (h.ajuda) aj = `<b>${esc(h.ajuda)}</b>${h.opcao ? ` — ${esc(h.opcao)}` : ''}`;
    else if (h.nivel === 'menu') aj = 'Nível 1: ▲▼ escolhem o grupo, ENTER entra.';
    else aj = 'Monitoração: ENTER/MENU abre os parâmetros.';
    if (h.msgDet) aj += `<br>${esc(h.msgDet)}`;
    $('#hmiAjuda').innerHTML = aj;
  }

  // ------------------------------------------------ lado direito: estado, bornes, parâmetros
  const side = el('div', {}, host);
  const st = el('div', { style: 'margin:0 0 8px;font-size:13px' }, side);
  const badge = el('span', { class: 'soft-state' }, st); st.append(' ');
  const stTxt = el('span', { class: 'muted' }, st);
  el('h3', { style: 'font-size:13px;margin:8px 0 2px' }, side).textContent = 'Bornes de controle (fiação da bancada)';
  const tb = el('table', { class: 'bornes' }, side);
  const row = (k) => { const tr = el('tr', {}, tb); el('td', {}, tr).textContent = k; return el('td', {}, tr); };
  const r = { di1: row('DI1 gira/para (P0263) ← SD04'), di3: row('DI3 reset de falha (P0265) ← SD05'), ai1: row('AI1 referência (P0222 = 1) ← SA0'), do1: row('DO1 "sem falha" (P0275) → ED06'), do2: row('DO2 "F > Fx" (P0276) → ED05'), ao1: row('AO1 corrente (P0251 = 5) → EA3'), rpm: row('Saída'), i: row('Corrente · torque'), pw: row('Alimentação (Q1)') };
  el('h3', { style: 'font-size:13px;margin:12px 0 4px' }, side).textContent = 'Parâmetros pela bancada (ou pela IHM, como na vida real)';
  const params = el('div', { class: 'cfw-params' }, side);
  const p = (lbl, ctrl) => { el('span', {}, params).textContent = lbl; params.appendChild(ctrl); return ctrl; };
  const sel220 = p('P0220 seleção LOC/REM', el('select', {}));
  [['0', '0 — sempre LOC'], ['1', '1 — sempre REM'], ['2', '2 — tecla HMI, inicia LOC (fábrica)'], ['3', '3 — tecla HMI, inicia REM']].forEach(([v, t]) => { const o = el('option', { value: v }, sel220); o.textContent = t; });
  sel220.onchange = () => send({ tipo: 'param', n: 220, v: Number(sel220.value) });
  const in100 = p('P0100 aceleração (s)', el('input', { type: 'number', min: 0.1, max: 999, step: 0.1, style: 'width:80px' }));
  in100.onchange = () => send({ tipo: 'param', n: 100, v: Number(in100.value) });
  const in101 = p('P0101 desaceleração (s)', el('input', { type: 'number', min: 0.1, max: 999, step: 0.1, style: 'width:80px' }));
  in101.onchange = () => send({ tipo: 'param', n: 101, v: Number(in101.value) });
  const in134 = p('P0134 velocidade máxima (Hz)', el('input', { type: 'number', min: 0, max: 500, step: 0.1, style: 'width:80px' }));
  in134.onchange = () => send({ tipo: 'param', n: 134, v: Number(in134.value) });
  const sel233 = p('P0233 sinal da AI1', el('select', {}));
  [['0', '0 — 0–10 V / 0–20 mA'], ['1', '1 — 4–20 mA'], ['2', '2 — 10–0 V'], ['3', '3 — 20–4 mA']].forEach(([v, t]) => { const o = el('option', { value: v }, sel233); o.textContent = t; });
  sel233.onchange = () => send({ tipo: 'param', n: 233, v: Number(sel233.value) });
  const sel251 = p('P0251 função da AO1', el('select', {}));
  [['0', '0 — referência de velocidade'], ['2', '2 — velocidade real'], ['5', '5 — corrente de saída'], ['11', '11 — torque']].forEach(([v, t]) => { const o = el('option', { value: v }, sel251); o.textContent = t; });
  sel251.onchange = () => send({ tipo: 'param', n: 251, v: Number(sel251.value) });
  const acts = el('div', { class: 'btn-row', style: 'margin-top:10px' }, side);
  const bCom = el('button', { class: 'btn small go' }, acts); bCom.textContent = 'Parametrizar inversor para a bancada analógica';
  bCom.title = 'P0220 = 1 (REM), P0222 = 1 (AI1), P0227 = 1, P0233 conforme o canal SA0, P0133 = 3 Hz, P0134 = 60 Hz, P0100 = P0101 = 2 s, P0263 = 1, P0265 = 20, P0275 = 13, P0276 = 2 — com o motor parado';
  bCom.onclick = () => send({ tipo: 'comissionar' });
  const bFab = el('button', { class: 'btn small ghost' }, acts); bFab.textContent = 'Padrão de fábrica 60 Hz (P0204 = 5)';
  bFab.onclick = () => { if (confirm('Voltar todos os parâmetros do CFW500 ao padrão de fábrica?')) send({ tipo: 'param', n: 204, v: 5 }); };
  el('p', { class: 'muted', style: 'font-size:12px;margin:8px 0 0' }, side).textContent = 'O botão deixa o inversor pronto para o canal analógico (REM, referência pela AI1 no sinal do canal SA0, 10 V = 60 Hz, AO1 = corrente, relés de fábrica) e salva na EEPROM. O inversor é o modelo completo do simulador CFW500 do HUB; quem quiser ensinar comissionamento pode voltar ao padrão de fábrica e fazer tudo pela IHM.';

  function update(s) {
    const inv = s.inv, sig = s.ao.sinais || {};
    if (inv.hmi) renderHMI(inv.hmi);
    badge.textContent = !inv.power ? 'sem alimentação' : inv.boot ? 'inicializando' : inv.falha ? `${inv.codFalha} ${inv.descFalha || ''}` : inv.rodando ? 'rodando' : 'parado';
    badge.className = `soft-state ${!inv.power ? '' : inv.falha ? 'fault' : inv.rodando ? 'run' : ''}`;
    stTxt.textContent = !inv.power ? 'Q1 desligado: o CFW500 está sem alimentação' : inv.locRem === 'LOC' ? 'LOC: o CLP não comanda — mude P0220 ou tecle LOC/REM' : `REM: comandado pelo CLP pelos bornes${inv.alarmes && inv.alarmes.length ? ' · alarme A' + String(inv.alarmes[0]).padStart(4, '0') : ''}`;
    r.di1.textContent = s.quadro.di1 ? '1 (24 V)' : s.do[4] && s.quadro.S0 ? '0 (cortada pelo S0)' : '0'; r.di3.textContent = s.do[5] ? '1 (24 V)' : '0';
    r.ai1.textContent = sig.ref ? `${fmt(sig.ref.valor, 2)} ${sig.ref.tipo}` : '—';
    r.do1.textContent = inv.DO1 ? 'fechado (OK)' : 'aberto'; r.do2.textContent = inv.DO2 ? 'fechado (rodando)' : 'aberto';
    r.ao1.textContent = `${fmt(inv.AO1_V, 2)} V`;
    r.rpm.textContent = `${fmt(inv.fHz, 1)} Hz · ${Math.round(inv.rpm)} rpm · ${fmt(inv.vOut || 0, 0)} V`;
    r.i.textContent = `${fmt(s.iMot, 2)} A · ${fmt(inv.torquePct || 0, 0)} %`;
    r.pw.textContent = inv.power ? `presente (Ud ${fmt(inv.ud || 0, 0)} V)` : 'ausente';
    const P = inv.params || {}; const ae = document.activeElement;
    if (ae !== sel220 && P[220] !== undefined) sel220.value = String(P[220]);
    if (ae !== in100 && P[100] !== undefined) in100.value = P[100];
    if (ae !== in101 && P[101] !== undefined) in101.value = P[101];
    if (ae !== in134 && P[134] !== undefined) in134.value = P[134];
    if (ae !== sel233 && P[233] !== undefined) sel233.value = String(P[233]);
    if (ae !== sel251 && P[251] !== undefined) sel251.value = String(P[251]);
  }
  update.col = col;   // a frente do inversor (IHM + teclado), para destacar em janela flutuante
  return update;
}
