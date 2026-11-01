/* HUB de Simuladores — interface */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const E = { estado: null, sel: null, rede: null, aulas: [], logs: {} };

  // ------------------------------------------------------------------ comunicação
  async function api(metodo, url, corpo, bruto) {
    const op = { method: metodo, headers: {} };
    if (bruto) { op.body = bruto; op.headers['Content-Type'] = 'application/octet-stream'; }
    else if (corpo !== undefined) { op.body = JSON.stringify(corpo); op.headers['Content-Type'] = 'application/json'; }
    const r = await fetch(url, op);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.erro || `Erro ${r.status}`); e.status = r.status; throw e; }
    return d;
  }
  let toastT;
  function toast(msg) {
    let t = $('.aviso-toast');
    if (!t) { t = document.createElement('div'); t.className = 'aviso-toast'; t.setAttribute('role', 'status'); document.body.append(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 6000);
  }

  async function carregar() {
    E.estado = await api('GET', '/api/estado');
    E.dev = E.estado.hub.modo === 'desenvolvedor';
    $('#versao').textContent = `v${E.estado.hub.versao}` + (E.dev ? ' · desenvolvedor' : '');
    document.querySelectorAll('[data-so-dev]').forEach((el) => { el.hidden = !E.dev; });
    $('#abrirAuto').checked = E.estado.config.abrirTelaAoIniciar !== false;
    E.atualizacao = E.estado.atualizacao; renderAtualizacao();
    if (!E.sel || !sim(E.sel)) E.sel = E.estado.simuladores[0]?.id || null;
    renderBancada();
    renderResumo();
  }
  const sim = (id) => E.estado?.simuladores.find((s) => s.id === id);

  function conectarEventos() {
    const ev = new EventSource('/api/eventos');
    ev.addEventListener('estado', (e) => {
      const d = JSON.parse(e.data); const s = sim(d.id);
      if (!s) return;
      const { id, ...resto } = d;
      s.execucao = resto;
      renderModulo(s); renderResumo();
      if (E.sel === id) renderDinamico(s);
    });
    ev.addEventListener('log', (e) => {
      const d = JSON.parse(e.data);
      (E.logs[d.id] ||= []).push(d);
      if (E.logs[d.id].length > 600) E.logs[d.id].shift();
      if (E.sel === d.id) anexarLog(d);
    });
    ev.addEventListener('catalogo', () => carregar());
    ev.addEventListener('atualizacao', (e) => { E.atualizacao = JSON.parse(e.data); renderAtualizacao(); });
    ev.addEventListener('reiniciando', () => { E.reiniciando = true; renderAtualizacao(); });
    ev.addEventListener('dev', (e) => {
      const d = JSON.parse(e.data);
      if (d.texto) (E.devLog ||= []).push(d.texto);
      const lg = $('#devLog'); if (!lg) return;
      if (d.texto) { lg.hidden = false; const l = document.createElement('div'); if (/\[ERRO\]/.test(d.texto)) l.className = 'erro'; l.textContent = d.texto; lg.append(l); lg.scrollTop = lg.scrollHeight; }
      if (d.fim) { toast(d.ok ? 'Enviado ao GitHub. Acompanhe no Actions.' : 'A publicação não foi concluída.'); setTimeout(carregarDev, 1200); }
    });
    // ao reconectar (ex.: depois de uma atualização), recarrega se a versão do HUB mudou
    ev.addEventListener('open', async () => {
      try {
        const st = await api('GET', '/api/estado');
        if (E.estado && st.hub.versao !== E.estado.hub.versao) location.reload();
      } catch (_) { /* ainda subindo */ }
    });
  }

  // ------------------------------------------------------------------ resumo do topo
  function renderResumo() {
    const rodando = E.estado.simuladores.filter((s) => ['rodando', 'iniciando'].includes(s.execucao.estado));
    $('#resumoExec').textContent = rodando.length ? `${rodando.length} em execução` : 'Nenhum em execução';
    $('#pararTodos').hidden = !rodando.length;
    const r = E.rede; const led = $('#resumoRede .led');
    led.className = 'led ' + (!r ? '' : r.pronta ? 'verde' : 'ambar');
    $('#resumoRede span').textContent = !r ? 'Rede' : r.pronta ? 'Rede pronta' : `Rede: faltam ${r.faltando.length} IP${r.faltando.length > 1 ? 's' : ''}`;
    const aviso = r && !r.pronta;
    $('#avisoRede').hidden = !aviso;
    if (aviso) $('#avisoRedeTexto').textContent = `Os IPs ${r.faltando.join(', ')} ainda não existem neste PC. Sem eles, cada simulador EtherNet/IP responde em todas as placas e só um roda por vez.`;
  }

  // ------------------------------------------------------------------ bancada
  const textoEstado = { parado: 'Parado', verificando: 'Verificando portas', iniciando: 'Iniciando', rodando: 'Em execução', erro: 'Com erro', instalando: 'Instalando' };

  /** Ilustração do dispositivo: da biblioteca (Icones) ou arquivo próprio do simulador. */
  function ilustracao(s) {
    if (/\.(svg|png)$/i.test(s.icone || '')) return `<img src="/api/sim/${encodeURIComponent(s.id)}/icone" alt="">`;
    return Icones.svg(s.icone, s.cor || '#7D878A', s.tipo);
  }

  function indicadores(s) {
    const st = s.execucao.estado;
    const ledEstado = st === 'erro' ? 'vermelho' : ['iniciando', 'verificando', 'instalando'].includes(st) ? 'ambar pisca' : st === 'rodando' ? 'verde' : '';
    const ativo = st === 'rodando' || st === 'iniciando';
    let ledRede = ''; let rede;
    if (!s.rede.precisaIp) rede = s.rede.descricaoIp || 'cliente, sem IP próprio';
    else if (ativo && s.execucao.ip === '0.0.0.0') { ledRede = 'ambar'; rede = 'todas as placas'; }
    else { ledRede = ativo ? 'verde' : ''; rede = s.ipAtribuido || 'sem IP'; }
    return { ledEstado, ledRede, rede, estado: textoEstado[st] || st };
  }

  function htmlCartao(s) {
    const x = indicadores(s);
    return `<span class="palco" style="--cor:${esc(s.cor || 'var(--aco)')}">${ilustracao(s)}<span class="selo"><i class="led ${x.ledEstado}"></i>${esc(x.estado)}</span></span>
      <span class="cartao-corpo">
        ${s.fabricante ? `<span class="cartao-fab">${esc(s.fabricante)}</span>` : ''}
        <span class="cartao-nome">${esc(s.nome)}</span>
        <span class="cartao-tipo">${esc(s.tipo)}${s.semFicha ? ' (sem ficha)' : ''}</span>
        <span class="cartao-rede"><i class="led ${x.ledRede}"></i>${esc(x.rede)}</span>
      </span>`;
  }
  function renderModulo(s) {
    const b = $(`.cartao[data-id="${CSS.escape(s.id)}"]`);
    if (b) b.innerHTML = htmlCartao(s);
  }
  function renderBancada() {
    $('#cartoes').innerHTML = E.estado.simuladores.map((s) => `<button class="cartao" data-id="${esc(s.id)}" aria-pressed="${s.id === E.sel}">${htmlCartao(s)}</button>`).join('') +
      (E.dev ? '<a class="cartao novo" href="#/adicionar"><b>+</b>Adicionar simulador</a>' : '');
    renderDetalhe();
  }

  function urlTela(s) {
    return `${location.protocol}//${location.hostname}:${s.execucao.httpPort || s.portaWebPreferida}${s.web.caminho || '/'}`;
  }

  function renderDetalhe() {
    const d = $('#detalhe'); const s = sim(E.sel);
    if (!s) { d.innerHTML = '<div class="placa"><h2>Nenhum simulador</h2><p>Use <a href="#/adicionar">Adicionar e atualizar</a> para trazer o primeiro.</p></div>'; return; }
    const aulas = (s.aprender || []).map((id) => E.aulas.find((a) => a.id === id)).filter(Boolean);
    const arquivos = [...(s.arquivos.eds || []), ...(s.arquivos.downloads || [])];
    d.innerHTML = `
      <div class="placa">
        <div class="det-cabeca"><span class="mini">${ilustracao(s)}</span>
          <div><h2>${esc(s.nome)}</h2>
          <p class="sub" style="margin:2px 0 0">${esc([s.fabricante, s.tipo].filter(Boolean).join(', '))}. Versão ${esc(s.versao)}</p></div></div>
        ${s.descricao ? `<p>${esc(s.descricao)}</p>` : ''}
        <div class="etiquetas">${(s.protocolos || []).map((p) => `<span class="etiq proto">${esc(p)}</span>`).join('')}${s.papel ? `<span class="etiq">${esc(s.papel)}</span>` : ''}</div>
        ${s.semFicha ? '<ul class="mensagens"><li>Este simulador ainda não tem ficha. Preencha a ficha para o HUB saber a porta da tela, o IP e os protocolos.</li></ul>' : ''}
        ${s.erroFicha ? `<ul class="mensagens"><li class="erro">${esc(s.erroFicha)}</li></ul>` : ''}
        ${s.modos ? htmlModos(s) : ''}
        <div class="acoes" id="detAcoes" style="margin-top:14px"></div>
        <ul class="mensagens" id="detMsgs"></ul>

        <h3>Conexão</h3>
        <dl class="campos">
          <dt>IP do equipamento</dt>
          <dd>${s.rede.precisaIp
            ? `<input class="campo ip" id="detIp" value="${esc(s.ipAtribuido || '')}" aria-label="IP do equipamento"><span id="detIpSit" style="font-size:14px;color:var(--grafite-2)"></span>`
            : `<span>${esc(s.rede.descricaoIp ? `${s.rede.descricaoIp}.` : 'Não precisa de IP próprio: ele conecta no CLP como cliente.')}</span>`}</dd>
          <dt>Porta da tela</dt>
          <dd><input class="campo porta" id="detPorta" type="number" value="${esc(s.portaWebPreferida)}" aria-label="Porta da tela">
            ${!s.contrato.portaWeb ? '<span style="font-size:14px;color:var(--led-ambar)">fixa no código deste simulador</span>' : ''}</dd>
          <dt></dt><dd><button class="btn peq" id="detSalvar">Salvar IP e porta</button></dd>
          <dt>Portas de rede</dt><dd><ul class="portas-lista" id="detPortas"></ul></dd>
        </dl>
        ${s.rede.observacao ? `<p style="font-size:14px;color:var(--grafite-2)">${esc(s.rede.observacao)}</p>` : ''}
        ${s.remoto ? `<h3>${esc(s.remoto.titulo || 'Instância remota')}</h3>
          ${s.remoto.texto ? `<p style="font-size:15px">${esc(s.remoto.texto)}</p>` : ''}
          <dl class="campos"><dt>Endereço</dt><dd><input class="campo" id="detRemUrl" value="${esc(s.urlRemota || '')}" style="width:24ch" aria-label="Endereço da instância remota">
            <button class="btn peq" id="detRemSalvar">Salvar</button><button class="btn peq" id="detRemVer">Verificar</button>
            <a class="btn peq" id="detRemAbrir" href="${esc(s.urlRemota || '#')}" target="_blank" rel="noopener">Abrir</a></dd>
            <dt>Situação</dt><dd id="detRemSit" style="font-size:14px">verificando...</dd></dl>` : ''}

        ${arquivos.length ? `<h3>Arquivos para o CLP</h3><div class="acoes">${arquivos.map((a) => `<a class="btn peq" href="/api/sim/${esc(s.id)}/arquivo/${a.split('/').map(encodeURIComponent).join('/')}" download>${esc(a.split('/').pop())}</a>`).join('')}</div>` : ''}
        ${aulas.length ? `<h3>Estudar o protocolo</h3><div class="acoes">${aulas.map((a) => `<a class="btn peq" href="#/aprender/${esc(a.id)}">${esc(a.titulo)}</a>`).join('')}</div>` : ''}
        ${E.dev && s.backups.length ? `<h3>Versões anteriores</h3><table class="tabela">${s.backups.map((b) => `<tr><td>${esc(b.versao)}</td><td>${esc(formatarCarimbo(b.quando))}</td><td><button class="btn peq" data-restaurar="${esc(b.nome)}">Restaurar</button></td></tr>`).join('')}</table>` : ''}
        ${E.dev ? '<p style="margin-top:22px"><button class="btn peq" id="detFicha">Editar ficha</button></p>' : ''}
      </div>
      <div class="placa">
        <div class="console-topo"><h3>Mensagens do simulador</h3><button class="btn peq" id="limparLog">Limpar</button></div>
        <div class="console" id="console" role="log" aria-live="polite"></div>
      </div>`;
    renderDinamico(s);
    carregarLog(s.id);
    if (s.modos) {
      const sel = $('#detModo');
      const atualizarObs = () => { const m = s.modos.find((x) => x.id === sel.value); $('#detModoObs').textContent = m?.observacao || ''; };
      sel.onchange = atualizarObs; atualizarObs();
    }
    if (s.remoto) {
      const verificar = async () => {
        const sit = $('#detRemSit'); if (!sit) return;
        sit.textContent = 'verificando...'; sit.style.color = '';
        try {
          const r = await api('GET', `/api/sim/${s.id}/remoto`);
          sit.innerHTML = r.online ? `<i class="led verde"></i> no ar (${esc(r.url)})` : `<i class="led"></i> fora do ar (${esc(r.motivo || '')}). A VM está ligada e o simulador iniciado?`;
        } catch (e) { sit.textContent = e.message; }
      };
      $('#detRemVer').onclick = verificar;
      $('#detRemSalvar').onclick = async () => {
        const url = $('#detRemUrl').value.trim();
        try { await api('PUT', `/api/sim/${s.id}/atribuicao`, { urlRemota: url }); s.urlRemota = url; $('#detRemAbrir').href = url || '#'; toast('Endereço salvo.'); verificar(); }
        catch (e) { toast(e.message); }
      };
      verificar();
    }

    $('#detSalvar').onclick = async () => {
      try {
        await api('PUT', `/api/sim/${s.id}/atribuicao`, { ip: s.rede.precisaIp ? $('#detIp').value.trim() : undefined, portaWeb: $('#detPorta').value.trim() });
        toast('IP e porta salvos. Valem na próxima vez que o simulador iniciar.');
        await carregar(); await carregarRede(false);
      } catch (e) { toast(e.message); }
    };
    if ($('#detFicha')) $('#detFicha').onclick = () => abrirFicha(s);
    $('#limparLog').onclick = () => { E.logs[s.id] = []; $('#console').innerHTML = ''; };
    d.querySelectorAll('[data-restaurar]').forEach((b) => b.onclick = async () => {
      if (!confirm('Voltar para esta versão? A versão atual vira um backup.')) return;
      try { await api('POST', `/api/sim/${s.id}/restaurar`, { backup: b.dataset.restaurar }); toast('Versão restaurada.'); carregar(); } catch (e) { toast(e.message); }
    });
  }
  /** Seletor de modo de execução (fichas com "modos"). Modos de outro sistema aparecem desativados. */
  function htmlModos(s) {
    const plat = E.estado.hub.plataforma;
    const pode = (m) => !m.plataformas || m.plataformas.includes(plat);
    const escolhido = s.modos.find((m) => m.id === s.modoEscolhido && pode(m)) || s.modos.find(pode) || s.modos[0];
    return `<div style="margin-top:12px"><label style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:15px">Modo de execução
      <select class="campo" id="detModo">${s.modos.map((m) => `<option value="${esc(m.id)}" ${m.id === escolhido.id ? 'selected' : ''} ${pode(m) ? '' : 'disabled'}>${esc(m.nome)}${pode(m) ? '' : ' (outro sistema)'}</option>`).join('')}</select></label>
      <p id="detModoObs" style="margin:6px 0 0;font-size:14px;color:var(--grafite-2)"></p></div>`;
  }
  const formatarCarimbo = (c) => c ? `${c.slice(6, 8)}/${c.slice(4, 6)}/${c.slice(0, 4)} ${c.slice(9, 11)}:${c.slice(11, 13)}` : '';

  /** Partes que mudam com o estado (sem redesenhar os campos de edição). */
  function renderDinamico(s) {
    const x = s.execucao; const st = x.estado;
    const ocupado = ['verificando', 'iniciando', 'instalando'].includes(st);
    const ativo = ['rodando', 'iniciando'].includes(st);
    const acoes = $('#detAcoes'); if (!acoes) return;
    acoes.innerHTML = `
      ${ativo ? '<button class="btn prim" data-a="parar">Parar</button>' : `<button class="btn prim" data-a="iniciar" ${ocupado || !s.instalado ? 'disabled' : ''}>Iniciar</button>`}
      <a class="btn" href="${esc(urlTela(s))}" target="_blank" rel="noopener" ${st === 'rodando' ? '' : 'aria-disabled="true" style="opacity:.45;pointer-events:none"'}>Abrir tela</a>
      ${ativo ? '<button class="btn" data-a="reiniciar">Reiniciar</button>' : ''}
      ${s.arquivos.guia ? '<button class="btn" data-a="guia">Guia</button>' : ''}
      ${!s.instalado || st === 'erro' ? `<button class="btn" data-a="instalar" ${ativo || ocupado ? 'disabled' : ''}>Instalar dependências</button>` : ''}
      <span style="align-self:center;font-size:14px;color:var(--grafite-2)">${esc(textoEstado[st] || st)}${x.modo && s.modos && ['rodando', 'iniciando'].includes(st) ? ` no modo ${esc(s.modos.find((m) => m.id === x.modo)?.nome || x.modo)}` : ''}${st === 'rodando' && x.httpPort ? `, tela na porta ${x.httpPort}` : ''}</span>`;
    acoes.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => acao(s, b.dataset.a, b));

    const msgs = [];
    if (!s.instalado && st !== 'instalando') msgs.push(['erro', 'As dependências deste simulador não estão instaladas. Use "Instalar dependências" (precisa de internet).']);
    for (const a of x.avisos || []) msgs.push([st === 'parado' ? 'erro' : '', a]);
    $('#detMsgs').innerHTML = msgs.map(([c, t]) => `<li class="${c}">${esc(t)}</li>`).join('');

    const portas = x.portas?.length ? x.portas : (s.rede.portas || []).map((p) => ({ ...p, porta: String(p.porta).replace(/\{(\w+)\}/g, (_, k) => s.variaveis?.[k] ?? k) }));
    $('#detPortas').innerHTML = portas.length ? portas.map((p) => `<li><code>${esc(p.proto.toUpperCase())} ${esc(p.porta)}</code><span>${esc(p.uso)}</span></li>`).join('') : '<li>nenhuma porta de servidor</li>';

    const sit = $('#detIpSit');
    if (sit && E.rede) {
      const ip = s.ipAtribuido; const no = E.rede.plano.find((p) => p.ip === ip && p.id === s.id);
      sit.textContent = !ip ? '' : no?.existe ? 'existe neste PC' : 'ainda não existe neste PC (aba Rede)';
      sit.style.color = no?.existe ? 'var(--led-verde)' : 'var(--led-ambar)';
    }
  }

  async function acao(s, a, botao) {
    if (a === 'guia') return abrirGuia(s);
    botao.disabled = true;
    try {
      if (a === 'iniciar' || a === 'reiniciar') {
        const r = await api('POST', `/api/sim/${s.id}/${a}`, a === 'iniciar' && $('#detModo') ? { modo: $('#detModo').value } : undefined);
        if (r.estado === 'rodando') toast(`${s.nome} em execução.${E.estado.config.abrirTelaAoIniciar !== false && a === 'iniciar' ? ' Abrindo a tela...' : ` Tela na porta ${r.httpPort}.`}`);
      } else await api('POST', `/api/sim/${s.id}/${a}`);
      if (a === 'instalar') toast('Instalando dependências. Acompanhe nas mensagens do simulador.');
    } catch (e) { toast(e.status === 409 ? 'Não foi possível iniciar: veja os motivos acima.' : e.message); }
    finally { botao.disabled = false; if (a === 'instalar') setTimeout(carregar, 500); }
  }

  // ------------------------------------------------------------------ console
  async function carregarLog(id) {
    try { E.logs[id] = await api('GET', `/api/sim/${id}/log`); } catch (_) { E.logs[id] = []; }
    if (E.sel !== id) return;
    const c = $('#console'); c.innerHTML = '';
    if (!E.logs[id].length) c.innerHTML = '<span class="vazio">As mensagens aparecem aqui quando o simulador iniciar.</span>';
    E.logs[id].forEach((l) => anexarLog(l, true));
    c.scrollTop = c.scrollHeight;
  }
  function anexarLog(l, semRolar) {
    const c = $('#console'); if (!c) return;
    c.querySelector('.vazio')?.remove();
    const noFim = c.scrollHeight - c.scrollTop - c.clientHeight < 40;
    const linha = document.createElement('div');
    linha.className = l.tipo === 'saida' ? '' : l.tipo;
    linha.textContent = `${new Date(l.t).toLocaleTimeString('pt-BR')}  ${l.texto}`;
    c.append(linha);
    while (c.childElementCount > 600) c.firstChild.remove();
    if (!semRolar && noFim) c.scrollTop = c.scrollHeight;
  }

  $('#cartoes').addEventListener('click', (e) => {
    const b = e.target.closest('.cartao[data-id]'); if (!b) return;
    E.sel = b.dataset.id;
    document.querySelectorAll('.cartao[data-id]').forEach((m) => m.setAttribute('aria-pressed', m.dataset.id === E.sel));
    renderDetalhe();
  });
  $('#abrirAuto').addEventListener('change', async (e) => {
    try { await api('PUT', '/api/config', { abrirTelaAoIniciar: e.target.checked }); E.estado.config.abrirTelaAoIniciar = e.target.checked; }
    catch (err) { toast(err.message); }
  });
  $('#pararTodos').onclick = async () => { await api('POST', '/api/parar-todos'); toast('Todos os simuladores foram parados.'); };

  // ------------------------------------------------------------------ diálogos
  document.querySelectorAll('dialog [data-fechar]').forEach((b) => b.onclick = () => b.closest('dialog').close());
  function abrirTexto(titulo, md) {
    $('#dlgTextoTitulo').textContent = titulo;
    $('#dlgTextoCorpo').innerHTML = MD.render(md);
    $('#dlgTexto').showModal();
  }
  async function abrirGuia(s) {
    try { const r = await api('GET', `/api/sim/${s.id}/guia`); abrirTexto(`Guia: ${s.nome}`, r.texto); } catch (e) { toast(e.message); }
  }
  $('#abrirContrato').onclick = async () => {
    try { const r = await api('GET', '/api/contrato'); abrirTexto('Contrato do HUB', r.texto); } catch (e) { toast(e.message); }
  };

  function abrirFicha(s) {
    const portas = (s.rede.portas || []).map((p) => `${p.proto} ${p.porta} ${p.uso || ''}`.trim()).join('\n');
    const lista = (a) => esc((a || []).join(', '));
    $('#formFicha').innerHTML = `
      <div class="form-ficha">
        <label>Nome<input class="campo" name="nome" value="${esc(s.nome)}" required></label>
        <label>Fabricante<input class="campo" name="fabricante" value="${esc(s.fabricante)}"></label>
        <label>Tipo de equipamento<input class="campo" name="tipo" value="${esc(s.tipo)}"></label>
        <label>Versão<input class="campo" name="versao" value="${esc(s.versao)}"></label>
        <label class="largo">Descrição<textarea class="campo" name="descricao" rows="2">${esc(s.descricao)}</textarea></label>
        <label>Protocolos (separados por vírgula)<input class="campo" name="protocolos" value="${lista(s.protocolos)}"></label>
        <label>Papel na rede<input class="campo" name="papel" value="${esc(s.papel)}" placeholder="Adapter EtherNet/IP, servidor Modbus TCP"></label>
        <label>Comando<input class="campo" name="comando" value="${esc(s.iniciar.comando)}"></label>
        <label>Argumentos (separados por vírgula)<input class="campo" name="args" value="${lista(s.iniciar.args)}"></label>
        <label>Porta da tela<input class="campo" name="porta" type="number" value="${esc(s.web.porta)}"></label>
        <label>Precisa de IP próprio?<select class="campo" name="precisaIp"><option value="1" ${s.rede.precisaIp ? 'selected' : ''}>Sim (adapter / servidor)</option><option value="0" ${s.rede.precisaIp ? '' : 'selected'}>Não (cliente)</option></select></label>
        <label>IP sugerido<input class="campo ip" name="ipSugerido" value="${esc(s.rede.ipSugerido || '')}"></label>
        <label>Cor de destaque<input class="campo" type="color" name="cor" value="${esc(s.cor || '#7D878A')}"></label>
        <label>Ilustração<select class="campo" name="icone">${Icones.lista.map((i) => `<option value="${i}" ${s.icone === i ? 'selected' : ''}>${esc(Icones.nomes[i])}</option>`).join('')}
          ${/\.(svg|png)$/i.test(s.icone || '') ? `<option value="${esc(s.icone)}" selected>Arquivo próprio: ${esc(s.icone)}</option>` : ''}</select></label>
        <label class="largo">Portas que o simulador abre (uma por linha: protocolo, porta e uso)<textarea class="campo mono" name="portas" rows="4" placeholder="tcp 44818 EtherNet/IP explícito">${esc(portas)}</textarea></label>
        <label>Guia (arquivo .md)<input class="campo" name="guia" value="${esc(s.arquivos.guia || '')}"></label>
        <label>Arquivos EDS (vírgula)<input class="campo" name="eds" value="${lista(s.arquivos.eds)}"></label>
        <label>Preservar ao atualizar (vírgula)<input class="campo" name="preservar" value="${lista(s.preservarAoAtualizar)}"></label>
        <label>Aulas relacionadas (vírgula)<input class="campo" name="aprender" value="${lista(s.aprender)}" placeholder="${esc(E.aulas.map((a) => a.id).join(', '))}"></label>
      </div>
      <div class="acoes" style="margin-top:18px"><button class="btn prim" value="salvar">Salvar ficha</button><button class="btn" value="cancelar" formnovalidate>Cancelar</button></div>`;
    const dlg = $('#dlgFicha');
    dlg.onclose = async () => {
      if (dlg.returnValue !== 'salvar') return;
      const f = new FormData($('#formFicha'));
      const sep = (n) => String(f.get(n) || '').split(',').map((x) => x.trim()).filter(Boolean);
      const ficha = {
        nome: f.get('nome'), fabricante: f.get('fabricante'), tipo: f.get('tipo'), versao: f.get('versao'), descricao: f.get('descricao'),
        protocolos: sep('protocolos'), papel: f.get('papel'), cor: f.get('cor'), icone: f.get('icone'), pacote: s.pacote,
        iniciar: { comando: f.get('comando') || 'node', args: sep('args') },
        web: { ...s.web, porta: Number(f.get('porta')) || 3000 },
        rede: {
          ...s.rede, precisaIp: f.get('precisaIp') === '1', ipSugerido: f.get('ipSugerido') || null,
          portas: String(f.get('portas') || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
            const [proto, porta, ...uso] = l.split(/\s+/);
            return { proto: proto.toLowerCase(), porta: /^\d+$/.test(porta) ? Number(porta) : porta, uso: uso.join(' ') };
          }),
        },
        variaveis: s.variaveis,
        arquivos: { ...s.arquivos, guia: f.get('guia') || null, eds: sep('eds') },
        preservarAoAtualizar: sep('preservar'), aprender: sep('aprender'),
      };
      try { await api('PUT', `/api/sim/${s.id}/ficha`, ficha); toast('Ficha salva.'); carregar(); } catch (e) { toast(e.message); }
    };
    dlg.returnValue = '';
    dlg.showModal();
  }

  // ------------------------------------------------------------------ rede
  async function carregarRede(desenhar = true) {
    try { E.rede = await api('GET', '/api/rede'); } catch (e) { toast(e.message); return; }
    renderResumo();
    if (desenhar) renderRede();
    const s = sim(E.sel); if (s && $('#detAcoes')) renderDinamico(s);
  }

  function renderRede(mensagens) {
    const r = E.rede; const raiz = $('#rede');
    if (!r) { raiz.innerHTML = '<p>Lendo a configuração de rede...</p>'; return; }
    const win = r.plataforma === 'win32';
    const antigas = (r.windows?.outrasLoopback ? [].concat(r.windows.outrasLoopback) : []).filter((a) => a.conflita);
    const nos = r.plano.map((p) => {
      const s = p.id && sim(p.id);
      const desenho = s ? ilustracao(s) : Icones.svg(p.origem ? 'clp' : 'generico', p.origem ? '#1D5BA6' : '#7D878A', p.papel);
      return `
      <div class="no ${p.origem ? 'clp' : ''} ${p.existe ? '' : 'falta'}">
        <span class="ilustra">${desenho}</span>
        <div class="papel">${esc(p.papel)}</div>
        <div class="ip"><i class="led ${p.existe ? 'verde' : 'ambar'}"></i>${esc(p.ip)}</div>
        <div class="situacao">${p.repetido ? '<span class="erro-txt">IP repetido no plano</span>' : p.existe ? (p.interface ? `na placa ${esc(p.interface)}` : 'existe') : 'falta criar'}</div>
      </div>`;
    }).join('');
    const msgs = [...(mensagens || [])];
    if (antigas.length) msgs.unshift({ c: '', t: `Placas antigas na mesma faixa: ${antigas.map((a) => `${a.nome} (${[].concat(a.ips || []).join(', ')})`).join('; ')}. Elas competem com a placa do HUB. Use "Migrar redes antigas".` });
    if (r.windows?.erro) msgs.push({ c: 'erro', t: `Não consegui ler os detalhes da placa pelo PowerShell: ${r.windows.erro}` });

    raiz.innerHTML = `
      <div class="topologia">
        <div class="barra-titulo"><i class="led ${r.pronta ? 'verde' : 'ambar'}"></i>
          <h3>${r.pronta ? 'Rede pronta: todos os IPs existem neste PC' : `Faltam ${r.faltando.length} IP${r.faltando.length > 1 ? 's' : ''} neste PC`}</h3>
          <button class="btn peq" id="redeAtualizar" style="margin-left:auto">Verificar de novo</button></div>
        <div class="barramento"><span class="rotulo-barra">Placa ${esc(r.adaptador)}, máscara de ${r.prefixo} bits</span>${nos}</div>
      </div>
      <div class="acoes" style="margin:16px 0 0">
        <button class="btn rede" data-r="criar">${r.pronta ? 'Conferir a rede e o firewall' : 'Criar ou completar a rede'}</button>
        ${antigas.length ? '<button class="btn" data-r="migrar">Migrar redes antigas</button>' : ''}
        <button class="btn perigo" data-r="remover-tudo">Remover a rede do HUB</button>
      </div>
      <p style="font-size:14px;color:var(--grafite-2);margin:8px 0 0">${win ? 'O Windows vai pedir permissão de administrador; uma janela do PowerShell mostra o andamento e fecha sozinha.' : 'No Linux, as alterações precisam do sudo.'}</p>
      <ul class="mensagens" id="redeMsgs">${msgs.map((m) => `<li class="${m.c}">${m.html || esc(m.t)}</li>`).join('')}</ul>

      <div class="grade-2">
        <div class="placa">
          <h3 style="margin-top:0">Endereços do laboratório</h3>
          <dl class="campos">
            <dt>IP do CLP / CODESYS</dt><dd><input class="campo ip" id="redeClp" value="${esc(r.ipClp)}"></dd>
            <dt>Máscara (bits)</dt><dd><input class="campo porta" id="redePrefixo" type="number" min="8" max="30" value="${r.prefixo}"></dd>
            <dt>IPs extras</dt><dd id="redeExtras">${(E.estado.config.rede.ipsExtras || []).map((ip) => `<span class="etiq mono">${esc(ip)} <button class="btn peq" data-tirar="${esc(ip)}" aria-label="Tirar ${esc(ip)}">×</button></span>`).join('') || '<span style="color:var(--grafite-2)">nenhum</span>'}</dd>
            <dt></dt><dd><input class="campo ip" id="redeNovoExtra" placeholder="192.168.100.23" aria-label="Novo IP extra"><button class="btn peq" id="redeAddExtra">Adicionar</button></dd>
          </dl>
          <p style="font-size:14px;color:var(--grafite-2)">IPs extras servem, por exemplo, para uma segunda câmera Keyence. O IP de cada simulador se muda em Dispositivos.</p>
          <button class="btn" id="redeSalvar">Salvar endereços</button>
        </div>
        <div class="placa">
          <h3 style="margin-top:0">No CODESYS, no mesmo PC</h3>
          <ol class="passos">
            <li>No dispositivo <em>Ethernet</em> (acima do scanner), escolha a placa <b>${esc(r.adaptador)}</b>.</li>
            <li>IP <b>${esc(r.ipClp)}</b>, máscara de ${r.prefixo} bits.</li>
            <li>Desmarque <em>Ajustar configurações do sistema operacional</em>. Se ficar marcado, o CODESYS apaga os IPs dos simuladores.</li>
            <li>Em cada equipamento do scanner, use o IP mostrado em Dispositivos e conexão T→O <b>ponto a ponto</b>: multicast não circula numa placa virtual.</li>
          </ol>
          <p style="font-size:14px;color:var(--grafite-2)">Com CLP real, ligue o cabo numa placa física com IP fixo na mesma faixa e adicione os IPs dos simuladores nela.</p>
        </div>
        <div class="placa">
          <h3 style="margin-top:0">IPs deste PC</h3>
          <table class="tabela"><thead><tr><th>Placa</th><th>IP</th><th>Máscara</th></tr></thead>
          <tbody>${r.locais.map((l) => `<tr><td>${esc(l.interface)}</td><td class="mono">${esc(l.ip)}</td><td class="mono">${esc(l.mascara)}</td></tr>`).join('') || '<tr><td colspan="3">Nenhum</td></tr>'}</tbody></table>
        </div>
      </div>`;

    $('#redeAtualizar').onclick = () => carregarRede();
    raiz.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => aplicarRede(b.dataset.r, b));
    raiz.querySelectorAll('[data-tirar]').forEach((b) => b.onclick = () => salvarRede((E.estado.config.rede.ipsExtras || []).filter((x) => x !== b.dataset.tirar)));
    $('#redeAddExtra').onclick = () => { const ip = $('#redeNovoExtra').value.trim(); if (ip) salvarRede([...(E.estado.config.rede.ipsExtras || []), ip]); };
    $('#redeSalvar').onclick = () => salvarRede(E.estado.config.rede.ipsExtras || []);
  }

  async function salvarRede(extras) {
    try {
      await api('PUT', '/api/rede/config', { ipClp: $('#redeClp').value.trim(), prefixo: +$('#redePrefixo').value, ipsExtras: extras });
      await carregar(); await carregarRede(); toast('Endereços salvos. Use "Criar ou completar a rede" para aplicar no PC.');
    } catch (e) { toast(e.message); }
  }

  async function aplicarRede(acao, botao) {
    if (acao === 'remover-tudo' && !confirm('Remover a placa virtual e as regras de firewall do HUB?')) return;
    botao.disabled = true;
    const msgs = $('#redeMsgs');
    msgs.innerHTML = '<li>Aguardando a permissão de administrador e o script de rede...</li>';
    try {
      const r = await api('POST', '/api/rede/aplicar', { acao });
      const linhas = (r.mensagens || []).filter((m) => m.trim()).map((t) => ({ c: /ERRO|\[!\]/.test(t) ? (t.includes('ERRO') ? 'erro' : '') : 'ok', t: t.trim() }));
      if (r.precisaTerminal) linhas.push({ c: '', html: `<div class="comando"><code>${esc(r.comando)}</code><button class="btn peq" data-copiar>Copiar</button></div>` });
      await carregarRede(false);
      renderRede([{ c: r.ok ? 'ok' : 'erro', t: r.ok ? 'Concluído.' : 'A ação não foi concluída.' }, ...linhas]);
      const cp = $('[data-copiar]'); if (cp) cp.onclick = () => navigator.clipboard.writeText(r.comando).then(() => toast('Comando copiado.'));
    } catch (e) { msgs.innerHTML = `<li class="erro">${esc(e.message)}</li>`; }
    finally { botao.disabled = false; }
  }

  // ------------------------------------------------------------------ aprender
  async function carregarAulas() {
    try { E.aulas = await api('GET', '/api/aprender'); } catch (_) { E.aulas = []; }
    $('#indiceAulas').innerHTML = E.aulas.map((a) => `<li><a href="#/aprender/${esc(a.id)}" data-aula="${esc(a.id)}">${esc(a.titulo)}<small>${esc(a.resumo)}</small></a></li>`).join('');
  }
  async function abrirAula(id) {
    id = id || E.aulas[0]?.id; if (!id) { $('#aula').innerHTML = '<p>Nenhuma aula encontrada na pasta hub/aprender.</p>'; return; }
    document.querySelectorAll('[data-aula]').forEach((a) => { if (a.dataset.aula === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    try {
      const a = await api('GET', `/api/aprender/${encodeURIComponent(id)}`);
      $('#aula').innerHTML = MD.render(a.texto);
      Widgets.montarWidgets($('#aula'));
      window.scrollTo({ top: 0 });
    } catch (e) { $('#aula').innerHTML = `<p>${esc(e.message)}</p>`; }
  }

  // ------------------------------------------------------------------ adicionar
  const soltar = $('#soltar');
  ['dragenter', 'dragover'].forEach((t) => soltar.addEventListener(t, (e) => { e.preventDefault(); soltar.classList.add('ativo'); }));
  ['dragleave', 'drop'].forEach((t) => soltar.addEventListener(t, () => soltar.classList.remove('ativo')));
  soltar.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) enviarZip(e.dataTransfer.files[0]); });
  soltar.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#arquivoZip').click(); } });
  $('#arquivoZip').addEventListener('change', (e) => { if (e.target.files[0]) enviarZip(e.target.files[0]); e.target.value = ''; });

  async function enviarZip(arq) {
    const out = $('#resultadoImport');
    if (!/\.zip$/i.test(arq.name)) { out.innerHTML = '<li class="erro">Escolha um arquivo .zip.</li>'; return; }
    out.innerHTML = `<li>Importando ${esc(arq.name)}...</li>`;
    try {
      const r = await api('POST', '/api/importar', undefined, await arq.arrayBuffer());
      const itens = [{ c: 'ok', t: r.acao === 'novo' ? `${r.nome} entrou na bancada (versão ${r.versaoDepois}).` : `${r.nome} atualizado: ${r.versaoAntes} → ${r.versaoDepois}. A versão anterior ficou guardada.` }];
      if (r.precisaInstalar) itens.push({ c: '', t: 'Baixando as dependências. Acompanhe nas mensagens do simulador, em Dispositivos.' });
      for (const a of r.avisos || []) itens.push({ c: '', t: a });
      out.innerHTML = itens.map((i) => `<li class="${i.c}">${esc(i.t)}</li>`).join('') + `<li class="ok"><a href="#/bancada" data-ir="${esc(r.id)}">Abrir em Dispositivos</a></li>`;
      out.querySelector('[data-ir]').onclick = () => { E.sel = r.id; };
      await carregar();
    } catch (e) { out.innerHTML = `<li class="erro">${esc(e.message)}</li>`; }
  }

  // ------------------------------------------------------------------ atualização do HUB
  function renderAtualizacao() {
    const a = E.atualizacao; const p = $('#painelAtualizacao'); const aviso = $('#avisoAtualizacao');
    if (!a || !p) return;
    aviso.hidden = !(a.disponivel || a.aplicando || E.reiniciando);
    if ((a.disponivel && !E.atualizacaoAdiada) || a.aplicando || E.reiniciando) mostrarDialogoAtualizacao();
    aviso.textContent = E.reiniciando ? 'Reiniciando...' : a.aplicando ? 'Atualizando...' : `Atualização ${a.nova}`;
    let situacao;
    if (E.reiniciando) situacao = '<i class="led ambar pisca"></i> Reiniciando com a versão nova. A página recarrega sozinha.';
    else if (a.aplicando) situacao = '<i class="led ambar pisca"></i> Instalando a atualização...';
    else if (a.verificando) situacao = '<i class="led ambar pisca"></i> Procurando...';
    else if (a.configurado === false) situacao = `<i class="led"></i> Atualização automática não configurada. ${esc(a.motivo || '')}`;
    else if (a.erro) situacao = `<i class="led vermelho"></i> ${esc(a.erro)}`;
    else if (a.disponivel) situacao = `<i class="led verde"></i> Versão <b>${esc(a.nova)}</b> disponível${a.publicadoEm ? `, publicada em ${esc(new Date(a.publicadoEm).toLocaleString('pt-BR'))}` : ''}.`;
    else if (a.ultima) situacao = `<i class="led verde"></i> Em dia. Última consulta: ${esc(new Date(a.ultima).toLocaleTimeString('pt-BR'))}.`;
    else situacao = '<i class="led"></i> Ainda não consultado.';
    p.innerHTML = `
      <div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap"><h3 style="margin:0">Atualização do HUB</h3><span style="color:var(--grafite-2)">versão instalada ${esc(a.atual)}</span></div>
      <p style="display:flex;align-items:center;gap:8px;margin:12px 0">${situacao}</p>
      <div class="acoes">
        ${a.disponivel && !a.aplicando && !E.reiniciando ? '<button class="btn prim" id="atuAplicar">Atualizar agora</button>' : ''}
        <button class="btn" id="atuVerificar" ${a.verificando || a.aplicando || a.configurado === false ? 'disabled' : ''}>Procurar atualização</button>
        <label class="opcao" style="margin-left:0"><input type="checkbox" id="atuAuto" ${a.automatica ? 'checked' : ''}> Instalar sozinho ao abrir o HUB</label>
      </div>
      ${a.disponivel && a.notas ? `<div class="texto" style="margin-top:14px;padding:14px 18px">${MD.render(a.notas)}</div>` : ''}
      ${a.progresso?.length && (a.aplicando || a.erro || E.reiniciando) ? `<div class="console" style="height:auto;max-height:220px;margin-top:14px">${a.progresso.map((t) => `<div>${esc(t)}</div>`).join('')}</div>` : ''}`;
    const ap = $('#atuAplicar');
    if (ap) ap.onclick = async () => {
      if (E.estado.simuladores.some((s) => ['rodando', 'iniciando'].includes(s.execucao.estado)) && !confirm('Os simuladores abertos serão parados para atualizar. Continuar?')) return;
      try { E.atualizacao = await api('POST', '/api/atualizacao/aplicar'); renderAtualizacao(); } catch (e) { toast(e.message); }
    };
    $('#atuVerificar').onclick = async () => { try { E.atualizacao = await api('POST', '/api/atualizacao/verificar'); renderAtualizacao(); } catch (e) { toast(e.message); } };
    $('#atuAuto').onchange = (e) => api('PUT', '/api/config', { atualizacaoAutomatica: e.target.checked }).catch((err) => toast(err.message));
  }

  /** Mensagem para o usuário: "Vamos atualizar o seu HUB" com OK. */
  function mostrarDialogoAtualizacao(forcar) {
    const a = E.atualizacao; const d = $('#dlgAtualizacao');
    if (!a || (!forcar && E.atualizacaoAdiada && !a.aplicando && !E.reiniciando)) return;
    const ocupado = a.aplicando || E.reiniciando;
    $('#atuTitulo').textContent = ocupado ? 'Atualizando o HUB' : a.disponivel ? 'Atualização disponível' : 'Versão do HUB';
    let corpo;
    if (E.reiniciando) corpo = '<p style="display:flex;gap:8px;align-items:center"><i class="led ambar pisca"></i> Reiniciando com a versão nova. Esta tela recarrega sozinha em alguns segundos.</p>';
    else if (a.aplicando) corpo = `<p style="display:flex;gap:8px;align-items:center"><i class="led ambar pisca"></i> Baixando e instalando a versão ${esc(a.nova)}. Não feche o HUB.</p>
      ${E.dev ? `<div class="console" style="height:auto;max-height:200px">${(a.progresso || []).map((t) => `<div>${esc(t)}</div>`).join('')}</div>` : ''}`;
    else if (a.disponivel) {
      const rodando = E.estado.simuladores.filter((s) => ['rodando', 'iniciando'].includes(s.execucao.estado));
      corpo = `<p style="font-size:18px;margin-top:0">Vamos atualizar o seu HUB da versão <b>${esc(a.atual)}</b> para a <b>${esc(a.nova)}</b>.</p>
        ${a.notas ? `<div class="texto" style="padding:12px 18px;margin-bottom:14px"><b>O que muda:</b>${MD.render(a.notas)}</div>` : ''}
        <p style="color:var(--grafite-2)">Leva menos de um minuto. Seus IPs, configurações e parâmetros salvos ficam como estão.${rodando.length ? ` Os simuladores abertos (${rodando.map((s) => esc(s.nome)).join(', ')}) serão fechados.` : ''}</p>
        <div class="acoes"><button class="btn prim" id="atuOk">OK, atualizar agora</button><button class="btn" id="atuDepois">Depois</button></div>`;
    } else {
      corpo = `<p style="margin-top:0">Versão instalada: <b>${esc(a.atual)}</b>.</p>
        <p>${a.configurado === false ? 'Esta cópia não recebe atualizações automáticas.' : a.erro ? esc(a.erro) : a.verificando ? 'Procurando atualização...' : 'O HUB está atualizado.'}</p>
        <div class="acoes">${a.configurado === false ? '' : '<button class="btn" id="atuProcurar">Procurar atualização</button>'}<button class="btn" id="atuFechar">Fechar</button></div>`;
    }
    $('#atuCorpo').innerHTML = corpo;
    if (!d.open) d.showModal();
    const ok = $('#atuOk');
    if (ok) ok.onclick = async () => {
      ok.disabled = true;
      try { sessionStorage.setItem('hubAtualizadoDe', a.atual); } catch (_) { /* sem sessão */ }
      try { E.atualizacao = await api('POST', '/api/atualizacao/aplicar'); renderAtualizacao(); } catch (e) { toast(e.message); ok.disabled = false; }
    };
    if ($('#atuDepois')) $('#atuDepois').onclick = () => { E.atualizacaoAdiada = true; d.close(); };
    if ($('#atuFechar')) $('#atuFechar').onclick = () => d.close();
    if ($('#atuProcurar')) $('#atuProcurar').onclick = async () => {
      try { E.atualizacao = await api('POST', '/api/atualizacao/verificar'); E.atualizacaoAdiada = false; mostrarDialogoAtualizacao(true); } catch (e) { toast(e.message); }
    };
  }
  $('#dlgAtualizacao').addEventListener('cancel', (e) => { if (E.atualizacao?.aplicando || E.reiniciando) e.preventDefault(); else E.atualizacaoAdiada = true; });
  $('#avisoAtualizacao').onclick = () => mostrarDialogoAtualizacao(true);
  $('#versao').onclick = () => mostrarDialogoAtualizacao(true);

  // ------------------------------------------------------------------ desenvolvedor
  async function carregarDev() {
    const raiz = $('#dev'); if (!raiz) return;
    raiz.innerHTML = '<p>Lendo a situação do projeto...</p>';
    let s;
    try { s = await api('GET', '/api/dev/situacao'); } catch (e) { raiz.innerHTML = `<ul class="mensagens"><li class="erro">${esc(e.message)}</li></ul>`; return; }
    const [ma, mi, pa] = s.versao.split('.').map(Number);
    const proxima = { correcao: `${ma}.${mi}.${pa + 1}`, melhoria: `${ma}.${mi + 1}.0` };
    const alt = s.alteracoes || [];
    raiz.innerHTML = `
      ${s.aviso ? `<ul class="mensagens" style="margin-bottom:16px"><li class="erro">${esc(s.aviso)}</li></ul>` : ''}
      <div class="dev-grade">
        <div class="placa">
          <h3 style="margin-top:0">1. Aplicar a versão que o Claude entregou</h3>
          <p style="font-size:15px">Solte aqui o zip do projeto. Os arquivos são trocados pelos do zip; sua chave, a ligação com o GitHub e os dados ficam como estão.</p>
          <label class="soltar" id="devSoltar" tabindex="0"><strong>Solte o zip do projeto aqui</strong>ou clique para escolher<input type="file" id="devZip" accept=".zip" class="sr"></label>
          <ul class="mensagens" id="devZipRes"></ul>
        </div>
        <div class="placa">
          <h3 style="margin-top:0">2. Versão e notas</h3>
          <dl class="campos">
            <dt>Versão</dt><dd><input class="campo porta" id="devVersao" value="${esc(s.versao)}" style="width:10ch">
              <button class="btn peq" data-v="${proxima.correcao}">${proxima.correcao} (correção)</button><button class="btn peq" data-v="${proxima.melhoria}">${proxima.melhoria} (novidade)</button></dd>
          </dl>
          <p style="font-size:14px;color:var(--grafite-2);margin:10px 0 4px">O que muda nesta versão (aparece para o usuário na mensagem de atualização). Uma linha por item, começando com "- ".</p>
          <textarea class="campo" id="devNotas">${esc(s.notas || '')}</textarea>
          <div class="acoes" style="margin-top:10px"><button class="btn" id="devSalvar">Salvar versão e notas</button></div>
          ${s.versaoPublicada ? `<ul class="mensagens"><li>A versão ${esc(s.versao)} já foi publicada. Para os HUBs atualizarem, aumente o número antes de publicar.</li></ul>` : ''}
        </div>
        <div class="placa">
          <h3 style="margin-top:0">3. Publicar no GitHub</h3>
          <dl class="campos">
            <dt>Repositório</dt><dd>${s.urlGithub ? `<a href="${esc(s.urlGithub)}" target="_blank" rel="noopener">${esc(s.urlGithub.replace('https://github.com/', ''))}</a>` : 'não ligado'}</dd>
            <dt>Último registro</dt><dd>${s.ultimoCommit ? `${esc(s.ultimoCommit.mensagem)}, em ${esc(s.ultimoCommit.quando)}` : '—'}</dd>
            <dt>Arquivos alterados</dt><dd>${alt.length}${s.naoEnviados ? `, e ${s.naoEnviados} registro(s) ainda não enviados` : ''}</dd>
            <dt>Chave privada</dt><dd>${s.chaveProtegida ? '<span class="ok-txt">protegida (não vai para o GitHub)</span>' : '<span class="erro-txt">NÃO protegida</span>'}</dd>
          </dl>
          ${alt.length ? `<div class="alteracoes">${alt.slice(0, 200).map((x) => `<div>${esc(x.estado)} ${esc(x.arquivo)}</div>`).join('')}</div>` : ''}
          <p style="font-size:14px;color:var(--grafite-2);margin:12px 0 4px">Descrição do registro</p>
          <input class="campo" id="devMsg" value="HUB ${esc(s.versao)}" style="width:100%">
          <div class="acoes" style="margin-top:10px"><button class="btn prim" id="devPublicar" ${s.repositorio ? '' : 'disabled'}>Publicar versão ${esc(s.versao)}</button>
            ${s.urlGithub ? `<a class="btn" href="${esc(s.urlGithub)}/actions" target="_blank" rel="noopener">Ver no Actions</a><a class="btn" href="${esc(s.urlGithub)}/releases" target="_blank" rel="noopener">Releases</a>` : ''}</div>
          <div class="console" id="devLog" style="height:auto;max-height:240px;margin-top:12px" hidden></div>
        </div>
        <div class="placa">
          <h3 style="margin-top:0">Para o usuário final</h3>
          <p>Ele só precisa do link do <b>HUB-Simuladores.exe</b>, que sempre entrega a versão mais recente:</p>
          ${s.urlGithub ? `<div class="comando"><code id="devLink">${esc(s.urlGithub)}/releases/latest/download/HUB-Simuladores.exe</code><button class="btn peq" id="devCopiar">Copiar</button></div>` : '<p>Disponível depois de ligar o projeto ao GitHub.</p>'}
          <p style="font-size:14px;color:var(--grafite-2)">Quando você publica, os HUBs instalados mostram a mensagem "Vamos atualizar o seu HUB" e o usuário só clica em OK.</p>
          <div class="acoes"><button class="btn" id="devReiniciar">Reiniciar este HUB (para ver mudanças de código)</button></div>
        </div>
      </div>`;
    if (E.devLog?.length) { const lg = $('#devLog'); lg.hidden = false; lg.innerHTML = E.devLog.map((t) => `<div class="${/\[ERRO\]/.test(t) ? 'erro' : ''}">${esc(t)}</div>`).join(''); }
    raiz.querySelectorAll('[data-v]').forEach((b) => b.onclick = () => { $('#devVersao').value = b.dataset.v; $('#devMsg').value = `HUB ${b.dataset.v}`; });
    $('#devSalvar').onclick = async () => {
      try { await api('PUT', '/api/dev/versao', { versao: $('#devVersao').value.trim(), notas: $('#devNotas').value }); toast('Versão e notas salvas.'); carregarDev(); } catch (e) { toast(e.message); }
    };
    const sol = $('#devSoltar');
    ['dragenter', 'dragover'].forEach((t) => sol.addEventListener(t, (e) => { e.preventDefault(); sol.classList.add('ativo'); }));
    ['dragleave', 'drop'].forEach((t) => sol.addEventListener(t, () => sol.classList.remove('ativo')));
    const enviarZipDev = async (arq) => {
      const out = $('#devZipRes'); out.innerHTML = `<li>Aplicando ${esc(arq.name)}...</li>`;
      try {
        const r = await api('POST', '/api/dev/aplicar-zip', undefined, await arq.arrayBuffer());
        out.innerHTML = `<li class="ok">Versão ${esc(r.antes)} → ${esc(r.depois)}: ${r.copiados} arquivos atualizados, ${r.apagados} removidos. Reinicie este HUB para testar as mudanças, ou publique direto.</li>`;
        setTimeout(carregarDev, 1500);
      } catch (e) { out.innerHTML = `<li class="erro">${esc(e.message)}</li>`; }
    };
    sol.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) enviarZipDev(e.dataTransfer.files[0]); });
    $('#devZip').addEventListener('change', (e) => { if (e.target.files[0]) enviarZipDev(e.target.files[0]); e.target.value = ''; });
    $('#devPublicar').onclick = async () => {
      if (s.versaoPublicada && !confirm(`A versão ${s.versao} já foi publicada; os HUBs não vão oferecer atualização. Publicar mesmo assim?`)) return;
      $('#devPublicar').disabled = true; E.devLog = []; const lg = $('#devLog'); lg.hidden = false; lg.innerHTML = '';
      try { await api('POST', '/api/dev/publicar', { mensagem: $('#devMsg').value.trim() }); } catch (e) { lg.innerHTML = `<div class="erro">${esc(e.message)}</div>`; $('#devPublicar').disabled = false; }
    };
    if ($('#devCopiar')) $('#devCopiar').onclick = () => navigator.clipboard.writeText($('#devLink').textContent).then(() => toast('Link copiado.'));
    $('#devReiniciar').onclick = async () => { await api('POST', '/api/dev/reiniciar'); E.reiniciando = true; toast('Reiniciando o HUB...'); };
  }

  // ------------------------------------------------------------------ assistente da primeira execução
  function assistente(passo = 1) {
    const a = $('#assistente');
    const barra = `<div class="assist-passos">${[1, 2, 3].map((n) => `<span class="${n <= passo ? 'feito' : ''}"></span>`).join('')}</div>`;
    if (passo === 1) {
      a.innerHTML = `${barra}<h3 style="font-size:24px">Bem-vindo ao HUB</h3>
        <p>Aqui ficam os simuladores de equipamentos industriais para você treinar a integração com o CLP.</p>
        <ul><li><b>Dispositivos</b>: escolha um equipamento, inicie e abra a tela dele.</li>
        <li><b>Rede virtual</b>: coloca o CLP e cada simulador num IP próprio, no mesmo PC.</li>
        <li><b>Aprender</b>: aulas de Modbus TCP, EtherNet/IP e redes, com exercícios.</li></ul>
        <div class="acoes"><button class="btn prim" data-p="2">Próximo: rede virtual</button></div>`;
    } else if (passo === 2) {
      const r = E.rede;
      const antigas = (r?.windows?.outrasLoopback ? [].concat(r.windows.outrasLoopback) : []).filter((x) => x.conflita);
      a.innerHTML = `${barra}<h3 style="font-size:24px">Rede virtual</h3>
        <p>Para o CODESYS e os simuladores conversarem no mesmo PC, o HUB cria uma placa de rede virtual com estes IPs:</p>
        <table class="tabela">${(r?.plano || []).map((p) => `<tr><td>${esc(p.papel)}</td><td class="mono">${esc(p.ip)}</td><td>${p.existe ? '<span class="ok-txt">já existe</span>' : 'será criado'}</td></tr>`).join('')}</table>
        ${antigas.length ? `<p>Encontrei placas antigas dos simuladores na mesma faixa (${antigas.map((x) => esc(x.nome)).join(', ')}). A migração remove essas placas e passa tudo para a placa do HUB.</p>` : ''}
        <p style="font-size:14px;color:var(--grafite-2)">Isso pede permissão de administrador uma única vez. Também libera as portas no firewall.</p>
        <ul class="mensagens" id="assistMsgs"></ul>
        <div class="acoes">${r?.pronta && !antigas.length ? '<button class="btn prim" data-p="3">A rede já está pronta: continuar</button>'
          : `<button class="btn rede" id="assistCriar">${antigas.length ? 'Migrar e criar a rede' : 'Criar a rede agora'}</button><button class="btn" data-p="3">Fazer depois</button>`}</div>`;
      const b = $('#assistCriar');
      if (b) b.onclick = async () => {
        b.disabled = true; $('#assistMsgs').innerHTML = '<li>Aguardando a permissão de administrador...</li>';
        try {
          const r2 = await api('POST', '/api/rede/aplicar', { acao: antigas.length ? 'migrar' : 'criar' });
          await carregarRede(false);
          if (r2.ok) return assistente(3);
          $('#assistMsgs').innerHTML = [...(r2.mensagens || []).slice(-4).map((t) => `<li class="erro">${esc(t)}</li>`),
            r2.precisaTerminal ? `<li><div class="comando"><code>${esc(r2.comando)}</code></div></li>` : ''].join('');
        } catch (e) { $('#assistMsgs').innerHTML = `<li class="erro">${esc(e.message)}</li>`; }
        b.disabled = false;
      };
    } else {
      a.innerHTML = `${barra}<h3 style="font-size:24px">Tudo pronto</h3>
        <p>Em Dispositivos, clique num equipamento e em <b>Iniciar</b>. O IP dele aparece no cartão; use esse IP no seu CLP.</p>
        <p>Se for a primeira vez com EtherNet/IP, comece pela aula <a href="#/aprender/laboratorio" data-fim>Como o laboratório funciona</a>.</p>
        <div class="acoes"><button class="btn prim" data-fim>Ir para a bancada</button></div>`;
    }
    a.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => assistente(+b.dataset.p));
    a.querySelectorAll('[data-fim]').forEach((b) => b.addEventListener('click', concluirAssistente));
  }
  async function concluirAssistente(e) {
    if (e?.currentTarget?.tagName === 'BUTTON') location.hash = '#/bancada';
    $('#dlgAssistente').close();
  }
  $('#dlgAssistente').addEventListener('close', () => { api('PUT', '/api/config', { primeiraConfigFeita: true }).catch(() => {}); });

  // ------------------------------------------------------------------ rotas
  function rota() {
    const [, vista = 'bancada', arg] = (location.hash || '#/bancada').split('/');
    let v = ['bancada', 'rede', 'aprender', 'adicionar', 'dev'].includes(vista) ? vista : 'bancada';
    if (!E.dev && (v === 'adicionar' || v === 'dev')) v = 'bancada';
    document.querySelectorAll('.vista').forEach((s) => { s.hidden = s.id !== `v-${v}`; });
    document.querySelectorAll('.abas a').forEach((a) => { if (a.dataset.vista === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (v === 'rede') carregarRede();
    if (v === 'aprender') abrirAula(arg && decodeURIComponent(arg));
    if (v === 'bancada' && E.estado) renderBancada();
    if (v === 'dev') carregarDev();
  }
  window.addEventListener('hashchange', rota);

  (async function iniciar() {
    try {
      await carregarAulas();
      await carregar();
      conectarEventos();
      rota();
      await carregarRede(location.hash.startsWith('#/rede'));
      if (!E.estado.config.primeiraConfigFeita) { assistente(1); $('#dlgAssistente').showModal(); }
      try {
        const de = sessionStorage.getItem('hubAtualizadoDe');
        if (de && de !== E.estado.hub.versao) { sessionStorage.removeItem('hubAtualizadoDe'); toast(`HUB atualizado para a versão ${E.estado.hub.versao}.`); }
      } catch (_) { /* sem sessão */ }
    } catch (e) {
      document.querySelector('main').innerHTML = `<div class="placa"><h2>Não consegui falar com o HUB</h2><p>${esc(e.message)}</p><p>Confira se a janela do HUB continua aberta.</p></div>`;
    }
  })();
})();
