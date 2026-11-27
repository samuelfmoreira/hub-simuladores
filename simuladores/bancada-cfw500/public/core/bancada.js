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
    motor: { nome: 'Motor trifásico 1 cv, 6 pontas (220 V Δ / 380 V Y)', pre: 'M', w: 470, h: 260, plano: 'mesa', unico: true,      // y dos bornes = profundidade na caixa de ligação
      term: [T('U1', 'U1', -38, -18, 'preto', 'Início do enrolamento U'), T('V1', 'V1', -4, -18, 'preto', 'Início do enrolamento V'), T('W1', 'W1', 30, -18, 'preto', 'Início do enrolamento W'),
        T('W2', 'W2', -38, 18, 'cinza', 'Fim do enrolamento W'), T('U2', 'U2', -4, 18, 'cinza', 'Fim do enrolamento U'), T('V2', 'V2', 30, 18, 'cinza', 'Fim do enrolamento V'), T('PE', 'PE', 60, 0, 'verde', 'Terra da carcaça')] },
    bot: { nome: 'Botão pulsador', pre: 'S', w: 100, h: 190, plano: 'painel', term: contatos(['13', '14'], ['21', '22'], -30, -70) },
    chave: { nome: 'Chave seletora 2 posições', pre: 'K', w: 100, h: 190, plano: 'painel', term: contatos(['13', '14'], ['21', '22'], -30, -70) },
    emerg: { nome: 'Botão de emergência', pre: 'S', w: 110, h: 190, plano: 'painel', term: contatos(['23', '24'], ['11', '12'], -30, -70) },
    pot: { nome: 'Potenciômetro 5 kΩ', pre: 'RP', w: 130, h: 190, plano: 'painel',
      term: [T('1', '1', -38, -65, 'preto', 'Extremo (início do curso)'), T('2', '2', 0, -65, 'amarelo', 'Cursor'), T('3', '3', 38, -65, 'vermelho', 'Extremo (fim do curso)')] },
    sinal: { nome: 'Sinaleiro 24 Vcc', pre: 'H', w: 90, h: 170, plano: 'painel', term: [T('X1', 'X1', -22, -55, 'vermelho', 'Positivo'), T('X2', 'X2', 22, -55, 'preto', 'Negativo')] },
    lamp: { nome: 'Sinaleiro 220 Vca', pre: 'H', w: 90, h: 170, plano: 'painel', term: [T('X1', 'X1', -22, -55, 'preto', 'Fase'), T('X2', 'X2', 22, -55, 'azul', 'Neutro ou outra fase')] },
    cont: { nome: 'Contatora tripolar, bobina 24 Vcc', pre: 'KM', w: 160, h: 200, plano: 'painel', hit: 0.0115,     // compacta: bornes a cada 24 mm
      term: [T('A1', 'A1', -60, 62, 'vermelho', 'Bobina + (24 Vcc)'), T('1', '1/L1', -36, 62, 'preto', 'Contato principal: entrada'), T('3', '3/L2', -12, 62, 'preto', 'Contato principal: entrada'), T('5', '5/L3', 12, 62, 'preto', 'Contato principal: entrada'), T('13', '13', 36, 62, 'azul', 'Contato auxiliar NA'), T('21', '21', 60, 62, 'vermelho', 'Contato auxiliar NF'),
        T('A2', 'A2', -60, -78, 'preto', 'Bobina − (0 V)'), T('2', '2/T1', -36, -78, 'preto', 'Contato principal: saída'), T('4', '4/T2', -12, -78, 'preto', 'Contato principal: saída'), T('6', '6/T3', 12, -78, 'preto', 'Contato principal: saída'), T('14', '14', 36, -78, 'azul', 'Contato auxiliar NA'), T('22', '22', 60, -78, 'vermelho', 'Contato auxiliar NF')] },
    fonte: { nome: 'Fonte 24 Vcc 2,5 A', pre: 'U', w: 140, h: 200, plano: 'painel',
      term: [T('L', 'L', -40, 62, 'preto', 'Entrada 100-240 Vca: fase'), T('N', 'N', 0, 62, 'azul', 'Entrada: neutro (ou outra fase)'), T('PE', 'PE', 40, 62, 'verde', 'Terra'),
        T('P', '+24V', -30, -70, 'vermelho', 'Saída +24 Vcc'), T('M', '0V', 30, -70, 'preto', 'Saída 0 V')] },
    gerador: { nome: 'Gerador de sinal 0-10 V / 4-20 mA', pre: 'G', w: 140, h: 190, plano: 'painel', term: [T('P', '+', -28, -65, 'vermelho', 'Saída +'), T('N', '−', 28, -65, 'preto', 'Saída −')] },
    multi: { nome: 'Multímetro digital', pre: 'P', w: 95, h: 190, plano: 'mesa', unico: true, term: [] },
    osc: { nome: 'Osciloscópio 2 canais com ponteiras diferenciais', pre: 'P', w: 300, h: 200, plano: 'mesa', unico: true, term: [] },
  };
  const MODOS_MULTI = ['OFF', 'V~', 'V⎓', 'Ω', '•)))'];
  /** tamanhos do painel perfurado (m): a mesa acompanha a largura */
  const PAINEIS = { normal: { w: 1.86, h: 1.02, nome: 'Normal', med: '1,9 × 1,0 m' }, grande: { w: 2.66, h: 1.02, nome: 'Grande', med: '2,7 × 1,0 m' }, extra: { w: 3.46, h: 1.32, nome: 'Extra', med: '3,5 × 1,3 m' } };
  const limites = (nome) => { const P = PAINEIS[nome] || PAINEIS.normal; return { painel: [-(P.w / 2 - 0.03), P.w / 2 - 0.03, 0.05, P.h - 0.03], mesa: [-(P.w / 2 + 0.05), P.w / 2 + 0.05, 0.10, 0.70] }; };
  const PONTAS = { multi: ['pv', 'pc'], osc: ['a1', 'b1', 'a2', 'b2'] };                 // chaves do estado que guardam em que borne cada ponta está
  const OSC_TB = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1], OSC_V = [0.5, 1, 2, 5, 10, 20, 50, 100, 200];   // s/div e V/div
  const PADRAO = [
    ['X1', 'rede', -0.72, 0.77], ['Q1', 'disj', -0.72, 0.45], ['A1', 'cfw', -0.38, 0.60],
    ['RP1', 'pot', -0.08, 0.80], ['G1', 'gerador', 0.08, 0.80], ['H1', 'sinal', 0.30, 0.81, 'verde'], ['H2', 'sinal', 0.41, 0.81, 'vermelho'], ['H3', 'sinal', 0.52, 0.81, 'amarelo'],
    ['S1', 'bot', -0.09, 0.57, 'verde'], ['S2', 'bot', 0.03, 0.57, 'vermelho'], ['S3', 'bot', 0.15, 0.57, 'preto'], ['S0', 'emerg', 0.28, 0.57],
    ['K1', 'chave', -0.09, 0.33], ['K2', 'chave', 0.03, 0.33], ['K3', 'chave', 0.15, 0.33], ['K4', 'chave', 0.27, 0.33],
    ['M1', 'motor', 0.55, 0.30], ['P1', 'multi', 0.02, 0.50], ['P2', 'osc', -0.52, 0.36],
  ];
  const EXTRAS = { KM1: ['KM1', 'cont'], U1: ['U1', 'fonte'] };     // componentes que as montagens prontas acrescentam se faltarem
  /** O que dá para acrescentar na bancada: [tipo, cor, nome] */
  const PALETA = [['bot', 'verde', 'Botão pulsador verde'], ['bot', 'vermelho', 'Botão pulsador vermelho'], ['bot', 'preto', 'Botão pulsador preto'], ['chave', '', 'Chave seletora 2 posições'], ['emerg', '', 'Botão de emergência'],
    ['cont', '', 'Contatora (bobina 24 Vcc)'], ['fonte', '', 'Fonte 24 Vcc 2,5 A'], ['sinal', 'verde', 'Sinaleiro verde 24 Vcc'], ['sinal', 'vermelho', 'Sinaleiro vermelho 24 Vcc'], ['sinal', 'amarelo', 'Sinaleiro amarelo 24 Vcc'],
    ['sinal', 'azul', 'Sinaleiro azul 24 Vcc'], ['sinal', 'branco', 'Sinaleiro branco 24 Vcc'], ['lamp', 'verde', 'Sinaleiro verde 220 Vca'], ['lamp', 'vermelho', 'Sinaleiro vermelho 220 Vca'], ['lamp', 'amarelo', 'Sinaleiro amarelo 220 Vca'],
    ['pot', '', 'Potenciômetro 5 kΩ'], ['disj', '', 'Disjuntor tripolar'], ['gerador', '', 'Gerador de sinal V / mA']];
  const ST0 = { rede: () => ({ ligada: false, desarmada: false, tensao: 220 }), disj: () => ({ fechado: false }), bot: () => ({ ap: false }), chave: () => ({ on: false }), emerg: () => ({ ap: false }),
    pot: () => ({ pos: 0 }), sinal: () => ({}), lamp: () => ({}), cont: () => ({ fechado: false }), fonte: () => ({ on: false }), gerador: () => ({ modo: 'V', valor: 0 }), multi: () => ({ modo: 0, pv: null, pc: null }), osc: () => ({ a1: null, b1: null, a2: null, b2: null, tb: 5, v1: 6, v2: 6, pos: 0, filtro: false, parado: false }), cfw: () => ({ s1: false }), motor: () => ({}) };

  // montagens prontas: [de, para, cor]
  const FORCA = [['X1.L1', 'Q1.1', 'preto'], ['X1.L2', 'Q1.3', 'preto'], ['X1.L3', 'Q1.5', 'preto'], ['Q1.2', 'A1.R', 'preto'], ['Q1.4', 'A1.S', 'preto'], ['Q1.6', 'A1.T', 'preto'], ['X1.PE', 'A1.PEi', 'verde'],
    ['A1.U', 'M1.U1', 'preto'], ['A1.V', 'M1.V1', 'preto'], ['A1.W', 'M1.W1', 'preto'], ['A1.PEo', 'M1.PE', 'verde']];
  const POT = [['A1.c8', 'RP1.3', 'vermelho'], ['A1.c6', 'RP1.2', 'amarelo'], ['A1.c4', 'RP1.1', 'preto']];
  /** jumpers do fechamento do motor: triângulo (rede 220 V) ou estrela (rede 380 V) */
  const FECHAMENTO = { 220: [['U1', 'W2'], ['V1', 'U2'], ['W1', 'V2']], 380: [['W2', 'U2'], ['U2', 'V2']] };
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
    contatora: { nome: 'Partida direta com contatora e selo (fonte U1, S1 liga, S2 desliga, KM1)', fios: [['X1.L1', 'Q1.1', 'preto'], ['X1.L2', 'Q1.3', 'preto'], ['X1.L3', 'Q1.5', 'preto'],
      ['Q1.2', 'KM1.1', 'preto'], ['Q1.4', 'KM1.3', 'preto'], ['Q1.6', 'KM1.5', 'preto'], ['KM1.2', 'M1.U1', 'preto'], ['KM1.4', 'M1.V1', 'preto'], ['KM1.6', 'M1.W1', 'preto'], ['X1.PE', 'M1.PE', 'verde'],
      ['Q1.2', 'U1.L', 'preto'], ['X1.N', 'U1.N', 'azul'], ['X1.PE', 'U1.PE', 'verde'],
      ['U1.P', 'S2.21', 'vermelho'], ['S2.22', 'S1.13', 'vermelho'], ['S1.14', 'KM1.A1', 'vermelho'], ['S1.13', 'KM1.13', 'vermelho'], ['KM1.14', 'KM1.A1', 'vermelho'], ['KM1.A2', 'U1.M', 'preto'],
      ['KM1.A1', 'H1.X1', 'vermelho'], ['H1.X2', 'U1.M', 'preto'], ['U1.P', 'KM1.21', 'vermelho'], ['KM1.22', 'H2.X1', 'vermelho'], ['H2.X2', 'U1.M', 'preto']] },
    gerador: { nome: 'Gira/Para em DI1 + gerador 4-20 mA em AI1', fios: FORCA.concat([['A1.c16', 'K1.13', 'preto'], ['K1.14', 'A1.c1', 'azul'], ['G1.P', 'A1.c6', 'vermelho'], ['G1.N', 'A1.c4', 'preto']]) },
  };

  class Bancada {
    constructor(o = {}) {
      this.comps = []; this.fios = []; this.seq = 1; this.painel = 'normal'; this.eventos = []; this.t = 0; this.n = 0; this.sujo = true;
      this.aoGravar = o.aoGravar || (() => {});
      this.inv = new SIM.CFW500({ salvo: o.salvo && o.salvo.inv, aoGravar: () => this.aoGravar(), aoEvento: (m) => this.evento(m) });
      this.motor = new SIM.Motor();
      this.net = {}; this.vdc = {}; this.fas = {}; this.erros = []; this.avisos = []; this.iLinha = 0; this.vEnrol = 0; this.alim = { f: 0, v: 0, seq: 1, fases: 0, cc: 0, via: '', kv: 0, kI: 1, lig: '' }; this.leitura = { txt: '', un: '', bip: false };
      if (o.salvo && o.salvo.comps) this.carregar(o.salvo); else this.padrao();
    }
    padrao() { this.comps = []; this.fios = []; PADRAO.forEach(([id, tipo, x, y, cor]) => this.comps.push({ id, tipo, x, y, cor: cor || '', st: ST0[tipo]() })); this.sujo = true; }
    carregar(s) {
      this.comps = s.comps.filter((c) => TIPOS[c.tipo]).map((c) => ({ id: c.id, tipo: c.tipo, x: c.x, y: c.y, cor: c.cor || '', st: Object.assign(ST0[c.tipo](), c.st || {}) }));
      for (const c of this.comps) { if (c.tipo === 'rede') { c.st.ligada = false; c.st.desarmada = false; } if (c.tipo === 'bot') c.st.ap = false; if (c.tipo === 'cont') c.st.fechado = false; if (c.tipo === 'fonte') c.st.on = false; (PONTAS[c.tipo] || []).forEach((k) => { c.st[k] = null; }); }
      if (!this.porTipo('osc')) { const pd = PADRAO.find((x) => x[1] === 'osc'); let n = 2; while (this.comp('P' + n)) n++; this.comps.push({ id: 'P' + n, tipo: 'osc', x: pd[2], y: pd[3], cor: '', st: ST0.osc() }); }   // bancada gravada antes de existir o osciloscópio
      this.fios = (s.fios || []).filter((f) => this.existe(f.a) && this.existe(f.b)); this.seq = 1 + this.fios.reduce((m, f) => Math.max(m, f.id), 0);
      if (s.motor) { this.motor.carga = s.motor.carga; this.motor.volante = !!s.motor.volante; }
      if (PAINEIS[s.painel]) this.painel = s.painel;
      const mt = this.porTipo('motor'); if (mt && !(s.v >= 2)) FECHAMENTO[220].forEach(([a, b]) => this.addFio(`${mt.id}.${a}`, `${mt.id}.${b}`, 'cinza'));   // antes da versão 1.5 o triângulo era interno
      this.sujo = true;
    }
    salvar() { return { v: 2, comps: this.comps, fios: this.fios, painel: this.painel, motor: { carga: this.motor.carga, volante: this.motor.volante }, inv: this.inv.paraGravar() }; }
    get limites() { return limites(this.painel); }
    get tensao() { const r = this.porTipo('rede'); return r && r.st.tensao === 380 ? 380 : 220; }
    /** Troca a rede da bancada (220 ou 380 V entre fases). A rede é desligada e o inversor passa a ser o da classe correspondente. */
    tensaoRede(v) {
      const r = this.porTipo('rede'); if (!r || (v !== 220 && v !== 380) || r.st.tensao === v) return false;
      r.st.tensao = v; r.st.ligada = false; r.st.desarmada = false; this.erros = []; this.inv.trocaClasse(v); this.sujo = true;
      this.evento(`Rede da bancada em ${v} V entre fases (${v === 380 ? 220 : 127} V fase-neutro).`); this.aoGravar(); return true;
    }
    /** Fecha o motor com jumpers: 'D' triângulo, 'Y' estrela, '' abre. Só mexe nos fios entre os bornes do próprio motor. */
    fechamento(tipo) {
      const m = this.porTipo('motor'); if (!m) return; const meu = (r) => r.startsWith(m.id + '.') && r !== m.id + '.PE';
      this.fios = this.fios.filter((f) => !(meu(f.a) && meu(f.b)));
      if (tipo) FECHAMENTO[tipo === 'Y' ? 380 : 220].forEach(([a, b]) => this.addFio(`${m.id}.${a}`, `${m.id}.${b}`, 'cinza'));
      this.sujo = true; this.aoGravar();
    }
    /** Troca o tamanho do painel. Ao diminuir, o que ficaria fora é trazido para dentro (procurando lugar livre). Devolve quantos mudaram de lugar. */
    tamanhoPainel(nome) {
      if (!PAINEIS[nome]) return -1; this.painel = nome; const L = limites(nome); let n = 0;
      for (const c of this.comps) {
        const d = TIPOS[c.tipo], pl = d.plano === 'painel', l = L[pl ? 'painel' : 'mesa'], mw = pl ? d.w / 2000 : 0.05, mh = pl ? d.h / 2000 : 0;
        const x = Math.max(l[0] + mw, Math.min(l[1] - mw, c.x)), y = Math.max(l[2] + mh, Math.min(l[3] - mh, c.y));
        if (x !== c.x || y !== c.y) { n++; c.x = x; c.y = y; if (pl && this.ocupado(c.tipo, x, y, c.id)) { const id = c.id; c.x = 99; const pos = this.lugarLivre(c.tipo); c.x = pos ? pos[0] : x; c.y = pos ? pos[1] : y; void id; } }
      }
      this.sujo = true; this.aoGravar(); return n;
    }
    evento(m) { this.eventos.push({ t: this.t, m }); if (this.eventos.length > 60) this.eventos.shift(); }
    comp(id) { return this.comps.find((c) => c.id === id); }
    porTipo(t) { return this.comps.find((c) => c.tipo === t); }
    existe(ref) { const [id, t] = ref.split('.'); const c = this.comp(id); return !!c && TIPOS[c.tipo].term.some((x) => x.id === t); }
    infoTerm(ref) { const [id, t] = ref.split('.'); const c = this.comp(id); const d = c && TIPOS[c.tipo].term.find((x) => x.id === t); return d ? { comp: c, tipo: TIPOS[c.tipo], term: d } : null; }

    // ---------------------------------------------------------------- edição
    /** Há componente do painel ocupando o retângulo de "tipo" centrado em (x, y)? */
    ocupado(tipo, x, y, ignora) {
      const d = TIPOS[tipo], w = d.w / 2000 + 0.006, h = d.h / 2000 + 0.006;
      return this.comps.some((c) => c.id !== ignora && TIPOS[c.tipo].plano === 'painel' && Math.abs(c.x - x) < w + TIPOS[c.tipo].w / 2000 && Math.abs(c.y - y) < h + TIPOS[c.tipo].h / 2000);
    }
    /** Primeiro lugar livre do painel, de cima para baixo e da esquerda para a direita (null = painel cheio). */
    lugarLivre(tipo) {
      const d = TIPOS[tipo]; if (d.plano !== 'painel') return [0.45, 0.5]; const w = d.w / 1000, h = d.h / 1000;
      const L = limites(this.painel).painel;
      for (let y = L[3] - h / 2; y >= L[2] + h / 2 - 1e-9; y -= 0.01) for (let x = L[0] + w / 2; x <= L[1] - w / 2 + 1e-9; x += 0.01) if (!this.ocupado(tipo, x, y)) return [+x.toFixed(3), +y.toFixed(3)];
      return null;
    }
    add(tipo, x, y, cor) {
      const d = TIPOS[tipo]; this.motivo = ''; if (!d || (d.unico && this.porTipo(tipo))) { this.motivo = 'unico'; return null; }
      if (x === undefined) { const pos = this.lugarLivre(tipo); if (!pos) { this.motivo = 'cheio'; return null; } [x, y] = pos; }
      let k = 1; while (this.comp(d.pre + k)) k++;
      const c = { id: d.pre + k, tipo, x, y, cor: cor || '', st: ST0[tipo]() }; this.comps.push(c); this.sujo = true; this.aoGravar(); return c;
    }
    remover(id) {
      const c = this.comp(id); if (!c || TIPOS[c.tipo].unico) return false;
      this.comps = this.comps.filter((x) => x !== c); this.fios = this.fios.filter((f) => !f.a.startsWith(id + '.') && !f.b.startsWith(id + '.'));
      for (const m of this.comps) (PONTAS[m.tipo] || []).forEach((k) => { if (m.st[k] && m.st[k].startsWith(id + '.')) m.st[k] = null; });
      this.sujo = true; this.aoGravar(); return true;
    }
    addFio(a, b, cor) {
      if (a === b || !this.existe(a) || !this.existe(b)) return null;
      if (this.fios.some((f) => (f.a === a && f.b === b) || (f.a === b && f.b === a))) return null;
      const f = { id: this.seq++, a, b, cor: cor || 'azul' }; this.fios.push(f); this.sujo = true; this.aoGravar(); return f;
    }
    corFio(id, cor) { const f = this.fios.find((x) => x.id === id); if (!f) return false; f.cor = cor; this.aoGravar(); return true; }
    removerFio(id) { const n = this.fios.length; this.fios = this.fios.filter((f) => f.id !== id); this.sujo = true; this.aoGravar(); return this.fios.length < n; }
    limparFios() { this.fios = []; for (const m of this.comps) (PONTAS[m.tipo] || []).forEach((k) => { m.st[k] = null; }); this.sujo = true; this.aoGravar(); }
    /** Liga os fios de uma montagem pronta. Componentes que a montagem usa e que não estão na bancada são recolocados. */
    montagem(nome) {
      const m = MONTAGENS[nome]; if (!m) return false; let novos = 0;
      for (const fio of m.fios) for (const r of [fio[0], fio[1]]) {
        const id = r.split('.')[0]; if (this.comp(id)) continue; const pd = PADRAO.find((x) => x[0] === id) || EXTRAS[id]; if (!pd) continue;
        const pos = pd[2] !== undefined && !this.ocupado(pd[1], pd[2], pd[3]) ? [pd[2], pd[3]] : (this.lugarLivre(pd[1]) || [pd[2] || 0.45, pd[3] || 0.5]);
        this.comps.push({ id, tipo: pd[1], x: pos[0], y: pos[1], cor: pd[4] || '', st: ST0[pd[1]]() }); novos++;
      }
      this.fios = []; m.fios.forEach(([a, b, c]) => this.addFio(a, b, c));
      const mt = this.porTipo('motor'); if (mt && this.fios.some((f) => f.a.startsWith(mt.id + '.') || f.b.startsWith(mt.id + '.'))) FECHAMENTO[this.tensao].forEach(([a, b]) => this.addFio(`${mt.id}.${a}`, `${mt.id}.${b}`, 'cinza'));
      this.sujo = true; return { ok: true, novos };
    }
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
        else if (c.tipo === 'lamp') res.push([p + 'X1', p + 'X2', 9680]);
        else if (c.tipo === 'cont') { if (s.fechado) { une(p + '1', p + '2'); une(p + '3', p + '4'); une(p + '5', p + '6'); une(p + '13', p + '14'); } else une(p + '21', p + '22'); res.push([p + 'A1', p + 'A2', 230]); }
        else if (c.tipo === 'motor') res.push([p + 'U1', p + 'U2', 10.2], [p + 'V1', p + 'V2', 10.2], [p + 'W1', p + 'W2', 10.2]);   // três enrolamentos de 10,2 Ω: 6,8 Ω entre fases em triângulo, 20,4 Ω em estrela
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
        const vf = (rede.st.tensao === 380 ? 380 : 220) / R3;      // tensão fase-neutro: 127 V na rede de 220 V, 220 V na de 380 V
        if (viva) ['L1', 'L2', 'L3'].forEach((l, i) => poe(p + l, { re: vf * Math.cos(-120 * i * RAD), im: vf * Math.sin(-120 * i * RAD), fonte: 'rede', fase: i }));
      }
      const saiInv = cfw && inv.sai.pwm && inv.sai.v > 1 && !inv.sai.cc;
      if (cfw) {
        const nu = ['U', 'V', 'W'].map((x) => N(A + x)), terra = rede ? N(rede.id + '.PE') : null;
        inv.ent.motor.curto = nu[0] === nu[1] || nu[1] === nu[2] || nu[0] === nu[2];
        inv.ent.motor.terra = terra !== null && nu.includes(terra);
        if (saiInv && !inv.ent.motor.curto && !inv.ent.motor.terra) ['U', 'V', 'W'].forEach((x, i) => { const a = inv.sai.v / R3; poe(A + x, { re: a * Math.cos(-120 * i * RAD), im: a * Math.sin(-120 * i * RAD), fonte: 'inv', fase: i }); });
      }
      // ---- 220 V onde não pode
      const frageis = { cfw: (t) => t[0] === 'c', pot: () => true, sinal: () => true, gerador: () => true, cont: (t) => t[0] === 'A', fonte: (t) => t === 'P' || t === 'M' };
      for (const k of nos) {
        const f = fas[N(k)]; if (!f || f.fonte === 'terra') continue;
        const [id, t] = k.split('.'), c = this.comp(id);
        if (frageis[c.tipo] && frageis[c.tipo](t)) { erros.push(`${f.fonte === 'rede' ? 'Tensão da rede (220 V)' : 'Tensão da saída do inversor'} no borne ${id}:${this.infoTerm(k).term.nome}, que é de comando em baixa tensão.`); trip = true; if (f.fonte === 'inv') this.inv._falha(70); }
      }
      const uCA = (x, y) => { const fa = fas[N(x)], fb = fas[N(y)]; return fa && fb ? Math.hypot(fa.re - fb.re, fa.im - fb.im) : 0; };
      for (const c of this.comps) {
        if (c.tipo === 'fonte') { const u = uCA(c.id + '.L', c.id + '.N'); if (u > 264) { erros.push(`Fonte ${c.id} ligada em ${u.toFixed(0)} V: a entrada é de 100 a 240 V. Na rede de 380 V use uma fase e o neutro.`); trip = true; } }
        else if (c.tipo === 'lamp') { const u = uCA(c.id + '.X1', c.id + '.X2'); if (u > 264) { erros.push(`Sinaleiro ${c.id} de 220 V ligado em ${u.toFixed(0)} V. Na rede de 380 V use uma fase e o neutro.`); trip = true; } }
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
      const al = { f: 0, v: 0, seq: 1, fases: 0, cc: 0, via: '', kv: 0, kI: 1, lig: '' };
      if (mot) {
        // Cada enrolamento (U1-U2, V1-V2, W1-W2) recebe a diferença de potencial entre os seus dois bornes. Nós sem fonte
        // (o centro da estrela, um jumper solto) assumem a média dos outros lados dos enrolamentos ligados a eles.
        const pm = mot.id + '.', enr = [['U1', 'U2'], ['V1', 'V2'], ['W1', 'W2']].map(([x, y]) => [N(pm + x), N(pm + y)]);
        const analisa = (pot) => {
          const V = Object.assign({}, pot), soltos = new Set(); enr.forEach((par) => par.forEach((n) => { if (!(n in V)) soltos.add(n); }));
          for (let it = 0; it < 24; it++) for (const u of soltos) { let sr = 0, si = 0, n = 0; for (const [x, y] of enr) { const o = x === u ? y : y === u ? x : null; if (o === null || o === u || !(o in V)) continue; sr += V[o].re; si += V[o].im; n++; } if (n) V[u] = { re: sr / n, im: si / n }; }
          const w = enr.map(([x, y]) => (x in V && y in V ? { re: V[x].re - V[y].re, im: V[x].im - V[y].im } : { re: 0, im: 0 })), mg = w.map((q) => Math.hypot(q.re, q.im)), mx = Math.max(...mg);
          if (mx < 1e-6) return null;
          const tres = mg.every((q) => q > 0.85 * mx), estrela = [...soltos].some((u) => enr.filter(([x, y]) => x === u || y === u).length >= 2);
          return { v: tres ? (mg[0] + mg[1] + mg[2]) / 3 : mx, fases: tres ? 3 : 2, seq: w[0].re * w[1].im - w[0].im * w[1].re < 0 ? 1 : -1, estrela };
        };
        const potR = {}, potI = {}; for (const n in fas) if (fas[n].fonte !== 'inv') { potR[n] = fas[n]; if (fas[n].fonte === 'terra') potI[n] = fas[n]; }
        if (cfw) ['U', 'V', 'W'].forEach((x, i) => { const n = N(A + x); if (!(n in potR)) potI[n] = { re: Math.cos(-120 * i * RAD) / R3, im: Math.sin(-120 * i * RAD) / R3 }; });   // saída do inversor em "por unidade": 1 = tensão entre fases
        const rr = viva && !trip ? analisa(potR) : null, ri = cfw && !inv.ent.motor.curto ? analisa(potI) : null;
        if (cfw) inv.ent.motor.fases = ri ? ri.fases : 0;
        const fecho = (r) => (r.fases === 3 ? (r.estrela ? 'Y' : 'Δ') : '');
        if (rr && rr.v > 20) Object.assign(al, { f: 60, v: rr.v, seq: rr.seq, fases: rr.fases, via: 'rede', kv: rr.v / this.tensao, kI: rr.estrela ? 1 / R3 : 1, lig: fecho(rr) });
        else if (ri && ri.v > 0.05) Object.assign(al, { seq: ri.seq, fases: ri.fases, via: 'inv', kv: ri.v, kI: ri.estrela ? 1 / R3 : 1, lig: fecho(ri) });
      }
      this.alim = al;

      // ---- comando em corrente contínua: análise nodal
      const idx = {}, lista = []; const no = (k) => { const n = N(k); if (!(n in idx)) { idx[n] = lista.length; lista.push(n); } return idx[n]; };
      const fontes = [];
      if (cfw && inv.vivo) {
        const gnd = A + 'c4';
        fontes.push({ a: A + 'c9', b: gnd, v: 24, r: 2, imax: 0.15, nome: '+24 V' }, { a: A + 'c8', b: gnd, v: 10, r: 20, imax: 0.03, nome: '+10 V' }, { a: A + 'c2', b: gnd, v: inv.sai.ao1, r: 100, imax: 0.02 });
        [1, 3, 5, 7].forEach((n, i) => { if (inv.diPnp(i)) res.push([A + 'c' + n, gnd, 4700]); else fontes.push({ a: A + 'c' + n, b: gnd, v: 24, r: 4700 }); });
        if (inv.sai.do2) res.push([A + 'c10', gnd, 10]);
      }
      if (cfw) res.push([A + 'c6', A + 'c4', cfw.st.s1 ? 500 : 100000]);
      for (const c of this.comps) if (c.tipo === 'fonte') {                 // fonte chaveada: liga com mais de 85 V entre L e N
        const p = c.id + '.', fa = fas[N(p + 'L')], fb = fas[N(p + 'N')], u = fa && fb ? Math.hypot(fa.re - fb.re, fa.im - fb.im) : 0;
        c.st.on = u > 85; if (c.st.on) fontes.push({ a: p + 'P', b: p + 'M', v: 24, r: 0.05, imax: 2.5, nome: '+24 V da fonte ' + c.id });
      }
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
      let mudou = false;
      for (const c of this.comps) {
        const p = c.id + '.';
        if (c.tipo === 'sinal') { const u = Math.abs(dv(vdc, p + 'X1', p + 'X2')); c.st.brilho = u < 8 ? 0 : Math.min(1, (u - 8) / 12); c.st.aceso = u > 15; }
        else if (c.tipo === 'lamp') {                                   // 220 Vca: acende com tensão alternada entre X1 e X2 (em 24 Vcc fica apagada)
          const fa = fas[N(p + 'X1')], fb = fas[N(p + 'X2')]; let u = 0;
          if (fa && fb) u = fa.fonte === fb.fonte || fa.fonte === 'terra' || fb.fonte === 'terra' ? Math.hypot(fa.re - fb.re, fa.im - fb.im) : Math.sqrt(fa.re ** 2 + fa.im ** 2 + fb.re ** 2 + fb.im ** 2);
          u = Math.max(u, Math.abs(dv(vdc, p + 'X1', p + 'X2'))); c.st.brilho = u < 60 ? 0 : Math.min(1, (u - 60) / 150); c.st.aceso = u > 150;
        } else if (c.tipo === 'cont') {                                // bobina 24 Vcc: fecha acima de 18 V, abre abaixo de 9,6 V
          const u = Math.abs(dv(vdc, p + 'A1', p + 'A2')), novo = c.st.fechado ? u > 9.6 : u > 18; c.st.ub = u;
          if (novo !== c.st.fechado) { c.st.fechado = novo; mudou = true; this.evento(`${c.id} ${novo ? 'fechou (bobina energizada)' : 'abriu'}.`); }
        }
      }
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
      this.sujo = mudou;            // contatora mudou de estado: os contatos valem na próxima solução
    }
    // ---------------------------------------------------------------- osciloscópio: tensão instantânea
    /** Potencial de um borne no instante tau (s). Rede: senoide de 60 Hz. Saída do inversor: PWM senoidal de verdade (cada
     *  fase chaveia entre +Ud/2 e -Ud/2 comparando a referência com a portadora triangular de P0297) ou, com o filtro
     *  ligado, só a fundamental. Comando: o valor contínuo calculado pelo circuito. tau = 0 é o ponto de disparo. */
    potencial(ref, tau, filtro) {
      if (!ref || !this._N) return 0; const n = this._N(ref), f = this.fas[n];
      if (!f) return this.vdc[n] || 0; if (f.fonte === 'terra') return 0;
      if (f.fonte === 'rede') { const w = 2 * Math.PI * 60 * tau; return Math.SQRT2 * (f.re * Math.cos(w) - f.im * Math.sin(w)); }
      const sai = this.inv.sai, th = 2 * Math.PI * sai.f * tau - f.fase * 2 * Math.PI / 3, amp = sai.v * Math.SQRT2 / R3;
      if (filtro) return amp * Math.sin(th);
      const ud = this.inv.ud, x = ((tau * this.inv.P[297]) % 1 + 1) % 1, tri = x < 0.5 ? 4 * x - 1 : 3 - 4 * x;
      return amp / (ud / 2) * Math.sin(th) > tri ? ud / 2 : -ud / 2;
    }
    /** Dados de um canal (pontas + e -): tipo do sinal, frequência, valor eficaz, pico a pico e os pontos da tela.
     *  colunas x 8 subamostras por coluna, guardando mínimo e máximo (como a detecção de pico de um osciloscópio digital). */
    canal(pa, pb, janela, colunas, filtro, t0 = 0) {
      const o = { ligado: !!(pa && pb), freq: 0, tipo: 'cc', min: new Float32Array(colunas), max: new Float32Array(colunas), rms: 0, vpp: 0, media: 0 };
      if (!o.ligado || !this._N) return o;
      const fa = this.fas[this._N(pa)], fb = this.fas[this._N(pb)], fontes = [fa, fb].filter((f) => f && f.fonte !== 'terra').map((f) => f.fonte);
      if (fontes.includes('inv')) { o.tipo = filtro ? 'fundamental' : 'pwm'; o.freq = Math.abs(this.inv.sai.f); } else if (fontes.includes('rede')) { o.tipo = 'rede'; o.freq = 60; }
      const sub = 8, dt = janela / (colunas * sub); let lo = Infinity, hi = -Infinity;
      for (let c = 0; c < colunas; c++) { let mn = Infinity, mx = -Infinity; for (let k = 0; k < sub; k++) { const t = t0 + (c * sub + k) * dt, v = this.potencial(pa, t, filtro) - this.potencial(pb, t, filtro); if (v < mn) mn = v; if (v > mx) mx = v; } o.min[c] = mn; o.max[c] = mx; if (mn < lo) lo = mn; if (mx > hi) hi = mx; }
      // eficaz e média sobre um número inteiro de ciclos (ou sobre a janela, se for contínuo)
      const T = o.freq > 0.2 ? 1 / o.freq : janela, n = 4000; let s2 = 0, sm = 0; for (let k = 0; k < n; k++) { const v = this.potencial(pa, (k + 0.5) * T / n, filtro) - this.potencial(pb, (k + 0.5) * T / n, filtro); s2 += v * v; sm += v; }
      o.rms = Math.sqrt(s2 / n); o.media = sm / n; o.vpp = hi - lo; return o;
    }
    /** Tensão contínua de um borne em relação ao GND do inversor (para dicas e testes). */
    vcc(ref) { return this.vdc[this._N ? this._N(ref) : ref] || 0; }

    // ---------------------------------------------------------------- tempo
    passo(dt) {
      this.t += dt;
      if (this.sujo || this.n++ % 5 === 0) this.resolver();
      const inv = this.inv, m = this.motor, al = this.alim;
      const s = al.via === 'inv' ? { f: Math.abs(inv.sai.f), v: inv.sai.v * al.kv, seq: al.seq * (inv.sai.f < 0 ? -1 : 1), fases: inv.sai.pwm ? al.fases : 0, cc: inv.sai.cc } : al;   // v = tensão em cada enrolamento
      m.passo(dt, s);
      const via = al.via === 'inv', kI = al.kI || 1; this.iLinha = m.i * kI; this.vEnrol = s.fases ? s.v : 0;      // em estrela a corrente de linha é a do enrolamento (÷ √3 da de triângulo)
      if (al.via === 'rede' && this.iLinha > 1.6 * SIM.PLACA.i * kI) { this.tSobre = (this.tSobre || 0) + dt; if (this.tSobre > 4) { const r = this.porTipo('rede'); r.st.desarmada = true; this.tSobre = 0; this.sujo = true;
        this.erros = [al.v > 264 ? `Motor com ${al.v.toFixed(0)} V em cada enrolamento (o certo é 220 V): fechado em triângulo numa rede de 380 V. Feche em estrela.` : `Sobrecorrente no motor por mais de 4 s (${this.iLinha.toFixed(1)} A): confira o fechamento, a carga e as três fases.`]; this.evento('A proteção geral da bancada desarmou: ' + this.erros[0]); } }
      else this.tSobre = Math.max(0, (this.tSobre || 0) - dt);
      Object.assign(inv.ent, { i: via ? m.i * kI : 0, ia: via ? m.ia * kI : 0, torque: via ? Math.abs(m.torque) * (m.ia >= 0 ? 1 : -1) : 0, pe: via ? m.pe : 0, hzRotor: via ? m.hzRotor * al.seq : 0 });
      const pwm = inv.sai.pwm, do1 = inv.sai.do1, do2 = inv.sai.do2, vivo = inv.vivo;
      inv.passo(dt);
      if (pwm !== inv.sai.pwm || do1 !== inv.sai.do1 || do2 !== inv.sai.do2 || vivo !== inv.vivo) this.sujo = true;
    }
    avanca(seg, dt = 0.002) { for (let t = 0; t < seg; t += dt) this.passo(dt); }
  }

  SIM.Bancada = Bancada; SIM.TIPOS = TIPOS; SIM.MONTAGENS = MONTAGENS; SIM.MODOS_MULTI = MODOS_MULTI; SIM.CTRL = CTRL; SIM.PONTAS = PONTAS; SIM.ST0 = ST0; SIM.FECHAMENTO = FECHAMENTO; SIM.PAINEIS = PAINEIS; SIM.PALETA = PALETA; SIM.EXTRAS = EXTRAS; SIM.OSC_TB = OSC_TB; SIM.OSC_V = OSC_V;
  if (typeof module !== 'undefined') module.exports = SIM;
})(typeof globalThis !== 'undefined' ? globalThis : this);
