// Módulo de visualização e configuração do transmissor: quatro teclas [ESC] [+] [->] [OK] e a árvore de menus do manual.
// Máquina de estados pura (sem tela): a página desenha o que tela() devolve, e os testes (tools/teste.js) apertam as teclas.
//
// Fontes: manual de operação 28775-EN, capítulo 6 (função das teclas, procedimentos e opções) e guia rápido 51852-PT,
// capítulo 5.3 (plano de menus e nomes em português). Textos em pares [português, inglês].
// Do simulador, por não constarem nesses documentos: os nomes em português das opções de sólidos, das formas de
// reservatório além de "Tanque de armazenamento", das curvas de linearização, dos valores exibidos além de "Escalado",
// as opções "Atualizar" e "Apagar" da supressão e a segunda apresentação do valor medido (com barra).
// Não simulados (aparecem no menu e respondem "Não simulado"): zoom da curva, curva de tendência, copiar dados e PIN.

export const MENUS = [
  { nome: ['Ajuste básico', 'Basic adjustment'], itens: [
    { tipo: 'cal', nome: ['Calibrar mín.', 'Min. adjustment'], pct: 'calMinPct', dist: 'calMin' },
    { tipo: 'cal', nome: ['Calibração Máx.', 'Max. adjustment'], pct: 'calMaxPct', dist: 'calMax' },
    { tipo: 'lista', nome: ['Produto', 'Medium'], par: 'meio', opcoes: [['Líquido', 'Liquid'], ['Sólido: pó/poeira', 'Solid: Powder/Dust'], ['Sólido: granulado', 'Solid: Granular/Pellets'], ['Sólido: brita/seixo', 'Solid: Ballast/Pebbels']] },
    { tipo: 'lista', nome: ['Forma do reservatório', 'Vessel form'], par: 'forma', opcoes: [['Tanque de armazenamento', 'Storage tank'], ['Tubo tranquilizador', 'Stilling tube'], ['Reservatório aberto', 'Open vessel'], ['Reservatório com agitador', 'Stirred vessel'], ['Silo', 'Silo'], ['Bunker', 'Bunker']] },
    { tipo: 'num', nome: ['Atenuação', 'Damping'], par: 'atenuacao', int: 3, dec: 0, un: 's' },
    { tipo: 'lista', nome: ['Curva de linearização', 'Linearisation curve'], par: 'linearizacao', opcoes: [['Linear', 'Linear'], ['Cilindro deitado', 'Horiz. cylinder'], ['Tanque esférico', 'Spherical tank']] },
    { tipo: 'tag', nome: ['TAG do sensor', 'Sensor-TAG'] },
  ] },
  { nome: ['Display', 'Display'], itens: [
    { tipo: 'lista', nome: ['Valor exibido', 'Displayed value'], par: 'valorExibido', opcoes: [['Altura', 'Height'], ['Distância', 'Distance'], ['Corrente', 'Current'], ['Escalado', 'Scaled'], ['Percentual', 'Percent'], ['Percentual lin.', 'Lin. percent']] },
    { tipo: 'lista', nome: ['Unidade de leitura', 'Display unit'], par: 'unidadeEscala', opcoes: [['Volume  m³', 'Volume  m³'], ['Volume  l', 'Volume  l'], ['Altura  m', 'Height  m'], ['Sem unidade', 'Without unit']] },
    { tipo: 'escala', nome: ['Escalação', 'Scaling'] },
    { tipo: 'lista', nome: ['Iluminação', 'Backlight'], par: 'luz', opcoes: [['Desligado', 'Switched off'], ['Ligado', 'Switched on']] },
  ] },
  { nome: ['Diagnóstico', 'Diagnostics'], itens: [
    { tipo: 'picos', nome: ['Indicador de valor de pico', 'Peak value indicator'] },
    { tipo: 'confiab', nome: ['Segurança de medição', 'Meas. reliability'] },
    { tipo: 'lista', nome: ['Seleção de curva', 'Curve selection'], local: 'curvaSel', opcoes: [['Curva do eco', 'Echo curve'], ['Curva de sinais falsos', 'False echo curve'], ['Curva de tendência', 'Trend curve']] },
    { tipo: 'curva', nome: ['Curva do eco', 'Echo curve'] },
  ] },
  { nome: ['Serviço', 'Service'], itens: [
    { tipo: 'supressao', nome: ['Supressão de sinais de interferência', 'False signal suppression'] },
    { tipo: 'lista', nome: ['Ajuste avançado', 'Extended setting'], par: 'ajusteEstendido', opcoes: [['Nenhum', 'None'], ['Variação rápida de nível', 'Quick level change']] },
    { tipo: 'corrente', nome: ['Saída de corrente', 'Current output'] },
    { tipo: 'simulacao', nome: ['Simulação', 'Simulation'] },
    { tipo: 'reset', nome: ['Reset', 'Reset'] },
    { tipo: 'fixo', nome: ['Unidade de calibração', 'Unit of measurement'], linhas: [['m(d) ▸', 'm(d) ▸']] },
    { tipo: 'lista', nome: ['Idioma', 'Language'], par: 'idioma', opcoes: [['Português', 'Português'], ['English', 'English']] },
    { tipo: 'lista', nome: ['SIL', 'SIL'], par: 'sil', opcoes: [['Não ativado', 'Not activated'], ['Ativado', 'Activated']] },
    { tipo: 'lista', nome: ['Modo operacional HART', 'HART mode'], par: 'hartMulti', opcoes: [['Padrão  Endereço 0', 'Standard  Address 0'], ['Multidrop', 'Multidrop']] },
    { tipo: 'nao', nome: ['Copiar dados do sensor', 'Copy sensor data'], pergunta: ['Copiar dados do sensor?', 'Copy sensor data?'] },
    { tipo: 'nao', nome: ['PIN', 'PIN'], pergunta: ['Ativar agora?', 'Enable?'] },
  ] },
  { nome: ['Info', 'Info'], itens: [
    { tipo: 'fixo', nome: ['Tipo de dispositivo', 'Instrument type'], linhas: [['VEGASON 61', 'VEGASON 61'], ['Número de série', 'Serial number'], ['12345678', '12345678']] },
    { tipo: 'fixo', nome: ['Data de calibração', 'Date of manufacture'], linhas: [['(simulador)', '(simulator)'], ['Versão do software', 'Software version'], ['3.50', '3.50']] },
    { tipo: 'fixo', nome: ['Última alteração através do PC', 'Last change using PC'], linhas: [['—', '—']] },
    { tipo: 'carac', nome: ['Características do sensor', 'Sensor characteristics'], pergunta: ['Exibir agora?', 'Display now?'] },
  ] },
];
const FALHA = { opcoes: [['Manter valor', 'Hold value'], ['20.5 mA', '20.5 mA'], ['22 mA', '22 mA'], ['< 3.6 mA', '< 3.6 mA']], valores: [1, 2, 3, 0] };   // ordem do menu -> valor interno
const CARAC = [['4-20 mA', '4-20 mA'], ['20-4 mA', '20-4 mA']], IMIN = [['3.8 mA', '3.8 mA'], ['4 mA', '4 mA']], IMAX = [['20 mA', '20 mA'], ['20.5 mA', '20.5 mA']];
const UNIDADES = ['m³', 'l', 'm', ''];
const X = {
  alterar: ['Alterar agora?', 'Change now?'], iniciarSim: ['Iniciar a simulação?', 'Start simulation?'], selReset: ['Selecionar reset?', 'Select reset?'],
  criar: ['Criar novo', 'Create new'], atualizar: ['Atualizar', 'Update'], apagar: ['Apagar', 'Delete'],
  distProduto: ['Distância até o produto', 'Sounded distance'], salvos: ['Sinais falsos salvos', 'False signals saved'], apagados: ['Sinais falsos apagados', 'False signals deleted'],
  pegouNivel: ['ATENÇÃO: o nível foi salvo como sinal falso', 'WARNING: level saved as false signal'],
  percentual: ['Percentual', 'Percent'], corrente: ['Corrente', 'Current'], simCurso: ['Simulação em curso', 'Simulation running'], escSair: ['[ESC] encerra', '[ESC] to stop'],
  rBasico: ['Reset', 'Reset'], rFabrica: ['Ajuste de fábrica', 'Default setting'], rPicos: ['Indicador de valor de pico', 'Peak value indicator'],
  resetAgora: ['Executar reset agora?', 'Reset now?'], resetFeito: ['Reset executado', 'Reset done'],
  nao: ['Não simulado', 'Not simulated'], semValor: ['Sem valor de medição', 'No measured value available'], spanPequeno: ['Faixa de calibração muito pequena', 'Adjustment span too small'],
  status: ['Status do dispositivo', 'Sensor status'], dMin: ['Distância mín.:', 'Distance min.:'], dMax: ['Distância máx.:', 'Distance max.:'], tMin: ['Tmín.:', 'T-min.:'], tMax: ['Tmáx.:', 'T-max.:'],
  carac: ['Curva característica:', 'Characteristics:'], modoFalha: ['Modo de falha:', 'Fail.mode:'], iMin: ['Corrente mín.:', 'Min. current:'], iMax: ['Corrente máx.:', 'Max. current:'],
  simulando: ['SIMULAÇÃO', 'SIMULATION'], multidrop: ['Multidrop: 4 mA fixos', 'Multidrop: fixed 4 mA'],
};
const CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';
const SESSENTA_MIN = 60 * 60 * 1000;

export function criarModulo({ enviar, estado, agora = () => Date.now() }) {
  const s = { tela: 'home', m: 0, i: 0, ed: null, fluxo: null, aviso: null, apres: 0, curvaSel: 0, tUlt: agora(), tManter: 0 };
  const E = () => estado();
  const L = () => (E().par.idioma ? 1 : 0);
  const t = (par) => par[L()];
  const f = (v, n) => Number(v).toFixed(n);
  const par = (id, v) => enviar({ tipo: 'param', id, v });
  const avisar = (...linhas) => { s.aviso = linhas; };
  const falhou = (r) => { if (r && r.ok === false) { avisar(r.erro || 'erro'); return true; } return false; };

  // ---------------------------------------------------------------- editores
  function edNum({ titulo, num, valor, int, dec, un, antes = [], depois = [], aoSalvar }) {
    const txt = Math.max(0, Number(valor) || 0).toFixed(dec).padStart(int + (dec ? dec + 1 : 0), '0');
    s.ed = { tipo: 'num', chars: txt.split(''), pos: 0, un, titulo, num, antes, depois, aoSalvar };
  }
  function edLista({ titulo, num, itens, sel, aoSalvar }) { s.ed = { tipo: 'lista', itens, sel: Math.max(0, sel), titulo, num, aoSalvar }; }
  function edTexto({ titulo, num, valor, aoSalvar }) { s.ed = { tipo: 'texto', chars: String(valor).toUpperCase().padEnd(12, ' ').slice(0, 12).split(''), pos: 0, titulo, num, aoSalvar }; }
  const digitos = (ed) => ed.chars.map((c, k) => (c === '.' ? -1 : k)).filter((k) => k >= 0);

  async function teclaEdicao(k) {
    const ed = s.ed;
    if (k === 'esc') { s.ed = null; return; }                        // valor não confirmado com [OK] não é salvo
    if (ed.tipo === 'lista') {
      if (k === 'mais' || k === 'seta') ed.sel = (ed.sel + 1) % ed.itens.length;
      else if (k === 'ok') { s.ed = null; await ed.aoSalvar(ed.sel); }
      return;
    }
    const pos = ed.tipo === 'num' ? digitos(ed) : ed.chars.map((_, k2) => k2);
    if (k === 'seta') ed.pos = (ed.pos + 1) % pos.length;
    else if (k === 'mais') {
      const ix = pos[ed.pos];
      if (ed.tipo === 'num') ed.chars[ix] = String((Number(ed.chars[ix]) + 1) % 10);
      else ed.chars[ix] = CHARS[(Math.max(0, CHARS.indexOf(ed.chars[ix])) + 1) % CHARS.length];
    } else if (k === 'ok') { s.ed = null; await ed.aoSalvar(ed.tipo === 'num' ? parseFloat(ed.chars.join('')) : ed.chars.join('').trimEnd()); }
  }

  // ---------------------------------------------------------------- [OK] sobre um item do menu
  async function abrir(it, num) {
    const P = E().par, titulo = t(it.nome);
    if (it.tipo === 'cal') {
      const linhaD = () => ({ t: `${f(E().par[it.dist], 3)} m(d)` }), linhaP = () => ({ t: `${f(E().par[it.pct], 2)} %` });
      edNum({ titulo, num, valor: P[it.pct], int: 3, dec: 2, un: '%', depois: [{ t: '=' }, linhaD()], aoSalvar: async (v) => {
        if (falhou(await par(it.pct, v))) return;
        edNum({ titulo, num, valor: E().par[it.dist], int: 1, dec: 3, un: 'm(d)', antes: [linhaP(), { t: '=' }], aoSalvar: async (v2) => { falhou(await par(it.dist, v2)); } });
      } });
    } else if (it.tipo === 'lista') {
      const atual = it.local ? s[it.local] : P[it.par];
      edLista({ titulo, num, itens: it.opcoes.map(t), sel: atual, aoSalvar: async (ix) => { if (it.local) s[it.local] = ix; else falhou(await par(it.par, ix)); } });
    } else if (it.tipo === 'num') edNum({ titulo, num, valor: P[it.par], int: it.int, dec: it.dec, un: it.un, aoSalvar: async (v) => { falhou(await par(it.par, v)); } });
    else if (it.tipo === 'tag') edTexto({ titulo, num, valor: E().tag, aoSalvar: async (v) => { falhou(await enviar({ tipo: 'tag', v })); } });
    else if (it.tipo === 'escala') {
      const un = UNIDADES[P.unidadeEscala];
      edNum({ titulo, num, valor: P.escala0, int: 4, dec: 1, un, antes: [{ t: '0 % =' }], aoSalvar: async (v) => {
        if (falhou(await par('escala0', v))) return;
        edNum({ titulo, num, valor: E().par.escala100, int: 4, dec: 1, un, antes: [{ t: '100 % =' }], aoSalvar: async (v2) => { falhou(await par('escala100', v2)); } });
      } });
    } else if (it.tipo === 'corrente') {
      const lista = (rot, opc, sel, salvar, prox) => edLista({ titulo: `${titulo} · ${t(rot)}`, num, itens: opc.map(t), sel, aoSalvar: async (ix) => { if (falhou(await salvar(ix))) return; if (prox) prox(); } });
      const falhas = FALHA.valores.map((v, k) => ({ v, k })).filter((o) => !(E().par.sil && (o.v === 1 || o.v === 2)));      // SIL bloqueia Manter valor e 20.5 mA
      lista(X.carac, CARAC, P.caracteristica, (ix) => par('caracteristica', ix), () =>
        edLista({ titulo: `${titulo} · ${t(X.modoFalha)}`, num, itens: falhas.map((o) => t(FALHA.opcoes[o.k])), sel: falhas.findIndex((o) => o.v === E().par.modoFalha), aoSalvar: async (ix) => {
          if (falhou(await par('modoFalha', falhas[ix].v))) return;
          lista(X.iMin, IMIN, E().par.iMinSel, (i2) => par('iMinSel', i2), () => lista(X.iMax, IMAX, E().par.iMaxSel, (i3) => par('iMaxSel', i3), null));
        } }));
    } else if (it.tipo === 'supressao') {
      edLista({ titulo, num, itens: [t(X.criar), t(X.atualizar), t(X.apagar)], sel: 0, aoSalvar: async (ix) => {
        if (ix === 2) { if (!falhou(await enviar({ tipo: 'supressao', acao: 'apagar' }))) avisar(t(X.apagados)); return; }
        edNum({ titulo, num, valor: E().med.D, int: 1, dec: 3, un: 'm(d)', antes: [{ t: t(X.distProduto), p: true }], aoSalvar: async (v) => {
          const r = await enviar({ tipo: 'supressao', acao: ix === 1 ? 'atualizar' : 'criar', dist: v });
          if (falhou(r)) return;
          if (r.pegouNivel) avisar(`${t(X.salvos)}: ${r.n}`, t(X.pegouNivel)); else avisar(`${t(X.salvos)}: ${r.n}`);
        } });
      } });
    } else if (it.tipo === 'simulacao') {
      edLista({ titulo, num, itens: [t(X.percentual), t(X.corrente)], sel: 0, aoSalvar: async (ix) => {
        const mA = ix === 1;
        edNum({ titulo, num, valor: mA ? E().med.mA : Math.min(100, Math.max(0, E().med.pct)), int: mA ? 2 : 3, dec: mA ? 2 : 1, un: mA ? 'mA' : '%', aoSalvar: async (v) => {
          if (!falhou(await enviar({ tipo: 'simular', modo: mA ? 'mA' : 'pct', v }))) s.fluxo = { tipo: 'sim', titulo, num };
        } });
      } });
    } else if (it.tipo === 'reset') {
      edLista({ titulo, num, itens: [t(X.rBasico), t(X.rFabrica), t(X.rPicos)], sel: 0, aoSalvar: async (ix) => {
        s.fluxo = { tipo: 'confirma', titulo, num, texto: [['Reset', 'Reset'], X.rFabrica, X.rPicos][ix], sim: async () => { if (!falhou(await enviar({ tipo: 'reset', qual: ['basico', 'fabrica', 'picos'][ix] }))) avisar(t(X.resetFeito)); } };
      } });
    } else if (it.tipo === 'carac') s.fluxo = { tipo: 'carac', titulo, num };
    else if (it.tipo === 'nao' || it.tipo === 'curva') avisar(t(X.nao));
    // 'picos', 'confiab' e 'fixo' só mostram
  }

  // ---------------------------------------------------------------- teclas: 'ok' | 'seta' | 'mais' | 'esc'
  async function tecla(k) {
    s.tUlt = agora();
    if (E().med.status === 'desligado') return;                       // sem o laço, o módulo está apagado
    if (E().med.sim && agora() - s.tManter > 4000) { s.tManter = agora(); enviar({ tipo: 'simular', modo: 'manter' }); }   // a simulação conta 10 min desde a última tecla
    if (s.aviso) { s.aviso = null; return; }
    if (s.ed) return teclaEdicao(k);
    if (s.fluxo) {
      const fl = s.fluxo;
      if (fl.tipo === 'sim') { if (k === 'esc') { s.fluxo = null; await enviar({ tipo: 'simular', modo: 'parar' }); } return; }
      if (fl.tipo === 'confirma') { s.fluxo = null; if (k === 'ok') await fl.sim(); return; }
      s.fluxo = null; return;
    }
    if (s.tela === 'home') { if (k === 'ok') s.tela = 'menu'; else if (k === 'seta') s.apres = (s.apres + 1) % 2; return; }
    if (s.tela === 'menu') {
      if (k === 'seta') s.m = (s.m + 1) % MENUS.length; else if (k === 'ok') { s.tela = 'item'; s.i = 0; } else if (k === 'esc') s.tela = 'home';
      return;
    }
    const itens = MENUS[s.m].itens;
    if (k === 'esc') s.tela = 'menu';
    else if (k === 'seta') s.i = (s.i + 1) % itens.length;
    else if (k === 'ok') await abrir(itens[s.i], `${s.m + 1}.${s.i + 1}`);
  }

  // ---------------------------------------------------------------- o valor da tela de medição
  function valorPrincipal() {
    const e = E(), m = e.med, P = e.par;
    if (m.status === 'desligado') return { apagado: true, valor: '', un: '' };
    if (m.status === 'falha') return { erro: m.erro, texto: t(m.erro === 'E017' ? X.spanPequeno : X.semValor), valor: m.erro, un: '' };
    const v = [[f(m.altura, 3), 'm'], [f(m.D, 3), 'm(d)'], [f(m.mA, 2), 'mA'], [f(m.escalado, 1), UNIDADES[P.unidadeEscala]], [f(m.pctNivel, 1), '%'], [f(m.pct, 1), '%']][P.valorExibido];
    return { valor: v[0], un: v[1], pct: m.pct, sim: !!m.sim };
  }

  // ---------------------------------------------------------------- o que o visor mostra agora
  function vista(it) {
    const e = E(), P = e.par, m = e.med, seta = (x) => `${x} ▸`;
    switch (it.tipo) {
      case 'cal': return [{ t: `${f(P[it.pct], 2)} %` }, { t: '=' }, { t: `${f(P[it.dist], 3)} m(d)` }, { t: `${f(m.D, 3)} m(d)`, p: true, d: true }];
      case 'lista': return [{ t: seta(t(it.opcoes[it.local ? s[it.local] : P[it.par]])) }];
      case 'num': return [{ t: `${f(P[it.par], it.dec)} ${it.un}`, g: true }];
      case 'tag': return [{ t: e.tag, g: true }];
      case 'escala': return [{ t: `0 % = ${f(P.escala0, 1)} ${UNIDADES[P.unidadeEscala]}` }, { t: `100 % = ${f(P.escala100, 1)} ${UNIDADES[P.unidadeEscala]}` }];
      case 'picos': return [{ t: `${t(X.dMin)} ${f(m.picos.dMin, 3)} m(d)`, p: true, e: true }, { t: `${t(X.dMax)} ${f(m.picos.dMax, 3)} m(d)`, p: true, e: true }, { t: `${t(X.tMin)} ${f(m.picos.tMin, 1)} °C`, p: true, e: true }, { t: `${t(X.tMax)} ${f(m.picos.tMax, 1)} °C`, p: true, e: true }];
      case 'confiab': return [{ t: `${m.confiab} dB`, g: true }, { t: t(X.status), p: true }, { t: m.erro || 'OK' }];
      case 'supressao': return [{ t: t(X.alterar) }];
      case 'corrente': return [{ t: `${t(X.carac)} ${t(CARAC[P.caracteristica])} ▸`, p: true, e: true }, { t: `${t(X.modoFalha)} ${t(FALHA.opcoes[FALHA.valores.indexOf(P.modoFalha)])} ▸`, p: true, e: true }, { t: `${t(X.iMin)} ${t(IMIN[P.iMinSel])} ▸`, p: true, e: true }, { t: `${t(X.iMax)} ${t(IMAX[P.iMaxSel])} ▸`, p: true, e: true }];
      case 'simulacao': return [{ t: t(X.iniciarSim) }];
      case 'reset': return [{ t: t(X.selReset) }];
      case 'fixo': return it.linhas.map((l) => ({ t: t(l) }));
      case 'nao': case 'carac': return [{ t: t(it.pergunta) }];
      default: return [];
    }
  }

  function tela() {
    const e = E(), m = e.med;
    if (m.status === 'desligado') { s.tela = 'home'; s.ed = null; s.fluxo = null; s.aviso = null; return { apagado: true, titulo: '', num: '', linhas: [] }; }
    if (s.tela !== 'home' && agora() - s.tUlt > SESSENTA_MIN) { s.tela = 'home'; s.ed = null; s.fluxo = null; s.aviso = null; }      // volta sozinho depois de 60 min
    if (s.fluxo && s.fluxo.tipo === 'sim' && !m.sim) s.fluxo = null;                                                                  // a simulação acabou sozinha
    const luz = !!e.par.luz;
    if (s.aviso) return { luz, titulo: '', num: '', linhas: s.aviso.map((x) => ({ t: x })) };
    if (s.ed) {
      const ed = s.ed;
      if (ed.tipo === 'lista') return { luz, titulo: ed.titulo, num: ed.num, lista: { itens: ed.itens, sel: ed.sel }, linhas: [] };
      const ix = (ed.tipo === 'num' ? digitos(ed) : ed.chars.map((_, k) => k))[ed.pos];
      return { luz, titulo: ed.titulo, num: ed.num, linhas: [...(ed.antes || []), { t: ed.chars.join('') + (ed.un ? ' ' + ed.un : ''), cur: ix, g: ed.tipo === 'texto' }, ...(ed.depois || [])] };
    }
    if (s.fluxo) {
      const fl = s.fluxo;
      if (fl.tipo === 'sim') return { luz, titulo: fl.titulo, num: fl.num, linhas: [{ t: t(X.simCurso), p: true }, { t: m.sim.modo === 'mA' ? `${f(m.sim.valor, 2)} mA` : `${f(m.sim.valor, 1)} %`, g: true }, { t: `${f(m.mA, 2)} mA · ${t(X.escSair)}`, p: true }] };
      if (fl.tipo === 'confirma') return { luz, titulo: fl.titulo, num: fl.num, linhas: [{ t: t(fl.texto), p: true }, { t: t(X.resetAgora) }] };
      return { luz, titulo: fl.titulo, num: fl.num, linhas: [['Conexão: G1½ PVDF', 'Process fitting: G1½ PVDF'], ['Vedação: EPDM', 'Seal: EPDM'], ['Faixa: 5 m', 'Measuring range: 5 m'], ['4…20 mA/HART 2 fios', '4…20 mA/HART two-wire'], ['Entrada: M20x1,5', 'Cable entry: M20x1.5']].map((l) => ({ t: t(l), p: true, e: true })) };
    }
    if (s.tela === 'home') {
      const v = valorPrincipal();
      if (v.erro) return { luz, titulo: e.tag, num: '', linhas: [{ t: v.erro, g: true, pisca: true }, { t: v.texto, p: true }] };
      const linhas = [{ t: `${v.valor} ${v.un}`.trim(), g: true }];
      if (m.sim) linhas.push({ t: t(X.simulando), p: true, pisca: true }); else if (e.par.hartMulti) linhas.push({ t: t(X.multidrop), p: true });
      return { luz, titulo: e.tag, num: '', linhas, barra: s.apres === 1 ? Math.min(1, Math.max(0, m.pct / 100)) : null };
    }
    if (s.tela === 'menu') return { luz, titulo: '', num: String(s.m + 1), lista: { itens: MENUS.map((x) => t(x.nome)), sel: s.m }, linhas: [] };
    const it = MENUS[s.m].itens[s.i], base = { luz, titulo: t(it.nome), num: `${s.m + 1}.${s.i + 1}` };
    if (it.tipo === 'curva') return Object.assign(base, { titulo: t(MENUS[2].itens[2].opcoes[s.curvaSel]), curva: ['eco', 'falso', 'tendencia'][s.curvaSel], linhas: s.curvaSel === 2 ? [{ t: t(X.nao) }] : [] });
    return Object.assign(base, { linhas: vista(it) });
  }

  return { tecla, tela, valorPrincipal, estadoInterno: s };
}

/** Árvore de menus para o guia: [{ num, pt, en, filhos: [{ num, pt, en }] }] */
export function arvore() {
  return MENUS.map((m, a) => ({ num: String(a + 1), pt: m.nome[0], en: m.nome[1], filhos: m.itens.map((it, b) => ({ num: `${a + 1}.${b + 1}`, pt: it.nome[0], en: it.nome[1], tipo: it.tipo })) }));
}
