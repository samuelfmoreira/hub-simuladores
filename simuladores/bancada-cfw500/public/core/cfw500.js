/* Bancada CFW500 - núcleo: motor de indução + inversor CFW500 (determinístico, sem relógio do PC: tempo só por passo(dt)).
 * O comportamento segue o Manual de Programação CFW500 V3.9X; o que é dedução está marcado com "DEDUÇÃO" e listado no guia. */
(function (g) {
  'use strict';
  const SIM = g.SIM = g.SIM || {};
  if (!SIM.params && typeof require !== 'undefined') require('./params.js');
  const { LISTA, MAPA, INOM } = SIM.params;
  const lim = (v, a, b) => Math.max(a, Math.min(b, v));
  const sg = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const R3 = Math.sqrt(3);

  // =================================================================== MOTOR (W22 0,75 kW, 4 polos, 220 V em triângulo)
  const PLACA = { modelo: 'W22 IR3 Premium', kw: 0.75, cv: 1, v: 220, vY: 380, i: 2.98, iY: 1.72, rpm: 1725, hz: 60, cos: 0.80, rend: 82.6, fs: 1.25, polos: 4, ipIn: 7.2 };
  const RS = 3.4;                       // ohm por fase (equivalente em estrela): 6,8 ohm medidos entre dois bornes
  const WN = PLACA.rpm * 2 * Math.PI / 60, TN = PLACA.kw * 1000 / WN;   // 180,6 rad/s · 4,15 N·m
  const TMAX = 2.8 * TN, FK = 13.54;    // conjugado máximo e escorregamento (Hz) em que ele ocorre -> 4,15 N·m com 2,5 Hz de escorregamento
  const BP = 1.33, CP = 9;              // barra profunda da gaiola: conjugado de partida de 2,3 x o nominal com tensão plena (sem isso a fórmula de Kloss daria 1,2 x)
  const IM0 = 1.8, CR = 13.08;          // corrente de magnetização e constante da corrente do rotor -> 2,98 A na carga nominal
  const EN = PLACA.v / R3 - RS * PLACA.i * 0.85;

  class Motor {
    constructor() { this.placa = PLACA; this.w = 0; this.ang = 0; this.carga = 0.3; this.volante = false; this.travado = false; this.zera(); this.iF = 0; }
    zera() { this.i = 0; this.ia = 0; this.torque = 0; this.pe = 0; this.phi = 0; this.fe = 0; this.fs = 0; }
    get rpm() { return this.w * 60 / (2 * Math.PI); }
    get hzRotor() { return this.w / Math.PI; }               // 4 polos: f = w·(p/2)/(2π)
    /** s = { f (Hz ≥ 0), v (V eficaz fase-fase), seq (+1 horário / -1), fases (0, 2 ou 3), cc (0..1 frenagem CC) } */
    passo(dt, s) {
      const fr = this.hzRotor; let te = 0, i = 0, ia = 0, pe = 0, fluxo = 0, fEst = 0;
      if (s.cc > 0 && s.fases >= 2) {                         // corrente contínua no estator: freia proporcional à velocidade
        i = s.cc * PLACA.v / (2 * RS);
        te = -TN * 0.5 * (i / PLACA.i) ** 2 * Math.tanh(this.w / 12); pe = 2 * RS * i * i;
      } else if (s.fases >= 2 && s.f > 0.05 && s.v > 1) {
        // fluxo: a tensão por fase se divide entre a queda no estator (RS·I) e a f.c.e.m. (proporcional a fluxo × frequência)
        const fe = s.f * s.seq, x = (fe - fr) / FK, gx = Math.abs(x) / Math.sqrt(1 + x * x), vph = s.v / R3, kE = EN / PLACA.hz;
        const sat = (p) => (p <= 1 ? p : p + 5 * (p - 1) ** 2);                // saturação: boost demais vira corrente
        let phi = vph / (0.85 * RS * Math.hypot(IM0, CR * gx) + s.f * kE);
        for (let k = 0; k < 4 && phi > 1; k++) phi = 0.5 * phi + 0.5 * vph / (0.85 * RS * Math.hypot(IM0 * sat(phi) / phi, CR * gx) + s.f * kE);
        const im = IM0 * sat(phi); fluxo = phi; fEst = fe;
        let ir = phi * CR * gx;
        te = 2 * TMAX * phi * phi * x / (1 + x * x) * (1 + BP * x * x / (CP + x * x));   // Kloss + efeito de barra profunda (só pesa com escorregamento alto: partida)
        if (s.fases === 2) { te *= Math.abs(this.w) < 8 ? 0 : 0.45; ir *= 1.9; }   // falta de fase: não parte, ronca e a corrente sobe
        ia = ir * sg(x); i = Math.sqrt(im * im + ir * ir);
        pe = te * (2 * Math.PI * fe / 2) + 3 * RS * i * i + 25;
      }
      // carga: atrito + freio de bancada (torque constante contra o movimento) + volante de inércia opcional
      const j = 0.0035 + (this.volante ? 0.03 : 0);
      const tFreio = this.travado ? 50 : 0.1 + this.carga * (TN - 0.245);     // carga = 1 -> conjugado nominal no eixo, já com os atritos
      if (Math.abs(this.w) < 0.3 && Math.abs(te) <= tFreio) this.w = 0;
      else {
        const tRes = sg(this.w || te) * tFreio + 0.0008 * this.w;
        const w0 = this.w; this.w += (te - tRes) / j * dt;
        if (w0 !== 0 && sg(w0) !== sg(this.w) && Math.abs(te) <= tFreio) this.w = 0;
      }
      this.ang += this.w * dt;
      this.i = i; this.ia = ia; this.torque = te; this.pe = pe;
      this.phi = fluxo; this.fe = fEst; this.fs = fEst ? fEst - fr : 0;      // fluxo (pu), frequência do estator e de escorregamento (Hz, com sinal): usados na tela do campo girante
    }
  }

  // =================================================================== INVERSOR
  const C_LINK = 940e-6, I_F70 = 2.3 * INOM;
  // classe de tensão do inversor: 220 = CFW500A04P3B2 (200-240 V) · 380 = CFW500A04P3T4 (380-480 V). Muda os níveis do link DC e alguns padrões de fábrica.
  const CLASSE = { 220: { sub: 200, sobre: 410, liga: 170, desliga: 110, faixaUd: 40, def: { 29: 3 } },
    380: { sub: 360, sobre: 810, liga: 300, desliga: 200, faixaUd: 80, def: { 29: 9, 296: 1, 151: 800, 153: 750, 185: 800, 190: 380, 321: 436, 322: 423, 323: 462, 400: 380 } } };
  const DEF50 = { 125: 5, 126: 10, 127: 20, 128: 30, 129: 40, 130: 50, 131: 55, 134: 55, 145: 50, 146: 33.3, 147: 16.7, 208: 500, 402: 1425, 403: 50 };
  const HIST = [50, 51, 52, 53, 54, 55, 60, 61, 62, 63, 64, 65, 70, 71, 72, 73, 74, 75];

  class CFW500 {
    constructor(o = {}) {
      this.classe = o.salvo && CLASSE[o.salvo.classe] ? o.salvo.classe : 220;
      this.P = {}; LISTA.forEach((p) => { this.P[p.n] = p.def; }); Object.assign(this.P, CLASSE[this.classe].def);
      this.usuario = { 1: null, 2: null }; this.senha = 5; this.acesso = false;
      this.aoGravar = o.aoGravar || (() => {}); this.aoEvento = o.aoEvento || (() => {});
      if (o.salvo) this.carregar(o.salvo);
      this.ent = { vLinha: 0, fases: 0, diV: [24, 24, 24, 24], aiV: 0, aiCorrente: false, motor: { fases: 0, seq: 1, curto: false, terra: false }, i: 0, ia: 0, torque: 0, pe: 0, hzRotor: 0 };
      this.sai = { vivo: false, pwm: false, f: 0, v: 0, cc: 0, do1: false, do2: false, ao1: 0 };
      this.ud = 0; this.vivo = false; this.boot = 0; this.falhaCod = 0; this.alarme = 0;
      this.di = [false, false, false, false]; this.diAnt = [false, false, false, false];
      this.fr = 0; this.fS = 0; this.fOut = 0; this.vfs = 1; this.estado = 0; this.locHMI = true; this.giroHMI = 1;
      this.runHMI = false; this.jogHMI = false; this.run3 = false; this.runEP = false; this.armado = false; this.exigeBorda = false; this.jogando = false; this.ep = 0; this.pwm = false;
      this.ccT = 0; this.ccFase = ''; this.iFilt = 0; this.aiFilt = 0; this.ixt = 0; this.igbt = 0; this.tAuto = 0; this.tReset = 0; this.tDormir = 0;
      this.dormindo = false; this.t76 = 0; this.dUd = 0; this.udAnt = 0; this.hist = { 2: false, 3: false }; this.evitaLado = -1; this.refAlvo = 0; this.rampa = ''; this.limit = '';
      this.hmi = SIM.HMI ? new SIM.HMI(this) : null;
    }

    // ---------------------------------------------------------------- memória (EEPROM)
    carregar(s) {
      if (s.P) for (const k in s.P) { const p = MAPA[k]; if (p && (!p.ro || HIST.includes(+k) || [42, 43, 44].includes(+k))) this.P[k] = s.P[k]; }
      if (s.usuario) this.usuario = s.usuario; if (s.senha) this.senha = s.senha;
    }
    paraGravar() {
      const P = {}; LISTA.forEach((p) => { if ((!p.ro && this.P[p.n] !== p.def && p.n !== 0) || HIST.includes(p.n) || [42, 43, 44].includes(p.n)) P[p.n] = this.P[p.n]; });
      return { P, usuario: this.usuario, senha: this.senha, classe: this.classe };
    }
    _fabrica(hz50) {
      LISTA.forEach((p) => { if (!p.ro) this.P[p.n] = p.def; }); Object.assign(this.P, CLASSE[this.classe].def); if (hz50) Object.assign(this.P, DEF50);
      this.acesso = false; this.locHMI = true; this.giroHMI = 1; this.runHMI = false;
    }
    /** Parametrização automática: padrão de fábrica e depois a lista [[n, valor], ...]. Grava mesmo com o inversor desligado. */
    parametrizar(lista) {
      this._fabrica(false); let n = 0;
      for (const [k, v] of lista) { const p = MAPA[k]; if (!p || p.ro) continue; this.P[k] = lim(+Number(v).toFixed(p.dec), p.min, p.max); n++; }
      this.P[121] = lim(this.P[121], this.P[133], this.P[134]); this.runHMI = false; this.run3 = false; this.runEP = false;
      this.aoGravar(); this.aoEvento(`Parametrização automática: padrão de fábrica e ${n} parâmetro(s).`); return n;
    }
    get rodando() { return this.pwm; }
    get niveis() { return CLASSE[this.classe]; }
    /** valor de fábrica de um parâmetro neste inversor (alguns dependem da classe de tensão) */
    padrao(n) { const d = CLASSE[this.classe].def; return n in d ? d[n] : MAPA[n].def; }
    /** Troca o inversor pelo de outra classe de tensão (220 ou 380 V): volta ao padrão de fábrica daquele modelo. */
    trocaClasse(v) { if (!CLASSE[v] || v === this.classe) return false; this.classe = v; this._fabrica(false); this.ud = 0; this.falhaCod = 0; this.aoGravar(); this.aoEvento(`Inversor da classe ${v === 380 ? '380-480 V (CFW500A04P3T4)' : '200-240 V (CFW500A04P3B2)'}, no padrão de fábrica.`); return true; }

    /** Altera um parâmetro pela HMI ou pela aba Parâmetros, com as mesmas recusas do inversor real. */
    set(n, v) {
      const p = MAPA[n], P = this.P; if (!p) return { ok: false, msg: 'parâmetro inexistente' };
      if (!this.vivo) return { ok: false, msg: 'inversor desenergizado' };
      if (p.ro) return { ok: false, msg: 'somente leitura (ro)' };
      v = lim(+Number(v).toFixed(p.dec), p.min, p.max);
      if (n === 0) { P[0] = v; this.acesso = v === this.senha; return { ok: true }; }
      if (P[200] === 1 && !this.acesso) return { ok: false, msg: 'senha ativa: ajuste P0000 com a senha' };
      if (this._diFn(26)) return { ok: false, msg: 'programação bloqueada por DIx (Bloqueia Prog.)' };
      if (p.cfg && this.pwm) return { ok: false, msg: 'parâmetro cfg: só altera com o motor parado' };
      if (n === 200) { if (v > 1) { this.senha = v; v = 1; } }
      if (n === 408) {
        if (![3, 4, 5].includes(P[202])) return { ok: false, msg: 'autoajuste só nos modos VVW e vetorial (P0202)' };
        if (v > 0) { this.tAuto = 4; }
      }
      if (n === 204) {
        if (v === 5 || v === 6) { this._fabrica(v === 6); this.aoEvento('Padrão de fábrica carregado (' + (v === 6 ? '50' : '60') + ' Hz).'); }
        else if (v === 9 || v === 10) this.usuario[v - 8] = Object.assign({}, this.paraGravar().P);
        else if (v === 7 || v === 8) { const u = this.usuario[v - 6]; if (!u) return { ok: false, msg: 'memória de usuário vazia' }; this._fabrica(false); this.carregar({ P: u }); }
        else if (v === 3) P[43] = 0; else if (v === 4) P[44] = 0;
        this.aoGravar(); return { ok: true };
      }
      P[n] = v;
      if (n === 121 || n === 133 || n === 134) P[121] = lim(P[121], P[133], P[134]);
      this.aoGravar(); return { ok: true };
    }

    // ---------------------------------------------------------------- entradas digitais
    _fn() { return [this.P[263], this.P[264], this.P[265], this.P[266]]; }
    _diFn(...cods) { const f = this._fn(); for (let i = 0; i < 4; i++) if (cods.includes(f[i])) return this.di[i]; return null; }
    _bordaFn(...cods) { const f = this._fn(); for (let i = 0; i < 4; i++) if (cods.includes(f[i]) && this.di[i] && !this.diAnt[i]) return true; return false; }
    _tem(...cods) { return this._fn().some((c) => cods.includes(c)); }
    diPnp(i) { return i < this.P[271]; }                       // i = 0..3: DI1..DI(P0271) são PNP

    /** Tabela 0.1 do manual: situações para o estado CONFIG (P0047). */
    _config() {
      const P = this.P, f = this._fn(), q = (...c) => f.filter((x) => c.includes(x)).length;
      const refs = [P[221], P[222]], gp = [P[224], P[227]];
      if (P[317] === 1) return 30; if (this.tAuto > 0) return 28;
      if (q(4, 35, 52) > 1) return 1; if (q(5, 36, 53) > 1) return 2; if (q(6) > 1) return 3; if (q(7) > 1) return 4;
      if (q(8) > 1 || (q(8) && q(4, 5, 35, 36, 52, 53))) return 5;
      if (q(9) > 1) return 6; if (q(11, 33, 37) > 1) return 7; if (q(12, 34, 38) > 1) return 8; if (q(14) > 1) return 9;
      if (q(26) > 1) return 12; if (q(27) > 1) return 13; if (q(28) > 1) return 14;
      if (!!q(4, 35, 52) !== !!q(5, 36, 53)) return 15; if (!!q(6) !== !!q(7)) return 16;
      if (refs.includes(8) !== !!q(13, 32)) return 17; if (refs.includes(7) !== !!q(11, 33, 37)) return 18;
      if (gp.includes(1) && !q(1, 2, 3, 4, 6, 35, 37, 51, 52)) return 19;
      if (f[1] === 29) return 20; if (P[203] === 1 && refs.includes(1)) return 21;
      if (refs.some((r) => [2, 3, 15, 16].includes(r))) return 25;
      if (P[202] === 0 && (P[147] > P[146] || P[146] > P[145] || P[144] > P[143] || P[143] > P[142])) return 27;
      if ([3, 4].includes(P[202]) && [409, 410, 411, 412, 413].some((n) => P[n] === 0)) return 31;
      if ([f[0], f[1]].filter((x) => x === 13 || x === 32).length > 1) return 32;
      if (P[104] === 1 && refs.some((r) => [1, 5, 6, 14].includes(r))) return 33;
      if (P[202] === 8 || P[202] === 10) return 37; if (q(10) > 1) return 40;
      return 0;
    }

    _falha(cod) {
      if (this.falhaCod) return; const P = this.P;
      this.falhaCod = cod; this.tReset = 0;
      [[70, 60], [60, 50]].forEach(([d, o]) => { for (let k = 0; k < 6; k++) P[d + k] = P[o + k]; });
      P[50] = cod; P[51] = +this.iFilt.toFixed(1); P[52] = Math.round(this.ud); P[53] = +Math.abs(this.fOut).toFixed(1); P[54] = Math.round(P[30]); P[55] = P[680];
      this.pwm = false; this.fr = this.fS = this.fOut = 0; this.runHMI = false; this.run3 = false; this.runEP = false; this.tAuto = 0; if (P[408]) P[408] = 0;
      this.aoEvento(`Falha F${String(cod).padStart(4, '0')}: ${(SIM.params.FALHAS[cod] || [''])[0]}`); this.aoGravar();
    }
    reset() { if (!this.falhaCod) return; this.falhaCod = 0; if (this.P[397] & 0x80) { this.exigeBorda = true; this.armado = false; } this.aoEvento('Reset de falha.'); }

    // ---------------------------------------------------------------- teclas de comando da HMI (as de navegação ficam em hmi.js)
    get loc() { const m = this.P[220]; return m === 0 ? true : m === 1 ? false : (m === 2 || m === 3) ? this.locHMI : m === 4 ? !this._diFn(9) : [6, 10].includes(m) ? false : true; }
    _sel(a, b) { return this.P[this.loc ? a : b]; }
    teclaI() { if (this.falhaCod || !this.vivo || this.boot > 0) return; if (this._sel(224, 227) === 0) this.runHMI = true; }
    teclaO() {
      if (!this.vivo) return; if (this.falhaCod) return this.reset();
      if (this._sel(224, 227) === 0) this.runHMI = false;
      else if (this.P[345] === 1) { this.runHMI = false; this.run3 = false; this.runEP = false; this.paradaHMI = true; }
    }
    teclaGiro() { const s = this._sel(223, 226); if (this.vivo && (s === 2 || s === 3)) this.giroHMI = -this.giroHMI; }
    teclaLocRem() {
      const m = this.P[220]; if (!this.vivo || (m !== 2 && m !== 3)) return;
      this.locHMI = !this.locHMI; this.runHMI = false;                 // DEDUÇÃO: ao trocar LOC/REM o comando das teclas volta para "parado"
    }
    teclaJog(apertada) { this.jogHMI = !!apertada; }

    // ---------------------------------------------------------------- um passo de simulação
    passo(dt) {
      const P = this.P, e = this.ent, s = this.sai;
      // ---- link DC: retificador + capacitores; a energia que volta do motor na desaceleração sobe a tensão
      const peInv = this.pwm ? e.pe : 0;
      const udRet = e.vLinha * Math.SQRT2 - (peInv > 0 ? peInv * (e.fases >= 3 ? 0.008 : 0.02) : 0);
      const u0 = Math.max(this.ud, 5);
      if (peInv < 0) this.ud += -peInv * dt / (C_LINK * u0);
      this.ud -= ((this.vivo ? 14 : 3) + u0 * u0 / 60000) * dt / (C_LINK * u0);
      if (this.ud < udRet) this.ud += (udRet - this.ud) * Math.min(1, dt / 0.008);
      if (this.ud < 0) this.ud = 0;
      if (!this.vivo && this.ud > this.niveis.liga) this._energizar(); else if (this.vivo && this.ud < this.niveis.desliga) this._desenergizar();
      if (!this.vivo) { Object.assign(s, { vivo: false, pwm: false, f: 0, v: 0, cc: 0, do1: false, do2: false, ao1: 0 }); return; }
      s.vivo = true; P[42] += dt / 3600; P[4] = Math.round(this.ud);
      if (this.boot > 0) { this.boot -= dt; if (this.hmi) this.hmi.passo(dt); return; }

      // ---- entradas: DIs (NPN ativa em nível baixo; PNP ativa em nível alto) e AI1
      this.diAnt = this.di.slice();
      for (let i = 0; i < 4; i++) this.di[i] = this.diPnp(i) ? e.diV[i] > 10 : e.diV[i] < 5;
      P[12] = this.di.reduce((a, b, i) => a | (b ? 1 << i : 0), 0);
      let pct, a163 = false; const sin = P[233];
      if (sin === 1 || sin === 3) { const mA = e.aiCorrente ? e.aiV / 500 * 1000 : e.aiV * 2; a163 = mA < 2; pct = lim((mA - 4) / 16 * 100, 0, 100); }
      else pct = lim(e.aiCorrente ? e.aiV / 500 * 1000 / 20 * 100 : e.aiV * 10, 0, 100);
      if (sin >= 2) pct = 100 - pct;
      pct = lim(pct * P[232] + P[234], -100, 100);
      this.aiFilt += (pct - this.aiFilt) * (P[235] > 0 ? Math.min(1, dt / P[235]) : 1); P[18] = +this.aiFilt.toFixed(1);

      // ---- situação geral
      const conf = P[47] = this._config();
      const sub = this.ud < this.niveis.sub * P[639] / 100;
      const loc = this.loc, pwmAnt = this.pwm;
      if (this._bordaFn(20)) this.reset();
      if (this.falhaCod && P[340] > 0) { this.tReset += dt; if (this.tReset >= P[340]) this.reset(); }
      if (this._tem(19) && !this._diFn(19)) this._falha(91);
      if (this._bordaFn(27, 28) && !this.pwm) { const u = this.usuario[this._bordaFn(27) ? 1 : 2]; if (u) { this._fabrica(false); this.carregar({ P: u }); } }

      // ---- comando gira/para
      const selGP = this._sel(224, 227), selGiro = this._sel(223, 226), selJog = this._sel(225, 228), selRef = this._sel(221, 222);
      const habGeral = this._tem(2) ? this._diFn(2) : true;
      const rapida = this._tem(3) && !this._diFn(3);
      let run = false, dir = 1, segunda = P[105] === 1 || (P[105] === 2 && !!this._diFn(14));
      if (selGP === 0) run = this.runHMI;
      else if (selGP === 1) {
        this.runHMI = false;
        if (this._tem(6) && this._tem(7)) {                    // 3 fios: Start pulsa (NA), Stop mantém fechado (NF)
          if (!this._diFn(7)) this.run3 = false; else if (this._bordaFn(6)) this.run3 = true; run = this.run3;
        } else if (this._tem(4, 35, 52) && this._tem(5, 36, 53)) {
          const av = !!this._diFn(4, 35, 52), re = !!this._diFn(5, 36, 53); run = av !== re; dir = av ? 1 : -1;
          if (run && this._tem(35, 36) && this._diFn(av ? 35 : 36)) segunda = true;
          if (!run) { this.armado = true; this.exigeBorda = false; } else if ((this._tem(52, 53) || this.exigeBorda) && !this.armado) run = false;
        } else if (this._tem(1, 51)) {
          run = !!this._diFn(1, 51);
          if (!run) { this.armado = true; this.exigeBorda = false; } else if ((this._tem(51) || this.exigeBorda) && !this.armado) run = false;
        } else if (this._tem(37)) {                            // DEDUÇÃO: Liga/Ac. E.P. (NA) liga e acelera; De. E.P./Desl. (NF) aberto desacelera e, no mínimo, desliga
          if (this._bordaFn(37)) this.runEP = true;
          if (this._tem(38) && !this._diFn(38) && this.ep <= P[133] + 0.01) this.runEP = false;
          run = this.runEP;
        } else if (this._tem(2, 3)) run = true;                 // só Habilita Geral / Parada Rápida programada: ela comanda
      }
      if (this.paradaHMI) { if (!run) this.paradaHMI = false; run = false; }
      if (selGiro === 0) dir = 1; else if (selGiro === 1) dir = -1; else if (selGiro === 2 || selGiro === 3) dir = this.giroHMI;
      else if (selGiro === 4 && this._tem(8)) dir = this._diFn(8) ? -1 : 1;      // DI de sentido de giro: inativa = horário, ativa = anti-horário
      else if (selGiro !== 4) dir = 1;
      const bloqueio = !!this.falhaCod || conf !== 0 || sub || !habGeral || this.tAuto > 0;
      run = run && !bloqueio && !rapida;
      const jogPed = !run && !bloqueio && (selJog === 1 ? this.jogHMI : selJog === 2 ? !!this._diFn(10) : false);
      if (!jogPed) this.jogando = false; else if (!this.jogando && Math.abs(this.fr) < 0.05) this.jogando = true;   // JOG só entra com o motor parado
      const jog = this.jogando;

      // ---- referência de velocidade (Hz, com sinal)
      const rA = P[134] / (segunda ? P[102] : P[100]), rD = P[134] / (rapida ? P[106] : segunda ? P[103] : P[101]);
      const sobe = this._diFn(11, 33, 37), desce = this._tem(38) ? !this._diFn(38) : this._diFn(12, 34);
      if (run || this.runEP) { if (sobe && !desce) this.ep += rA * dt; else if (desce && !sobe) this.ep -= rD * dt; }
      else if (desce && this._tem(12, 34)) this.ep = P[133];
      this.ep = lim(this.ep, P[133], P[134]);
      const fnD = this._fn(), eMS = (i) => (fnD[i] === 13 || fnD[i] === 32) && this.di[i];        // MS2 = DI1 ou DI2 · MS1 = DI3 · MS0 = DI4
      const ms = (eMS(0) || eMS(1) ? 4 : 0) + (eMS(2) ? 2 : 0) + (eMS(3) ? 1 : 0);
      if (fnD.some((c, i) => c === 32 && this.di[i])) segunda = true;
      const aiHz = () => {
        if (P[231] !== 0) return 0; const x = this.aiFilt / 100;
        return P[230] === 0 && x >= 0 ? P[133] + x * (P[134] - P[133]) : x * P[134];
      };
      let ref = selRef === 0 ? P[121] : selRef === 1 || selRef === 6 ? aiHz() : selRef === 5 || selRef === 14 ? Math.max(0, aiHz()) : selRef === 7 ? this.ep : selRef === 8 ? P[124 + ms] : 0;
      this.ms = ms;
      let alvo = 0, mag = lim(Math.abs(ref), P[133], P[134]);
      if (P[306] > 0) for (const fe of [P[303], P[304]]) {     // frequência evitada: pula a faixa
        const a = fe - P[306] / 2, b = fe + P[306] / 2;
        if (mag > a && mag < b) mag = Math.abs(this.fr) <= a + 0.01 ? a : Math.abs(this.fr) >= b - 0.01 ? b : (this.evitaLado < 0 ? a : b);
        else if (mag <= a) this.evitaLado = -1; else if (mag >= b) this.evitaLado = 1;
      }
      const refFinal = mag * (ref < 0 ? -dir : dir);
      // modo dormir (P0217/P0218)
      if (P[217] > 0 && run && Math.abs(ref) < P[217]) { this.tDormir += dt; if (this.tDormir >= P[218]) this.dormindo = true; } else { this.tDormir = 0; this.dormindo = false; }
      if (run && !this.dormindo) alvo = refFinal; else if (jog) alvo = lim(Math.abs(P[122]), 0, P[134]) * sg(P[122] || 1) * dir;
      this.refAlvo = run || jog ? alvo : refFinal;
      P[1] = Math.round(Math.abs(this.refAlvo) * P[208] / P[403]);

      // ---- habilitação do PWM, Flying Start e frenagem CC
      const quer = run && !this.dormindo || jog;
      let cc = 0;
      if (bloqueio) { this.pwm = false; this.fr = this.fS = 0; this.ccFase = ''; }
      else if (quer) {
        if (!this.pwm) {
          this.pwm = true; this.vfs = 1; this.fr = this.fS = 0; this.ccFase = '';
          const fs = (P[320] === 1 || P[320] === 2) && !this._diFn(24) && P[202] !== 4;
          if (fs && Math.abs(e.hzRotor) > 1) { this.fr = this.fS = lim(e.hzRotor, -P[134], P[134]); this.vfs = 0; }
          else if (P[299] > 0) { this.ccFase = 'partida'; this.ccT = P[299]; }
        }
        if (this.ccFase === 'parada') this.ccFase = '';
      } else if (this.pwm) {
        const modo = rapida ? 2 : P[229];
        if (modo === 1) { this.pwm = false; this.fr = this.fS = 0; }                  // por inércia: corta os pulsos
        else if (this.ccFase === 'parada') { /* aguardando o tempo da frenagem */ }
        else if (Math.abs(this.fr) <= (P[300] > 0 ? P[301] : 0.02)) {
          this.fr = this.fS = 0;
          if (P[300] > 0 && !rapida) { this.ccFase = 'parada'; this.ccT = P[300]; } else this.pwm = false;
        }
      }
      if (this.ccFase) { this.ccT -= dt; cc = P[302] / 100; if (this.ccT <= 0) { if (this.ccFase === 'parada') this.pwm = false; this.ccFase = ''; cc = 0; } }
      if (this.vfs < 1) this.vfs = Math.min(1, this.vfs + dt / P[331]);

      // ---- rampa, com regulação do link DC e limitação de corrente (P0150, P0151, P0135)
      this.rampa = ''; this.limit = '';
      if (!this.pwm) { this.udAnt = this.ud; this.dUd = 0; }
      if (this.pwm && !cc) {
        const tipo = P[150], iNow = e.i;
        // o regulador olha a tensão e a velocidade com que ela sobe (antecipa a energia que ainda volta do motor)
        this.dUd += ((this.ud - this.udAnt) / dt - this.dUd) * Math.min(1, dt / 0.006); this.udAnt = this.ud;
        const udPrev = this.ud + Math.max(0, this.dUd) * 0.09;
        const kUd = lim((P[151] - udPrev) / this.niveis.faixaUd, 0, 1), kI = lim((P[135] - iNow) / (0.1 * P[135] + 0.01), 0, 1);
        const d = alvo - this.fr, acel = this.fr === 0 || sg(d) === sg(this.fr);
        if (Math.abs(d) > 1e-6) {
          if (acel && kI < 1) this.limit = 'corrente'; if (!acel && kUd < 1) this.limit = 'link DC';
          const passoHz = (acel ? rA * kI : rD * kUd) * dt, f0 = this.fr;
          this.fr += lim(d, -passoHz, passoHz);
          if (f0 !== 0 && sg(f0) !== sg(this.fr) && this.fr !== 0) this.fr = 0;
          this.rampa = acel ? 'acel' : 'desac';
        }
        if (iNow > P[135] && (tipo === 0 || tipo === 1) && !(Math.abs(d) > 1e-6 && this.rampa === 'desac')) {     // Desac_LC: reduz a frequência
          this.fr -= sg(this.fr) * Math.min(Math.abs(this.fr), rD * dt * lim((iNow / P[135] - 1) * 6, 0, 1)); this.limit = 'corrente';
        }
        if (udPrev > P[151] && (tipo === 1 || tipo === 3) && this.fr !== 0) { this.fr = lim(this.fr + sg(this.fr) * rA * dt, -P[134], P[134]); this.limit = 'link DC'; }
        if (P[104] === 1) { const tau = 0.15 * Math.min(P[100], P[101]); this.fS += (this.fr - this.fS) * Math.min(1, dt / tau); } else this.fS = this.fr;
      }
      // ---- tensão de saída: curva V/f ajustável (P0136, P0142...P0147) ou VVW
      let fOut = this.pwm ? this.fS : 0, v = 0;
      if (this.pwm && !cc && Math.abs(fOut) > 0.02) {
        const fa = Math.abs(fOut), iaN = lim(e.ia / (P[401] * P[407] || 1), -1.5, 1.5);
        let pv;
        if (P[202] === 0) {
          const pts = [[0, P[136]], [P[147], P[144]], [P[146], P[143]], [P[145], P[142]]];
          pv = P[142];
          for (let k = 0; k < 3; k++) if (fa <= pts[k + 1][0]) { const [x0, y0] = pts[k], [x1, y1] = pts[k + 1]; pv = x1 > x0 ? y0 + (y1 - y0) * (fa - x0) / (x1 - x0) : y1; break; }
          pv = Math.max(pv, 0) + (fa < P[145] ? P[137] * lim(e.i / P[295], 0, 2) * (1 - fa / P[145]) : 0);
          fOut += sg(fOut) * P[138] / 100 * P[403] * iaN;
        } else {                                                  // VVW/vetorial: compensa a queda no estator e o escorregamento com os dados do motor
          const polos = Math.max(2, 2 * Math.round(60 * P[403] / (P[402] || 1))), ns = 120 * P[403] / polos;
          pv = Math.min(100, fa / P[403] * 100) * P[178] / 100 + R3 * P[409] * Math.max(0, e.ia) / P[400] * 100;
          fOut += sg(fOut) * lim((ns - P[402]) / ns, 0, 0.2) * P[403] * iaN;
        }
        v = Math.min(pv / 100 * P[400], this.ud / Math.SQRT2 * 1.03 * P[179] / 100) * this.vfs;
      }
      this.fOut = fOut;
      Object.assign(s, { pwm: this.pwm, f: fOut, v, cc: this.pwm ? cc : 0 });

      // ---- autoajuste (P0408): mede a resistência do estator com o motor parado
      if (this.tAuto > 0) {
        if (e.motor.fases < 3) { this._falha(33); }
        else { this.tAuto -= dt; s.pwm = true; s.cc = 0.08; if (this.tAuto <= 0) { Object.assign(P, { 408: 0, 409: RS, 410: IM0, 411: 21.5, 412: 0.124, 413: 0.35 }); this.aoGravar(); this.aoEvento('Autoajuste concluído: P0409 = 3,40 Ω.'); } }
      }

      // ---- medições e proteções
      this.iFilt += (e.i - this.iFilt) * Math.min(1, dt / Math.max(0.002, P[139] / 1000));
      const fa = Math.abs(fOut), tnP = [0.12, 0.19, 0.25, 0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3][Math.min(9, P[404])] * 1000 / ((P[402] || 1) * Math.PI / 30);
      P[2] = Math.round(Math.abs(this.fS) * P[208] / P[403]); P[3] = +this.iFilt.toFixed(1); P[5] = +fa.toFixed(1); P[7] = Math.round(s.pwm ? v : 0);
      P[9] = +(this.pwm ? e.torque / tnP * 100 : 0).toFixed(1); P[10] = +Math.max(0, peInv / 1000).toFixed(2);
      P[11] = +(this.pwm && v > 5 && this.iFilt > 0.1 ? lim(peInv / (R3 * v * this.iFilt), -1, 1) : 0).toFixed(2);
      P[43] += this.pwm ? dt / 3600 : 0; P[44] += Math.max(0, peInv) * dt / 3.6e6; P[681] = Math.round(this.fS / P[403] * 8192);
      const tAlvo = 25 + 0.9 * e.i * e.i * (P[297] / 5000); P[30] = +(P[30] + (tAlvo - P[30]) * dt / 60).toFixed(3); P[34] = Math.round(25 + (P[30] - 25) * 0.4);
      P[36] = (P[352] === 1 || (P[352] >= 2 && P[30] > 60) || (P[352] === 6 && this.pwm)) ? 5400 : 0;
      if (this.pwm) {
        if (sub) this._falha(21);
        else if (e.motor.curto || e.i > I_F70) this._falha(70);
        else if (e.motor.terra && (P[343] & 1)) this._falha(74);
        else if (P[202] === 4) this._falha(79);
        if ((P[343] & 0x10) && fa > 0.1 * P[403] && e.motor.fases === 2 && e.i > 0.2 * P[401]) { this.t76 += dt; if (this.t76 > 2) this._falha(76); } else this.t76 = 0;
      }
      if (this.ud > this.niveis.sobre) this._falha(22);
      // sobrecarga do motor Ixt (P0156/P0157/P0158 conforme a velocidade; 60 s em 1,5x)
      const rel = fa / (P[403] || 60);
      const iol = P[406] === 1 || rel >= 1 ? P[156] : rel >= 0.5 ? P[157] + (P[156] - P[157]) * (rel - 0.5) / 0.5 : rel >= 0.2 ? P[158] + (P[157] - P[158]) * (rel - 0.2) / 0.3 : P[158];
      const k = iol > 0 ? this.iFilt / iol : 0;
      this.ixt = lim(this.ixt + (k > 1 ? (k * k - 1) / 1.25 / 60 * 100 : -100 / 120 * (1 - k * k)) * dt, 0, 100); P[37] = Math.round(this.ixt);
      if (this.ixt >= 100) this._falha(72);
      this.igbt = lim(this.igbt + (e.i > 1.5 * INOM ? (e.i / INOM - 1.5) / 0.5 / 3 : -0.05) * dt, 0, 1); if (this.igbt >= 1 && (P[343] & 2)) this._falha(48);
      this.alarme = this.ixt > P[349] ? 46 : this.igbt > 0.5 ? 47 : (this._tem(18) && !this._diFn(18)) ? 90 : a163 ? 163 : 0;
      P[48] = this.alarme; P[49] = this.falhaCod; this.a163 = a163;
      this.estado = P[6] = this.falhaCod ? 3 : this.tAuto > 0 ? 4 : conf ? 5 : sub ? 2 : this.dormindo ? 10 : (this.pwm && s.cc > 0) ? 6 : this.pwm ? 1 : 0;
      P[680] = (run ? 2 : 0) | (rapida ? 0x10 : 0) | (segunda ? 0x20 : 0) | (conf ? 0x40 : 0) | (this.alarme ? 0x80 : 0) | (this.pwm ? 0x100 : 0) | (habGeral && !this.falhaCod ? 0x200 : 0)
        | (this.fS >= 0 ? 0x400 : 0) | (jog ? 0x800 : 0) | (loc ? 0 : 0x1000) | (sub ? 0x2000 : 0) | (this.falhaCod ? 0x8000 : 0);
      P[690] = 2 | (this.dormindo ? 0x20 : 0) | (this.rampa === 'desac' ? 0x40 : 0) | (this.rampa === 'acel' ? 0x80 : 0) | (this.limit ? 0x400 : 0) | (s.cc > 0 ? 0x4000 : 0) | (this.pwm ? 0x8000 : 0);

      // ---- saídas: DO1 (relé), DO2 (transistor) e AO1
      const F = Math.abs(this.fS), Fref = Math.abs(this.refAlvo), tq = Math.abs(P[9]);
      const cmp = (id, val, nivel, h) => { this.hist[id] = this.hist[id] ? val > nivel - h : val >= nivel + h; return this.hist[id]; };
      const fnDO = (c, id) => {
        switch (c) {
          case 1: return Fref > P[288]; case 2: return cmp(id, F, P[288], P[287]); case 3: return !cmp(id, F, P[288], P[287]);
          case 4: return this.pwm && Math.abs(this.fr - alvo) < 0.05 && !this.limit; case 6: return this.iFilt > P[290]; case 7: return this.iFilt < P[290];
          case 8: return tq > P[293]; case 9: return tq < P[293]; case 10: return !loc; case 11: return this.pwm; case 12: return !this.falhaCod && !sub && !conf && !this.pwm;
          case 13: return !this.falhaCod; case 14: return this.falhaCod !== 70; case 16: return this.falhaCod !== 21 && this.falhaCod !== 22; case 18: return this.falhaCod !== 72;
          case 19: return !a163; case 21: return this.fS >= 0; case 25: return !sub; case 26: return !!this.falhaCod; case 35: return !this.alarme;
          case 36: return !this.falhaCod && !this.alarme; case 52: return this.fS < 0; default: return false;
        }
      };
      s.do1 = fnDO(P[275], 2); s.do2 = fnDO(P[276], 3); P[13] = (s.do1 ? 1 : 0) | (s.do2 ? 2 : 0);
      const fnAO = { 0: Fref / P[134], 2: F / P[134], 3: Math.abs(e.ia) / (2 * INOM), 4: Math.abs(e.ia) / (2 * INOM), 5: this.iFilt / (2 * INOM), 7: Math.abs(e.ia) / (2 * INOM),
        8: Math.max(0, peInv) / (1.5 * R3 * P[400] * INOM), 10: Math.max(0, e.ia) / (2 * INOM), 11: tq / 200, 16: this.ixt / 100 }[P[251]] || 0;
      let ao = lim(fnAO * P[252], 0, 1); P[14] = +(ao * 100).toFixed(1);
      const sa = P[253]; if (sa >= 3) ao = 1 - ao;
      s.ao1 = (sa === 2 || sa === 5) ? 2 + ao * 8 : ao * 10;      // em corrente (com a chave S1 em mA) 4-20 mA sobre 500 ohm equivalem a 2-10 V
      if (this.hmi) this.hmi.passo(dt);
    }

    _energizar() {
      const P = this.P; this.vivo = true; this.boot = 1.4; this.falhaCod = 0; this.alarme = 0; this.pwm = false; this.fr = this.fS = this.fOut = 0;
      this.locHMI = P[220] !== 3; this.giroHMI = this._sel(223, 226) === 3 ? -1 : 1; this.runHMI = false; this.run3 = false; this.runEP = false; this.armado = false; this.exigeBorda = false;
      this.acesso = false; P[0] = 0; this.tAuto = 0; if (P[408]) P[408] = 0; this.ccFase = ''; this.dormindo = false;
      if (P[120] === 0) P[121] = P[133]; this.ep = P[120] === 0 ? P[133] : lim(this.ep, P[133], P[134]); P[121] = lim(P[121], P[133], P[134]);
      if (this.hmi) this.hmi.ligar(); this.aoEvento('Inversor energizado.');
    }
    _desenergizar() { this.vivo = false; this.pwm = false; this.fr = this.fS = this.fOut = 0; if (this.hmi) this.hmi.desligar(); this.aoGravar(); this.aoEvento('Inversor desenergizado.'); }
  }

  SIM.Motor = Motor; SIM.CFW500 = CFW500; SIM.PLACA = PLACA; SIM.RS_MOTOR = RS; SIM.MOTOR_K = { TN, TMAX, FK, IM0, CR, RS, EN, BP, CP };
  if (typeof module !== 'undefined') module.exports = SIM;
})(typeof globalThis !== 'undefined' ? globalThis : this);
