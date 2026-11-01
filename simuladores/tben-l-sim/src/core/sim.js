'use strict';
/**
 * Simulação da célula de paletização + mestre IO-Link de 8 portas (sem gráficos).
 *
 * Camadas, de baixo para cima:
 *   device IO-Link  -> física dos atuadores/sensores, escreve DIN (lado device)
 *   porta do mestre -> estado (STARTUP, PREOPERATE, OPERATE...), validação,
 *                      Data Storage, eventos, tempo de ciclo; publica IN e PQI
 *   controlador     -> lê IN/PQI e manda as saídas, que a porta trava em LOUT
 */
const { EventEmitter } = require('events');
const {
  DEV, PORTS, EVENTS, EVENT_DIAG, DIAG, MODELS, FACTORY, COMMISSIONED, IOL_VENDOR_ID, VDS_TXT, MIN_CYCLE_MS,
  defaultCfg, cfgValid, u16, setU16
} = require('./portmap');

const BELT_Y = 1.4, TOP = 1.25, BOTTOM = 0.15, PAL_H = 0.15, END_X = -1.4, PLAT_Z = 1.0, OUT_Z = 4.15;
const B1X = END_X + 0.19;
const SLOTS = [[-0.2, 0.2], [0.2, 0.2], [-0.2, -0.2], [0.2, -0.2]];
const COMM = ['STARTUP', 'PREOPERATE', 'OPERATE', 'ERRO_VALIDACAO'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hex = (v, n = 4) => '0x' + v.toString(16).toUpperCase().padStart(n, '0');
const newSerial = () => 'SL' + (241000 + Math.floor(Math.random() * 8999));

function newDevice(p, alt, commissioned) {
  const m = MODELS[p.dev][alt];
  const params = { ...FACTORY[p.dev] };
  if (commissioned) Object.assign(params, COMMISSIONED[p.n], { 0x18: 'PAL01-' + p.tag });
  return { alt, model: m, pid: m.pid, product: m.product, vid: IOL_VENDOR_ID, did: m.did, serial: newSerial(), params };
}

class Sim extends EventEmitter {
  constructor() {
    super();
    this.IN = PORTS.map(p => new Uint8Array(p.inLen));    // publicado ao controlador
    this.DIN = PORTS.map(p => new Uint8Array(p.inLen));   // produzido pelo device
    this.LOUT = PORTS.map(p => new Uint8Array(p.outLen)); // saídas entregues ao device
    this.PQI = new Uint8Array(8);
    this.ZERO = PORTS.map(p => new Uint8Array(p.outLen));
    this.S = PORTS.map(p => {
      const st = {
        cfg: defaultCfg(p.dev), cfgSrc: 'padrão', state: 'OPERATE', stateT: 0, cycT: 1, backup: null, events: [], active: new Set(),
        disc: false, short: false, dev: newDevice(p, 0, true),
        fx: false, latched: false, status: 0, act: 0, dir: 1, prevRst: 0, prevAdv: 0, cycles: 0, v: 0, moving: false, ready: true, oor: false
      };
      st.backup = { pid: st.dev.pid, vid: st.dev.vid, did: st.dev.did, params: { ...st.dev.params } };
      return st;
    });
    this.W = { pb: { start: false, stop: false, reset: false }, estop: false, feed: true, boxH: 0.30 };
    this.nextId = 1;
    this.lamps = 0; this.dist1 = 800; this.prevPQI = new Uint8Array(8).fill(0xC0);
    this.reset();
  }

  log(text, kind = 'info') { this.emit('log', { t: Date.now(), text, kind }); }
  tag(n) { return `X${n} ${PORTS[n].tag}`; }
  /** Device comunicando (DevCom): ISDU disponível */
  conn(n) { return COMM.includes(this.S[n].state); }
  operate(n) { return this.S[n].state === 'OPERATE'; }
  param(n, x) { return this.S[n].dev.params[x]; }
  cycleMs(n) { return Math.max(this.S[n].cfg.cycle || 0, MIN_CYCLE_MS); }

  reset() {
    Object.assign(this.W, { platY: TOP, p: 0, boxes: [], pallets: [], falling: [], pushBox: null, spawnT: 0, dispT: 0, done: 0, lost: 0 });
    this.S.forEach(st => { st.act = 0; st.latched = false; });
    this.spawnPallet(); this.W.pallets[0].drop = 0;
    this.log('Cena reiniciada: elevador no topo com pallet vazio');
  }

  /* ===================== Eventos IO-Link ===================== */
  event(n, code, mode) {
    const st = this.S[n], def = EVENTS[code];
    if (mode === 'apareceu') { if (st.active.has(code)) return; st.active.add(code); }
    else if (mode === 'desapareceu') { if (!st.active.has(code)) return; st.active.delete(code); }
    const e = { t: Date.now(), port: n, code, text: def.t, type: def.type, origin: def.origin, mode };
    st.events.unshift(e); if (st.events.length > 40) st.events.pop();
    this.emit('iolEvent', e);
    this.log(`${this.tag(n)}: evento IO-Link ${hex(code)} ${def.t} (${def.type}, ${mode})`,
      mode === 'desapareceu' ? 'ok' : def.type === 'notificação' ? 'info' : 'diag');
  }
  setActive(n, code, on) { this.event(n, code, on ? 'apareceu' : 'desapareceu'); }
  clearDeviceEvents(n) {
    const st = this.S[n];
    [...st.active].filter(c => EVENTS[c].origin === 'device').forEach(c => st.active.delete(c));
  }

  /* ===================== Porta do mestre ===================== */
  setState(n, s) {
    const st = this.S[n], old = st.state;
    if (old === s) return;
    st.state = s; st.stateT = 0;
    if (old === 'SEM_DEVICE') this.setActive(n, 0x1800, false);
    if (old === 'CURTO') this.setActive(n, 0x1806, false);
    if (old === 'ERRO_VALIDACAO') { this.setActive(n, 0x1802, false); this.setActive(n, 0x1803, false); }
    if (!COMM.includes(s) || s === 'ERRO_VALIDACAO') this.clearDeviceEvents(n);
    if (s === 'SEM_DEVICE' && COMM.includes(old)) this.setActive(n, 0x1800, true);
    if (s === 'CURTO') this.setActive(n, 0x1806, true);
    if (s === 'PREOPERATE') this.dataStorage(n);
    if (s === 'OPERATE') { st.cycT = 1e9; this.log(`${this.tag(n)}: porta em OPERATE, dados de processo válidos`, 'ok'); }
    if (s === 'DESATIVADA') this.log(`${this.tag(n)}: porta desativada pela configuração`);
  }

  portStep(n, dt) {
    const st = this.S[n];
    st.stateT += dt;
    if (st.cfg.mode === 0) return this.setState(n, 'DESATIVADA');
    if (st.short) return this.setState(n, 'CURTO');
    if (st.disc) return this.setState(n, 'SEM_DEVICE');
    if (['DESATIVADA', 'CURTO', 'SEM_DEVICE'].includes(st.state)) return this.setState(n, 'STARTUP');
    if (st.state === 'STARTUP' && st.stateT >= 0.3) {
      if (st.cfg.vds >= 1 && (st.dev.vid !== st.cfg.vid || st.dev.did !== st.cfg.did)) {
        this.setState(n, 'ERRO_VALIDACAO');
        this.setActive(n, st.dev.vid !== st.cfg.vid ? 0x1802 : 0x1803, true);
        this.log(`${this.tag(n)}: validação recusou o device (esperado ${hex(st.cfg.vid)}/${hex(st.cfg.did, 6)}, conectado ${hex(st.dev.vid)}/${hex(st.dev.did, 6)} ${st.dev.pid})`, 'diag');
      } else this.setState(n, 'PREOPERATE');
    } else if (st.state === 'PREOPERATE' && st.stateT >= 0.2) this.setState(n, 'OPERATE');
  }

  restartPort(n) {
    const st = this.S[n];
    if (COMM.includes(st.state)) { if (st.state === 'STARTUP') st.stateT = 0; else this.setState(n, 'STARTUP'); }
  }

  dataStorage(n) {
    const st = this.S[n], d = st.dev;
    if (st.cfg.vds < 2) return;
    if (!st.backup) {
      st.backup = { pid: d.pid, vid: d.vid, did: d.did, params: { ...d.params } };
      return this.log(`${this.tag(n)}: Data Storage vazio, backup criado com os parâmetros do device`, 'info');
    }
    if (st.backup.vid !== d.vid || st.backup.did !== d.did) {
      this.event(n, 0x180A, 'único');
      st.backup = { pid: d.pid, vid: d.vid, did: d.did, params: { ...d.params } };
      return this.log(`${this.tag(n)}: backup era de outro tipo de device e foi substituído pelos parâmetros atuais`, 'diag');
    }
    const diff = Object.keys(st.backup.params).filter(k => st.backup.params[k] !== d.params[k]);
    if (diff.length) {
      Object.assign(d.params, st.backup.params);
      this.log(`${this.tag(n)}: Data Storage restaurou ${diff.length} parâmetro(s) no device (${diff.map(k => hex(+k)).join(', ')})`, 'ok');
    }
  }

  /** Chamado depois de toda escrita ISDU bem-sucedida */
  paramWritten(n) {
    const st = this.S[n];
    if (st.cfg.vds === 2 && st.state === 'OPERATE') {
      this.event(n, 0xFF91, 'único');
      st.backup = { pid: st.dev.pid, vid: st.dev.vid, did: st.dev.did, params: { ...st.dev.params } };
      this.log(`${this.tag(n)}: backup do Data Storage atualizado`, 'ok');
    } else if (st.cfg.vds === 3) {
      this.log(`${this.tag(n)}: modo Restore: a alteração vale até a próxima partida da porta, quando o backup é restaurado`, 'info');
    }
  }

  configure(n, cfg, src) {
    if (!cfgValid(cfg)) return { ok: false, msg: 'configuração fora da faixa' };
    const st = this.S[n], before = JSON.stringify(st.cfg);
    st.cfgSrc = src;
    if (before === JSON.stringify(cfg)) return { ok: true, changed: false };
    st.cfg = { ...cfg };
    this.log(`${this.tag(n)}: configuração da porta alterada pela ${src}: ${cfg.mode ? 'IO-Link' : 'desativada'}, ${VDS_TXT[cfg.vds]}, ciclo ${cfg.cycle ? cfg.cycle + ' ms' : 'mínimo do device'}`, 'info');
    this.restartPort(n);
    return { ok: true, changed: true };
  }

  replaceDevice(n, alt) {
    const p = PORTS[n], st = this.S[n];
    st.dev = newDevice(p, alt, false);
    Object.assign(st, { fx: false, latched: false, act: 0, oor: false, cycles: 0 });
    this.clearDeviceEvents(n);
    this.log(`${this.tag(n)}: device trocado por um ${st.dev.pid} novo, com parâmetros de fábrica (série ${st.dev.serial})`, 'info');
    this.restartPort(n);
  }

  clearBackup(n) { this.S[n].backup = null; this.log(`${this.tag(n)}: Data Storage apagado. O próximo device conectado vira a referência`, 'info'); }

  /* ===================== Planta ===================== */
  spawnBox() { this.W.boxes.push({ id: this.nextId++, x: -6.0, h: this.W.boxH + (Math.random() - 0.5) * 0.004 }); }
  spawnPallet() { this.W.pallets.push({ id: this.nextId++, z: PLAT_Z, onPlat: true, count: 0, layerH: [], boxes: [], endT: 0, drop: 0.5 }); }
  palletOnPlat() { return this.W.pallets.find(p => p.onPlat && Math.abs(p.z - PLAT_Z) < 0.3); }
  fallBox(b, pos, reason) {
    this.W.falling.push({ id: b.id, h: b.h, x: pos[0], y: pos[1], z: pos[2], vy: 0, t: 0, rot: 0, spin: (Math.random() - 0.5) * 3 });
    this.W.lost++;
    this.log('Caixa caiu: ' + reason, 'diag');
  }

  rollerStep(n, dt, power, o) {
    const st = this.S[n]; const run = (o[0] & 1) && power;
    const rst = (o[0] >> 2) & 1; if (rst && !st.prevRst && !st.fx) st.latched = false; st.prevRst = rst;
    if (st.fx && run) st.latched = true;
    const cap = st.dev.model.maxPct || 100;
    const target = (run && !st.latched) ? Math.min(cap, o[1]) : 0;
    const stepV = 100 * dt / (Math.max(50, this.param(n, 0x40)) / 1000);
    st.act += clamp(target - st.act, -stepV, stepV);
    if (st.act < 0.05) st.act = 0;
    st.dir = (o[0] & 2) ? -1 : 1;
    const D = this.DIN[n];
    D[0] = (st.act > 1 ? 1 : 0) | (st.latched ? 2 : 0); D[1] = Math.round(st.act);
  }

  laserIn(n, dist) {
    const st = this.S[n], D = this.DIN[n];
    st.oor = dist > (st.dev.model.range || 3000);
    const valid = !st.fx && !st.oor;
    setU16(D, 0, valid ? dist : 0);
    D[2] = (valid ? 1 : 0) | (valid && dist < this.param(n, 0x3C) ? 2 : 0);
    D[3] = st.fx ? 12 : st.oor ? 0 : 96;
  }

  /**
   * @param dt     passo em segundos
   * @param outFor função (n) => Uint8Array com as saídas do controlador para a porta n
   */
  step(dt, outFor) {
    const W = this.W, S = this.S, D = this.DIN;
    const power = !W.estop;
    const O = n => this.LOUT[n];

    PORTS.forEach(p => this.portStep(p.n, dt));

    this.rollerStep(0, dt, power, O(0));
    this.rollerStep(6, dt, power, O(6));

    // Esteira C1
    const v1 = S[0].act / 100 * 0.5 * S[0].dir;
    const list = W.boxes.slice().sort((a, b) => b.x - a.x);
    if (v1 > 0) { let lim = W.p > 0.02 ? END_X - 0.45 : END_X; for (const b of list) { b.x = Math.min(b.x + v1 * dt, Math.max(b.x, lim)); lim = b.x - 0.42; } }
    else if (v1 < 0) { list.reverse(); let lim = -6.0; for (const b of list) { b.x = Math.max(b.x + v1 * dt, Math.min(b.x, lim)); lim = b.x + 0.42; } }
    W.spawnT += dt;
    if (W.feed && W.spawnT > 1.8 && W.boxes.length < 10 && !W.boxes.some(b => b.x < -5.5)) { this.spawnBox(); W.spawnT = 0; }

    // Válvulas e empurrador
    const vo = O(2), air = !S[2].fx;
    const adv = (vo[0] & 1) && power, ret = ((vo[0] >> 1) & 1) && power;
    if (adv && !S[2].prevAdv) S[2].cycles++; S[2].prevAdv = adv;
    if (air && adv && !ret) {
      if (!W.pushBox && W.p < 0.1) {
        const i = W.boxes.findIndex(b => Math.abs(b.x - END_X) < 0.03);
        if (i >= 0) { const b = W.boxes.splice(i, 1)[0]; b.from = [b.x, BELT_Y + b.h / 2, 0]; b.pos = b.from.slice(); W.pushBox = b; }
      }
      W.p = Math.min(1, W.p + dt / 0.7);
    } else if (air && ret && !adv) {
      if (W.pushBox && W.p < 1) { const b = W.pushBox; W.pushBox = null; this.fallBox(b, b.pos, 'empurrador recuou antes do fim de curso'); }
      W.p = Math.max(0, W.p - dt / 0.7);
    }
    if (W.pushBox) this.movePushedBox();
    D[2][0] = air ? 1 : 0;

    // Inversor e elevador
    const d = O(4), sd = S[4];
    const en = d[0] & 1, up = (d[0] >> 1) & 1, dn = (d[0] >> 2) & 1, rst = (d[0] >> 3) & 1;
    if (rst && !sd.prevRst && !sd.fx) sd.latched = false; sd.prevRst = rst;
    if (sd.fx && en && power) sd.latched = true;
    sd.ready = power && !sd.latched;
    const vmax = Math.min(this.param(4, 0x50), sd.dev.model.maxV || 400);
    let v = 0; if (sd.ready && en && (up ^ dn)) v = Math.min(u16(d, 2), vmax) * (up ? 1 : -1);
    const y0 = W.platY; W.platY = clamp(W.platY + v / 1000 * dt, BOTTOM, TOP);
    sd.moving = Math.abs(W.platY - y0) > 1e-7; sd.v = sd.moving ? Math.abs(v) : 0;
    D[4][0] = (sd.ready ? 1 : 0) | (sd.moving ? 2 : 0) | (sd.latched ? 4 : 0) | (sd.moving ? 8 : 0);
    D[4][1] = sd.latched ? 21 : 0; setU16(D[4], 2, sd.v);
    const atBottom = W.platY <= BOTTOM + 0.0005;

    // Pallets, C2 e dispensador
    const v2 = S[6].act / 100 * 0.4 * S[6].dir;
    const ps = W.pallets.slice().sort((a, b) => b.z - a.z);
    let lim = OUT_Z;
    for (const p of ps) {
      if (!(p.onPlat && !atBottom)) {
        if (v2 > 0) p.z = Math.min(p.z + v2 * dt, Math.max(p.z, lim));
        else if (v2 < 0) p.z = Math.max(p.z + v2 * dt, atBottom ? PLAT_Z : 2.05);
      }
      lim = p.z - 1.0;
      if (p.onPlat && p.z > 1.5) p.onPlat = false;
      if (!p.onPlat && p.z < 1.45 && atBottom) p.onPlat = true;
      p.drop = Math.max(0, p.drop - dt * 1.5);
      p.y = (p.onPlat ? W.platY : BOTTOM) + p.drop;
      if (p.z >= OUT_Z - 0.001) {
        p.endT += dt;
        if (p.endT > 3) {
          W.pallets.splice(W.pallets.indexOf(p), 1); W.done++;
          this.log(`Pallet retirado da saída com ${p.count} caixas`, p.count === 12 ? 'ok' : 'info');
        }
      } else p.endT = 0;
    }
    if (atBottom && S[6].act < 1 && !W.pallets.some(p => p.z < 2.0)) {
      W.dispT += dt; if (W.dispT > 1.5) { this.spawnPallet(); W.dispT = 0; this.log('Dispensador colocou um pallet vazio no elevador'); }
    } else W.dispT = 0;

    for (const f of W.falling.slice()) {
      f.t += dt; f.vy -= 9.8 * dt; f.y = Math.max(f.h / 2, f.y + f.vy * dt);
      if (f.y > f.h / 2) f.rot += f.spin * dt;
      if (f.t > 3) W.falling.splice(W.falling.indexOf(f), 1);
    }

    // Sensores e hub (lado device)
    const under = W.boxes.find(b => Math.abs(b.x - B1X) < 0.2);
    this.dist1 = (2.2 - BELT_Y - (under ? under.h : 0)) * 1000 + (Math.random() - 0.5) * 2;
    this.laserIn(1, this.dist1);
    this.laserIn(5, (2.9 - W.platY) * 1000);
    const hub = [W.p <= 0, W.p >= 1, atBottom, W.platY >= TOP - 0.0005, !!this.palletOnPlat(), W.pallets.some(p => p.z >= OUT_Z - 0.01),
      W.pb.start, !W.pb.stop, W.pb.reset, !W.estop];
    const nIn = S[3].dev.model.inputs || 16;
    D[3][0] = 0; D[3][1] = 0; hub.forEach((on, i) => { if (on && i < nIn) D[3][i >> 3] |= 1 << (i & 7); });
    this.lamps = this.operate(7) ? O(7)[0] & (S[7].dev.alt ? 0x07 : 0x0F) : 0;

    // Eventos do device e status (0x0024)
    this.deviceEvents();

    // Publicação pela porta: respeita o estado e o tempo de ciclo
    PORTS.forEach(p => {
      const n = p.n, st = S[n];
      if (st.state === 'OPERATE') {
        st.cycT += dt * 1000;
        if (st.cycT >= this.cycleMs(n)) { st.cycT = 0; this.IN[n].set(D[n]); this.LOUT[n].set(outFor(n)); }
        this.PQI[n] = 0xC0 | (st.status ? 0x20 : 0);
      } else {
        this.IN[n].fill(0); this.LOUT[n].fill(0);
        this.PQI[n] = this.conn(n) ? 0x40 | (st.status ? 0x20 : 0) : 0;
      }
    });
    this.watchPQI();
  }

  deviceEvents() {
    const S = this.S;
    const rule = { 0: [[0x4000, () => S[0].latched]], 6: [[0x4000, () => S[6].latched]], 4: [[0x5000, () => S[4].latched]],
      2: [[0x8C00, () => S[2].fx]], 1: [[0x8C40, () => S[1].fx], [0x8C20, () => S[1].oor]], 5: [[0x8C40, () => S[5].fx], [0x8C20, () => S[5].oor]] };
    PORTS.forEach(p => {
      const n = p.n, st = S[n];
      if (st.state === 'PREOPERATE' || st.state === 'OPERATE') (rule[n] || []).forEach(([code, cond]) => this.setActive(n, code, !!cond()));
      const act = [...st.active].filter(c => EVENTS[c].origin === 'device');
      st.status = act.some(c => EVENTS[c].type === 'erro') ? 4 : act.includes(0x8C20) ? 2 : act.includes(0x8C40) ? 1 : 0;
    });
  }

  movePushedBox() {
    const W = this.W, b = W.pushBox, pal = this.palletOnPlat();
    let tx = END_X, ty = BELT_Y + b.h / 2, tz = PLAT_Z, base = 0, slot = [0, 0];
    if (pal && pal.count < 12) {
      const L = Math.floor(pal.count / 4); slot = SLOTS[pal.count % 4];
      base = pal.layerH.slice(0, L).reduce((a, c) => a + c, 0);
      tx = END_X + slot[0]; tz = pal.z + slot[1]; ty = W.platY + PAL_H + base + b.h / 2;
    }
    const e = W.p * W.p * (3 - 2 * W.p);
    b.pos = [b.from[0] + (tx - b.from[0]) * e, b.from[1] + (ty - b.from[1]) * Math.max(0, (e - 0.7) / 0.3), b.from[2] + (tz - b.from[2]) * e];
    if (W.p < 1) return;
    W.pushBox = null;
    if (!pal) return this.fallBox(b, b.pos, 'não há pallet no elevador');
    if (pal.count >= 12) return this.fallBox(b, b.pos, 'pallet já está completo');
    const err = (W.platY + PAL_H + base - BELT_Y) * 1000;
    if (Math.abs(err) > 25) return this.fallBox(b, b.pos, `elevador fora de posição (${err > 0 ? '+' : ''}${err.toFixed(0)} mm)`);
    const L = Math.floor(pal.count / 4);
    if (pal.count % 4 === 0) pal.layerH[L] = b.h;
    pal.boxes.push({ id: b.id, h: b.h, lx: slot[0], ly: PAL_H + base + b.h / 2, lz: slot[1] });
    pal.count++;
  }

  watchPQI() {
    PORTS.forEach(p => {
      const a = this.prevPQI[p.n], b = this.PQI[p.n];
      if (a === b) return;
      if ((a & 0x80) && !(b & 0x80)) this.log(`${this.tag(p.n)}: PQ = 0, dados de processo inválidos para o controlador`, 'diag');
      this.prevPQI[p.n] = b;
    });
  }

  /** Diagnóstico PROFINET por porta: erro de canal + código do evento IO-Link como valor adicional */
  diagCodes() {
    return PORTS.map(p => {
      const st = this.S[p.n];
      const list = [...st.active].filter(c => EVENTS[c].type !== 'notificação');
      if (!list.length) return { err: 0, add: 0 };
      const prio = c => EVENTS[c].origin === 'porta' ? 0 : EVENTS[c].type === 'erro' ? 1 : 2;
      list.sort((a, b) => prio(a) - prio(b));
      return { err: EVENT_DIAG[list[0]] || DIAG.ERROR, add: list[0] };
    });
  }

  portInfo() {
    return this.S.map((st, n) => ({
      state: st.state, cfg: st.cfg, cfgSrc: st.cfgSrc, cycleMs: this.cycleMs(n), disc: st.disc, short: st.short, fx: st.fx, status: st.status,
      conn: this.conn(n), dev: { pid: st.dev.pid, product: st.dev.product, vid: st.dev.vid, did: st.dev.did, serial: st.dev.serial, alt: st.dev.alt },
      backup: st.backup ? { pid: st.backup.pid, vid: st.backup.vid, did: st.backup.did, params: st.backup.params } : null,
      active: [...st.active]
    }));
  }

  snapshot() {
    const W = this.W, boxes = [];
    W.boxes.forEach(b => boxes.push([b.id, +b.x.toFixed(4), +(BELT_Y + b.h / 2).toFixed(4), 0, +b.h.toFixed(4), 0, 0]));
    if (W.pushBox) { const b = W.pushBox; boxes.push([b.id, ...b.pos.map(v => +v.toFixed(4)), +b.h.toFixed(4), 0, 0]); }
    W.pallets.forEach(p => p.boxes.forEach(b => boxes.push([b.id, END_X + b.lx, +(p.y + b.ly).toFixed(4), +(p.z + b.lz).toFixed(4), +b.h.toFixed(4), 0, 0])));
    W.falling.forEach(f => boxes.push([f.id, +f.x.toFixed(4), +f.y.toFixed(4), +f.z.toFixed(4), +f.h.toFixed(4), 1, +f.rot.toFixed(3)]));
    return {
      platY: +W.platY.toFixed(4), p: +W.p.toFixed(4), boxes,
      pallets: W.pallets.map(p => [p.id, END_X, +p.y.toFixed(4), +p.z.toFixed(4)]),
      lamps: this.lamps, dist1: Math.round(this.dist1),
      laser1: this.operate(1) && !this.S[1].fx, laser2: this.operate(5) && !this.S[5].fx,
      count: (this.palletOnPlat() || { count: 0 }).count, done: W.done, lost: W.lost
    };
  }
}

module.exports = { Sim, consts: { BELT_Y, TOP, BOTTOM, PAL_H, END_X, PLAT_Z, OUT_Z, B1X } };
