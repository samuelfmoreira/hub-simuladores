'use strict';
/**
 * Simulação do sistema de combate a incêndio (SITUAÇÃO PROBLEMA 02).
 *
 * Saídas do simulador  -> COILS escritas no CLP  -> entradas do CLP (I0.0 .. I1.7)
 * Entradas do simulador <- DISCRETE INPUTS lidas  <- saídas do CLP   (Q0.0 .. Q1.2)
 *
 * Unidade interna de pressão: bar (o display também mostra kgf/cm²).
 */
const { SSW05 } = require('./ssw05');

// ---- Mapa de I/O (ordem = offset a partir do endereço base) ----------------------
const COILS = [
  { tag: 'B_SEL', addr: 'I0.0', xp: 'I00', desc: 'Seleção da bomba 01' },
  { tag: 'B_SEL', addr: 'I0.1', xp: 'I01', desc: 'Seleção da bomba 02' },
  { tag: 'B1_MA', addr: 'I0.2', xp: 'I02', desc: 'Bomba 01 em manual' },
  { tag: 'B1_MA', addr: 'I0.3', xp: 'I03', desc: 'Bomba 01 em automático' },
  { tag: 'B2_MA', addr: 'I0.4', xp: 'I04', desc: 'Bomba 02 em manual' },
  { tag: 'B2_MA', addr: 'I0.5', xp: 'I05', desc: 'Bomba 02 em automático' },
  { tag: 'BJ_MA', addr: 'I0.6', xp: 'I06', desc: 'Jockey em manual' },
  { tag: 'BJ_MA', addr: 'I0.7', xp: 'I07', desc: 'Jockey em automático' },
  { tag: 'B1_L', addr: 'I1.0', xp: 'I10', desc: 'Liga bomba 01 (NA)' },
  { tag: 'B1_D', addr: 'I1.1', xp: 'I11', desc: 'Desliga bomba 01 (NF)' },
  { tag: 'B2_L', addr: 'I1.2', xp: 'I12', desc: 'Liga bomba 02 (NA)' },
  { tag: 'B2_D', addr: 'I1.3', xp: 'I13', desc: 'Desliga bomba 02 (NF)' },
  { tag: 'BJ_L', addr: 'I1.4', xp: 'I14', desc: 'Liga jockey (NA)' },
  { tag: 'BJ_D', addr: 'I1.5', xp: 'I15', desc: 'Desliga jockey (NF)' },
  { tag: 'PJ', addr: 'I1.6', xp: 'I16', desc: 'Pressostato da jockey' },
  { tag: 'PB', addr: 'I1.7', xp: 'I17', desc: 'Pressostato das principais' },
];

const DISCRETE_INPUTS = [
  { tag: 'K-B1', addr: 'Q0.0', xp: 'Q00', desc: 'Contatora bomba 01 (DI1 da SS_01)' },
  { tag: 'K-B2', addr: 'Q0.1', xp: 'Q01', desc: 'Contatora bomba 02 (DI1 da SS_02)' },
  { tag: 'K-BJ', addr: 'Q0.2', xp: 'Q02', desc: 'Contatora bomba jockey' },
  { tag: 'RAX1', addr: 'Q0.3', xp: 'Q03', desc: 'LB1_S bomba 01 selecionada' },
  { tag: 'RAX2', addr: 'Q0.4', xp: 'Q04', desc: 'LB2_S bomba 02 selecionada' },
  { tag: 'RAX3', addr: 'Q0.5', xp: 'Q05', desc: 'LB1_L bomba 01 ligada' },
  { tag: 'RAX4', addr: 'Q0.6', xp: 'Q06', desc: 'LB2_L bomba 02 ligada' },
  { tag: 'RAX5', addr: 'Q0.7', xp: 'Q07', desc: 'LBJ_L jockey ligada' },
  { tag: 'RAX6', addr: 'Q1.0', xp: 'Q10', desc: 'LB1_D bomba 01 desligada' },
  { tag: 'RAX7', addr: 'Q1.1', xp: 'Q11', desc: 'LB2_D bomba 02 desligada' },
  { tag: 'RAX8', addr: 'Q1.2', xp: 'Q12', desc: 'LBJ_D jockey desligada' },
];

const BUTTONS = ['B1_L', 'B1_D', 'B2_L', 'B2_D', 'BJ_L', 'BJ_D'];
const BREAKERS = ['DG', 'D1', 'D4', 'D2', 'D3', 'DB1', 'DB2', 'DBJ'];
const KGF_PER_BAR = 1 / 0.980665;

// Pressostato tipo KP 5 (alta pressão, rearme automático): faixa 8–32 bar, DIF 1,8–6 bar
const KP = { rangeMin: 8, rangeMax: 32, difMin: 1.8, difMax: 6 };

const DEFAULTS = {
  panel: { B_SEL: '0', B1_MA: '0', B2_MA: '0', BJ_MA: '0' },
  breakers: { DG: true, D1: true, D4: true, D2: true, D3: true, DB1: true, DB2: true, DBJ: true },
  jockeyWiring: [1, 2, 3], // motor U1,V1,W1 ligados aos bornes 2/T1(1), 4/T2(2), 6/T3(3) de K-BJ; null = solto
  process: {
    leak: 0.05,          // vazamento da rede (coef.)
    hydrant: 0,          // abertura do hidrante (%)
    kHydrant: 0.8,       // coef. do hidrante a 100 %
    jockeyMax: 12,       // pressão de shutoff da jockey (bar)
    jockeyGain: 0.15,
    mainMax: 13.5,       // pressão de shutoff das principais (bar)
    mainGain: 1.0,
    relief: 14,          // válvula de alívio (bar)
    minPulseMs: 300,     // pulso mínimo dos botões (garante que o CLP enxergue)
  },
  // Rearme (contato fecha) = faixa − DIF. Contato "NF" = fecha em BAIXA pressão.
  pressostats: {
    PJ: { range: 9.8, dif: 3.9, contact: 'NF' },  // abre em ~10 kgf/cm², fecha em ~6 kgf/cm²
    PB: { range: 9.8, dif: 5.9, contact: 'NF' },  // abre em ~10 kgf/cm², fecha em ~4 kgf/cm²
  },
};

const clone = (o) => JSON.parse(JSON.stringify(o));

class ProcessSim {
  constructor(saved = {}) {
    const d = clone(DEFAULTS);
    this.panel = Object.assign(d.panel, saved.panel);
    this.breakers = Object.assign(d.breakers, saved.breakers);
    this.jockeyWiring = Array.isArray(saved.jockeyWiring) && saved.jockeyWiring.length === 3
      ? saved.jockeyWiring.map((v) => ([1, 2, 3].includes(v) ? v : null))
      : (saved.jockeyWired === false ? [null, null, null] : d.jockeyWiring.slice());
    this.jockeyPhaseLossT = 0;
    this.jockeyReverse = false;
    this.events = [];
    this.process = Object.assign(d.process, saved.process);
    this.process.hydrant = 0;
    this.pressostats = {
      PJ: Object.assign(d.pressostats.PJ, saved.pressostats?.PJ),
      PB: Object.assign(d.pressostats.PB, saved.pressostats?.PB),
    };
    // Ignora configurações salvas de versões antigas (SSW-08)
    const sv = (i) => (saved.ssw?.[i]?.pots ? saved.ssw[i] : {});
    this.ssw = [new SSW05(sv(0)), new SSW05(sv(1))];

    this.buttons = Object.fromEntries(BUTTONS.map((b) => [b, { pressed: false, releaseReq: false, pressedAt: 0 }]));
    this.pressure = 9.0;
    this.jockeySpeed = 0;
    this.plc = new Array(DISCRETE_INPUTS.length).fill(false);
    this.k = { KB1: false, KB2: false, KBJ: false };
    this.lamps = new Array(8).fill(false);
    this.v24 = true;
    this.flows = { jockey: 0, main1: 0, main2: 0, out: 0 };
    for (const n of ['PJ', 'PB']) {
      const ps = this.pressostats[n];
      ps.low = this.pressure <= ps.range - ps.dif;
      ps.test = false;
    }
    this.dirty = false;
  }

  serialize() {
    const ps = (p) => ({ range: p.range, dif: p.dif, contact: p.contact });
    return {
      panel: this.panel,
      breakers: this.breakers,
      jockeyWiring: this.jockeyWiring,
      process: this.process,
      pressostats: { PJ: ps(this.pressostats.PJ), PB: ps(this.pressostats.PB) },
      ssw: this.ssw.map((s) => s.serialize()),
    };
  }

  isDirty() { return this.dirty || this.ssw.some((s) => s.dirty); }
  clearDirty() { this.dirty = false; this.ssw.forEach((s) => { s.dirty = false; }); }

  // -------------------------------------------------------------------------------
  /** Saídas do simulador (coils) na ordem do mapa COILS. */
  getCoils() {
    if (!this.v24) return new Array(COILS.length).fill(false); // sem LL+ no campo
    const p = this.panel, b = (n) => this.buttons[n].pressed;
    return [
      p.B_SEL === 'B1', p.B_SEL === 'B2',
      p.B1_MA === 'M', p.B1_MA === 'A',
      p.B2_MA === 'M', p.B2_MA === 'A',
      p.BJ_MA === 'M', p.BJ_MA === 'A',
      b('B1_L'), !b('B1_D'),
      b('B2_L'), !b('B2_D'),
      b('BJ_L'), !b('BJ_D'),
      this.contactClosed('PJ'),
      this.contactClosed('PB'),
    ];
  }

  contactClosed(name) {
    const ps = this.pressostats[name];
    let low = ps.low;
    if (ps.test) low = !low; // alavanca de teste manual inverte o contato enquanto pressionada
    return ps.contact === 'NF' ? low : !low;
  }

  /** Recebe as saídas do CLP (discrete inputs lidas). */
  setPlcOutputs(bits) {
    for (let i = 0; i < this.plc.length; i++) this.plc[i] = !!bits[i];
  }

  // -------------------------------------------------------------------------------
  step(dt) {
    const br = this.breakers, pr = this.process;
    const now = Date.now();

    // Botões: libera o "solta" só após o pulso mínimo
    for (const n of BUTTONS) {
      const bt = this.buttons[n];
      if (bt.pressed && bt.releaseReq && now - bt.pressedAt >= pr.minPulseMs) {
        bt.pressed = false; bt.releaseReq = false;
      }
    }

    // 24 Vcc: DG -> D1 -> fonte -> D4 -> LL+
    this.v24 = br.DG && br.D1 && br.D4;
    const Q = this.plc.map((q) => q && this.v24);

    this.k.KB1 = Q[0];
    this.k.KB2 = Q[1];
    this.k.KBJ = Q[2];
    this.lamps = Q.slice(3, 11);

    // Soft-starters SSW-05: A1-A2 por D2/D3, potência por DB1/DB2,
    // DI1 = contato 13-14 da contatora (na mesma tensão de A1). DI2 (reset) não ligada.
    this.ssw[0].step(dt, { ctrlPower: br.DG && br.D2, lineOk: br.DG && br.DB1, di: [this.k.KB1, false] });
    this.ssw[1].step(dt, { ctrlPower: br.DG && br.D3, lineOk: br.DG && br.DB2, di: [this.k.KB2, false] });

    // Jockey: partida direta. A ligação do motor (U1 V1 W1) define o que acontece.
    const jw = this.jockeyLink();
    const jFed = this.k.KBJ && br.DG && br.DBJ;
    const jOn = jFed && jw.phases === 3;
    if (jFed && jw.phases === 2) {
      // Falta de fase: o motor não parte, a corrente sobe e o disjuntor-motor DBJ desarma
      this.jockeyPhaseLossT += dt;
      if (this.jockeyPhaseLossT > 4) {
        br.DBJ = false; this.dirty = true; this.jockeyPhaseLossT = 0;
        this.events.push({ level: 'warn', text: 'DBJ desarmou: motor da jockey ligado com só 2 fases (falta de fase).' });
      }
    } else this.jockeyPhaseLossT = 0;
    this.jockeyReverse = jw.reverse;
    const jTau = jOn ? 0.35 : 2.0;
    this.jockeySpeed += ((jOn ? 1 : 0) - this.jockeySpeed) * Math.min(1, dt / jTau);
    if (this.jockeySpeed < 0.002) this.jockeySpeed = 0;

    // Rede hidráulica (modelo didático de 1ª ordem)
    const P = this.pressure;
    const pump = (gain, pmax, s) => gain * s * Math.max(0, pmax * s * s - P);
    // Bomba centrífuga girando ao contrário entrega bem menos pressão
    const qj = pump(pr.jockeyGain, pr.jockeyMax * (this.jockeyReverse ? 0.35 : 1), this.jockeySpeed);
    // Principal girando ao contrário (sequência de fase invertida sem proteção) entrega pouca pressão
    const q1 = pump(pr.mainGain, pr.mainMax * (this.ssw[0].reverse ? 0.35 : 1), this.ssw[0].speed);
    const q2 = pump(pr.mainGain, pr.mainMax * (this.ssw[1].reverse ? 0.35 : 1), this.ssw[1].speed);
    const qout = (pr.leak + pr.kHydrant * pr.hydrant / 100) * Math.sqrt(Math.max(0, P));
    this.pressure = Math.min(pr.relief, Math.max(0, P + (qj + q1 + q2 - qout) * dt));
    this.flows = { jockey: qj, main1: q1, main2: q2, out: qout };

    // Pressostatos (histerese do KP)
    for (const n of ['PJ', 'PB']) {
      const ps = this.pressostats[n];
      if (this.pressure >= ps.range) ps.low = false;
      else if (this.pressure <= ps.range - ps.dif) ps.low = true;
    }
  }

  // -------------------------------------------------------------------------------
  action(a) {
    switch (a.type) {
      case 'selector': {
        const allowed = { B_SEL: ['B1', '0', 'B2'], B1_MA: ['M', '0', 'A'], B2_MA: ['M', '0', 'A'], BJ_MA: ['M', '0', 'A'] };
        if (allowed[a.name]?.includes(a.value)) { this.panel[a.name] = a.value; this.dirty = true; }
        break;
      }
      case 'button': {
        const bt = this.buttons[a.name];
        if (!bt) break;
        if (a.value) { bt.pressed = true; bt.releaseReq = false; bt.pressedAt = Date.now(); }
        else bt.releaseReq = true;
        break;
      }
      case 'breaker':
        if (BREAKERS.includes(a.name)) { this.breakers[a.name] = !!a.value; this.dirty = true; }
        break;
      case 'jockeyWired':
        this.jockeyWiring = a.value ? [1, 2, 3] : [null, null, null]; this.dirty = true;
        break;
      case 'jockeyWire': {
        // a.motor: 0=U1 1=V1 2=W1 ; a.terminal: 1=2/T1 2=4/T2 3=6/T3 ou null (solta)
        const m = Number(a.motor);
        if (![0, 1, 2].includes(m)) break;
        const t = [1, 2, 3].includes(Number(a.terminal)) ? Number(a.terminal) : null;
        if (t !== null) this.jockeyWiring = this.jockeyWiring.map((v, i) => (i !== m && v === t ? null : v));
        this.jockeyWiring[m] = t;
        this.dirty = true;
        break;
      }
      case 'sswKey':
        if (a.key === 'RESET') this.ssw[a.index]?.resetFault();
        break;
      case 'sswPot':
        this.ssw[a.index]?.setPot(a.name, a.value);
        break;
      case 'sswDip':
        this.ssw[a.index]?.setDip(a.name, a.value);
        break;
      case 'sswDoor':
        this.ssw[a.index]?.setDoor(a.value);
        break;
      case 'sswTrain':
        this.ssw[a.index]?.setTrain(a.name, a.value);
        break;
      case 'sswModel':
        this.ssw[a.index]?.setModel(Number(a.value));
        break;
      case 'process': {
        const lim = { leak: [0, 0.5], hydrant: [0, 100] };
        if (lim[a.name]) {
          const [lo, hi] = lim[a.name];
          this.process[a.name] = Math.min(hi, Math.max(lo, Number(a.value) || 0));
          this.dirty = true;
        }
        break;
      }
      case 'setPressure':
        this.pressure = Math.min(this.process.relief, Math.max(0, Number(a.value) || 0));
        break;
      case 'pressostat': {
        const ps = this.pressostats[a.name];
        if (!ps) break;
        if (a.field === 'range') ps.range = round1(Math.min(KP.rangeMax, Math.max(KP.rangeMin, Number(a.value))));
        if (a.field === 'dif') ps.dif = round1(Math.min(KP.difMax, Math.max(KP.difMin, Number(a.value))));
        if (a.field === 'contact' && ['NF', 'NA'].includes(a.value)) ps.contact = a.value;
        if (a.field === 'test') ps.test = !!a.value;
        this.dirty = true;
        break;
      }
      default: break;
    }
  }

  /** Situação da ligação do motor da jockey. */
  jockeyLink() {
    const w = this.jockeyWiring;
    const phases = w.filter((v) => v !== null).length;
    let reverse = false;
    if (phases === 3) {
      // Sequência de fases: permutação par = sentido correto; ímpar (2 fases trocadas) = sentido inverso
      const inv = (w[0] > w[1]) + (w[0] > w[2]) + (w[1] > w[2]);
      reverse = inv % 2 === 1;
    }
    return { phases, reverse, wired: phases === 3 };
  }

  snapshot() {
    const ps = (n) => {
      const p = this.pressostats[n];
      return { range: p.range, dif: p.dif, low: p.low, contact: p.contact, test: p.test, closed: this.contactClosed(n), cutIn: round1(p.range - p.dif) };
    };
    return {
      panel: this.panel,
      buttons: Object.fromEntries(BUTTONS.map((b) => [b, this.buttons[b].pressed])),
      breakers: this.breakers,
      jockeyWired: this.jockeyLink().wired,
      jockeyWiring: this.jockeyWiring,
      jockeyLink: this.jockeyLink(),
      v24: this.v24,
      k: this.k,
      lamps: this.lamps,
      pressure: round2(this.pressure),
      pressureKgf: round2(this.pressure * KGF_PER_BAR),
      jockeySpeed: round3(this.jockeySpeed),
      flows: Object.fromEntries(Object.entries(this.flows).map(([k, v]) => [k, round3(v)])),
      process: { leak: this.process.leak, hydrant: this.process.hydrant, relief: this.process.relief },
      pressostats: { PJ: ps('PJ'), PB: ps('PB') },
      ssw: this.ssw.map((s) => s.snapshot()),
    };
  }
}

const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;
const round3 = (v) => Math.round(v * 1000) / 1000;

module.exports = { ProcessSim, COILS, DISCRETE_INPUTS, KP, KGF_PER_BAR };
