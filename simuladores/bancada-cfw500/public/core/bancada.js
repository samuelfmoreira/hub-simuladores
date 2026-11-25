/* Bancada CFW500 - componentes, fios e circuito.
 * O circuito é resolvido de verdade: os fios e os contatos fechados formam NÓS; a rede e a saída do inversor são fontes
 * alternadas (fasores) e o comando em corrente contínua (+24 V, +10 V, DIs, AI1, AO1, DO2, potenciômetro, sinaleiros,
 * gerador de sinal) é resolvido por análise nodal. O multímetro lê esse resultado. */
(function (g) {
  'use strict';
  const SIM = g.SIM = g.SIM || {};
  if (!SIM.CFW500 && typeof require !== 'undefined') { require('./params.js'); require('./hmi.js'); require('./cfw500.js'); }
  const R3 = Math.sqrt(3), RAD = Math.PI / 180;

  // ---------------------------------------------------------------- tipos de componente (bornes em mm, a partir do centro do módulo)
  const T = (id, nome, x, y, cor, desc) => ({ id, nome, x, y, cor: cor || 'preto', desc: desc || '' });
  const linha = (ids, y, x0, dx, f) => ids.map((d, i) => f(d, x0 + i * dx, y));
  const CTRL = { 1: ['DI1', 'Entrada digital 1'], 3: ['DI2', 'Entrada digital 2'], 5: ['DI3', 'Entrada digital 3'], 7: ['DI4', 'Entrada digital 4'], 9: ['+24V', 'Fonte +24 Vcc (máx. 150 mA)'],
    11: ['DO1-RL-C', 'Relé DO1: comum'], 13: ['DO1-RL-NA', 'Relé DO1: contato NA'], 15: ['DO1-RL-NF', 'Relé DO1: contato NF'], 2: ['AO1', 'Saída analógica 1 (0-10 V)'],
    4: ['GND', 'Referência 0 V'], 6: ['AI1', 'Entrada analógica 1'], 8: ['+10V', 'Referência +10 Vcc para potenciômetro'], 10: ['DO2-TR', 'Saída digital 2 (transistor NPN, coletor aberto)'],
    12: ['RS485-A', 'RS-485 (terminal A)'], 14: ['RS485-B', 'RS-485 (terminal B)'], 16: ['GND', 'Referência 0 V'] };
  const corCtrl = (n) => (n === 9 || n === 8 ? 'vermelho' : n === 4 || n === 16 ? 'preto' : n === 6 || n === 2 ? 'amarelo' : n >= 11 && n <= 15 && n % 2 ? 'cinza' : 'azul');
  const contatos = (na, nf, y1, y2) => [T(na[0], na[0], -22, y1, 'azul', 'Contato NA'), T(na[1], na[1], 22, y1, 'azul', 'Contato NA'), T(nf[0], nf[0], -22, y2, 'vermelho', 'Contato NF'), T(nf[1], nf[1], 22, y2, 'vermelho', 'Contato NF')];
  const TIPOS = {
    rede: { nome: 'Alimentação trifásica 220 V', pre: 'X', w: 240, h: 250, plano: 'painel', unico: true,
      term: [T('L1', 'L1', -84, -85, 'preto', 'Fase R'), T('L2', 'L2', -42, -85, 'preto', 'Fase S'), T('L3', 'L3', 0, -85, 'preto', 'Fase T'), T('N', 'N', 42, -85, 'azul', 'Neutro'), T('PE', 'PE', 84, -85, 'verde', 'Terra de proteção')] },
    disj: { nome: 'Disjuntor tripolar', pre: 'Q', w: 150, h: 230, plano: 'painel',
      term: [T('1', '1', -40, 80, 'preto', 'Entrada polo 1'), T('3', '3', 0, 80, 'preto', 'Entrada polo 2'), T('5', '5', 40, 80, 'preto', 'Entrada polo 3'),
        T('2', '2', -40, -80, 'preto', 'Saída polo 1'), T('4', '4', 0, -80, 'preto', 'Saída polo 2'), T('6', '6', 40, -80, 'preto', 'Saída polo 3')] },
    cfw: { nome: 'Inversor CFW500 + plug-in CFW500-IOS', pre: 'A', w: 330, h: 500, plano: 'painel', unico: true,
      term: [T('R', 'R/L1', -135, 203, 'preto', 'Entrada de rede'), T('S', 'S/L2', -100, 203, 'preto', 'Entrada de rede'), T('T', 'T/L3', -65, 203, 'preto', 'Entrada de rede'), T('PEi', 'PE', -30, 203, 'verde', 'Terra (entrada)'),
        T('U', 'U', 30, 203, 'preto', 'Saída para o motor'), T('V', 'V', 65, 203, 'preto', 'Saída para o motor'), T('W', 'W', 100, 203, 'preto', 'Saída para o motor'), T('PEo', 'PE', 135, 203, 'verde', 'Terra (motor)')]
        .concat(linha([1, 3, 5, 7, 9, 11, 13, 15], -150, -133, 38, (n, x, y) => T('c' + n, n + ' ' + CTRL[n][0], x, y, corCtrl(n), CTRL[n][1])))
        .concat(linha([2, 4, 6, 8, 10, 12, 14, 16], -212, -133, 38, (n, x, y) => T('c' + n, n + ' ' + CTRL[n][0], x, y, corCtrl(n), CTRL[n][1]))) },
    motor: { nome: 'Motor trifásico 1 cv', pre: 'M', w: 470, h: 260, plano: 'mesa', unico: true,
      term: [T('U1', 'U1', -45, 0, 'preto', 'Bobina U (ligação triângulo 220 V)'), T('V1', 'V1', -15, 0, 'preto', 'Bobina V'), T('W1', 'W1', 15, 0, 'preto', 'Bobina W'), T('PE', 'PE', 45, 0, 'verde', 'Terra da carcaça')] },
    bot: { nome: 'Botão pulsador', pre: 'S', w: 100, h: 190, plano: 'painel', term: contatos(['13', '14'], ['21', '22'], -30, -70) },
    chave: { nome: 'Chave seletora 2 posições', pre: 'K', w: 100, h: 190, plano: 'painel', term: contatos(['13', '14'], ['21', '22'], -30, -70) },
    emerg: { nome: 'Botão de emergência', pre: 'S', w: 110, h: 190, plano: 'painel', term: contatos(['23', '24'], ['11', '12'], -30, -70) },
    pot: { nome: 'Potenciômetro 5 kΩ', pre: 'RP', w: 130, h: 190, plano: 'painel',
      term: [T('1', '1', -38, -65, 'preto', 'Extremo (início do curso)'), T('2', '2', 0, -65, 'amarelo', 'Cursor'), T('3', '3', 38, -65, 'vermelho', 'Extremo (fim do curso)')] },
    sinal: { nome: 'Sinaleiro 24 Vcc', pre: 'H', w: 90, h: 170, plano: 'painel', term: [T('X1', 'X1', -22, -55, 'vermelho', 'Positivo'), T('X2', 'X2', 22, -55, 'preto', 'Negativo')] },
    gerador: { nome: 'Gerador de sinal 0-10 V / 4-20 mA', pre: 'G', w: 140, h: 190, plano: 'painel', term: [T('P', '+', -28, -65, 'vermelho', 'Saída +'), T('N', '−', 28, -65, 'preto', 'Saída −')] },
    multi: { nome: 'Multímetro digital', pre: 'P', w: 95, h: 190, plano: 'mesa', unico: true, term: [] },
  };
  const MODOS_MULTI = ['OFF', 'V~', 'V⎓', 'Ω', '•)))'];
  const PADRAO = [
    ['X1', 'rede', -0.72, 0.77], ['Q1', 'disj', -0.72, 0.45], ['A1', 'cfw', -0.38, 0.60],
    ['RP1', 'pot', -0.08, 0.80], ['G1', 'gerador', 0.08, 0.80], ['H1', 'sinal', 0.30, 0.81, 'verde'], ['H2', 'sinal', 0.41, 0.81, 'vermelho'], ['H3', 'sinal', 0.52, 0.81, 'amarelo'],
    ['S1', 'bot', -0.09, 0.57, 'verde'], ['S2', 'bot', 0.03, 0.57, 'vermelho'], ['S3', 'bot', 0.15, 0.57, 'preto'], ['S0', 'emerg', 0.28, 0.57],
    ['K1', 'chave', -0.09, 0.33], ['K2', 'chave', 0.03, 0.33], ['K3', 'chave', 0.15, 0.33], ['K4', 'chave', 0.27, 0.33],
    ['M1', 'motor', 0.55, 0.30], ['P1', 'multi', 0.02, 0.50],
  ];
  const ST0 = { rede: () => ({ ligada: false, desarmada: false }), disj: () => ({ fechado: false }), bot: () => ({ ap: false }), chave: () => ({ on: false }), emerg: () => ({ ap: false }),
    pot: () => ({ pos: 0 }), sinal: () => ({}), gerador: () => ({ modo: 'V', valor: 0 }), multi: () => ({ modo: 0, pv: null, pc: null }), cfw: () => ({ s1: false }), motor: () => ({}) };

  // montagens prontas: [de, para, cor]
  const FORCA = [['X1.L1', 'Q1.1', 'preto'], ['X1.L2', 'Q1.3', 'preto'], ['X1.L3', 'Q1.5', 'preto'], ['Q1.2', 'A1.R', 'preto'], ['Q1.4', 'A1.S', 'preto'], ['Q1.6', 'A1.T', 'preto'], ['X1.PE', 'A1.PEi', 'verde'],
    ['A1.U', 'M1.U1', 'preto'], ['A1.V', 'M1.V1', 'preto'], ['A1.W', 'M1.W1', 'preto'], ['A1.PEo', 'M1.PE', 'verde']];
  const POT = [['A1.c8', 'RP1.3', 'vermelho'], ['A1.c6', 'RP1.2', 'amarelo'], ['A1.c4', 'RP1.1', 'preto']];
  const MONTAGENS = {
    forca: { nome: 'Só a força (rede, disjuntor, inversor, motor)', fios: FORCA },
    dois_fios: { nome: 'Gira/Para (K1 em DI1) e sentido (K2 em DI2)', fios: FORCA.concat([['A1.c16', 'K1.13', 'preto'], ['K1.14', 'A1.c1', 'azul'], ['K1.13', 'K2.13', 'preto'], ['K2.14', 'A1.c3', 'azul']]) },
    pot: { nome: 'Gira/Para em DI1 + potenciômetro em AI1', fios: FORCA.concat(POT, [['A1.c16', 'K1.13', 'preto'], ['K1.14', 'A1.c1', 'azul'], ['K1.13', 'K2.13', 'preto'], ['K2.14', 'A1.c3', 'azul']]) },
    tres_fios: { nome: 'Start (S1 NA em DI1) e Stop (S2 NF em DI2)', fios: FORCA.concat([['A1.c16', 'S1.13', 'preto'], ['S1.14', 'A1.c1', 'azul'], ['S1.13', 'S2.21', 'preto'], ['S2.22', 'A1.c3', 'azul']]) },
    multispeed: { nome: 'Multispeed: K1 em DI1, K2 em DI2, K3 em DI3 e K4 em DI4', fios: FORCA.concat([['A1.c16', 'K1.13', 'preto'], ['K1.14', 'A1.c1', 'azul'], ['K1.13', 'K2.13', 'preto'], ['K2.14', 'A1.c3', 'azul'],
      ['K2.13', 'K3.13', 'preto'], ['K3.14', 'A1.c5', 'azul'], ['K3.13', 'K4.13', 'preto'], ['K4.14', 'A1.c7', 'azul']]) },
    sinalizacao: { nome: 'Potenciômetro + DO1 (relé) em H1 e DO2 (transistor) em H3', fios: FORCA.concat(POT, [['A1.c16', 'K1.13', 'preto'], ['K1.14', 'A1.c1', 'azul'],
      ['A1.c9', 'A1.c11', 'vermelho'], ['A1.c13', 'H1.X1', 'vermelho'], ['H1.X2', 'A1.c16', 'preto'], ['A1.c9', 'H3.X1', 'vermelho'], ['H3.X2', 'A1.c10', 'azul']]) },
    falha_ext: { nome: 'Gira/Para (K1), sentido (K2) e emergência S0 (NF) em DI4', fios: FORCA.concat([['A1.c16', 'K1.13', 'preto'], ['K1.14', 'A1.c1', 'azul'], ['K1.13', 'K2.13', 'preto'], ['K2.14', 'A1.c3', 'azul'], ['K2.13', 'S0.11', 'preto'], ['S0.12', 'A1.c7', 'azul']]) },
    gerador: { nome: 'Gira/Para em DI1 + gerador 4-20 mA em AI1', fios: FORCA.concat([['A1.c16', 'K1.13', 'preto'], ['K1.14', 'A1.c1', 'azul'], ['G1.P', 'A1.c6', 'vermelho'], ['G1.N', 'A1.c4', 'preto']]) },
  };

  class Bancada {
    constructor(o = {}) {
      this.comps = []; this.fios = []; this.seq = 1; this.eventos = []; this.t = 0; this.n = 0; this.sujo = true;
      this.aoGravar = o.aoGravar || (() => {});
      this.inv = new SIM.CFW500({ salvo: o.salvo && o.salvo.inv, aoGravar: () => this.aoGravar(), aoEvento: (m) => this.evento(m) });
      this.motor = new SIM.Motor();
      this.net = {}; this.vdc = {}; this.fas = {}; this.erros = []; this.avisos = []; this.alim = { f: 0, v: 0, seq: 1, fases: 0, cc: 0, via: '' }; this.leitura = { txt: '', un: '', bip: false };
      if (o.salvo && o.salvo.comps) this.carregar(o.salvo); else this.padrao();
    }
    padrao() { this.comps = []; this.fios = []; PADRAO.forEach(([id, tipo, x, y, cor]) => this.comps.push({ id, tipo, x, y, cor: cor || '', st: ST0[tipo]() })); this.sujo = true; }
    carregar(s) {
      this.comps = s.comps.filter((c) => TIPOS[c.tipo]).map((c) => ({ id: c.id, tipo: c.tipo, x: c.x, y: c.y, cor: c.cor || '', st: Object.assign(ST0[c.tipo](), c.st || {}) }));
      for (const c of this.comps) { if (c.tipo === 'rede') { c.st.ligada = false; c.st.desarmada = false; } if (c.tipo === 'bot') c.st.ap = false; if (c.tipo === 'multi') { c.st.pv = c.st.pc = null; } }
      this.fios = (s.fios || []).filter((f) => this.existe(f.a) && this.existe(f.b)); this.seq = 1 + this.fios.reduce((m, f) => Math.max(m, f.id), 0);
      if (s.motor) { this.motor.carga = s.motor.carga; this.motor.volante = !!s.motor.volante; }
      this.sujo = true;
    }
    salvar() { return { comps: this.comps, fios: this.fios, motor: { carga: this.motor.carga, volante: this.motor.volante }, inv: this.inv.paraGravar() }; }
    evento(m) { this.eventos.push({ t: this.t, m }); if (this.eventos.length > 60) this.eventos.shift(); }
    comp(id) { return this.comps.find((c) => c.id === id); }
    porTipo(t) { return this.comps.find((c) => c.tipo === t); }
    existe(ref) { const [id, t] = ref.split('.'); const c = this.comp(id); return !!c && TIPOS[c.tipo].term.some((x) => x.id === t); }
    infoTerm(ref) { const [id, t] = ref.split('.'); const c = this.comp(id); const d = c && TIPOS[c.tipo].term.find((x) => x.id === t); return d ? { comp: c, tipo: TIPOS[c.tipo], term: d } : null; }

    // ---------------------------------------------------------------- edição
    add(tipo, x, y, cor) {
      const d = TIPOS[tipo]; if (!d || (d.unico && this.porTipo(tipo))) return null;
      let k = 1; while (this.comp(d.pre + k)) k++;
      const c = { id: d.pre + k, tipo, x, y, cor: cor || '', st: ST0[tipo]() }; this.comps.push(c); this.sujo = true; this.aoGravar(); return c;
    }
    remover(id) {
      const c = this.comp(id); if (!c || TIPOS[c.tipo].unico) return false;
      this.comps = this.comps.filter((x) => x !== c); this.fios = this.fios.filter((f) => !f.a.startsWith(id + '.') && !f.b.startsWith(id + '.'));
      const m = this.porTipo('multi'); if (m) ['pv', 'pc'].forEach((k) => { if (m.st[k] && m.st[k].startsWith(id + '.')) m.st[k] = null; });
      this.sujo = true; this.aoGravar(); return true;
    }
    addFio(a, b, cor) {
      if (a === b || !this.existe(a) || !this.existe(b)) return null;
      if (this.fios.some((f) => (f.a === a && f.b === b) || (f.a === b && f.b === a))) return null;
      const f = { id: this.seq++, a, b, cor: cor || 'azul' }; this.fios.push(f); this.sujo = true; this.aoGravar(); return f;
    }
    removerFio(id) { const n = this.fios.length; this.fios = this.fios.filter((f) => f.id !== id); this.sujo = true; this.aoGravar(); return this.fios.length < n; }
    limparFios() { this.fios = []; const m = this.porTipo('multi'); if (m) m.st.pv = m.st.pc = null; this.sujo = true; this.aoGravar(); }
    montagem(nome) { const m = MONTAGENS[nome]; if (!m) return false; this.fios = []; m.fios.forEach(([a, b, c]) => this.addFio(a, b, c)); return true; }
    /** Muda o estado de um componente: { ligada }, { fechado }, { ap }, { on }, { pos }, { modo }, { pv }, ... */
    acao(id, st) {
      const c = this.comp(id); if (!c) return;
      if (c.tipo === 'rede' && st.ligada && c.st.desarmada) { c.st.desarmada = false; this.erros = []; }
      Object.assign(c.st, st); this.sujo = true;
      if (!('ap' in st) || c.tipo === 'emerg') this.aoGravar();
    }

    // ---------------------------------------------------------------- circuito
    resolver() {
      const inv = this.inv, pai = {}, nos = [];
      const acha = (k) => { if (!(k in pai)) { pai[k] = k; nos.push(k); } let r = k; while (pai[r] !== r) r = pai[r]; while (pai[k] !== r) { const p = pai[k]; pai[k] = r; k = p; } return r; };
      const une = (a, b) => { const ra = acha(a), rb = acha(b); if (ra !== rb) pai[ra] = rb; };
      for (const c of this.comps) for (const t of TIPOS[c.tipo].term) acha(c.id + '.' + t.id);
      for (const f of this.fios) une(f.a, f.b);
      const res = [], norton = [];                              // res: [a, b, ohms] · norton: [a, b, volts, ohms] (fonte de tensão com resistência série, + em a)
      const cfw = this.porTipo('cfw'), A = cfw ? cfw.id + '.' : null, rede = this.porTipo('rede'), mot = this.porTipo('motor'), mm = this.porTipo('multi');
      for (const c of this.comps) {
        const p = c.id + '.', s = c.st;
        if (c.tipo === 'disj' && s.fechado) { une(p + '1', p + '2'); une(p + '3', p + '4'); une(p + '5', p + '6'); }
        else if (c.tipo === 'bot' || c.tipo === 'chave') { if (s.ap || s.on) une(p + '13', p + '14'); else une(p + '21', p + '22'); }
        else if (c.tipo === 'emerg') { if (s.ap) une(p + '23', p + '24'); else une(p + '11', p + '12'); }
        else if (c.tipo === 'pot') { res.push([p + '1', p + '2', 1 + s.pos * 5000], [p + '2', p + '3', 1 + (1 - s.pos) * 5000]); }
        else if (c.tipo === 'sinal') res.push([p + 'X1', p + 'X2', 2400]);
        else if (c.tipo === 'motor') res.push([p + 'U1', p + 'V1', 10.2], [p + 'V1', p + 'W1', 10.2], [p + 'W1', p + 'U1', 10.2]);   // triângulo: 6,8 Ω entre dois bornes
        else if (c.tipo === 'cfw') { une(p + 'c4', p + 'c16'); une(p + 'PEi', p + 'PEo'); une(p + 'c11', inv.vivo && inv.sai.do1 ? p + 'c13' : p + 'c15'); }
      }
      const N = (k) => acha(k);
      // ---- fontes alternadas (fasores): rede e saída do inversor
      const fas = {}, erros = [], avisos = []; let trip = false;
      const poe = (k, f) => {
        const n = N(k), o = fas[n];
        if (!o) { fas[n] = Object.assign({ k }, f); return; }
        const dv = Math.hypot(o.re - f.re, o.im - f.im);
        if (dv < 1) return;
        if (o.fonte === 'inv' || f.fonte === 'inv') { if (o.fonte !== f.fonte) { erros.push(`Rede ligada na saída do inversor (${o.k} com ${k}): isso destrói o inversor.`); trip = true; this.inv._falha(70); } }
        else { erros.push(`Curto-circuito na rede entre ${o.k} e ${k}.`); trip = true; }
      };
      const viva = rede && rede.st.ligada && !rede.st.desarmada;
      if (rede) {
        const p = rede.id + '.';
        poe(p + 'N', { re: 0, im: 0, fonte: 'terra' }); poe(p + 'PE', { re: 0, im: 0, fonte: 'terra' });
        if (viva) ['L1', 'L2', 'L3'].forEach((l, i) => poe(p + l, { re: 127 * Math.cos(-120 * i * RAD), im: 127 * Math.sin(-120 * i * RAD), fonte: 'rede', fase: i }));
      }
      const saiInv = cfw && inv.sai.pwm && inv.sai.v > 1 && !inv.sai.cc;
      if (cfw) {
        const nu = ['U', 'V', 'W'].map((x) => N(A + x)), terra = rede ? N(rede.id + '.PE') : null;
        inv.ent.motor.curto = nu[0] === nu[1] || nu[1] === nu[2] || nu[0] === nu[2];
        inv.ent.motor.terra = terra !== null && nu.includes(terra);
        if (saiInv && !inv.ent.motor.curto && !inv.ent.motor.terra) ['U', 'V', 'W'].forEach((x, i) => { const a = inv.sai.v / R3; poe(A + x, { re: a * Math.cos(-120 * i * RAD), im: a * Math.sin(-120 * i * RAD), fonte: 'inv', fase: i }); });
      }
      // ---- 220 V onde não pode
      const frageis = { cfw: (t) => t[0] === 'c', pot: () => true, sinal: () => true, gerador: () => true };
      for (const k of nos) {
        const f = fas[N(k)]; if (!f || f.fonte === 'terra') continue;
        const [id, t] = k.split('.'), c = this.comp(id);
        if (frageis[c.tipo] && frageis[c.tipo](t)) { erros.push(`${f.fonte === 'rede' ? 'Tensão da rede (220 V)' : 'Tensão da saída do inversor'} no borne ${id}:${this.infoTerm(k).term.nome}, que é de comando em baixa tensão.`); trip = true; if (f.fonte === 'inv') this.inv._falha(70); }
      }
      if (mm && mm.st.modo >= 3) for (const k of ['pv', 'pc']) { const r = mm.st[k], f = r && fas[N(r)]; if (f && f.fonte !== 'terra') avisos.push('Multímetro em Ω com tensão no circuito: desligue a rede antes de medir resistência.'); }
      if (trip && rede) { rede.st.desarmada = true; this.evento('A proteção geral da bancada desarmou: ' + erros[0]); this.erros = erros; return this.resolver(); }
      if (erros.length) this.erros = erros;

      // ---- alimentação do inversor (R, S, T)
      if (cfw) {
        const fs = ['R', 'S', 'T'].map((x) => fas[N(A + x)]).filter((f) => f && f.fonte !== 'inv');
        let vmax = 0; for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) vmax = Math.max(vmax, Math.hypot(fs[i].re - fs[j].re, fs[i].im - fs[j].im));
        inv.ent.vLinha = vmax; inv.ent.fases = new Set(fs.filter((f) => f.fonte === 'rede').map((f) => f.fase)).size;
      }
      // ---- alimentação do motor: pelo inversor (U, V, W) ou direto da rede
      const al = { f: 0, v: 0, seq: 1, fases: 0, cc: 0, via: '' };
      if (mot) {
        const nm = ['U1', 'V1', 'W1'].map((x) => N(mot.id + '.' + x));
        const liga = (prefixo, bornes) => nm.map((n) => bornes.findIndex((b) => N(prefixo + b) === n));
        const par = (ix) => { const v = ix.filter((i) => i >= 0); if (new Set(v).size !== v.length) return null; return { n: v.length, seq: v.length === 3 ? ((ix[1] - ix[0] + 3) % 3 === 1 ? 1 : -1) : 1 }; };
        const pi = cfw ? par(liga(A, ['U', 'V', 'W'])) : null, pr = viva ? par(liga(rede.id + '.', ['L1', 'L2', 'L3'])) : null;
        if (cfw) inv.ent.motor.fases = pi ? (pi.n >= 2 ? pi.n : 0) : 0;
        if (pr && pr.n >= 2 && !trip) Object.assign(al, { f: 60, v: 220, seq: pr.seq, fases: pr.n, via: 'rede' });
        else if (pi && pi.n >= 2) Object.assign(al, { seq: pi.seq, fases: pi.n, via: 'inv' });
      }
      this.alim = al;

      // ---- comando em corrente contínua: análise nodal
      const idx = {}, lista = []; const no = (k) => { const n = N(k); if (!(n in idx)) { idx[n] = lista.length; lista.push(n); } return idx[n]; };
      const fontes = [];
      if (cfw && inv.vivo) {
        const gnd = A + 'c4';
        fontes.push({ a: A + 'c9', b: gnd, v: 24, r: 2, imax: 0.2, nome: '+24 V' }, { a: A + 'c8', b: gnd, v: 10, r: 20, imax: 0.03, nome: '+10 V' }, { a: A + 'c2', b: gnd, v: inv.sai.ao1, r: 100, imax: 0.02 });
        [1, 3, 5, 7].forEach((n, i) => { if (inv.diPnp(i)) res.push([A + 'c' + n, gnd, 4700]); else fontes.push({ a: A + 'c' + n, b: gnd, v: 24, r: 4700 }); });
        if (inv.sai.do2) res.push([A + 'c10', gnd, 10]);
      }
      if (cfw) res.push([A + 'c6', A + 'c4', cfw.st.s1 ? 500 : 100000]);
      for (const c of this.comps) if (c.tipo === 'gerador') {
        const p = c.id + '.';
        if (c.st.modo === 'V') fontes.push({ a: p + 'P', b: p + 'N', v: c.st.valor, r: 50 }); else fontes.push({ a: p + 'P', b: p + 'N', i: c.st.valor / 1000, vmax: 24, r: 50 });
      }
      const medeV = mm && (mm.st.modo === 1 || mm.st.modo === 2) && mm.st.pv && mm.st.pc;
      if (medeV) res.push([mm.st.pv, mm.st.pc, 1e7]);
      const resolveCC = (rs, fts) => {
        for (const k in idx) delete idx[k]; lista.length = 0;
        const ref = cfw ? no(A + 'c4') : -1;
        rs.forEach((r) => { no(r[0]); no(r[1]); }); fts.forEach((f) => { no(f.a); no(f.b); });
        const n = lista.length, G = Array.from({ length: n }, () => new Float64Array(n + 1));
        const cond = (a, b, gv) => { G[a][a] += gv; G[b][b] += gv; G[a][b] -= gv; G[b][a] -= gv; };
        for (let i = 0; i < n; i++) G[i][i] += 1e-9;
        rs.forEach((r) => cond(no(r[0]), no(r[1]), 1 / r[2]));
        fts.forEach((f) => {
          const a = no(f.a), b = no(f.b);
          if (f.i !== undefined && !f.sat) { G[a][n] += f.i; G[b][n] -= f.i; cond(a, b, 1e-7); }
          else if (f.limitada) { G[a][n] += f.imax; G[b][n] -= f.imax; cond(a, b, 1e-7); }
          else { const v = f.sat ? f.vmax : f.v; cond(a, b, 1 / f.r); G[a][n] += v / f.r; G[b][n] -= v / f.r; }
        });
        if (ref >= 0) { for (let j = 0; j <= n; j++) G[ref][j] = 0; G[ref][ref] = 1; }
        for (let c = 0; c < n; c++) {                              // eliminação de Gauss com pivô parcial
          let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(G[r][c]) > Math.abs(G[p][c])) p = r;
          if (Math.abs(G[p][c]) < 1e-15) continue; if (p !== c) { const t = G[p]; G[p] = G[c]; G[c] = t; }
          for (let r = c + 1; r < n; r++) { const m = G[r][c] / G[c][c]; if (m !== 0) for (let j = c; j <= n; j++) G[r][j] -= m * G[c][j]; }
        }
        const V = new Float64Array(n);
        for (let r = n - 1; r >= 0; r--) { let s = G[r][n]; for (let j = r + 1; j < n; j++) s -= G[r][j] * V[j]; V[r] = Math.abs(G[r][r]) < 1e-15 ? 0 : s / G[r][r]; }
        const out = {}; lista.forEach((k, i) => { out[k] = V[i]; }); return out;
      };
      let vdc = resolveCC(res, fontes), refaz = false;
      const dv = (v, a, b) => (v[N(a)] || 0) - (v[N(b)] || 0);
      for (const f of fontes) {
        if (f.i !== undefined) { if (dv(vdc, f.a, f.b) > f.vmax) { f.sat = true; refaz = true; } }
        else if (f.imax && (f.v - dv(vdc, f.a, f.b)) / f.r > f.imax) { f.limitada = true; refaz = true; if (f.nome) avisos.push(`Fonte de ${f.nome} do inversor em curto ou sobrecarregada.`); }
      }
      if (refaz) vdc = resolveCC(res, fontes);
      this.vdc = vdc; this.fas = fas; this.net = pai; this._N = N; this.avisos = avisos;
      if (cfw) {
        const gnd = A + 'c4';
        inv.ent.diV = [1, 3, 5, 7].map((n) => (inv.vivo ? dv(vdc, A + 'c' + n, gnd) : 0));
        inv.ent.aiV = dv(vdc, A + 'c6', gnd); inv.ent.aiCorrente = !!cfw.st.s1;
      }
      for (const c of this.comps) if (c.tipo === 'sinal') { const u = Math.abs(dv(vdc, c.id + '.X1', c.id + '.X2')); c.st.brilho = u < 8 ? 0 : Math.min(1, (u - 8) / 12); c.st.aceso = u > 15; }
      // ---- multímetro
      const L = this.leitura = { txt: '', un: '', bip: false, modo: mm ? MODOS_MULTI[mm.st.modo] : 'OFF' };
      if (mm && mm.st.modo > 0) {
        const a = mm.st.pv, b = mm.st.pc, m = mm.st.modo;
        if (m === 1) {                                           // V~: diferença dos fasores (fontes de frequência diferente somam em valor eficaz)
          let u = 0; const fa = a && fas[N(a)], fb = b && fas[N(b)];
          if (a && b && (fa || fb)) {
            if (fa && fb && (fa.fonte === fb.fonte || fa.fonte === 'terra' || fb.fonte === 'terra')) u = Math.hypot(fa.re - fb.re, fa.im - fb.im);
            else if (fa && fb) u = Math.sqrt(fa.re ** 2 + fa.im ** 2 + fb.re ** 2 + fb.im ** 2); else u = 0;
          }
          L.txt = u.toFixed(1); L.un = 'V~';
        } else if (m === 2) { L.txt = (a && b ? dv(vdc, a, b) : 0).toFixed(2); L.un = 'V⎓'; }
        else {
          if (!a || !b) { L.txt = 'OL'; }
          else if (N(a) === N(b)) { L.txt = m === 3 ? '0.0' : '0.0'; L.bip = m === 4; }
          else {
            const vivoCC = Math.abs(dv(vdc, a, b)) > 0.3, fa = fas[N(a)], fb = fas[N(b)], vivoCA = (fa && fa.fonte !== 'terra') || (fb && fb.fonte !== 'terra');
            if (vivoCC || vivoCA) { L.txt = 'Err'; L.erro = true; }
            else {
              const pass = res.filter((r) => r[2] < 5e6);
              const v2 = resolveCC(pass, [{ a, b, i: 0.001, vmax: 1e9, r: 1 }]), r = dv(v2, a, b) / 0.001;
              if (r > 4e7 || r < 0) L.txt = 'OL'; else { L.txt = r >= 1000 ? (r / 1000).toFixed(2) : r.toFixed(1); L.k = r >= 1000; L.bip = m === 4 && r < 30; if (m === 4 && !L.bip) L.txt = 'OL'; }
            }
          }
          L.un = m === 3 ? (L.k ? 'kΩ' : 'Ω') : '•)))';
        }
      }
      this.sujo = false;
    }
    /** Tensão contínua de um borne em relação ao GND do inversor (para dicas e testes). */
    vcc(ref) { return this.vdc[this._N ? this._N(ref) : ref] || 0; }

    // ---------------------------------------------------------------- tempo
    passo(dt) {
      this.t += dt;
      if (this.sujo || this.n++ % 5 === 0) this.resolver();
      const inv = this.inv, m = this.motor, al = this.alim;
      const s = al.via === 'inv' ? { f: Math.abs(inv.sai.f), v: inv.sai.v, seq: al.seq * (inv.sai.f < 0 ? -1 : 1), fases: inv.sai.pwm ? al.fases : 0, cc: inv.sai.cc } : al;
      m.passo(dt, s);
      const via = al.via === 'inv';
      Object.assign(inv.ent, { i: via ? m.i : 0, ia: via ? m.ia : 0, torque: via ? Math.abs(m.torque) * (m.ia >= 0 ? 1 : -1) : 0, pe: via ? m.pe : 0, hzRotor: via ? m.hzRotor * al.seq : 0 });
      const pwm = inv.sai.pwm, do1 = inv.sai.do1, do2 = inv.sai.do2, vivo = inv.vivo;
      inv.passo(dt);
      if (pwm !== inv.sai.pwm || do1 !== inv.sai.do1 || do2 !== inv.sai.do2 || vivo !== inv.vivo) this.sujo = true;
    }
    avanca(seg, dt = 0.002) { for (let t = 0; t < seg; t += dt) this.passo(dt); }
  }

  SIM.Bancada = Bancada; SIM.TIPOS = TIPOS; SIM.MONTAGENS = MONTAGENS; SIM.MODOS_MULTI = MODOS_MULTI; SIM.CTRL = CTRL;
  if (typeof module !== 'undefined') module.exports = SIM;
})(typeof globalThis !== 'undefined' ? globalThis : this);
