'use strict';
// Fila de escrita por prioridade para não sobrecarregar o CLP.
//   P0: imediato (fura a fila), P1: lote a cada 100 ms, P2: lote a cada 1000 ms.
// Coalescência: último valor vence por tag. Uma requisição em voo por vez.
// Degradação adaptativa: se a latência média passar de limiarMs, P1 -> 300 ms e P2 -> 2500 ms
// (os únicos períodos que o servidor Altus aceita sem revisar são múltiplos de 100 ms).
const EventEmitter = require('events');

const PADRAO = {
  periodos: { 1: 100, 2: 1000 }, periodosLentos: { 1: 300, 2: 2500 },
  limiarMs: 200, recuperaMs: 80, janela: 10, maxNosPorWrite: 1000, timeoutMs: 2000,
};

class PriorityWriteQueue extends EventEmitter {
  // writer(items) -> Promise<void>; items = [{ tag, valor }]
  constructor(writer, opts = {}) {
    super();
    this.writer = writer;
    this.o = Object.assign({}, PADRAO, opts);
    this.pend = { 0: new Map(), 1: new Map(), 2: new Map() };
    this.ultimo = new Map(); // tag -> último valor enviado (para ressincronizar)
    this.prioDe = new Map();
    this.emVoo = false; this.urgente = false;
    this.lento = false; this.rtts = [];
    this.stats = { escritas: 0, nos: 0, erros: 0, lat: 0, latMax: 0, eps: 0, _epsAcc: 0, _epsT: Date.now(), degradacoes: 0 };
    this.timers = [];
    this.ativo = false;
  }
  periodo(p) { return (this.lento ? this.o.periodosLentos : this.o.periodos)[p]; }
  iniciar() {
    this.ativo = true;
    this._agendar(1); this._agendar(2);
  }
  parar() { this.ativo = false; for (const t of this.timers) clearTimeout(t); this.timers = []; }
  _agendar(p) {
    const t = setTimeout(async () => {
      this.timers = this.timers.filter(x => x !== t);
      if (!this.ativo) return;
      await this._flush(p);
      if (this.ativo) this._agendar(p);
    }, this.periodo(p));
    this.timers.push(t);
  }
  enfileirar(tag, valor, prio = 1) {
    this.prioDe.set(tag, prio);
    // um tag só fica numa prioridade: a mais alta pendente
    for (const p of [0, 1, 2]) if (p !== prio) this.pend[p].delete(tag);
    this.pend[prio].set(tag, valor);
    if (prio === 0) {
      if (this.emVoo) this.urgente = true; else this._flush(0);
    }
  }
  pendentes() { return { 0: this.pend[0].size, 1: this.pend[1].size, 2: this.pend[2].size }; }
  async _flush(prio) {
    if (this.emVoo || !this.pend[prio].size) return;
    // um lote de P1 ou P2 leva também tudo que estiver pendente em prioridades mais altas
    const items = [];
    for (let p = 0; p <= prio; p++) {
      for (const [tag, valor] of this.pend[p]) items.push({ tag, valor });
      this.pend[p].clear();
    }
    await this._enviar(items.slice(0, this.o.maxNosPorWrite));
    if (items.length > this.o.maxNosPorWrite) for (const it of items.slice(this.o.maxNosPorWrite)) this.enfileirar(it.tag, it.valor, this.prioDe.get(it.tag) ?? 1);
  }
  async _enviar(items) {
    this.emVoo = true;
    const t0 = Date.now();
    try {
      await Promise.race([this.writer(items), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout de escrita')), this.o.timeoutMs))]);
      const rtt = Date.now() - t0;
      for (const it of items) this.ultimo.set(it.tag, it.valor);
      this.stats.escritas++; this.stats.nos += items.length; this.stats._epsAcc++;
      this._rtt(rtt);
      this.emit('escrita', { items, rtt });
    } catch (e) {
      this.stats.erros++;
      // devolve à fila para a próxima tentativa (sem perder valores mais novos já enfileirados)
      for (const it of items) { const p = this.prioDe.get(it.tag) ?? 1; if (!this.pend[p].has(it.tag)) this.pend[p].set(it.tag, it.valor); }
      this.emit('erro', e);
    } finally {
      this.emVoo = false;
      const agora = Date.now();
      if (agora - this.stats._epsT >= 1000) { this.stats.eps = this.stats._epsAcc; this.stats._epsAcc = 0; this.stats._epsT = agora; }
      if (this.urgente) { this.urgente = false; this._flush(0); }
    }
  }
  _rtt(rtt) {
    this.rtts.push(rtt); if (this.rtts.length > this.o.janela) this.rtts.shift();
    this.stats.lat = Math.round(this.rtts.reduce((a, b) => a + b, 0) / this.rtts.length);
    this.stats.latMax = Math.max(this.stats.latMax, rtt);
    if (!this.lento && this.rtts.length >= this.o.janela && this.stats.lat > this.o.limiarMs) {
      this.lento = true; this.stats.degradacoes++; this.emit('degradou', this.stats.lat);
    } else if (this.lento && this.rtts.length >= this.o.janela && this.rtts.every(r => r < this.o.recuperaMs)) {
      this.lento = false; this.emit('recuperou');
    }
  }
  // após reconexão: reenviar tudo, P0 primeiro
  ressincronizar() {
    const porPrio = [[], [], []];
    for (const [tag, valor] of this.ultimo) porPrio[this.prioDe.get(tag) ?? 1].push([tag, valor]);
    for (const p of [2, 1, 0]) for (const [tag, valor] of porPrio[p]) this.enfileirar(tag, valor, p);
  }
}

// Escritor de tags com deadband por tag (analógicos) e detecção de mudança (arrays/bools).
class TagWriter {
  constructor(fila, deadbands = {}) { this.fila = fila; this.db = deadbands; this.ult = new Map(); }
  // valor: número, boolean ou array de números/booleans
  escrever(tag, valor, prio = 1) {
    const u = this.ult.get(tag);
    if (u !== undefined && !this._mudou(u, valor, this.db[tag] || 0)) return false;
    this.ult.set(tag, Array.isArray(valor) ? valor.slice() : valor);
    this.fila.enfileirar(tag, valor, prio);
    return true;
  }
  // db: número (mesmo deadband para todos os elementos) ou array (deadband por elemento)
  _mudou(a, b, db) {
    if (Array.isArray(a)) { if (a.length !== b.length) return true; for (let i = 0; i < a.length; i++) if (this._mudou(a[i], b[i], Array.isArray(db) ? (db[i] || 0) : db)) return true; return false; }
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) > db;
    return a !== b;
  }
}

module.exports = { PriorityWriteQueue, TagWriter, PADRAO };
