'use strict';
/**
 * Sessões independentes: cada sessão = 1 CLP + 1 processo simulado + 1 fila Modbus.
 * Vários CLPs podem ser atendidos ao mesmo tempo (uma sessão por bancada/aluno).
 */
const fs = require('fs');
const path = require('path');
const { ModbusTcpClient, hex, FC_NAMES } = require('./modbus-client');
const { PRIORITY, PRIORITY_NAMES } = require('./priority-queue');
const { ProcessSim, COILS, DISCRETE_INPUTS } = require('./process-sim');

const DEFAULT_CONN = {
  host: '127.0.0.1',
  port: 502,
  unitId: 1,
  coilBase: 0,          // endereço da 1ª coil (I0.0)
  diBase: 0,            // endereço da 1ª discrete input (Q0.0)
  pollMs: 100,          // ciclo de leitura das saídas do CLP
  syncMs: 1000,         // reescrita periódica de todas as coils
  verifyMs: 3000,       // leitura de verificação (FC01)
  verify: false,
  timeoutMs: 1000,
  gapMs: 10,            // intervalo mínimo entre frames
  writeMode: 'multiple',// 'multiple' (FC15) | 'single' (FC05)
  autoReconnect: true,
  showFrames: false,
  addrMode: 'base',     // 'base' = contíguo a partir da 1ª coil/entrada; 'table' = endereço individual por ponto
  coilMap: null,        // [16] endereços das coils no modo 'table'
  diMap: null,          // [11] endereços das discrete inputs no modo 'table'
};

/** Agrupa pontos em faixas de endereços consecutivos: [{ start, idxs: [índices na ordem do endereço] }] */
function runsOf(addrs) {
  const pairs = addrs.map((a, i) => [a, i]).sort((x, y) => x[0] - y[0]);
  const runs = [];
  for (const [a, i] of pairs) {
    const r = runs[runs.length - 1];
    if (r && a === r.start + r.idxs.length) r.idxs.push(i);
    else runs.push({ start: a, idxs: [i] });
  }
  return runs;
}

const SIM_DT_MS = 50;
const BROADCAST_MS = 100;
const MAX_LOG = 400;

class Session {
  constructor(data, manager) {
    this.manager = manager;
    this.id = data.id;
    this.name = data.name || data.id;
    this.config = Object.assign({}, DEFAULT_CONN, data.config || {});
    this.sim = new ProcessSim(data.sim || {});
    this.client = null;
    this.status = 'desconectado'; // desconectado | conectando | conectado | reconectando | erro
    this.statusText = 'Desconectado';
    this.userDisconnected = true;
    this.logs = [];
    this.logSeq = 0;
    this.sse = new Set();
    this.coils = this.sim.getCoils();
    this.owner = data.owner || null;
    this.plcBits = new Array(DISCRETE_INPUTS.length).fill(false);
    this.timers = {};
    this.reconnectTimer = null;
    this.lastDiOk = 0;
    this.connectedAt = 0;
    this.verifyMismatch = 0;

    let last = Date.now();
    this.simTimer = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(0.2, (now - last) / 1000);
      last = now;
      this.sim.step(dt);
      while (this.sim.events.length) { const e = this.sim.events.shift(); this.log(e.level, e.text); }
      this._checkCoilChanges();
      if (this.sim.isDirty()) { this.sim.clearDirty(); this.manager.scheduleSave(); }
    }, SIM_DT_MS);
    this.bcTimer = setInterval(() => this._broadcast(), BROADCAST_MS);
    this.log('info', `Sessão "${this.name}" pronta.`);
  }

  // ---- Diagnóstico -----------------------------------------------------------
  log(level, text) {
    // Evita inundar o diagnóstico: a mesma mensagem de erro/aviso só aparece 1x a cada 5 s.
    if (level === 'erro' || level === 'warn') {
      this.repeat = this.repeat || new Map();
      const r = this.repeat.get(text);
      const t = Date.now();
      if (r && t - r.at < 5000) { r.count++; return; }
      if (r && r.count) text += ` (+${r.count} repetições suprimidas)`;
      this.repeat.set(text.replace(/ \(\+\d+ repetições suprimidas\)$/, ''), { at: t, count: 0 });
      if (this.repeat.size > 200) this.repeat.clear();
    }
    const d = new Date();
    const ts = d.toLocaleTimeString('pt-BR', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
    const entry = { seq: ++this.logSeq, ts, level, text };
    this.logs.push(entry);
    if (this.logs.length > MAX_LOG) this.logs.shift();
    for (const res of this.sse) send(res, 'log', entry);
  }

  // ---- Conexão ---------------------------------------------------------------
  setConfig(cfg) {
    const c = this.config;
    const num = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : def; };
    const live = ['showFrames', 'verify'];
    if (this.client && Object.keys(cfg).some((k) => !live.includes(k))) {
      throw new Error('Desconecte antes de alterar a configuração da conexão.');
    }
    if (cfg.host !== undefined) {
      const h = String(cfg.host).trim();
      if (!/^[A-Za-z0-9.\-:]{1,253}$/.test(h)) throw new Error('Endereço IP/host inválido.');
      c.host = h;
    }
    if (cfg.port !== undefined) c.port = num(cfg.port, 1, 65535, c.port);
    if (cfg.unitId !== undefined) c.unitId = num(cfg.unitId, 0, 255, c.unitId);
    if (cfg.coilBase !== undefined) c.coilBase = num(cfg.coilBase, 0, 65535 - COILS.length, c.coilBase);
    if (cfg.diBase !== undefined) c.diBase = num(cfg.diBase, 0, 65535 - DISCRETE_INPUTS.length, c.diBase);
    if (cfg.pollMs !== undefined) c.pollMs = num(cfg.pollMs, 20, 5000, c.pollMs);
    if (cfg.syncMs !== undefined) c.syncMs = num(cfg.syncMs, 200, 60000, c.syncMs);
    if (cfg.verifyMs !== undefined) c.verifyMs = num(cfg.verifyMs, 500, 60000, c.verifyMs);
    if (cfg.timeoutMs !== undefined) c.timeoutMs = num(cfg.timeoutMs, 100, 10000, c.timeoutMs);
    if (cfg.gapMs !== undefined) c.gapMs = num(cfg.gapMs, 0, 1000, c.gapMs);
    if (cfg.writeMode !== undefined) c.writeMode = cfg.writeMode === 'single' ? 'single' : 'multiple';
    if (cfg.addrMode !== undefined) c.addrMode = cfg.addrMode === 'table' ? 'table' : 'base';
    const mapOf = (arr, n, what) => {
      if (!Array.isArray(arr) || arr.length < n) throw new Error(`Tabela de ${what} deve ter ${n} endereços.`);
      arr = arr.slice(0, n);
      const v = arr.map((x) => Number(x));
      if (v.some((x) => !Number.isInteger(x) || x < 0 || x > 65535)) throw new Error(`Endereço de ${what} inválido (use 0 a 65535).`);
      if (new Set(v).size !== v.length) throw new Error(`Há endereços de ${what} repetidos.`);
      return v;
    };
    if (cfg.coilMap !== undefined) c.coilMap = mapOf(cfg.coilMap, COILS.length, 'coils');
    if (cfg.diMap !== undefined) c.diMap = mapOf(cfg.diMap, DISCRETE_INPUTS.length, 'discrete inputs');
    if (cfg.autoReconnect !== undefined) c.autoReconnect = !!cfg.autoReconnect;
    if (cfg.showFrames !== undefined) c.showFrames = !!cfg.showFrames;
    if (cfg.verify !== undefined) {
      c.verify = !!cfg.verify;
      if (this.client?.connected) this._startPolling();
    }
    this.manager.scheduleSave();
  }

  /** Quantas coils são enviadas: 16 (SP02) ou 18 (com o retorno das softs). */
  nCoils() { return COILS.length; }

  coilAddrs() {
    const c = this.config, n = this.nCoils();
    if (c.addrMode === 'table' && c.coilMap) {
      const m = c.coilMap.slice(0, n);
      while (m.length < n) m.push(Math.max(...m) + 1); // tabela antiga de 16 pontos
      return m;
    }
    return Array.from({ length: n }, (_, i) => c.coilBase + i);
  }

  diAddrs() {
    const c = this.config;
    return c.addrMode === 'table' && c.diMap ? c.diMap.slice() : DISCRETE_INPUTS.map((_, i) => c.diBase + i);
  }

  setStatus(status, text) {
    this.status = status;
    this.statusText = text;
  }

  async connect() {
    if (this.client) return;
    this.userDisconnected = false;
    clearTimeout(this.reconnectTimer);
    const c = this.config;
    this.setStatus('conectando', `Conectando a ${c.host}:${c.port}…`);
    this.log('info', `Conectando a ${c.host}:${c.port} (Unit ID ${c.unitId})…`);

    const client = new ModbusTcpClient({
      host: c.host, port: c.port, unitId: c.unitId, timeoutMs: c.timeoutMs, gapMs: c.gapMs,
    });
    this.client = client;

    client.on('connect', () => {
      this.connectedAt = Date.now();
      this.setStatus('conectado', `Conectado a ${c.host}:${c.port}`);
      this.log('ok', c.addrMode === 'table'
        ? `Conectado. Endereçamento por tabela: coils ${runsOf(this.coilAddrs()).map((r) => `${r.start}–${r.start + r.idxs.length - 1}`).join(', ')}; discrete inputs ${runsOf(this.diAddrs()).map((r) => `${r.start}–${r.start + r.idxs.length - 1}`).join(', ')}.`
        : `Conectado. Coils (saídas do simulador) a partir de ${c.coilBase}, discrete inputs (entradas do simulador) a partir de ${c.diBase}.`);
      this._writeAll(PRIORITY.EVENT, 'wEvt');
      this._startPolling();
    });
    client.on('frame', (dir, buf, r) => {
      if (!this.config.showFrames) return;
      const what = dir === 'TX' && r ? ` [${PRIORITY_NAMES[Math.min(3, r.priority)]} · ${FC_NAMES[r.fc]}]` : '';
      this.log('frame', `${dir} ${hex(buf)}${what}`);
    });
    client.on('warn', (t) => this.log('warn', t));
    client.on('requestError', (e) => this.log('erro', e.message));
    client.on('error', (e) => this.log('erro', e.code ? `${e.code}: ${e.message}` : e.message));
    client.on('close', (wasConnected) => {
      this._stopPolling();
      this.client = null;
      this.plcBits.fill(false);
      this.sim.setPlcOutputs([]); // perda de comunicação: zera as saídas do CLP no simulador
      if (wasConnected) this.log('warn', 'Conexão encerrada. Saídas do CLP zeradas no simulador por segurança.');
      if (this.userDisconnected) {
        this.setStatus('desconectado', 'Desconectado');
      } else if (this.config.autoReconnect) {
        this.setStatus('reconectando', 'Sem conexão — nova tentativa em 3 s');
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      } else {
        this.setStatus('erro', 'Falha na conexão');
      }
    });

    try {
      await client.connect();
    } catch (e) {
      // o evento 'close' cuida do estado/reconexão
    }
  }

  disconnect() {
    this.userDisconnected = true;
    clearTimeout(this.reconnectTimer);
    if (this.client) {
      this.log('info', 'Desconectando a pedido do usuário.');
      this.client.close();
    } else {
      this.setStatus('desconectado', 'Desconectado');
    }
  }

  // ---- Polling por fila --------------------------------------------------------
  _startPolling() {
    this._stopPolling();
    const c = this.config;
    const diRuns = runsOf(this.diAddrs());
    // P1: leitura cíclica das saídas do CLP, uma requisição por faixa contígua (não acumula na fila)
    this.timers.read = setInterval(() => {
      if (!this.client?.connected) return;
      for (const r of diRuns) {
        const key = `rDI:${r.start}`;
        if (this.client.isQueued(key)) continue;
        this.client.request({ key, priority: PRIORITY.CYCLIC, fc: 2, address: r.start, quantity: r.idxs.length })
          .then((bits) => {
            r.idxs.forEach((idx, k) => { this.plcBits[idx] = bits[k]; });
            this.sim.setPlcOutputs(this.plcBits);
            this.lastDiOk = Date.now();
          })
          .catch(() => {});
      }
    }, c.pollMs);
    // P2: sincronismo periódico de todas as coils
    this.timers.sync = setInterval(() => {
      if (!this.client?.connected) return;
      this._writeAll(PRIORITY.SYNC, 'wSync');
    }, c.syncMs);
    // P3: verificação das coils (opcional)
    if (c.verify) {
      const coilRuns = runsOf(this.coilAddrs());
      this.timers.verify = setInterval(() => {
        if (!this.client?.connected) return;
        for (const r of coilRuns) {
          const key = `rCoils:${r.start}`;
          if (this.client.isQueued(key)) continue;
          this.client.request({ key, priority: PRIORITY.DIAG, fc: 1, address: r.start, quantity: r.idxs.length })
            .then((bits) => {
              const diff = r.idxs.filter((idx, k) => bits[k] !== this.coils[idx]).map((idx) => COILS[idx].xp || COILS[idx].addr);
              if (diff.length) {
                this.verifyMismatch++;
                this.log('warn', `Verificação FC01: CLP diferente do simulador em ${diff.join(', ')} (será corrigido no próximo sincronismo).`);
              }
            })
            .catch(() => {});
        }
      }, c.verifyMs);
    }
  }

  _stopPolling() {
    for (const t of Object.values(this.timers)) clearInterval(t);
    this.timers = {};
  }

  _writeAll(priority, keyBase) {
    if (!this.client) return;
    const addrs = this.coilAddrs();
    if (this.config.writeMode === 'single') {
      addrs.forEach((_, i) => this._writeOne(i, priority));
      return;
    }
    for (const r of runsOf(addrs)) {
      if (keyBase === 'wSync' && this.client.isQueued(`wEvt:${r.start}`)) continue;
      this.client.request({
        key: `${keyBase}:${r.start}`, priority, fc: 15, address: r.start, retries: 2,
        getValues: () => r.idxs.map((i) => this.coils[i]),
      }).catch(() => {});
    }
  }

  _writeOne(i, priority) {
    const addr = this.coilAddrs()[i];
    this.client.request({
      key: `w5:${addr}`, priority, fc: 5, address: addr, retries: 2,
      getValue: () => this.coils[i],
    }).catch(() => {});
  }

  /** Detecta mudanças nas saídas do simulador e agenda escrita P0 (evento). */
  _checkCoilChanges() {
    const now = this.sim.getCoils();
    const changed = [];
    for (let i = 0; i < now.length; i++) if (now[i] !== this.coils[i]) changed.push(i);
    if (!changed.length) return;
    this.coils = now;
    if (!this.client?.connected) return;
    const n = this.nCoils();
    if (!changed.some((i) => i < n)) return; // retorno das softs desligado: nada a enviar
    if (this.config.writeMode === 'single') changed.filter((i) => i < n).forEach((i) => this._writeOne(i, PRIORITY.EVENT));
    else this._writeAll(PRIORITY.EVENT, 'wEvt');
  }

  // ---- Estado para a interface ------------------------------------------------
  stateSnapshot() {
    const cl = this.client;
    const st = cl?.stats;
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      statusText: this.statusText,
      config: this.config,
      comm: {
        connectedFor: this.status === 'conectado' ? Date.now() - this.connectedAt : 0,
        lastDiAgeMs: this.lastDiOk ? Date.now() - this.lastDiOk : null,
        queue: cl ? cl.queue.countByPriority() : [0, 0, 0, 0],
        queueSize: cl ? cl.queue.size : 0,
        inflight: !!cl?.inflight,
        rate: cl ? Math.round(cl.rate() * 10) / 10 : 0,
        sent: st?.sent || 0, ok: st?.ok || 0, timeouts: st?.timeouts || 0, exceptions: st?.exceptions || 0,
        retries: st?.retries || 0, errors: st?.errors || 0,
        lastRtMs: st?.lastRtMs || 0, avgRtMs: st ? Math.round(st.avgRtMs * 10) / 10 : 0, maxRtMs: st?.maxRtMs || 0,
        sentByPriority: st?.sentByPriority || [0, 0, 0, 0],
        dropped: cl?.queue.dropped || 0,
        verifyMismatch: this.verifyMismatch,
      },
      coils: this.coils,
      plc: this.sim.plc,
      coilAddrs: this.coilAddrs(),
      diAddrs: this.diAddrs(),
      owner: this.owner,
      sim: this.sim.snapshot(),
    };
  }

  _broadcast() {
    if (!this.sse.size) return;
    const s = this.stateSnapshot();
    for (const res of this.sse) send(res, 'state', s);
  }

  attach(res) {
    this.sse.add(res);
    send(res, 'logs', this.logs);
    send(res, 'state', this.stateSnapshot());
  }

  detach(res) { this.sse.delete(res); }

  clearLogs() {
    this.logs = [];
    for (const res of this.sse) send(res, 'logs', []);
  }

  serialize() {
    return { id: this.id, name: this.name, owner: this.owner, config: this.config, sim: this.sim.serialize() };
  }

  destroy() {
    this.userDisconnected = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.simTimer);
    clearInterval(this.bcTimer);
    this._stopPolling();
    if (this.client) this.client.close();
    for (const res of this.sse) { send(res, 'deleted', { id: this.id }); res.end(); }
    this.sse.clear();
  }
}

function send(res, event, data) {
  try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch (_) { /* cliente saiu */ }
}

class SessionManager {
  constructor(file) {
    this.file = file;
    this.sessions = new Map();
    this.saveTimer = null;
    let data = null;
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { /* primeira execução */ }
    const list = data?.sessions?.length ? data.sessions : [{ id: 's1', name: 'Bancada 01' }];
    for (const d of list) this.sessions.set(d.id, new Session(d, this));
    this.scheduleSave();
  }

  list() {
    return [...this.sessions.values()].map((s) => ({ id: s.id, name: s.name, status: s.status, host: s.config.host, port: s.config.port, owner: s.owner }));
  }

  get(id) { return this.sessions.get(id); }

  /** Sessão própria de cada PC (pelo IP). O PC do servidor usa a primeira sessão. */
  forClient(ownerKey) {
    for (const s of this.sessions.values()) if (s.owner === ownerKey) return s;
    if (ownerKey === 'local') {
      const first = [...this.sessions.values()].find((s) => !s.owner);
      if (first) { first.owner = 'local'; this.scheduleSave(); return first; }
    }
    const s = this.create(ownerKey === 'local' ? 'Este PC' : `PC ${ownerKey}`);
    s.owner = ownerKey;
    this.scheduleSave();
    return s;
  }

  create(name) {
    let n = this.sessions.size + 1;
    while (this.sessions.has(`s${n}`)) n++;
    const id = `s${n}`;
    const s = new Session({ id, name: (name || `Bancada ${String(n).padStart(2, '0')}`).slice(0, 40) }, this);
    this.sessions.set(id, s);
    this.scheduleSave();
    return s;
  }

  rename(id, name) {
    const s = this.get(id);
    if (!s) return null;
    s.name = String(name || s.name).slice(0, 40);
    this.scheduleSave();
    return s;
  }

  remove(id) {
    const s = this.get(id);
    if (!s) return false;
    if (this.sessions.size === 1) throw new Error('Mantenha pelo menos uma sessão.');
    s.destroy();
    this.sessions.delete(id);
    this.scheduleSave();
    return true;
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 800);
  }

  saveNow() {
    const data = { savedAt: new Date().toISOString(), sessions: [...this.sessions.values()].map((s) => s.serialize()) };
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file + '.tmp', JSON.stringify(data, null, 2));
      fs.renameSync(this.file + '.tmp', this.file);
    } catch (e) {
      console.error('Falha ao salvar sessões:', e.message);
    }
  }

  shutdown() {
    this.saveNow();
    for (const s of this.sessions.values()) s.destroy();
  }
}

module.exports = { SessionManager, DEFAULT_CONN };
