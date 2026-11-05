'use strict';
/**
 * Micro soft-starter WEG SSW-05 Plus — conforme o manual 0899.5119 (R11).
 *
 * Frente (sem IHM):
 *   Trimpots: ACCEL TIME 1–20 s · MOTOR CURRENT 30–100 % In · PEDESTAL VOLTAGE 30–80 % Un · DECEL TIME OFF–20 s
 *   Dip-switch (6): 1 OVERCURRENT · 2 PHASE LOSS · 3 PHASE SEQ · 4 STALL · 5 OVERLOAD (ON = protege) · 6 MAN/AUTO (reset)
 *   LEDs MOTOR PROTECTION: OVERCURRENT, PHASE LOSS, PHASE SEQ, STALL, OVERLOAD
 *   LEDs STARTER STATUS: FAULT (falhas internas, piscando em código), RUN (tensão plena), READY (aceso pronta/tensão plena; pisca nas rampas)
 *   Botão RESET · Bornes A1 A2 (90–250 Vca) · DI1 (habilita/desabilita) · DI2 (reset) · relés 13–14/23 (operação) e 14/23–24 (tensão plena)
 * Falhas: E03 falta de fase · E05 sobrecarga (classe 10) · E63 rotor bloqueado · E66 sobrecorrente · E67 sequência de fase
 * Valores de fábrica (pontos vermelhos da frente): pedestal 30 %, aceleração no meio da escala, desaceleração OFF,
 * corrente 100 %, proteções ON, reset MAN.
 */

const MODELS = [3, 10, 16, 23, 30, 45, 60, 85];
// Escala dos trimpots: 225° de curso (mínimo em baixo à esquerda, máximo à direita).
const POT_SWEEP = 225, POT_START = -135;
const potAtTop = (min, max) => min + (max - min) * (-POT_START / POT_SWEEP); // valor com o ponteiro para cima
const POTS = {
  accT: { name: 'ACCEL TIME — tempo de aceleração', min: 1, max: 20, step: 0.5, unit: 's', def: Math.round(potAtTop(1, 20) * 2) / 2 },
  motorPct: { name: 'MOTOR CURRENT — corrente do motor (% da In da chave)', min: 30, max: 100, step: 1, unit: '%', def: 100 },
  initV: { name: 'PEDESTAL VOLTAGE — tensão de pedestal', min: 30, max: 80, step: 1, unit: '%', def: 30 },
  decT: { name: 'DECEL TIME — tempo de desaceleração', min: 0, max: 20, step: 0.5, unit: 's', def: 0, off: 0 },
};
const DIPS = {
  overcurrent: { n: 1, name: 'OVERCURRENT — sobrecorrente', def: true },
  phaseLoss: { n: 2, name: 'PHASE LOSS — falta de fase', def: true },
  phaseSeq: { n: 3, name: 'PHASE SEQ — sequência de fase', def: true },
  stall: { n: 4, name: 'STALL — rotor bloqueado', def: true },
  overload: { n: 5, name: 'OVERLOAD — sobrecarga do motor (classe 10)', def: true },
  auto: { n: 6, name: 'MAN / AUTO — reset manual ou automático', def: false },
};
const FAULTS = {
  E03: { led: 'phaseLoss', text: 'Falta de fase' },
  E05: { led: 'overload', text: 'Sobrecarga do motor' },
  E63: { led: 'stall', text: 'Rotor bloqueado (stall)' },
  E66: { led: 'overcurrent', text: 'Sobrecorrente' },
  E67: { led: 'phaseSeq', text: 'Sequência de fase incorreta' },
};
const AUTO_RESET_S = 15 * 60;
const round = (v, step) => Math.round(v / step) * step;

class SSW05 {
  constructor(saved = {}) {
    this.model = MODELS.includes(saved.model) ? saved.model : 16;
    this.motorA = Number(saved.motorA) > 0 ? Number(saved.motorA) : Math.round(this.model * 0.9 * 10) / 10;
    this.pots = {};
    for (const [k, p] of Object.entries(POTS)) {
      const v = Number(saved.pots?.[k]);
      this.pots[k] = Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.def;
    }
    const sd = Object.assign({}, saved.dips || {});
    if (sd.phase !== undefined && sd.phaseLoss === undefined) sd.phaseLoss = sd.phase; // versão anterior
    this.dips = {};
    for (const [k, d] of Object.entries(DIPS)) this.dips[k] = typeof sd[k] === 'boolean' ? sd[k] : d.def;
    this.door = true; // a soft sempre começa com a tampa frontal aberta (ajustes à mostra)
    this.train = { seqInverted: false, jammed: false };
    this.faultHist = Array.isArray(saved.faultHist) ? saved.faultHist.slice(0, 3) : [];
    this.powered = false;
    this.state = 'off';
    this.fault = null;
    this.faultT = 0;
    this.ocT = 0;
    this.vout = 0;
    this.speed = 0;
    this.iPu = 0;
    this.thermal = 0;
    this.di = [false, false];
    this.prevDi2 = false;
    this.rl = [false, false];
    this.lineOk = false;
    this.dirty = false;
    this.blink = 0;
  }

  serialize() {
    return { model: this.model, motorA: this.motorA, pots: this.pots, dips: this.dips, faultHist: this.faultHist };
  }

  isRunning() { return ['accel', 'run', 'decel'].includes(this.state); }
  inMotorA() { return Math.round(this.model * this.pots.motorPct) / 100; }
  currentA() { return Math.round(this.iPu * this.motorA * 10) / 10; }
  iSet() { return (this.iPu * this.motorA) / Math.max(0.1, this.inMotorA()); }
  /** Motor girando ao contrário: rede com sequência invertida e proteção PHASE SEQ desligada. */
  get reverse() { return this.train.seqInverted && !this.dips.phaseSeq; }

  setPot(name, value) {
    const p = POTS[name];
    if (!p) return false;
    const v = Number(value);
    if (!Number.isFinite(v)) return false;
    this.pots[name] = Math.min(p.max, Math.max(p.min, round(v, p.step)));
    this.dirty = true;
    return true;
  }
  setDip(name, value) {
    if (!(name in DIPS)) return false;
    this.dips[name] = !!value;
    if (name === 'overload' && !value) this.thermal = 0; // manual: desabilitar zera a imagem térmica
    this.dirty = true;
    return true;
  }
  setDoor(open) { this.door = !!open; this.dirty = true; }
  setTrain(name, value) { if (name in this.train) this.train[name] = !!value; }
  setModel(model) {
    if (!MODELS.includes(model) || this.isRunning()) return false;
    this.model = model; this.dirty = true; return true;
  }

  triggerFault(code) {
    if (this.fault) return;
    this.fault = code;
    this.faultT = 0;
    this.state = 'fault';
    this.vout = 0;
    this.faultHist.unshift(code);
    this.faultHist = this.faultHist.slice(0, 3);
    this.dirty = true;
  }
  resetFault() {
    if (!this.fault || !this.powered) return false;
    if (this.fault === 'E05' && this.thermal > 100) return false; // motor ainda quente
    this.fault = null;
    this.state = 'ready';
    this.ocT = 0;
    return true;
  }

  /** io = { ctrlPower, lineOk, di: [DI1, DI2] } */
  step(dt, io) {
    this.blink = (this.blink + dt) % 1;
    this.lineOk = !!io.lineOk;
    const di = io.ctrlPower ? io.di.map(Boolean) : [false, false];
    this.di = di;

    if (!io.ctrlPower) {
      if (this.powered) { this.powered = false; this.fault = null; this.state = 'off'; }
      this.vout = 0; this.rl = [false, false];
      this._motor(dt); // imagem térmica fica salva sem alimentação em A1-A2 (manual, item 15.1)
      return;
    }
    if (!this.powered) { this.powered = true; this.state = 'ready'; }

    if (di[1] && !this.prevDi2) this.resetFault();   // DI2: pulso de reset
    this.prevDi2 = di[1];

    if (this.fault && this.dips.auto && this.fault !== 'E67') {
      this.faultT += dt;
      const coolDone = this.fault === 'E05' && this.thermal < 100;
      if (this.faultT >= AUTO_RESET_S || coolDone) this.resetFault();
    }

    const runCmd = di[0];
    if (!this.fault && runCmd) {
      if (this.dips.phaseLoss && !this.lineOk) this.triggerFault('E03');
      else if (this.dips.phaseSeq && this.train.seqInverted && this.lineOk) this.triggerFault('E67');
    }
    if (!this.fault && this.isRunning() && !this.lineOk && this.dips.phaseLoss) this.triggerFault('E03');

    const p = this.pots;
    if (this.fault) {
      this.state = 'fault'; this.vout = 0;
    } else {
      switch (this.state) {
        case 'ready':
          if (runCmd && this.lineOk) { this.state = 'accel'; this.vout = p.initV; }
          break;
        case 'accel':
          if (!runCmd) { this._beginStop(); break; }
          if (!this.lineOk) { this.vout = 0; this.state = 'ready'; break; }
          this.vout += ((100 - p.initV) / p.accT) * dt;
          if (this.vout >= 100) {
            this.vout = 100;
            // Fim da rampa, antes de fechar o by-pass: corrente ≥ 2× ajustada = rotor bloqueado
            if (this.dips.stall && this.iSet() >= 2) { this.triggerFault('E63'); break; }
            this.state = 'run';
          }
          break;
        case 'run':
          this.vout = this.lineOk ? 100 : 0;
          // Sobrecorrente: em tensão plena, corrente > 3× ajustada por mais de 1 s
          if (this.iSet() > 3) this.ocT += dt; else this.ocT = 0;
          if (this.dips.overcurrent && this.ocT > 1) { this.triggerFault('E66'); break; }
          if (!runCmd || !this.lineOk) this._beginStop();
          break;
        case 'decel':
          if (runCmd) { this.state = 'accel'; break; }
          this.vout -= ((100 - p.initV) / p.decT) * dt;
          if (this.vout <= p.initV) { this.vout = 0; this.state = 'ready'; }
          break;
        default:
          this.state = 'ready';
      }
    }
    this._motor(dt);
    this._thermal(dt);
    // 13–14/23: operação (fecha com o comando, abre no fim da rampa de parada)
    // 14/23–24: tensão plena (by-pass)
    this.rl = [this.isRunning(), this.state === 'run'];
  }

  _beginStop() {
    if (this.pots.decT <= 0 || !this.lineOk) { this.vout = 0; this.state = 'ready'; }
    else this.state = 'decel';
  }

  _motor(dt) {
    const v = this.vout;
    const jam = this.train.jammed;
    const target = v <= 0 || jam ? 0 : Math.min(1, Math.max(0, (v - 28) / 67));
    const tau = target > this.speed ? 0.6 : (v > 0 ? 0.8 : 3.0);
    this.speed += (target - this.speed) * Math.min(1, dt / tau);
    if (this.speed < 0.002) this.speed = 0;
    if (v <= 0) this.iPu = 0;
    else if (this.state === 'decel') this.iPu = 0.25 * (v / 100) + 0.75 * this.speed * this.speed;
    else this.iPu = (v / 100) * (6.0 * (1 - this.speed) + 0.25) + 0.7 * this.speed * this.speed;
  }

  _thermal(dt) {
    const tau = 10 * 38.8; // classe 10
    const ir = this.iSet();
    this.thermal += ((ir * ir * 100) - this.thermal) * dt / tau;
    if (this.dips.overload && this.thermal > 132 && this.powered) this.triggerFault('E05');
  }

  leds() {
    const on = this.blink < 0.5;
    const f = this.fault ? FAULTS[this.fault].led : null;
    return {
      overcurrent: f === 'overcurrent', phaseLoss: f === 'phaseLoss', phaseSeq: f === 'phaseSeq',
      stall: f === 'stall', overload: f === 'overload',
      fault: false,
      run: this.state === 'run',
      ready: !this.powered || this.fault ? false : (this.state === 'accel' || this.state === 'decel') ? on : true,
    };
  }

  snapshot() {
    return {
      model: this.model, motorA: this.motorA, inMotorA: this.inMotorA(),
      pots: this.pots, dips: this.dips, door: this.door, train: this.train,
      powered: this.powered, state: this.state, fault: this.fault,
      faultText: this.fault ? FAULTS[this.fault].text : null, faultHist: this.faultHist,
      autoResetIn: this.fault && this.dips.auto && this.fault !== 'E67' ? Math.max(0, Math.round(AUTO_RESET_S - this.faultT)) : null,
      vout: Math.round(this.vout * 10) / 10, speed: Math.round(this.speed * 1000) / 1000,
      currentA: this.currentA(), thermal: Math.round(this.thermal), reverse: this.reverse,
      di: this.di, rl: this.rl, leds: this.leds(),
    };
  }
}

function sswMeta() {
  return { models: MODELS, pots: POTS, dips: DIPS, faults: FAULTS, potSweep: POT_SWEEP, potStart: POT_START };
}

module.exports = { SSW05, MODELS, POTS, DIPS, FAULTS, sswMeta };
