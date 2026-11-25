'use strict';
/**
 * Fila de requisições Modbus com prioridade.
 *
 * Prioridades (menor número = mais urgente):
 *   0 = EVENTO   -> escrita disparada por ação do usuário/processo (botão, chave, pressostato)
 *   1 = CÍCLICA  -> leitura das saídas do CLP (Discrete Inputs)
 *   2 = SINCRONISMO -> reescrita periódica de todas as coils (garante imagem íntegra)
 *   3 = DIAGNÓSTICO -> leitura de verificação das coils (FC01)
 *
 * Regras:
 *  - Coalescência: requisições com a mesma "key" não se acumulam. Se já existe uma
 *    na fila, a nova é fundida nela (os valores são sempre lidos no momento do envio).
 *  - Envelhecimento (aging): a cada `agingMs` de espera, a requisição sobe 1 nível
 *    de prioridade. Evita que leituras de baixa prioridade fiquem esquecidas.
 *  - Empate: a mais antiga sai primeiro (FIFO dentro da mesma prioridade).
 */
const PRIORITY = Object.freeze({ EVENT: 0, CYCLIC: 1, SYNC: 2, DIAG: 3 });
const PRIORITY_NAMES = ['P0 evento', 'P1 leitura', 'P2 sincronismo', 'P3 diagnóstico'];

class PriorityQueue {
  constructor({ agingMs = 1500, maxSize = 200 } = {}) {
    this.agingMs = agingMs;
    this.maxSize = maxSize;
    this.items = [];
    this.seq = 0;
    this.dropped = 0;
  }

  get size() { return this.items.length; }

  find(key) {
    if (!key) return null;
    return this.items.find((i) => i.key === key) || null;
  }

  push(item) {
    item.seq = this.seq++;
    item.enqueuedAt = item.enqueuedAt || Date.now();
    if (this.items.length >= this.maxSize) {
      // Descarta a requisição menos importante (maior prioridade numérica, mais nova)
      let worst = 0;
      for (let i = 1; i < this.items.length; i++) {
        const a = this.items[i], b = this.items[worst];
        if (a.priority > b.priority || (a.priority === b.priority && a.seq > b.seq)) worst = i;
      }
      if (this.items[worst].priority >= item.priority) {
        const [old] = this.items.splice(worst, 1);
        this.dropped++;
        if (old.reject) old.reject(new Error('Descartada: fila cheia'));
      } else {
        this.dropped++;
        if (item.reject) item.reject(new Error('Descartada: fila cheia'));
        return null;
      }
    }
    this.items.push(item);
    return item;
  }

  /** Prioridade efetiva considerando o envelhecimento. */
  effectivePriority(item, now = Date.now()) {
    const boost = Math.floor((now - item.enqueuedAt) / this.agingMs);
    return Math.max(0, item.priority - boost);
  }

  pop() {
    if (!this.items.length) return null;
    const now = Date.now();
    let best = 0;
    let bestP = this.effectivePriority(this.items[0], now);
    for (let i = 1; i < this.items.length; i++) {
      const p = this.effectivePriority(this.items[i], now);
      if (p < bestP || (p === bestP && this.items[i].seq < this.items[best].seq)) {
        best = i; bestP = p;
      }
    }
    return this.items.splice(best, 1)[0];
  }

  /** Quantidade de itens aguardando por nível de prioridade. */
  countByPriority() {
    const c = [0, 0, 0, 0];
    for (const i of this.items) c[Math.min(3, i.priority)]++;
    return c;
  }

  clear(err) {
    const all = this.items;
    this.items = [];
    for (const i of all) if (i.reject) i.reject(err || new Error('Fila limpa'));
  }
}

module.exports = { PriorityQueue, PRIORITY, PRIORITY_NAMES };
