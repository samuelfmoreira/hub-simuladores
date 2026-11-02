/* Assistente de comunicação com o CLP (componente comum ao CFW500 e ao SCA06).
 *
 * Percorre, na ordem em que um técnico faria em campo, as etapas para o equipamento conversar com o
 * CLP pela rede: cada etapa explica o porquê, mostra "valor atual → valor novo" de cada parâmetro e
 * como seria na HMI, e grava parâmetro por parâmetro (a HMI do equipamento mostra cada gravação).
 * Dois ritmos: passo a passo (o aluno lê e grava cada etapa) ou "fazer tudo".
 *
 * Uso: AssistenteCLP.abrir({
 *   titulo, subtitulo,
 *   modos: [{ id, nome, texto }]            (opcional: escolha antes das etapas)
 *   etapas(modo) -> [{ titulo, porque, hmi, itens: [{ n, v, nome, faz }] }],
 *   ler(n) -> valor atual,  gravar(n, v) -> Promise<{ ok, msg }>,
 *   fmt(n, v) -> texto do valor (opcional),  bloqueio() -> texto | null (opcional),
 *   resumo(modo) -> html do "o que configurar no CLP"
 * });
 */
(function () {
  'use strict';
  const CSS = `
  dialog.aclp { width: min(900px, 95vw); max-height: 92vh; border: 0; border-radius: 12px; padding: 0; background: #1E2327; color: #E6EAE7;
    font: 15px/1.45 'Barlow', system-ui, sans-serif; box-shadow: 0 18px 60px rgba(0,0,0,.55); }
  dialog.aclp::backdrop { background: rgba(10,12,14,.6); }
  .aclp * { box-sizing: border-box; }
  .aclp-cab { display: flex; align-items: flex-start; gap: 12px; padding: 16px 20px 12px; border-bottom: 1px solid #343B40; }
  .aclp-cab h2 { margin: 0; font: 600 22px/1.15 'Barlow Condensed', 'Arial Narrow', sans-serif; }
  .aclp-cab p { margin: 2px 0 0; color: #A7B0B3; font-size: 14px; }
  .aclp-x { margin-left: auto; background: none; border: 1px solid #485055; color: #E6EAE7; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
  .aclp-trilha { display: flex; gap: 6px; flex-wrap: wrap; padding: 12px 20px 0; }
  .aclp-trilha span { font-size: 12.5px; padding: 3px 10px; border-radius: 999px; background: #2A3136; color: #A7B0B3; border: 1px solid #3A4247; }
  .aclp-trilha span.atual { background: #2E5D8C; color: #fff; border-color: #2E5D8C; }
  .aclp-trilha span.feita { background: #1F4D33; color: #BFE8CC; border-color: #2C6B47; }
  .aclp-corpo { padding: 14px 20px; overflow: auto; max-height: calc(92vh - 190px); }
  .aclp-corpo h3 { margin: 0 0 6px; font: 600 20px/1.2 'Barlow Condensed', 'Arial Narrow', sans-serif; }
  .aclp-porque { margin: 0 0 12px; }
  .aclp table { width: 100%; border-collapse: collapse; font-size: 14px; margin: 4px 0 12px; }
  .aclp th, .aclp td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #343B40; vertical-align: top; }
  .aclp th { color: #A7B0B3; font-weight: 600; font-size: 12.5px; text-transform: uppercase; letter-spacing: .03em; }
  .aclp td.pn { font: 600 14px ui-monospace, Consolas, monospace; white-space: nowrap; }
  .aclp td.val { font-family: ui-monospace, Consolas, monospace; white-space: nowrap; }
  .aclp td.st { width: 120px; font-size: 13px; color: #A7B0B3; }
  .aclp tr.gravando td { background: #2B3A48; }
  .aclp tr.ok td.st { color: #7FD69B; }
  .aclp tr.igual td.st { color: #9FC4AE; }
  .aclp tr.erro td.st { color: #FF8A80; }
  .aclp-hmi { border-left: 4px solid #C98A2B; background: #262C30; padding: 8px 12px; border-radius: 6px; font-size: 14px; }
  .aclp-hmi b { color: #F0C27A; }
  .aclp-aviso { margin: 10px 0 0; padding: 8px 12px; border-radius: 6px; background: #4A2A27; color: #FFD0CB; font-size: 14px; }
  .aclp-ok { margin: 10px 0 0; padding: 8px 12px; border-radius: 6px; background: #1F4D33; color: #CFF1DA; font-size: 14px; }
  .aclp-modos { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
  .aclp-modos button { text-align: left; padding: 12px 14px; border-radius: 8px; border: 1px solid #485055; background: #262C30; color: #E6EAE7; cursor: pointer; font: inherit; }
  .aclp-modos button:hover { border-color: #5B8FC2; }
  .aclp-modos b { display: block; font-size: 16px; margin-bottom: 4px; }
  .aclp-rodape { display: flex; gap: 8px; align-items: center; padding: 12px 20px 16px; border-top: 1px solid #343B40; flex-wrap: wrap; }
  .aclp-rodape .esp { flex: 1; }
  .aclp-b { font: 600 14px 'Barlow', system-ui, sans-serif; padding: 8px 14px; border-radius: 6px; border: 1px solid #485055; background: #2A3136; color: #E6EAE7; cursor: pointer; }
  .aclp-b.prim { background: #2E6FB0; border-color: #2E6FB0; color: #fff; }
  .aclp-b:disabled { opacity: .45; cursor: default; }
  .aclp-resumo table td:first-child { color: #A7B0B3; width: 38%; }
  `;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pn = (n) => 'P' + String(n).padStart(4, '0');
  const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

  function abrir(cfg) {
    if (!document.getElementById('aclpCss')) { const st = document.createElement('style'); st.id = 'aclpCss'; st.textContent = CSS; document.head.appendChild(st); }
    let dlg = document.getElementById('aclpDlg');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'aclpDlg'; dlg.className = 'aclp'; document.body.appendChild(dlg); }
    const fmt = cfg.fmt || ((n, v) => String(v));
    const E = { modo: null, etapas: [], i: 0, feitas: new Set(), linhas: {}, ocupado: false, tudo: false, aviso: '', fim: false };
    if (!cfg.modos || cfg.modos.length < 2) { E.modo = cfg.modos && cfg.modos[0] ? cfg.modos[0].id : null; E.etapas = cfg.etapas(E.modo); }

    function cabecalho() {
      return `<div class="aclp-cab"><div><h2>${esc(cfg.titulo)}</h2><p>${esc(cfg.subtitulo || '')}</p></div>
        <button class="aclp-x" data-a="fechar" aria-label="Fechar o assistente">Fechar</button></div>`;
    }
    function trilha() {
      if (!E.etapas.length) return '';
      return `<div class="aclp-trilha">${E.etapas.map((et, k) => `<span class="${E.fim ? 'feita' : k === E.i ? 'atual' : E.feitas.has(k) ? 'feita' : ''}">${k + 1}. ${esc(et.titulo)}</span>`).join('')}
        <span class="${E.fim ? 'atual' : ''}">✓ No CLP</span></div>`;
    }
    function telaModos() {
      return `${cabecalho()}<div class="aclp-corpo"><h3>O que você vai comandar pela rede?</h3>
        <p class="aclp-porque">A configuração muda conforme o modo. Escolha um para ver as etapas.</p>
        <div class="aclp-modos">${cfg.modos.map((m) => `<button data-modo="${esc(m.id)}"><b>${esc(m.nome)}</b>${esc(m.texto)}</button>`).join('')}</div></div>
        <div class="aclp-rodape"><span class="esp"></span><button class="aclp-b" data-a="fechar">Cancelar</button></div>`;
    }
    function telaEtapa() {
      const et = E.etapas[E.i], feita = E.feitas.has(E.i), ult = E.i === E.etapas.length - 1;
      const linhas = et.itens.map((it, k) => {
        const atual = cfg.ler(it.n);
        const marca = E.linhas[E.i + ':' + k];   // 'ok' (gravado) ou 'igual' (já estava assim)
        return `<tr id="aclpL${k}" class="${marca || ''}"><td class="pn">${pn(it.n)}</td><td>${esc(it.nome)}<br><small style="color:#A7B0B3">${esc(it.faz)}</small></td>
          <td class="val">${esc(atual === undefined ? '—' : fmt(it.n, atual))}</td><td class="val"><b>${esc(fmt(it.n, it.v))}</b></td>
          <td class="st">${marca === 'ok' ? '✓ gravado' : marca === 'igual' ? '✓ já estava assim' : ''}</td></tr>`;
      }).join('');
      return `${cabecalho()}${trilha()}<div class="aclp-corpo">
        <h3>Etapa ${E.i + 1} de ${E.etapas.length}: ${esc(et.titulo)}</h3>
        <p class="aclp-porque">${et.porque}</p>
        <table><thead><tr><th>Parâmetro</th><th>O que faz</th><th>Atual</th><th>Novo</th><th></th></tr></thead><tbody>${linhas}</tbody></table>
        <div class="aclp-hmi"><b>Como seria na HMI:</b> ${et.hmi}</div>
        ${E.aviso ? `<div class="aclp-aviso">${E.aviso}</div>` : feita ? `<div class="aclp-ok">Etapa gravada. ${ult ? 'Falta só ver o que configurar no CLP.' : 'Siga para a próxima.'}</div>` : ''}
        </div>
        <div class="aclp-rodape">
          <button class="aclp-b" data-a="voltar" ${E.i === 0 && !(cfg.modos && cfg.modos.length > 1) ? 'disabled' : ''}>Voltar</button>
          <span class="esp"></span>
          <button class="aclp-b" data-a="tudo" ${E.ocupado ? 'disabled' : ''} title="Grava esta etapa e as seguintes, uma depois da outra">Fazer tudo</button>
          ${feita ? `<button class="aclp-b prim" data-a="proxima" ${E.ocupado ? 'disabled' : ''}>${ult ? 'Ver o que configurar no CLP' : 'Próxima etapa'}</button>`
            : `<button class="aclp-b prim" data-a="gravar" ${E.ocupado ? 'disabled' : ''}>Gravar esta etapa</button>`}
        </div>`;
    }
    function telaFim() {
      return `${cabecalho()}${trilha()}<div class="aclp-corpo aclp-resumo"><h3>Pronto. Agora, no CLP:</h3>${cfg.resumo(E.modo)}</div>
        <div class="aclp-rodape"><button class="aclp-b" data-a="voltar">Voltar</button><span class="esp"></span><button class="aclp-b prim" data-a="fechar">Concluir</button></div>`;
    }
    function desenhar() {
      const escolher = cfg.modos && cfg.modos.length > 1 && !E.modo;   // só o SCA06 tem escolha de modo
      dlg.innerHTML = escolher ? telaModos() : E.fim ? telaFim() : telaEtapa();
      dlg.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => acao(b.dataset.a); });
      dlg.querySelectorAll('[data-modo]').forEach((b) => { b.onclick = () => { E.modo = b.dataset.modo; E.etapas = cfg.etapas(E.modo); E.i = 0; E.feitas.clear(); E.linhas = {}; E.fim = false; desenhar(); }; });
    }
    async function gravarEtapa() {
      const bloq = cfg.bloqueio ? cfg.bloqueio() : null;
      if (bloq) { E.aviso = bloq; desenhar(); return false; }
      E.aviso = ''; E.ocupado = true; desenhar();
      const et = E.etapas[E.i];
      for (let k = 0; k < et.itens.length; k++) {
        const it = et.itens[k], tr = dlg.querySelector('#aclpL' + k), st = tr && tr.querySelector('.st');
        if (tr) tr.className = 'gravando';
        if (st) st.textContent = 'gravando…';
        if (cfg.ler(it.n) === it.v) {
          await dorme(350);
          if (tr) tr.className = 'igual'; if (st) st.textContent = '✓ já estava assim';
          E.linhas[E.i + ':' + k] = 'igual';
          continue;
        }
        let r;
        try { r = await cfg.gravar(it.n, it.v); } catch (e) { r = { ok: false, msg: e.message }; }
        await dorme(450);
        if (!r || !r.ok) {
          if (tr) tr.className = 'erro'; if (st) st.textContent = '✕ recusado';
          E.aviso = `${pn(it.n)} não foi gravado: ${esc((r && r.msg) || 'erro')}.`; E.ocupado = false; E.tudo = false; desenhar(); return false;
        }
        if (tr) { tr.className = 'ok'; tr.querySelector('td:nth-child(3)').textContent = fmt(it.n, cfg.ler(it.n) ?? it.v); }
        if (st) st.textContent = '✓ gravado';
        E.linhas[E.i + ':' + k] = 'ok';
      }
      E.feitas.add(E.i); E.ocupado = false; desenhar(); return true;
    }
    async function acao(a) {
      if (a === 'fechar') { if (!E.ocupado) { E.tudo = false; dlg.close(); } return; }
      if (E.ocupado) return;
      if (a === 'voltar') { E.aviso = ''; if (E.fim) E.fim = false; else if (E.i > 0) E.i--; else if (cfg.modos && cfg.modos.length > 1) E.modo = null; desenhar(); return; }
      if (a === 'gravar') { await gravarEtapa(); return; }
      if (a === 'proxima') { E.aviso = ''; if (E.i < E.etapas.length - 1) E.i++; else E.fim = true; desenhar(); return; }
      if (a === 'tudo') {
        E.tudo = true;
        while (E.tudo) {
          if (!E.feitas.has(E.i)) { const ok = await gravarEtapa(); if (!ok) return; }
          await dorme(700);
          if (E.i < E.etapas.length - 1) { E.i++; desenhar(); await dorme(500); } else { E.fim = true; E.tudo = false; desenhar(); }
        }
      }
    }
    dlg.oncancel = (e) => { if (E.ocupado) e.preventDefault(); else E.tudo = false; };   // Esc não interrompe uma gravação
    desenhar();
    if (!dlg.open) dlg.showModal();
  }
  window.AssistenteCLP = { abrir };
})();
