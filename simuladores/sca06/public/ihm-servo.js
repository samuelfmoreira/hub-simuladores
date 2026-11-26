/* IHM do painel do servo SV-01 (aba IHM).
 * A IHM é um cliente Modbus TCP do CLP: ela só lê e escreve tags no CLP; quem comanda o SCA06 é o programa do CLP
 * (PRG_IHM_Servo, Parte 9 do guia) ou o CLP de demonstração. Telas: Início, Velocidade, Torque, Absoluta, Pulso. */
(function () {
  'use strict';
  const App = () => window.SCA06App;
  const req = (m) => App().req(Object.assign({ t: 'ihm' }, m));
  const $ = (s, r = document) => r.querySelector(s);
  const fmt = (v, d = 0) => (v === undefined || v === null || v === '?') ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const MODOS = { 1: { id: 'vel', nome: 'Velocidade' }, 2: { id: 'torque', nome: 'Torque' }, 3: { id: 'abs', nome: 'Posição absoluta' }, 4: { id: 'rel', nome: 'Pulso (relativa)' } };
  const TELAS = [['inicio', 'Início'], ['vel', 'Velocidade'], ['torque', 'Torque'], ['abs', 'Absoluta'], ['rel', 'Pulso']];

  let host = null, info = null, E = null, tela = 'inicio', montado = false, aviso = '';
  const val = (id) => (E && E.valores && E.valores[id] && E.valores[id].ok) ? E.valores[id].v : undefined;

  async function cmd(tag, valor) {
    try {
      const r = await req({ op: 'cmd', tag, valor });
      const res = r && r.result ? r.result : r;
      if (res && res.erro) mostrarAviso(res.erro);
    } catch (e) { mostrarAviso(e.message); }
  }
  function mostrarAviso(t) { aviso = t; const a = $('#ihmsAviso', host); if (a) { a.textContent = t; a.hidden = !t; clearTimeout(mostrarAviso.tmr); mostrarAviso.tmr = setTimeout(() => { a.hidden = true; }, 4000); } }

  // ---------------------------------------------------------------- partes da tela
  const lampada = (id, nome, cor) => `<div class="ihms-lamp" data-l="${id}" data-cor="${cor}"><i></i><span>${nome}</span></div>`;
  const mostrador = (id, nome, un, dec) => `<div class="ihms-mostr"><span>${nome}</span><b data-v="${id}" data-dec="${dec}">—</b><small>${un}</small></div>`;
  const entrada = (id, nome, un, passo, min, max) => `<label class="ihms-ent"><span>${nome}</span><span class="ihms-ent-l"><button class="ihms-mm" data-mm="${id}" data-d="-${passo}">−</button><input type="number" data-sp="${id}" step="${passo}" min="${min}" max="${max}"><button class="ihms-mm" data-mm="${id}" data-d="${passo}">+</button></span><small>${un}</small></label>`;
  const disco = () => `<svg class="ihms-disco" viewBox="0 0 120 120" aria-label="posição do disco">
      <circle cx="60" cy="60" r="52" class="ihms-disco-aro"/>
      ${Array.from({ length: 12 }, (_, i) => { const a = i * 30 * Math.PI / 180; return `<line x1="${60 + 44 * Math.sin(a)}" y1="${60 - 44 * Math.cos(a)}" x2="${60 + 52 * Math.sin(a)}" y2="${60 - 52 * Math.cos(a)}" class="ihms-disco-tick"/>`; }).join('')}
      <text x="60" y="20" class="ihms-disco-n">0</text><text x="103" y="64" class="ihms-disco-n">90</text><text x="60" y="110" class="ihms-disco-n">180</text><text x="17" y="64" class="ihms-disco-n">270</text>
      <line x1="60" y1="60" x2="60" y2="16" class="ihms-disco-alvo" data-alvo/>
      <line x1="60" y1="60" x2="60" y2="14" class="ihms-disco-pont" data-pont/>
      <circle cx="60" cy="60" r="5" class="ihms-disco-eixo"/></svg>`;
  const bannerModo = (n) => `<div class="ihms-modo-banner" data-banner="${n}"></div>`;

  function corpoTela() {
    if (tela === 'inicio') return `
      <div class="ihms-grade2">
        <div class="ihms-bloco"><h4>Estado</h4><div class="ihms-lamps">${lampada('habilitado', 'Habilitado', 'ok')}${lampada('movendo', 'Movendo', 'azul')}${lampada('emPosicao', 'Em posição', 'ok')}${lampada('falha', 'Falha', 'err')}${lampada('pronto', 'Pronto', 'ok')}</div>
          <div class="ihms-botoes"><button class="ihms-bt ihms-bt-hab" data-tog="habilita">HABILITAR GERAL</button><button class="ihms-bt" data-pulso="reset">RESET</button><button class="ihms-bt ihms-bt-stop" data-pulso="stop">STOP</button></div></div>
        <div class="ihms-bloco"><h4>Modo de controle</h4><div class="ihms-modos">
          ${[1, 2, 3, 4].map((n) => `<button class="ihms-bt-modo" data-modo="${n}"><b>${MODOS[n].nome}</b><small>${['', 'gira na velocidade pedida', 'aplica a corrente pedida', 'vai até o ângulo pedido', 'anda um passo por pulso'][n]}</small></button>`).join('')}</div></div>
      </div>
      <div class="ihms-linha">${mostrador('velAtual', 'Velocidade', 'rpm', 0)}${mostrador('corrente', 'Corrente', 'A', 1)}${mostrador('posicao', 'Posição', '°', 1)}${mostrador('passos', 'Passos', '', 0)}</div>`;
    if (tela === 'vel') return `${bannerModo(1)}
      <div class="ihms-grade2"><div class="ihms-bloco">${entrada('velRef', 'Velocidade desejada', 'rpm', 50, -3000, 3000)}<p class="ihms-dica">Negativo gira no sentido anti-horário.</p>
        <button class="ihms-bt ihms-bt-grande" data-tog="partir" data-on="PARAR" data-off="PARTIR">PARTIR</button></div>
        <div class="ihms-bloco">${mostrador('velAtual', 'Velocidade atual', 'rpm', 0)}${mostrador('corrente', 'Corrente', 'A', 1)}<div class="ihms-lamps">${lampada('movendo', 'Movendo', 'azul')}${lampada('habilitado', 'Habilitado', 'ok')}</div></div></div>`;
    if (tela === 'torque') return `${bannerModo(2)}
      <div class="ihms-grade2"><div class="ihms-bloco">${entrada('torqueRef', 'Corrente desejada', 'A', 0.1, -3, 3)}<p class="ihms-dica">Sem carga, o disco acelera; com o peso montado, 0,3 A o segura perto de 50°. Parar segura o eixo.</p>
        <button class="ihms-bt ihms-bt-grande" data-tog="partir" data-on="PARAR" data-off="APLICAR">APLICAR</button></div>
        <div class="ihms-bloco">${mostrador('corrente', 'Corrente atual', 'A', 1)}${mostrador('velAtual', 'Velocidade', 'rpm', 0)}<div class="ihms-lamps">${lampada('movendo', 'Movendo', 'azul')}${lampada('habilitado', 'Habilitado', 'ok')}</div></div></div>`;
    if (tela === 'abs') return `${bannerModo(3)}
      <div class="ihms-grade2"><div class="ihms-bloco">${entrada('destino', 'Destino', '°', 15, 0, 359.9)}${entrada('velPos', 'Velocidade', 'rpm', 10, 1, 3000)}
        <button class="ihms-bt ihms-bt-grande" data-pulso="disparo">IR PARA O DESTINO</button><p class="ihms-dica">O CLP leva o disco ao ângulo pelo menor caminho.</p></div>
        <div class="ihms-bloco ihms-centro">${disco()}${mostrador('posicao', 'Posição', '°', 1)}<div class="ihms-lamps">${lampada('emPosicao', 'Em posição', 'ok')}${lampada('movendo', 'Movendo', 'azul')}</div></div></div>`;
    return `${bannerModo(4)}
      <div class="ihms-grade2"><div class="ihms-bloco">${entrada('passo', 'Passo', '°', 15, 0.1, 359.9)}${entrada('velPos', 'Velocidade', 'rpm', 10, 1, 3000)}
        <button class="ihms-bt ihms-bt-grande" data-pulso="disparo">PULSO ▶</button><p class="ihms-dica">Cada pulso anda um passo a partir de onde o disco está.</p></div>
        <div class="ihms-bloco ihms-centro">${disco()}${mostrador('posicao', 'Posição', '°', 1)}${mostrador('passos', 'Passos', '', 0)}<div class="ihms-lamps">${lampada('emPosicao', 'Em posição', 'ok')}${lampada('movendo', 'Movendo', 'azul')}</div></div></div>`;
  }

  function montarTela() {
    const tituloCfg = info ? info.cfg.titulo : 'SERVO SV-01';
    host.innerHTML = `
      <div class="ihms-device">
        <div class="ihms-moldura">
          <div class="ihms-tela">
            <div class="ihms-topo"><b>${tituloCfg}</b><span class="ihms-modo-atual" id="ihmsModoAtual">—</span><span class="ihms-com" id="ihmsCom"><i></i><span>sem comunicação</span></span></div>
            <div class="ihms-corpo">${corpoTela()}</div>
            <div class="ihms-aviso" id="ihmsAviso" hidden></div>
            <div class="ihms-semcom" id="ihmsSemCom"><b>IHM sem comunicação com o CLP</b><span>Conecte ao CLP (CODESYS em 192.168.100.10) ou ligue o CLP de demonstração, logo abaixo.</span></div>
            <nav class="ihms-nav">${TELAS.map(([id, n]) => `<button data-tela="${id}" class="${id === tela ? 'on' : ''}">${n}</button>`).join('')}</nav>
          </div>
        </div>
        <div class="ihms-marca">IHM 7" · Modbus TCP</div>
      </div>
      <div class="ihms-cfg">
        <div class="wh"><span>Comunicação da IHM com o CLP (Modbus TCP)</span></div>
        <div class="row ihms-cfg-l">
          <label>IP do CLP <input id="ihmsIp" class="num" style="width:16ch"></label>
          <label>Porta <input id="ihmsPorta" type="number" class="num" style="width:8ch"></label>
          <label>Unit ID <input id="ihmsUnit" type="number" class="num" style="width:6ch"></label>
          <button class="small" id="ihmsSalvar">Salvar</button>
          <button class="primary small" id="ihmsLigar">Conectar</button>
        </div>
        <div class="row ihms-cfg-l">
          <button class="small" id="ihmsDemo">Ligar CLP de demonstração</button>
          <span class="hint" id="ihmsDemoTxt">Faz o papel do CODESYS com o programa do guia (Parte 9). O drive precisa estar configurado para a IHM: assistente <b>Comunicação com o CLP → IHM (todos os modos)</b>.</span>
        </div>
        <p class="hint" id="ihmsStatus"></p>
        <details class="ihms-mapa"><summary>Mapa de tags no CLP (mapa padrão)</summary><div id="ihmsMapa"></div>
          <p class="hint">No CODESYS, o <b>ModbusTCP Slave Device</b> precisa de pelo menos 5 coils, 5 discrete inputs, 6 holding registers e 5 input registers. Coils e holding registers a IHM escreve; discrete inputs e input registers o CLP escreve.</p>
          <button class="small" id="ihmsPadrao">Restaurar mapa padrão</button></details>
      </div>`;
    ligarEventos(); preencherCfg(); montado = true; atualizar(E);
  }

  function preencherCfg() {
    if (!info) return;
    $('#ihmsIp', host).value = info.cfg.ip; $('#ihmsPorta', host).value = info.cfg.porta; $('#ihmsUnit', host).value = info.cfg.unitId;
    const AREA = { coil: 'Coil', di: 'Discrete Input', hr: 'Holding Register', ir: 'Input Register' };
    $('#ihmsMapa', host).innerHTML = `<table class="tab"><tr><th>Tag</th><th>O que é</th><th>Área</th><th>Endereço</th><th>Ref.</th></tr>${info.papeis.map((p) => {
      const t = info.cfg.tags[p.id]; return `<tr><td><code>${t.nome}</code></td><td>${p.desc}</td><td>${AREA[t.area]}</td><td>${t.end}</td><td><code>${info.modicon[p.id]}</code></td></tr>`; }).join('')}</table>`;
  }

  function ligarEventos() {
    host.querySelectorAll('[data-tela]').forEach((b) => b.onclick = () => { tela = b.dataset.tela; montarTela(); });
    host.querySelectorAll('[data-tog]').forEach((b) => b.onclick = () => cmd(b.dataset.tog, !(val(b.dataset.tog) === true)));
    host.querySelectorAll('[data-pulso]').forEach((b) => b.onclick = () => cmd(b.dataset.pulso, true));
    host.querySelectorAll('[data-modo]').forEach((b) => b.onclick = () => { cmd('modo', +b.dataset.modo); tela = MODOS[b.dataset.modo].id; montarTela(); });
    host.querySelectorAll('[data-banner]').forEach((b) => b.onclick = () => cmd('modo', +b.dataset.banner));
    host.querySelectorAll('[data-sp]').forEach((inp) => {
      inp.onchange = () => cmd(inp.dataset.sp, +inp.value);
      inp.onfocus = () => { inp.dataset.editando = '1'; }; inp.onblur = () => { delete inp.dataset.editando; };
    });
    host.querySelectorAll('[data-mm]').forEach((b) => b.onclick = () => {
      const inp = host.querySelector(`[data-sp="${b.dataset.mm}"]`); const t = info.cfg.tags[b.dataset.mm];
      const novo = Math.min(t.max, Math.max(t.min, Math.round(((+inp.value || 0) + +b.dataset.d) * 10) / 10));
      inp.value = novo; cmd(b.dataset.mm, novo);
    });
    $('#ihmsSalvar', host).onclick = async () => { const r = await req({ op: 'cfg', cfg: Object.assign({}, info.cfg, { ip: $('#ihmsIp', host).value.trim(), porta: +$('#ihmsPorta', host).value, unitId: +$('#ihmsUnit', host).value }) }); info = (r.result || r).info; preencherCfg(); };
    $('#ihmsLigar', host).onclick = () => req({ op: E && E.ativo ? 'desligar' : 'ligar' });
    $('#ihmsDemo', host).onclick = async () => {
      const ligar = !(E && E.demo && E.demo.ligado);
      $('#ihmsDemo', host).disabled = true; $('#ihmsDemoTxt', host).textContent = ligar ? 'Ligando o CLP de demonstração…' : 'Desligando…';
      const r = await req({ op: 'demo', ligar }); const res = r.result || r;
      $('#ihmsDemo', host).disabled = false;
      if (res.info) { info = res.info; preencherCfg(); }
      if (res.erro) mostrarAviso(res.erro);
    };
    $('#ihmsPadrao', host).onclick = async () => { if (!confirm('Voltar o mapa de tags da IHM ao padrão?')) return; const r = await req({ op: 'padrao' }); info = (r.result || r).info; preencherCfg(); };
  }

  // ---------------------------------------------------------------- atualização (a cada estado do servidor)
  function atualizar(estado) {
    E = estado;
    if (!montado || !host || !E) return;
    const com = !!E.comOk;
    $('#ihmsSemCom', host).hidden = com;
    const c = $('#ihmsCom', host); c.classList.toggle('on', com); c.querySelector('span').textContent = com ? 'CLP' : (E.status === 'conectando' ? 'conectando…' : 'sem comunicação');
    const modo = val('modoAtual'); $('#ihmsModoAtual', host).textContent = MODOS[modo] ? `Modo: ${MODOS[modo].nome}` : 'Modo: —';
    host.querySelectorAll('[data-v]').forEach((el) => { el.textContent = fmt(val(el.dataset.v), +el.dataset.dec); });
    host.querySelectorAll('[data-l]').forEach((el) => el.classList.toggle('on', val(el.dataset.l) === true));
    host.querySelectorAll('[data-tog]').forEach((b) => { const on = val(b.dataset.tog) === true; b.classList.toggle('on', on); if (b.dataset.on) b.textContent = on ? b.dataset.on : b.dataset.off; });
    host.querySelectorAll('[data-modo]').forEach((b) => b.classList.toggle('on', +b.dataset.modo === modo));
    host.querySelectorAll('[data-banner]').forEach((b) => {
      const n = +b.dataset.banner, ativo = n === modo;
      b.classList.toggle('ativo', ativo);
      b.textContent = ativo ? `Modo ${MODOS[n].nome} ativo no CLP` : `O CLP está em outro modo · toque aqui para ativar ${MODOS[n].nome}`;
    });
    host.querySelectorAll('[data-sp]').forEach((inp) => { if (!inp.dataset.editando && document.activeElement !== inp) { const v = val(inp.dataset.sp); if (v !== undefined) inp.value = Math.round(v * 10) / 10; } });
    const pos = val('posicao'); const p = host.querySelector('[data-pont]');
    if (p && pos !== undefined) p.setAttribute('transform', `rotate(${pos} 60 60)`);
    const alvo = host.querySelector('[data-alvo]');
    if (alvo) { const a = tela === 'abs' ? val('destino') : undefined; alvo.style.display = a === undefined ? 'none' : ''; if (a !== undefined) alvo.setAttribute('transform', `rotate(${a} 60 60)`); }
    const st = $('#ihmsStatus', host);
    const s = E.stats; const demo = E.demo || {};
    st.innerHTML = `${E.ativo ? (com ? `<b style="color:var(--ok)">Comunicando</b> com ${info ? info.cfg.ip + ':' + info.cfg.porta : 'o CLP'}` : `<b style="color:var(--warn)">${E.status}</b> ${E.erro || ''}`) : 'Comunicação desligada.'}${s ? ` · telegramas ${s.tx}/${s.rx} · timeouts ${s.timeouts} · exceções ${s.excecoes}` : ''}`;
    $('#ihmsLigar', host).textContent = E.ativo ? 'Desconectar' : 'Conectar';
    const bd = $('#ihmsDemo', host);
    if (!bd.disabled) {
      bd.textContent = demo.ligado ? 'Desligar CLP de demonstração' : 'Ligar CLP de demonstração';
      bd.classList.toggle('on', !!demo.ligado);
      $('#ihmsDemoTxt', host).innerHTML = demo.ligado ? `CLP de demonstração ligado: a IHM conversa com ele em <b>${demo.host || '127.0.0.1'}:${demo.porta}</b>, e ele comanda o SCA06 pela EtherNet/IP (8/11 palavras).`
        : demo.erro ? `<span style="color:var(--err)">${demo.erro}</span>` : 'Faz o papel do CODESYS com o programa do guia (Parte 9). O drive precisa estar configurado para a IHM: assistente <b>Comunicação com o CLP → IHM (todos os modos)</b>.';
    }
  }

  async function abrir(el) {
    host = el;
    if (!App() || !App().S.info || !App().S.info.backend) { host.innerHTML = '<p class="hint">A IHM precisa do servidor do simulador (rede real). Na demonstração no navegador ela não está disponível.</p>'; return; }
    try { const r = await req({ op: 'info' }); info = (r.result || r).info; } catch (e) { host.innerHTML = `<p class="hint">IHM indisponível: ${e.message}</p>`; return; }
    montarTela();
  }

  window.IHMServoUI = { abrir, atualizar: (e) => atualizar(e), aberta: () => montado };
})();
