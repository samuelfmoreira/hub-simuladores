/**
 * =====================================================================
 *  MODELO DO INVERSOR WEG CFW500 (controle escalar V/f)
 * =====================================================================
 *  Implementa, conforme o Manual de Programação V1.8X:
 *   - Cap. 7  : seleção LOC/REM, fontes de comando e de referência,
 *               palavra de controle (P0682/P0684) e de estado (P0680/P0690),
 *               referência "velocidade 13 bits" (8192 = P0403).
 *   - Cap. 11 : rampas 1ª/2ª/3ª, rampa S, limitação de corrente e
 *               regulação do barramento CC (P0150/P0151), frenagem CC,
 *               frequências evitadas.
 *   - Cap. 12 : entradas/saídas digitais e analógicas (principais funções).
 *   - Cap. 15 : proteções Ixt motor (F0072/A0046), IGBTs (F0048/A0047),
 *               subtensão/sobretensão (F0021/F0022), histórico de falhas,
 *               auto-reset.
 *   - Manual Ethernet: P0313 (ação no erro de comunicação), A0149/F0249,
 *               P0800..P0849.
 *
 *  O motor de indução é simulado pela curva de Kloss (torque x escorregamento)
 *  com dados de placa vindos de P0400..P0409, e a carga vem da esteira.
 * =====================================================================
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { LIST, MAP } = require('./params');
const { FALHAS, ALARMES } = require('./faults');

const POT_KW = [0.12, 0.19, 0.25, 0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3.0, 3.7, 4.0, 4.5, 5.5, 7.5, 9.0, 11, 15, 18.5, 22];

// Padrões de fábrica 50 Hz (valores entre parênteses no manual) — P0204 = 6
const PADRAO_50HZ = { 125: 50, 126: 100, 127: 200, 128: 300, 129: 400, 130: 500, 131: 550, 134: 550, 145: 500, 146: 333,
  147: 167, 208: 500, 402: 1425, 403: 50 };

const ARQ = path.join(__dirname, '..', '..', 'data', 'eeprom.json');

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const bit = (w, n) => ((w >> n) & 1) === 1;

class CFW500 extends EventEmitter {
  constructor(planta) {
    super();
    this.planta = planta;
    this.v = new Map();                 // valores atuais (brutos)
    this.usuario = { 1: null, 2: null }; // memórias de usuário (P0204 = 9/10)
    this.senha = 0;                     // valor real da senha (P0200)
    this.senhaLiberada = false;
    this.ixtSalvo = 0;
    this.carregarEEPROM();

    // ---------------- entradas físicas (bornes) ----------------
    this.di = [false, false, false, false, false, false, false, false]; // DI1..DI8 (estado "ativo")
    this.ai1Volts = 0;                  // potenciômetro nos bornes AI1 (0..10 V)
    this.redeVac = 380;                 // tensão de alimentação (injeção de falhas)
    this.inj = { faltaFaseMotor: false, faltaTerra: false, moduloEth: false };

    this.ligado = false;
    this.ligar();
  }

  // ===================================================================
  //  PERSISTÊNCIA (EEPROM simulada)
  // ===================================================================
  carregarEEPROM() {
    for (const p of LIST) this.v.set(p.n, p.def);
    try {
      const d = JSON.parse(fs.readFileSync(ARQ, 'utf8'));
      for (const [k, val] of Object.entries(d.params || {})) {
        const p = MAP.get(+k);
        if (p && !p.ro && !p.net) this.v.set(+k, clamp(val, p.min, p.max));
      }
      // histórico de falhas também é não volátil
      for (const n of [50, 51, 52, 53, 54, 55, 60, 61, 62, 63, 64, 65, 70, 71, 72, 73, 74, 75])
        if (d.params && d.params[n] !== undefined) this.v.set(n, d.params[n]);
      this.usuario = d.usuario || this.usuario;
      this.senha = d.senha || 0;
      this.ixtSalvo = d.ixt || 0;
    } catch { /* primeira energização: padrão de fábrica */ }
  }

  salvarEEPROM() {
    const params = {};
    for (const p of LIST) {
      const val = this.v.get(p.n);
      const hist = (p.n >= 50 && p.n <= 75);
      if ((!p.ro && !p.net && val !== p.def) || hist) params[p.n] = val;
    }
    try {
      fs.mkdirSync(path.dirname(ARQ), { recursive: true });
      fs.writeFileSync(ARQ, JSON.stringify({ params, usuario: this.usuario, senha: this.senha, ixt: this.ixt }, null, 1));
    } catch (e) { this.emit('log', 'Erro ao salvar EEPROM: ' + e.message); }
    this.sujo = false;
  }

  // ===================================================================
  //  LIGA / DESLIGA (energização)
  // ===================================================================
  ligar() {
    this.ligado = true;
    this.tBoot = 1.2;                 // tempo de inicialização (tela de abertura da HMI)
    this.senhaLiberada = false;
    this.v.set(0, 0);
    // valores de rede voltam a zero na energização
    for (const n of [684, 685, 695, 696, 697, 698, 682, 683]) this.v.set(n, 0);
    this.netEscrito = false;          // a rede ainda não escreveu a palavra de controle
    this.falha = 0; this.alarmes = new Set(); this.alarmeRede = false; this.errosRede = new Map();
    this.pwm = false; this.f = 0; this.acc = 0; this.omega = 0; this.ud = this.udRetificado();
    this.ixt = this.ixtSalvo || 0; this.ixtIgbt = 0; this.temp = 25; this.iFilt = 0;
    this.locRem = this.locRemPadrao();
    this.hmiGira = false; this.hmiHorario = this.giroPadrao(this.v.get(223)); this.hmiHorarioRem = this.giroPadrao(this.v.get(226));
    this.hmiJog = false; this.tresFios = false; this.epRef = this.refInicialBackup();
    this.diAnt = [...this.di]; this.cwAnt = 0;
    this.estadoPar = 'normal';        // normal | rampa | inercia | rapida | frenagemCC
    this.tFrenCC = 0; this.tAutoReset = 0; this.holdRampa = false; this.limitando = false;
    this.ultimaRef = 0; this.giraCmd = false; this.jogAtivo = false; this.paradaRapida = false; this.segRampa = false;
    this.horarioCmd = true; this.habGeral = false; this.config47 = 0;
    this.motorT = 0; this.motorI = 0; this.vOut = 0; this.pElet = 0;
    this.emit('energizacao');
  }

  desligar() {
    this.ixtSalvo = this.ixt;
    this.salvarEEPROM();
    this.ligado = false; this.pwm = false;
    this.emit('desenergizacao');
  }

  locRemPadrao() {
    const s = this.v.get(220);
    return (s === 1 || s === 3 || s === 6 || s === 10) ? 'REM' : 'LOC';
  }
  giroPadrao(op) { return !(op === 1 || op === 3 || op === 6 || op === 10); } // true = horário

  refInicialBackup() {
    const b = this.v.get(120);
    if (b === 0) return this.v.get(133) / 10;
    if (b === 2) return this.v.get(121) / 10;
    return (this.v.get(121)) / 10;
  }

  // ===================================================================
  //  ACESSO A PARÂMETROS
  // ===================================================================
  get(n) { return this.v.get(n); }
  hz(n) { return this.v.get(n) / 10; } // parâmetros de frequência com 1 casa decimal

  /** Valor como palavra de 16 bits (como vai para a rede) */
  lerPalavra(n) {
    if (!MAP.has(n)) return null;
    return this.v.get(n) & 0xFFFF;
  }

  /**
   * Escrita de parâmetro com as mesmas regras do inversor.
   * origem: 'hmi' | 'net' | 'ui'
   * Retorna null se OK, ou {erro:'codigo', msg:'texto'}
   */
  escrever(n, valor, origem = 'hmi') {
    const p = MAP.get(n);
    if (!p) return { erro: 'inexistente', msg: `P${String(n).padStart(4, '0')} não existe` };
    if (!this.ligado) return { erro: 'desligado', msg: 'Inversor desenergizado' };
    if (p.net && origem !== 'net') return { erro: 'ro', msg: 'Parâmetro escrito somente via rede de comunicação' };
    if (p.ro && !(p.net && origem === 'net')) return { erro: 'ro', msg: 'Parâmetro somente leitura' };
    // palavra de 16 bits vinda da rede: reinterpreta com sinal se o parâmetro admite negativo
    if (origem === 'net') {
      valor &= 0xFFFF;
      if (p.min < 0 && valor > 32767) valor -= 65536;
    }
    if (!Number.isInteger(valor) || valor < p.min || valor > p.max)
      return { erro: 'faixa', msg: `Valor fora da faixa (${p.min} a ${p.max})` };
    if (p.cfg && this.pwm) return { erro: 'cfg', msg: 'Parâmetro "cfg": só pode ser alterado com o motor parado' };
    if (origem === 'hmi' && n !== 0) {
      if (this.senha && !this.senhaLiberada) return { erro: 'senha', msg: 'Senha ativa: programe P0000' };
      if (this.funcaoDiAtiva(26)) return { erro: 'bloq', msg: 'Programação bloqueada por DIx (função 26)' };
    }

    // ---------------- efeitos especiais ----------------
    switch (n) {
      case 0:
        this.senhaLiberada = this.senha !== 0 && valor === this.senha;
        this.v.set(0, this.senhaLiberada ? 1 : 0);
        return null;
      case 200:
        if (valor === 0) { this.senha = 0; this.v.set(200, 0); }
        else if (valor > 1) { this.senha = valor; this.v.set(200, 1); this.senhaLiberada = false; }
        this.sujo = true; return null;
      case 204:
        this.executarP0204(valor); return null;
      case 849:
        if (valor === 1) { this.v.set(849, 1); this.emit('ethReinit'); setTimeout(() => this.v.set(849, 0), 1500); }
        return null;
      case 121:
        if (origem === 'hmi') valor = Math.min(valor, this.v.get(134));
        break;
      case 408:
        if (valor === 1) { this.v.set(408, 1); this.autoajuste = 3.0; return null; }
        break;
      default:
    }
    const antigo = this.v.get(n);
    this.v.set(n, valor);
    if (n === 684 || n === 685) this.netEscrito = true;
    if (!p.ro && !p.net) this.sujo = true;
    if (antigo !== valor) this.emit('param', { n, valor, origem });
    return null;
  }

  executarP0204(op) {
    if (op === 5 || op === 6) {
      const preserva = { 296: this.v.get(296), 297: this.v.get(297), 308: this.v.get(308) };
      for (const p of LIST) if (!p.ro && !p.net) this.v.set(p.n, p.def);
      if (op === 6) for (const [k, val] of Object.entries(PADRAO_50HZ)) this.v.set(+k, val);
      for (const [k, val] of Object.entries(preserva)) this.v.set(+k, val);
      this.senha = 0;
      // volta à situação de comando inicial do padrão (P0220 = 2 -> LOC) e esquece a palavra da rede
      this.locRem = this.locRemPadrao();
      this.netEscrito = false; this.hmiGira = false;
      this.hmiHorario = this.giroPadrao(this.v.get(223)); this.hmiHorarioRem = this.giroPadrao(this.v.get(226));
      this.emit('log', `P0204 = ${op}: padrão de fábrica ${op === 5 ? '60' : '50'} Hz carregado`);
    } else if (op === 7 || op === 8) {
      const mem = this.usuario[op - 6];
      if (mem) for (const [k, val] of Object.entries(mem)) this.v.set(+k, val);
      this.emit('log', mem ? `Usuário ${op - 6} carregado` : `Memória de usuário ${op - 6} vazia`);
    } else if (op === 9 || op === 10) {
      const mem = {};
      for (const p of LIST) if (!p.ro && !p.net) mem[p.n] = this.v.get(p.n);
      this.usuario[op - 8] = mem;
      this.emit('log', `Parâmetros salvos em Usuário ${op - 8}`);
    }
    this.v.set(204, 0);
    this.sujo = true;
  }

  // ===================================================================
  //  ENTRADAS DIGITAIS — helpers
  // ===================================================================
  /** Lista de índices de DIs programadas com a função f */
  disComFuncao(f) {
    const r = [];
    for (let i = 0; i < 8; i++) if (this.v.get(263 + i) === f) r.push(i);
    return r;
  }
  funcaoDiAtiva(f) { return this.disComFuncao(f).some((i) => this.di[i]); }
  funcaoDiExiste(f) { return this.disComFuncao(f).length > 0; }
  /** Borda de subida de alguma DI com a função f */
  bordaDi(f) { return this.disComFuncao(f).some((i) => this.di[i] && !this.diAnt[i]); }

  /** Verifica situações de estado CONFIG (Tabela 5.4) */
  verificarConfig() {
    const unicas = [[4, 1], [5, 2], [6, 3], [7, 4], [8, 5], [9, 6], [11, 7], [12, 8], [14, 9], [22, 10], [24, 11], [26, 12], [27, 13], [28, 14]];
    for (const [f, cod] of unicas) if (this.disComFuncao(f).length > 1) return cod;
    if (this.funcaoDiExiste(4) !== this.funcaoDiExiste(5)) return 15;
    return 0;
  }

  // ===================================================================
  //  DADOS DO MOTOR (placa) a partir dos parâmetros
  // ===================================================================
  motor() {
    const fn = Math.max(1, this.v.get(403));
    const nn = Math.max(1, this.v.get(402));
    const pp = Math.max(1, Math.round((60 * fn) / nn));   // pares de polos
    const nsN = (60 * fn) / pp;                            // rpm síncrona nominal
    const sN = Math.max(5, nsN - nn);                      // escorregamento nominal (rpm)
    const pn = POT_KW[this.v.get(404)] * 1000;
    const tn = pn / ((nn * 2 * Math.PI) / 60);
    const In = Math.max(0.1, this.v.get(401) / 10);
    const fp = this.v.get(407) / 100;
    const j = 0.003 * (pn / 1000) ** 1.2 + 0.0005;
    return { fn, nn, pp, nsN, sN, pn, tn, In, fp, vn: this.v.get(400), rs: this.v.get(409) / 100, j, sK: 4.79 * sN, tK: 2.5 * tn };
  }

  udRetificado() { return this.redeVac * Math.SQRT2 * 0.98; }
  limitesUd() {
    const t = this.v.get(296);
    return t === 0 ? { sub: 200, sobre: 410 } : t === 1 ? { sub: 360, sobre: 810 } : { sub: 500, sobre: 1000 };
  }

  // ===================================================================
  //  FALHAS E ALARMES
  // ===================================================================
  gerarFalha(cod) {
    if (this.falha || !this.ligado) return;
    this.falha = cod;
    this.pwm = false; this.f = 0; this.acc = 0;
    // histórico: 3ª <- 2ª <- última <- nova
    for (let k = 0; k < 6; k++) { this.v.set(70 + k, this.v.get(60 + k)); this.v.set(60 + k, this.v.get(50 + k)); }
    this.v.set(50, cod); this.v.set(51, Math.round(this.iFilt * 10)); this.v.set(52, Math.round(this.ud));
    this.v.set(53, Math.round(Math.abs(this.fSaida || 0) * 10)); this.v.set(54, Math.round(this.temp)); this.v.set(55, this.v.get(680));
    this.v.set(49, cod);
    this.tAutoReset = 0;
    this.sujo = true;
    this.emit('falha', { cod, ...FALHAS[cod] });
  }

  resetFalha(origem) {
    if (!this.falha) return false;
    // condições que impedem o reset enquanto persistirem
    const lim = this.limitesUd();
    if ((this.falha === 21 && this.ud < lim.sub) || (this.falha === 91 && this.funcaoDiExiste(19) && !this.funcaoDiAtiva(19))) return false;
    if (this.falha === 249 && this.alarmeRede) return false;
    this.emit('log', `Reset da falha F${String(this.falha).padStart(4, '0')} (${origem})`);
    this.falha = 0; this.v.set(49, 0);
    this.estadoPar = 'normal';
    // depois do reset, comandos HMI precisam de novo "Gira"
    this.hmiGira = false; this.tresFios = false;
    return true;
  }

  /** Chamado pelas interfaces de rede (EtherNet/IP ou Modbus TCP) */
  erroComunicacao(ativo, motivo = '', fonte = 'eip') {
    // cada interface (EtherNet/IP, Modbus TCP) informa seu próprio erro; o alarme
    // A0149 fica ativo enquanto qualquer uma delas estiver em erro.
    if (!this.errosRede) this.errosRede = new Map();
    if (ativo) this.errosRede.set(fonte, motivo); else this.errosRede.delete(fonte);
    ativo = this.errosRede.size > 0;
    if (ativo && !this.alarmeRede) {
      this.alarmeRede = true;
      this.emit('log', `Erro de comunicação Ethernet: ${motivo} — ação P0313 = ${this.v.get(313)}`);
      const acao = this.v.get(313);
      let cw = this.v.get(684);
      switch (acao) {
        case 1: cw &= ~0x0001; break;                       // para por rampa
        case 2: cw &= ~0x0002; break;                       // desabilita geral
        case 3: cw &= ~0x0010; break;                       // vai para LOC
        case 4: {                                           // LOC mantém habilitação/referência
          if (this.locRem === 'REM' && this.fonteGP() === 4) {
            this.hmiGira = bit(cw, 0) && bit(cw, 1);
            this.v.set(121, clamp(Math.round(Math.abs(this.refRede()) * 10), 0, this.v.get(134)));
          }
          cw &= ~0x0010; break;
        }
        case 5: this.gerarFalha(249); break;
        default:
      }
      this.v.set(684, cw);
    } else if (!ativo && this.alarmeRede) {
      this.alarmeRede = false;
      this.emit('log', 'Comunicação Ethernet restabelecida');
    }
  }

  // ===================================================================
  //  SELEÇÃO DE FONTES (Capítulo 7)
  // ===================================================================
  fonteGP() { return this.v.get(this.locRem === 'LOC' ? 224 : 227); }
  fonteGiro() { return this.v.get(this.locRem === 'LOC' ? 223 : 226); }
  fonteJog() { return this.v.get(this.locRem === 'LOC' ? 225 : 228); }
  fonteRef() { return this.v.get(this.locRem === 'LOC' ? 221 : 222); }

  /** Referência via rede (P0685, 13 bits) em Hz, com sinal */
  refRede() { return (this.v.get(685) * this.v.get(403)) / 8192; }

  atualizarLocRem() {
    const s = this.v.get(220);
    const cw = this.v.get(684);
    switch (s) {
      case 0: this.locRem = 'LOC'; break;
      case 1: this.locRem = 'REM'; break;
      case 2: case 3: break; // tecla da HMI altera this.locRem
      case 4: this.locRem = this.funcaoDiAtiva(9) ? 'REM' : 'LOC'; break;
      case 9: case 10: if (this.netEscrito) this.locRem = bit(cw, 4) ? 'REM' : 'LOC'; break;
      default:
    }
  }

  /** Avalia todos os comandos lógicos para a situação atual (LOC ou REM) */
  avaliarComandos() {
    const cw = this.v.get(684);
    const gp = this.fonteGP();
    let gira = false, hab = true, rapida = false;

    if (gp === 0) {                         // teclas da HMI
      gira = this.hmiGira;
    } else if (gp === 1) {                  // entradas digitais
      // "Todas as DIs ajustadas para Habilita Geral, Parada Rápida, Avanço/Retorno e
      //  Start/Stop devem estar ativas para que o inversor possa habilitar o giro"
      if (this.funcaoDiExiste(2)) hab = this.funcaoDiAtiva(2);
      if (this.funcaoDiExiste(3) && !this.funcaoDiAtiva(3)) rapida = true;
      const temGP = this.funcaoDiExiste(1);
      const av = this.funcaoDiAtiva(4) || this.funcaoDiAtiva(35);
      const rt = this.funcaoDiAtiva(5) || this.funcaoDiAtiva(36);
      // três fios: pulso no Start liga, Stop (NF) desliga
      if (this.funcaoDiExiste(6) || this.funcaoDiExiste(37)) {
        const stopOk = this.funcaoDiExiste(7) ? this.funcaoDiAtiva(7) : !this.funcaoDiAtiva(38);
        if (!stopOk) this.tresFios = false;
        else if (this.bordaDi(6) || this.bordaDi(37)) this.tresFios = true;
      }
      if (temGP) gira = this.funcaoDiAtiva(1);
      if (this.funcaoDiExiste(4)) { gira = av !== rt; if (gira) this.dirDiAvRt = av; }
      if (this.funcaoDiExiste(6) || this.funcaoDiExiste(37)) gira = this.tresFios;
      if (!temGP && !this.funcaoDiExiste(4) && !this.funcaoDiExiste(6) && !this.funcaoDiExiste(37) && this.funcaoDiExiste(2))
        gira = hab; // só Habilita Geral programada: funciona como gira/para por inércia
    } else if (gp === 4) {                  // CO/DN/PB/Eth -> palavra P0684
      gira = bit(cw, 0);
      hab = bit(cw, 1);
      rapida = bit(cw, 6);
    }

    // P0229 = 1: "Habilita Rampa" passa a ter função análoga ao Habilita Geral
    // ---------------- sentido de giro ----------------
    const fg = this.fonteGiro();
    let horario = true;
    switch (fg) {
      case 0: horario = true; break;
      case 1: horario = false; break;
      case 2: case 3: horario = this.locRem === 'LOC' ? this.hmiHorario : this.hmiHorarioRem; break;
      case 4: horario = !this.funcaoDiAtiva(8); break; // DI inativa = horário
      case 9: case 10: horario = this.netEscrito ? bit(cw, 2) : this.giroPadrao(fg); break;
      default: horario = true;
    }
    if (gp === 1 && this.funcaoDiExiste(4)) horario = this.dirDiAvRt !== false; // avanço/retorno define sentido

    // ---------------- JOG ----------------
    const fj = this.fonteJog();
    let jog = false;
    if (fj === 1) jog = this.hmiJog;
    else if (fj === 2) jog = this.funcaoDiAtiva(10);
    else if (fj === 5) jog = bit(cw, 3);
    // JOG só atua com Gira/Para = Para e Habilita Geral ativo
    jog = jog && !gira && hab;

    // ---------------- 2ª rampa (P0105) ----------------
    const s105 = this.v.get(105);
    const seg = s105 === 1 || (s105 === 2 && [14, 32, 33, 34, 35, 36].some((f) => this.funcaoDiAtiva(f))) || (s105 === 5 && bit(cw, 5));

    this.giraCmd = gira; this.habGeral = hab; this.paradaRapida = rapida;
    this.horarioCmd = horario; this.jogAtivo = jog; this.segRampa = seg;
  }

  /** Referência de velocidade em Hz (com sinal) antes dos limites */
  avaliarReferencia(dt) {
    const fr = this.fonteRef();
    let ref = 0;
    switch (fr) {
      case 0: ref = this.v.get(121) / 10; break;
      case 1: case 14: ref = (this.v.get(18) / 1000) * this.hz(134); if (fr === 14) ref = Math.max(0, ref); break;
      case 7: {                                    // potenciômetro eletrônico
        const taxa = this.hz(134) / Math.max(0.1, this.v.get(this.segRampa ? 102 : 100) / 10);
        const ac = this.funcaoDiAtiva(11) || this.funcaoDiAtiva(33) || this.funcaoDiAtiva(37);
        const de = this.funcaoDiAtiva(12) || this.funcaoDiAtiva(34) || this.funcaoDiAtiva(38);
        if (ac && de && !this.pwm) this.epRef = this.hz(133);
        else if (ac) this.epRef += taxa * dt;
        else if (de) this.epRef -= taxa * dt;
        this.epRef = clamp(this.epRef, this.hz(133), this.hz(134));
        ref = this.epRef; break;
      }
      case 8: {                                    // multispeed
        const dis = [...this.disComFuncao(13), ...this.disComFuncao(32)].sort();
        let idx = 0;
        // DI de menor número = bit mais significativo (Tabela 7.3: DI1/2/5/6 -> MSB)
        dis.forEach((d, k) => { if (this.di[d]) idx |= 1 << (dis.length - 1 - k); });
        idx <<= (3 - dis.length);
        ref = this.v.get(124 + clamp(idx, 0, 7)) / 10; break;
      }
      case 11: ref = this.refRede(); break;
      default: ref = 0;
    }
    return ref;
  }

  // ===================================================================
  //  CICLO PRINCIPAL — chamado a cada dt segundos
  // ===================================================================
  passo(dt) {
    if (!this.ligado) { this.omega *= Math.exp(-dt / 2); this.planta.passo(dt, this.omega); return; }
    if (this.tBoot > 0) this.tBoot -= dt;

    const pl = this.planta;
    // sensores da esteira -> DI5 / DI6
    this.di[4] = pl.s1; this.di[5] = pl.s2;
    let dis = 0; this.di.forEach((d, i) => { if (d) dis |= 1 << i; });
    this.v.set(12, dis);

    // ---------------- entrada analógica AI1 ----------------
    const x = clamp(this.ai1Volts / 10, 0, 1);
    let ai = x;
    switch (this.v.get(233)) {
      case 1: ai = (x * 20 - 4) / 16; break;
      case 2: ai = 1 - x; break;
      case 3: ai = (20 - x * 20 - 4) / 16; break;
      default:
    }
    ai = ai * (this.v.get(232) / 1000) + this.v.get(234) / 1000;
    const tf = this.v.get(235) / 100;
    this.aiFilt = tf > 0 ? (this.aiFilt ?? ai) + (ai - (this.aiFilt ?? ai)) * Math.min(1, dt / tf) : ai;
    this.v.set(18, Math.round(clamp(this.aiFilt, -1, 1) * 1000));
    if (this.v.get(233) === 1 && x * 20 < 2) this.alarmes.add(163); else this.alarmes.delete(163);

    // ---------------- estado CONFIG ----------------
    this.config47 = this.verificarConfig();
    this.v.set(47, this.config47);

    this.atualizarLocRem();
    this.avaliarComandos();

    // ---------------- reset de falhas ----------------
    const cw = this.v.get(684);
    if (bit(cw, 7) && !bit(this.cwAnt, 7)) this.resetFalha('rede: P0684 bit 7');
    if (this.bordaDi(20)) this.resetFalha('DIx');
    if (this.falha && this.v.get(340) > 0) {
      this.tAutoReset += dt;
      if (this.tAutoReset >= this.v.get(340)) { this.resetFalha('auto-reset P0340'); this.tAutoReset = 0; }
    }
    // falha / alarme externos
    if (this.funcaoDiExiste(19) && !this.funcaoDiAtiva(19)) this.gerarFalha(91);
    if (this.funcaoDiExiste(18) && !this.funcaoDiAtiva(18)) this.alarmes.add(90); else this.alarmes.delete(90);

    // módulo Ethernet com defeito (injeção)
    if (this.inj.moduloEth) {
      if (this.v.get(313) === 5) this.gerarFalha(248); else this.alarmes.add(148);
    } else this.alarmes.delete(148);
    if (this.alarmeRede && this.v.get(313) !== 5) this.alarmes.add(149); else this.alarmes.delete(149);

    // ---------------- autoajuste (simplificado) ----------------
    if (this.autoajuste > 0) {
      this.autoajuste -= dt;
      if (this.autoajuste <= 0) { this.v.set(408, 0); this.v.set(409, Math.round(this.motor().vn / (this.motor().In * 40) * 100)); this.emit('log', 'Autoajuste concluído (P0409 estimado)'); }
    }

    // ---------------- máquina de estados de habilitação ----------------
    const lim = this.limitesUd();
    const sub = this.ud < lim.sub;
    if (sub && this.pwm) this.gerarFalha(21);

    const podeHabilitar = !this.falha && !this.config47 && !sub && this.habGeral && !(this.autoajuste > 0);
    const querGirar = this.giraCmd || this.jogAtivo;
    const modoPar = this.v.get(229);

    if (!this.pwm) {
      if (podeHabilitar && querGirar && !this.paradaRapida) {
        this.pwm = true; this.estadoPar = 'normal'; this.f = 0; this.acc = 0;
      }
    } else {
      if (!this.habGeral || this.falha || this.config47) {          // desabilita geral: inércia
        this.pwm = false;
      } else if (this.paradaRapida && this.estadoPar !== 'rapida') {
        this.estadoPar = 'rapida';
      } else if (!querGirar && this.estadoPar === 'normal') {
        this.estadoPar = modoPar === 1 ? 'inercia' : modoPar === 2 ? 'rapida' : 'rampa';
        if (this.estadoPar === 'inercia') this.pwm = false;
      } else if (querGirar && (this.estadoPar === 'rampa') && !this.paradaRapida) {
        this.estadoPar = 'normal';                                  // religou durante a desaceleração
      }
    }

    // ---------------- referência e limites ----------------
    let refHz = this.avaliarReferencia(dt);
    if (this.jogAtivo) refHz = this.v.get(122) / 10;
    let sinal = this.horarioCmd ? 1 : -1;
    if (refHz < 0) { sinal = -sinal; refHz = -refHz; }
    refHz = clamp(refHz, this.hz(133), this.hz(134));                 // P0133 <= |ref| <= P0134
    // frequências evitadas
    const faixa = this.v.get(306) / 10;
    if (faixa > 0) for (const fe of [this.hz(303), this.hz(304)]) {
      if (Math.abs(refHz - fe) < faixa / 2) refHz = refHz < fe ? fe - faixa / 2 : fe + faixa / 2;
    }
    this.ultimaRef = sinal * refHz;
    const refComLimite = this.ultimaRef;

    // ---------------- gerador de rampa ----------------
    let alvo = 0;
    if (this.pwm) {
      if (this.estadoPar === 'normal') alvo = (this.giraCmd || this.jogAtivo) ? refComLimite : 0;
      else alvo = 0;
    }
    const fmax = Math.max(0.1, this.hz(134));
    let tAc, tDe;
    if (this.estadoPar === 'rapida') { tAc = tDe = this.v.get(106) / 10; }
    else if (this.segRampa) { tAc = this.v.get(102) / 10; tDe = this.v.get(103) / 10; }
    else { tAc = this.v.get(100) / 10; tDe = this.v.get(101) / 10; }
    this.tAcAtual = tAc; this.tDeAtual = tDe;

    const fAnt = this.f;
    if (this.pwm && this.estadoPar !== 'frenagemCC') this.rampa(alvo, fmax / tAc, fmax / tDe, dt, tAc, tDe);
    this.acelerando = Math.abs(this.f) > Math.abs(fAnt) + 1e-9;
    this.desacelerando = Math.abs(this.f) < Math.abs(fAnt) - 1e-9;

    // fim da parada: frenagem CC (P0300) ou corta os pulsos
    if (this.pwm && this.estadoPar !== 'normal' && this.estadoPar !== 'frenagemCC') {
      const tCC = this.v.get(300) / 10;
      if (tCC > 0 && Math.abs(this.f) <= this.hz(301)) { this.estadoPar = 'frenagemCC'; this.tFrenCC = tCC; this.f = 0; }
      else if (Math.abs(this.f) < 0.01) { this.pwm = false; this.f = 0; }
    }
    if (this.estadoPar === 'frenagemCC') {
      this.tFrenCC -= dt;
      if (this.tFrenCC <= 0 || querGirar) { this.pwm = querGirar && podeHabilitar; this.estadoPar = 'normal'; }
    }
    if (!this.pwm) { this.f = 0; this.acc = 0; }

    // ---------------- motor + carga (subpassos) ----------------
    this.simularMotor(dt);

    // ---------------- proteções ----------------
    this.protecoes(dt);

    // ---------------- saídas e palavras de estado ----------------
    this.atualizarSaidas();
    this.atualizarEstado();

    this.diAnt = [...this.di]; this.cwAnt = cw;
  }

  /**
   * Rampa linear ou S (P0104). Aceleração = P0134 / tempo de rampa.
   * Inversão de sentido passa por zero (desacelera, depois acelera).
   */
  rampa(alvo, taxaAc, taxaDe, dt, tAc, tDe) {
    let f = this.f;
    // retenção da rampa por limitação de corrente ou regulação do barramento CC
    const subindo = Math.abs(alvo) > Math.abs(f) && Math.sign(alvo || 1) === Math.sign(f || alvo || 1);
    if (this.holdRampa && (subindo ? this.limitando === 'corrente' : this.limitando === 'ud')) return;

    const sCurve = this.v.get(104) === 1;
    let destino = alvo;
    if (f !== 0 && Math.sign(alvo) !== Math.sign(f) && alvo !== 0) destino = 0; // passa por zero
    const dif = destino - f;
    if (Math.abs(dif) < 1e-6) { this.acc = 0; this.f = destino; return; }
    const afastando = Math.abs(destino) > Math.abs(f);
    const taxa = afastando ? taxaAc : taxaDe;
    if (!sCurve) {
      const passo = Math.sign(dif) * Math.min(Math.abs(dif), taxa * dt);
      this.f = f + passo;
      this.acc = passo / dt;
      return;
    }
    // Rampa S: aceleração varia com "jerk" limitado (~25% do tempo de rampa em cada curva)
    const tRampa = afastando ? tAc : tDe;
    const jerk = taxa / Math.max(0.05, 0.25 * tRampa);
    const dist = Math.abs(dif);
    const aAbs = Math.abs(this.acc);
    const freioNecessario = (aAbs * aAbs) / (2 * jerk);
    let aDesejada = Math.sign(dif) * taxa;
    if (dist <= freioNecessario + aAbs * dt) aDesejada = 0;
    const dA = clamp(aDesejada - this.acc, -jerk * dt, jerk * dt);
    this.acc += dA;
    if (Math.sign(this.acc) !== Math.sign(dif)) this.acc = Math.sign(dif) * Math.min(Math.abs(this.acc), jerk * dt);
    let passo = this.acc * dt;
    if (Math.abs(passo) > dist || (dist < 0.02)) { passo = dif; this.acc = 0; }
    this.f = f + passo;
  }

  /**
   * Motor de indução em V/f:
   *  - escorregamento x = n_síncrona - n_rotor (rpm)
   *  - torque de Kloss: T = 2·Tk·x·xk / (x² + xk²) · Φ²
   *  - corrente: Im (magnetização) e It (ativa, proporcional ao torque/fluxo)
   *  - J·dω/dt = Tm - Tcarga
   */
  simularMotor(dt) {
    const m = this.motor();
    const pl = this.planta;
    const carga = pl.cargaNoMotor();
    const jTot = m.j + carga.j;
    const N = 20;
    const h = dt / N;
    const fn = m.fn;
    const fAbs = Math.abs(this.f);
    const fluxo = fAbs <= fn ? 1 : fn / fAbs;                         // enfraquecimento de campo
    const fase = !this.inj.faltaFaseMotor;
    let T = 0;
    let I = 0;
    let x = 0;
    for (let k = 0; k < N; k++) {
      T = 0;
      if (this.pwm && fase) {
        const nSinc = (60 * this.f) / m.pp;                            // rpm síncrona (com sinal)
        const nRotor = (this.omega * 60) / (2 * Math.PI);
        x = nSinc - nRotor;                                            // escorregamento em rpm
        if (this.estadoPar === 'frenagemCC') x = -nRotor * (this.v.get(302) / 200);
        T = ((2 * m.tK * x * m.sK) / (x * x + m.sK * m.sK)) * fluxo * fluxo;
      }
      // carga: gravidade + atrito de Coulomb (com aderência quando parado) + viscoso
      const tExt = T + carga.tGrav;
      let a;
      if (Math.abs(this.omega) < 1e-3) {
        if (Math.abs(tExt) <= carga.tAtrito) { this.omega = 0; continue; }
        a = (tExt - Math.sign(tExt) * carga.tAtrito) / jTot;
      } else {
        a = (tExt - Math.sign(this.omega) * carga.tAtrito - carga.b * this.omega) / jTot;
      }
      const omNovo = this.omega + a * h;
      // passou por zero: para e deixa o atrito estático decidir no próximo subpasso
      this.omega = (Math.sign(omNovo) !== Math.sign(this.omega) && this.omega !== 0) ? 0 : omNovo;
    }
    // corrente do motor
    if (this.pwm && fase) {
      // corrente de magnetização + corrente rotórica referida (cresce com o escorregamento
      // e satura em ~4,8 x nominal no rotor bloqueado — como no circuito equivalente)
      const im = m.In * Math.sqrt(1 - m.fp * m.fp) * Math.min(1, fluxo * 1.05);
      const kN = Math.sqrt(1 + (m.sN / m.sK) ** 2);
      const i2 = (m.In * m.fp * (Math.abs(x) / m.sN) * kN) / Math.sqrt(1 + (x / m.sK) ** 2) * fluxo;
      I = Math.sqrt(im * im + i2 * i2);
      if (fAbs < 0.5 && this.estadoPar !== 'frenagemCC') I *= fAbs / 0.5 + 0.2;
    }
    // tensão de saída (curva V/f linear + boost manual P0136)
    const vMax = (m.vn * this.v.get(142)) / 1000;
    const boost = (m.vn * this.v.get(136)) / 1000;
    let V = 0;
    if (this.pwm) V = Math.min(vMax, Math.max((m.vn * fAbs) / fn, boost * (1 - fAbs / fn) + (m.vn * fAbs) / fn));
    if (this.estadoPar === 'frenagemCC') V = (m.vn * this.v.get(302)) / 1000 * 0.2;
    // potência elétrica (potência no entreferro + perdas no estator)
    const omegaS = (2 * Math.PI * this.f) / m.pp;
    const pEl = this.pwm ? T * omegaS + 3 * m.rs * I * I * 0.3 : 0;

    // ---------------- barramento CC ----------------
    const C = 470e-6;
    const uRet = this.udRetificado();
    let ud = this.ud;
    if (pEl < 0) {                                       // regenerando: energia carrega o capacitor
      ud = Math.sqrt(Math.max(0, ud * ud + (2 * -pEl * dt) / C));
    } else {
      const alvoUd = uRet - 0.015 * pEl / 10;            // pequena queda com carga
      ud = ud > alvoUd ? Math.max(alvoUd, ud - (ud - alvoUd) * Math.min(1, dt / 0.8) - 2 * dt * 20) : alvoUd + (ud - alvoUd) * Math.exp(-dt / 0.02);
    }
    this.ud = ud;

    // filtro da corrente (P0139)
    const tfI = Math.max(0.001, this.v.get(139) / 1000);
    this.iFilt += (I - this.iFilt) * Math.min(1, dt / tfI);
    this.motorT = T; this.motorI = I; this.vOut = V; this.pElet = pEl; this.fluxo = fluxo;
    this.fSaida = this.pwm ? this.f : 0;
    this.motorM = m;

    pl.passo(dt, this.omega);
  }

  protecoes(dt) {
    const m = this.motorM;
    const I = this.motorI;
    const lim = this.limitesUd();
    const mask = this.v.get(343);
    const fAbs = Math.abs(this.fSaida);

    // limitação de corrente (P0135) e regulação do barramento CC (P0150/P0151)
    this.holdRampa = false; this.limitando = false;
    const p150 = this.v.get(150);
    if (this.pwm && I > this.v.get(135) / 10) {
      this.limitando = 'corrente';
      if (p150 === 2 || p150 === 3 || this.acelerando) this.holdRampa = true;   // Hold_LC (ou durante aceleração)
      else if (fAbs > 0.5) {                                                      // Desac_LC
        const exc = I / (this.v.get(135) / 10) - 1;
        this.f -= Math.sign(this.f) * (this.hz(134) / (this.v.get(106) / 10)) * (1 + 8 * exc) * dt;
      }
    }
    if (this.pwm && this.ud > this.v.get(151)) {
      this.limitando = 'ud';
      if (p150 === 0 || p150 === 2) this.holdRampa = true;                       // Hold_Ud
      else this.f += Math.sign(this.f) * (this.v.get(152) / 100) * (this.ud - this.v.get(151)) * dt; // Acel_Ud
    }

    // limitador rápido de corrente (regulador interno, ciclo a ciclo): se a corrente passa
    // muito do P0135 (ex.: motor "desengatou" por travamento), a frequência é trazida
    // instantaneamente para perto da rotação do rotor, limitando o escorregamento.
    const iLim = this.v.get(135) / 10;
    if (this.pwm && I > 1.15 * iLim && this.estadoPar !== 'frenagemCC') {
      const im = m.In * Math.sqrt(1 - m.fp * m.fp);
      const i2Alvo = Math.sqrt(Math.max(0.01, iLim * iLim - im * im));
      const A = (m.In * m.fp * Math.sqrt(1 + (m.sN / m.sK) ** 2)) / m.sN * (this.fluxo || 1);
      const den = A * A - (i2Alvo / m.sK) ** 2;
      const xAlvo = den > 0 ? i2Alvo / Math.sqrt(den) : m.sK;
      const nRotor = (this.omega * 60) / (2 * Math.PI);
      const sentido = Math.sign(this.f) || 1;
      this.f = ((nRotor + sentido * xAlvo) * m.pp) / 60;
      if (Math.sign(this.f) !== sentido) this.f = 0;
      this.limitando = 'corrente'; this.holdRampa = true;
    }

    // sobrecorrente (hardware) — curto-circuito injetado ou corrente acima da proteção
    if (this.pwm && (this.inj.curto || I > 3.5 * (this.v.get(295) / 10))) this.gerarFalha(70);
    if (this.pwm && this.inj.faltaTerra && (mask & 0x01)) this.gerarFalha(74);
    if (this.pwm && this.inj.faltaFaseMotor && (mask & 0x10) && fAbs > 1) this.gerarFalha(76);
    if (this.ud > lim.sobre) this.gerarFalha(22);

    // Ixt do motor (F0072/A0046): 150 % da corrente de sobrecarga -> 60 s
    const iSob = (fAbs > 0.5 * m.fn ? this.v.get(156) : fAbs > 0.05 * m.fn ? this.v.get(157) : this.v.get(158)) / 10;
    const r = iSob > 0 ? this.iFilt / iSob : 0;
    if (r > 1) this.ixt += (100 * (r * r - 1)) / (1.25 * 60) * dt;
    else this.ixt -= (100 * (1 - r * r)) / 600 * dt;
    this.ixt = clamp(this.ixt, 0, 100);
    if (this.ixt >= 100) this.gerarFalha(72);
    if (this.ixt > this.v.get(349) && this.v.get(349) < 100) this.alarmes.add(46); else this.alarmes.delete(46);

    // sobrecarga dos IGBTs (F0048/A0047): 200 % de P0295 -> 3 s, inativa abaixo de 150 %
    const q = this.iFilt / (this.v.get(295) / 10);
    if (q > 1.5) this.ixtIgbt += (100 * (q * q - 2.25)) / (3 * 1.75) * dt;
    else this.ixtIgbt -= 10 * dt;
    this.ixtIgbt = clamp(this.ixtIgbt, 0, 100);
    if (this.ixtIgbt >= 100 && (mask & 0x02)) this.gerarFalha(48);
    if (this.ixtIgbt > this.v.get(349)) this.alarmes.add(47); else this.alarmes.delete(47);

    // temperatura do módulo de potência (NTC)
    const tAlvo = 28 + 38 * q * q * Math.sqrt(this.v.get(297) / 5000);
    this.temp += (tAlvo - this.temp) * Math.min(1, dt / 90);
    if (this.temp > 95) this.alarmes.add(50); else this.alarmes.delete(50);
    if (this.temp > 110) this.gerarFalha(51);
  }

  atualizarSaidas() {
    const v = this.v;
    const fAbs = Math.abs(this.fSaida);
    const fx = this.hz(288), hist = this.hz(287);
    const ref = Math.abs(this.ultimaRef);
    const I = this.iFilt;
    const tq = this.motorM ? (100 * this.motorT) / this.motorM.tn : 0;
    let dos = 0;
    this.doAnt = this.doAnt || [false, false, false, false, false];
    for (let i = 0; i < 5; i++) {
      const fn = v.get(275 + i);
      let s = false;
      switch (fn) {
        case 1: s = ref > fx; break;
        case 2: s = this.doAnt[i] ? fAbs > fx - hist : fAbs > fx + hist; break;
        case 3: s = this.doAnt[i] ? fAbs < fx + hist : fAbs < fx - hist; break;
        case 4: s = this.pwm && Math.abs(fAbs - ref) < Math.max(hist, 0.1); break;
        case 6: s = I > v.get(290) / 10; break;
        case 7: s = I < v.get(290) / 10; break;
        case 8: s = tq > v.get(293); break;
        case 9: s = tq < v.get(293); break;
        case 10: s = this.locRem === 'REM'; break;
        case 11: s = this.pwm; break;
        case 12: s = !this.falha && !this.pwm && !this.config47 && this.ud >= this.limitesUd().sub; break;
        case 13: s = !this.falha; break;
        case 14: s = this.falha !== 70; break;
        case 16: s = this.falha !== 21 && this.falha !== 22; break;
        case 18: s = this.falha !== 72; break;
        case 20: s = bit(v.get(695), i); break;
        case 21: s = this.horarioCmd; break;
        case 25: s = this.ud > this.limitesUd().sub; break;
        case 26: s = !!this.falha; break;
        case 35: s = this.alarmes.size === 0; break;
        case 36: s = !this.falha && this.alarmes.size === 0; break;
        default: s = false;
      }
      this.doAnt[i] = s;
      if (s) dos |= 1 << i;
    }
    v.set(13, dos);

    // saídas analógicas AO1/AO2 (0..100 %)
    const aoVal = (fn) => {
      switch (fn) {
        case 0: return ref / this.hz(134);
        case 2: return fAbs / this.hz(134);
        case 5: return I / (1.5 * v.get(295) / 10);
        case 7: return Math.abs(I * (this.motorT >= 0 ? 1 : -1)) / (1.5 * v.get(295) / 10);
        case 11: return Math.abs(tq) / 200;
        case 16: return this.ixt / 100;
        case 18: case 19: case 20: return v.get(696 + fn - 18) / 32767;
        default: return 0;
      }
    };
    v.set(14, Math.round(clamp(aoVal(v.get(251)) * (v.get(252) / 1000), 0, 1) * 1000));
    v.set(15, Math.round(clamp(aoVal(v.get(254)) * (v.get(255) / 1000), 0, 1) * 1000));
  }

  atualizarEstado() {
    const v = this.v;
    const m = this.motorM;
    const fAbs = Math.abs(this.fSaida);
    const lim = this.limitesUd();
    const sub = this.ud < lim.sub;
    const ref = this.ultimaRef;
    const rpmRef = v.get(208);

    // leitura
    v.set(1, Math.round((Math.abs(ref) * rpmRef) / Math.max(1, v.get(403))));
    v.set(2, Math.round((fAbs * rpmRef) / Math.max(1, v.get(403))));
    v.set(3, Math.round(this.iFilt * 10));
    v.set(4, Math.round(this.ud));
    v.set(5, Math.round(fAbs * 10));
    v.set(7, Math.round(this.vOut));
    v.set(9, Math.round(clamp((1000 * this.motorT) / m.tn, -10000, 10000)));
    const pkW = this.pwm ? this.pElet / 1000 : 0;
    v.set(10, Math.round(Math.max(0, pkW) * 10));
    const s = Math.sqrt(3) * this.vOut * this.motorI;
    v.set(11, s > 1 ? Math.round(clamp(this.pElet / s, -1, 1) * 100) : 0);
    v.set(30, Math.round(this.temp));
    v.set(37, Math.round(this.ixt));
    const listaAl = [...this.alarmes].sort((a, b) => b - a);
    v.set(48, listaAl[0] || 0);

    // P0006 — estado do inversor
    let st = 0;
    if (this.falha) st = 3;
    else if (this.autoajuste > 0) st = 4;
    else if (this.config47) st = 5;
    else if (this.estadoPar === 'frenagemCC') st = 6;
    else if (sub) st = 2;
    else if (this.pwm) st = 1;
    v.set(6, st);

    // P0680 — palavra de estado (Tabela 5.2 do manual Ethernet)
    let w = 0;
    if (this.giraCmd) w |= 1 << 1;
    if (this.estadoPar === 'rapida' && this.pwm) w |= 1 << 4;
    if (this.segRampa) w |= 1 << 5;
    if (this.config47) w |= 1 << 6;
    if (this.alarmes.size) w |= 1 << 7;
    if (this.pwm && this.estadoPar !== 'frenagemCC') w |= 1 << 8;
    if (this.habGeral && !this.falha) w |= 1 << 9;
    if (this.pwm ? this.f >= 0 && this.horarioOuF() : this.horarioCmd) w |= 1 << 10;
    if (this.jogAtivo && this.pwm) w |= 1 << 11;
    if (this.locRem === 'REM') w |= 1 << 12;
    if (sub) w |= 1 << 13;
    if (this.falha) w |= 1 << 15;
    v.set(680, w);

    // P0681 — velocidade 13 bits (8192 = P0403), negativa no sentido reverso
    v.set(681, Math.round(clamp((this.fSaida * 8192) / Math.max(1, v.get(403)), -32768, 32767)));

    // P0690 — estado lógico 2
    let w2 = 0;
    if (this.desacelerando && this.pwm) w2 |= 1 << 6;
    if (this.acelerando && this.pwm) w2 |= 1 << 7;
    if (this.holdRampa) w2 |= 1 << 8;
    if (this.pwm && Math.abs(this.f - (this.estadoPar === 'normal' ? ref : 0)) < 0.05) w2 |= 1 << 9;
    if (this.limitando) w2 |= 1 << 10;
    if (v.get(403) === 50) w2 |= 1 << 11;
    if (this.estadoPar === 'frenagemCC') w2 |= 1 << 14;
    if (this.pwm) w2 |= 1 << 15;
    v.set(690, w2);
  }

  horarioOuF() { return this.f > 0 || (this.f === 0 && this.horarioCmd); }

  // ===================================================================
  //  TECLAS DA HMI que atuam no acionamento (o restante está em hmi.js)
  // ===================================================================
  teclaAcionamento(tecla, pressionada) {
    if (!this.ligado || this.tBoot > 0) return;
    const loc = this.locRem === 'LOC';
    switch (tecla) {
      case 'start':
        if (pressionada && this.fonteGP() === 0) this.hmiGira = true;
        break;
      case 'stop':
        if (!pressionada) break;
        if (this.falha) { this.resetFalha('HMI'); break; }
        if (this.fonteGP() === 0) this.hmiGira = false;
        break;
      case 'giro': {
        if (!pressionada) break;
        const fg = this.fonteGiro();
        if (fg === 2 || fg === 3) { if (loc) this.hmiHorario = !this.hmiHorario; else this.hmiHorarioRem = !this.hmiHorarioRem; }
        break;
      }
      case 'locrem': {
        if (!pressionada) break;
        const s = this.v.get(220);
        if (s === 2 || s === 3) {
          this.locRem = loc ? 'REM' : 'LOC';
          this.emit('log', `Tecla LOC/REM: situação ${this.locRem}`);
        }
        break;
      }
      case 'jog':
        this.hmiJog = pressionada && this.fonteJog() === 1;
        break;
      default:
    }
  }

  // ===================================================================
  //  INSTANTÂNEO PARA A INTERFACE
  // ===================================================================
  estado() {
    const m = this.motorM || this.motor();
    const pl = this.planta;
    return {
      ligado: this.ligado, boot: this.tBoot > 0,
      f: this.fSaida || 0, ref: this.ultimaRef, rpm: (this.omega * 60) / (2 * Math.PI),
      nSinc: (60 * (this.fSaida || 0)) / m.pp, i: this.iFilt, ud: this.ud, v: this.vOut,
      torque: m.tn ? (100 * this.motorT) / m.tn : 0, pot: this.pElet / 1000, ixt: this.ixt, ixtIgbt: this.ixtIgbt, temp: this.temp,
      pwm: this.pwm, locRem: this.locRem, falha: this.falha, alarmes: [...this.alarmes],
      giraCmd: this.giraCmd, habGeral: this.habGeral, horario: this.horarioCmd, jog: this.jogAtivo,
      paradaRapida: this.paradaRapida, segRampa: this.segRampa, estadoPar: this.estadoPar,
      limitando: this.limitando, config: this.config47,
      fontes: { gp: this.fonteGP(), giro: this.fonteGiro(), jog: this.fonteJog(), ref: this.fonteRef() },
      di: this.di, ai1: this.ai1Volts, dos: this.v.get(13), ao1: this.v.get(14), ao2: this.v.get(15),
      p680: this.v.get(680), p681: this.v.get(681), p684: this.v.get(684), p685: this.v.get(685), p690: this.v.get(690),
      p006: this.v.get(6), redeVac: this.redeVac, inj: this.inj,
      planta: pl.estado(this.omega),
    };
  }
}

module.exports = { CFW500 };
