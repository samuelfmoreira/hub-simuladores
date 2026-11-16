// IHM do operador: tela de 7" (800 × 480 lógicos) desenhada em tamanho fixo e escalada para caber onde estiver.
// Três registradores com o CLP: velocidade (manual), setpoint de nível (auto) e o nível que o CLP manda mostrar.
import { el, fmt } from './util.js';

export function createIHM(host, { send }) {
  host.innerHTML = '';
  const wrap = el('div', { class: 'ihm-wrap' }, host);
  const col = el('div', { class: 'ihm-op' }, wrap);
  col.innerHTML = `
    <div class="ihm-bezel">
      <div class="ihm-top"><span class="ihm-title">ESTAÇÃO TQ-01 — OPERAÇÃO</span><span class="ihm-link" id="ihmLink">● SEM CLP</span><span class="ihm-clock" id="ihmClock"></span></div>
      <div class="ihm-screen">
        <div class="ihm-pane ihm-pane-nivel">
          <div class="ihm-h">NÍVEL DO TANQUE</div>
          <div class="ihm-tankrow">
            <div class="ihm-tank"><div class="ihm-water" id="ihmWater"></div><div class="ihm-mark hh"><i></i>HH 2,8</div><div class="ihm-mark ll"><i></i>LL 0,3</div><div class="ihm-spline" id="ihmSpLine"></div></div>
            <div class="ihm-read"><div class="ihm-big" id="ihmNivel">—</div><div class="ihm-unit">metros</div><div class="ihm-note" id="ihmNivelSub">aguardando o CLP</div></div>
          </div>
        </div>
        <div class="ihm-pane ihm-pane-set">
          <div class="ihm-h">AJUSTES DO OPERADOR</div>
          <button class="ihm-field" id="fVel"><span class="ihm-flbl">Velocidade da bomba<small>modo manual</small></span><span class="ihm-fval"><b id="ihmVel">75</b> %</span></button>
          <button class="ihm-field" id="fSp"><span class="ihm-flbl">Setpoint de nível<small>modo automático</small></span><span class="ihm-fval"><b id="ihmSp">2,00</b> m</span></button>
          <div class="ihm-note">toque no campo para digitar</div>
        </div>
      </div>
      <div class="ihm-foot"><span>IHM_Velocidade %IW2 · IHM_Setpoint %IW3 · IHM_Nivel %QW2</span><span>IHM · cliente Modbus TCP do CLP</span></div>
      <div class="ihm-keypad" id="ihmKeypad" hidden>
        <div class="ihm-kp-box">
          <div class="ihm-kp-head" id="kpTitle">Velocidade</div>
          <div class="ihm-kp-disp"><span id="kpVal">75</span><span id="kpUnit">%</span></div>
          <div class="ihm-kp-range" id="kpRange">0 a 100</div>
          <div class="ihm-kp-grid">
            <button data-k="7">7</button><button data-k="8">8</button><button data-k="9">9</button><button data-k="bs">⌫</button>
            <button data-k="4">4</button><button data-k="5">5</button><button data-k="6">6</button><button data-k="clr">C</button>
            <button data-k="1">1</button><button data-k="2">2</button><button data-k="3">3</button><button data-k="esc" class="esc">ESC</button>
            <button data-k="0" class="w2">0</button><button data-k=",">,</button><button data-k="ok" class="ok">ENTER</button>
          </div>
        </div>
      </div>
    </div>`;
  const $ = (q) => col.querySelector(q);
  let vel = 75, sp = 2.0, kp = null, buf = '';
  // escala a tela de 800×480 para a largura disponível
  // escala livre: na porta o contêiner limita a largura; na janela flutuante a IHM acompanha o tamanho da janela
  const ajustar = () => { const w = wrap.clientWidth || 800; const k = w / 800; col.style.transform = `scale(${k})`; wrap.style.height = `${Math.round(480 * k)}px`; };
  new ResizeObserver(ajustar).observe(wrap); ajustar();
  // teclado numérico
  const abrir = (campo) => { kp = campo; buf = ''; $('#kpTitle').textContent = campo === 'vel' ? 'Velocidade da bomba' : 'Setpoint de nível'; $('#kpUnit').textContent = campo === 'vel' ? '%' : 'm'; $('#kpRange').textContent = campo === 'vel' ? 'de 0 a 100 %' : 'de 0,00 a 3,00 m'; $('#kpVal').textContent = campo === 'vel' ? String(vel) : fmt(sp, 2); $('#ihmKeypad').hidden = false; };
  const fechar = () => { $('#ihmKeypad').hidden = true; kp = null; };
  const confirmar = () => {
    const v = Number((buf || $('#kpVal').textContent).replace(',', '.'));
    if (Number.isNaN(v)) return fechar();
    if (kp === 'vel') { vel = Math.max(0, Math.min(100, Math.round(v))); $('#ihmVel').textContent = vel; send({ tipo: 'ihm', vel }); }
    else { sp = Math.max(0, Math.min(3, Math.round(v * 100) / 100)); $('#ihmSp').textContent = fmt(sp, 2); send({ tipo: 'ihm', sp }); }
    fechar();
  };
  $('#fVel').onclick = () => abrir('vel'); $('#fSp').onclick = () => abrir('sp');
  col.querySelectorAll('.ihm-kp-grid button').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.k;
      if (k === 'esc') return fechar();
      if (k === 'ok') return confirmar();
      if (k === 'clr') buf = '';
      else if (k === 'bs') buf = buf.slice(0, -1);
      else if (k === ',') { if (kp === 'sp' && !buf.includes(',')) buf = (buf || '0') + ','; }
      else if (buf.replace(',', '').length < 4) buf += k;
      $('#kpVal').textContent = buf === '' ? '0' : buf;
    };
  });
  setInterval(() => { $('#ihmClock').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }, 1000);
  function update(s) {
    if (s.ihm && !kp) {
      if (typeof s.ihm.vel === 'number' && s.ihm.vel !== vel) { vel = s.ihm.vel; $('#ihmVel').textContent = vel; }
      if (typeof s.ihm.sp === 'number' && s.ihm.sp !== sp) { sp = s.ihm.sp; $('#ihmSp').textContent = fmt(sp, 2); }
    }
    $('#ihmSpLine').style.bottom = `${Math.max(0, Math.min(100, sp / 3 * 100))}%`;
    const n = s.ihm ? s.ihm.nivel : null; const con = s.comm && s.comm.clpConectado;
    if (con && typeof n === 'number') { $('#ihmNivel').textContent = fmt(n, 2); $('#ihmWater').style.height = `${Math.max(0, Math.min(100, n / 3 * 100))}%`; $('#ihmNivelSub').textContent = n === 0 ? 'o CLP manda 0 — ele escreve IHM_Nivel?' : 'valor recebido do CLP (IHM_Nivel)'; }
    else { $('#ihmNivel').textContent = '—'; $('#ihmWater').style.height = '0%'; $('#ihmNivelSub').textContent = con ? 'aguardando o CLP' : 'sem comunicação com o CLP'; }
    $('#ihmLink').textContent = con ? `● CLP ${s.comm.modo}` : '● SEM CLP'; $('#ihmLink').className = `ihm-link ${con ? 'on' : ''}`;
  }
  update.col = wrap;
  return update;
}
