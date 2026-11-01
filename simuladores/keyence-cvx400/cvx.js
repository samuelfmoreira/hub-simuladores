/**
 * =====================================================================
 *  MODELO DO SISTEMA DE VISÃO KEYENCE CV-X400 (conforme o EDS)
 * =====================================================================
 *
 *  ASSEMBLY 100 — ENTRADA DO CLP (T->O, o simulador produz)
 *  -------------------------------------------------------------------
 *   Byte 0   bit0 Command complete   bit1 Command error   bit2 Command ready
 *            bit3 Result ready       bit4 Result OR
 *   Byte 1   bit0..3 READY1..READY4
 *   Byte 2   bit0..3 ACK1..ACK4
 *   Byte 3   bit0 BUSY  bit1 ERROR  bit3 RUN
 *   Byte 4..11   Área de bits configurável ("Atribuição de saída" do CV-X)
 *   Byte 12..13  Error code (UINT)
 *   Byte 16..19  Total count (UDINT)
 *   Byte 20..23  Command result (UDINT)
 *   Byte 24..    User defined input data: depende do PROGRAMA carregado
 *                (ver programas.js)
 *
 *  ATRIBUIÇÃO DE SAÍDA (bytes 4..11), por programa, como no CV-X real
 *  (bit N do byte 4 = "Tool Judge Value N" do EDS; byte 5 bit 0 = Value8).
 *  O 0004:bit6 não é usado: no EDS o Tool Judge Value6 aponta para o
 *  parâmetro errado (Command Result).
 *     0004:bit0  Status Total  No estado NG
 *     0004:bit1  Status Total  No estado OK
 *     0004:bit2.. uma linha por ferramenta, No estado NG
 *   No CODESYS/MasterTool o I/O Mapping mostra cada "Tool Judge Value" como
 *   um BYTE separado; na rede os bits vêm todos no byte 4.
 *
 *  ASSEMBLY 101 — SAÍDA DO CLP (O->T, o simulador consome)
 *  -------------------------------------------------------------------
 *   Byte 0   bit0 Command request  bit3 Result ack  bit4 Error reset request
 *   Byte 1   bit0..3 TRG1..TRG4
 *   Byte 16..19 Command Number,  Byte 20..23 Parâmetro do comando
 *
 *  TROCA DE PROGRAMA
 *   Feita somente na própria câmera (seletor de programas da tela).
 *   Comandos vindos do CLP (Command request) não são executados: a câmera
 *   responde Command complete + Command error, para o CLP não ficar travado
 *   esperando.
 *
 *  MODOS
 *   Execução:    RUN = 1, aceita TRG1 do CLP e atualiza a saída EtherNet/IP.
 *   Programação: RUN = 0, READY1 = 0, TRG1 do CLP é ignorado; o botão Exec
 *                faz uma medição de TESTE só na tela (não altera a saída).
 *
 *  SEQUÊNCIA DE UMA INSPEÇÃO (TRG1)
 *   TRG1 sobe  -> ACK1 = 1, READY1 = 0, BUSY = 1, Result ready = 0
 *   fim        -> dados e bits atualizados, Total count + 1,
 *                 BUSY = 0, READY1 = 1, Result ready = 1
 *   TRG1 desce -> ACK1 = 0;  Result ack sobe -> Result ready = 0
 * =====================================================================
 */

"use strict";

const { EventEmitter } = require("events");
const { TIPOS, TAMANHO_ASSEMBLY } = require("./programas");

const TEMPO_CARGA_MS = 600;       // tempo de troca de programa (BUSY ligado)

const copia = (o) => JSON.parse(JSON.stringify(o));

class SimuladorCVX extends EventEmitter {
  constructor() {
    super();
    this.entrada = Buffer.alloc(TAMANHO_ASSEMBLY);   // assembly 100

    // Programas gravados na "câmera" (como no cartão SD do CV-X)
    this.programas = new Map();
    this._criar(41, "INSPECAO_ETIQUETA", "etiqueta");
    this._criar(42, "DISCO_FUROS", "furos");
    this.prog = this.programas.get(41);

    // Peça na frente da câmera e falhas simuladas: uma por tipo de programa
    this.pecas = {};
    this.falhas = {};
    for (const [t, def] of Object.entries(TIPOS)) {
      this.pecas[t] = def.pecaPadrao();
      this.falhas[t] = def.falhasPadrao();
    }

    this.global = { autoDisparo: false, autoIntervaloMs: 3000 };
    this.modo = "execucao";
    this.historico = [];
    this._ultimoTrigger = null;

    this.s = {
      busy: false, carregando: false, ready1: true, ack1: false, resultReady: false, resultOR: false,
      erro: false, run: true, cmdReady: true, cmdComplete: false, cmdError: false, cmdResult: 0,
      codigoErro: 0, totalCount: 0, contNg: 0,
      bitsSaida: Buffer.alloc(8),
      progHoraMs: null, intervaloMs: null,
    };

    this.clp = { conectado: false, run: false, trg1: false, resultAck: false, errorReset: false, cmdRequest: false };
    this.ultimaLeitura = null;
    this._timerInspecao = null;
    this._timerCarga = null;
    this._timerAuto = null;
    this._escreverStatus();
  }

  // ---- atalhos do programa atual ----
  get def() { return TIPOS[this.prog.tipo]; }
  get config() { return this.prog.config; }
  get peca() { return this.pecas[this.prog.tipo]; }
  get falhasAtuais() { return this.falhas[this.prog.tipo]; }

  _criar(numero, nome, tipo, config) {
    const p = { numero, nome, tipo, config: config ? copia(config) : TIPOS[tipo].configPadrao() };
    this.programas.set(numero, p);
    return p;
  }

  lerEntrada() {
    return this.entrada;
  }

  // -------------------------------------------------------------------
  // Saídas do CLP (assembly 101)
  // -------------------------------------------------------------------
  receberSaidas(buf, run) {
    const b0 = buf[0] || 0;
    const b1 = buf[1] || 0;
    const novo = {
      conectado: true,
      run,
      cmdRequest: (b0 & 0x01) !== 0,
      resultAck: (b0 & 0x08) !== 0,
      errorReset: (b0 & 0x10) !== 0,
      trg1: (b1 & 0x01) !== 0,
      cmdNumero: buf.length >= 20 ? buf.readUInt32LE(16) : 0,
      cmdParam: buf.length >= 24 ? buf.readUInt32LE(20) : 0,
    };
    const ant = this.clp;
    this.clp = novo;

    // Com o CLP em IDLE (PROGRAM/STOP) as saídas não são válidas
    if (run) {
      if (novo.trg1 && !ant.trg1) {
        if (this.modo === "programacao") {
          this.emit("log", "TRG1 do CLP ignorado: câmera em modo programação");
        } else {
          this.s.ack1 = true;
          this.emit("log", "TRG1 recebido do CLP");
          this.disparar("CLP (TRG1)");
        }
      }
      if (novo.resultAck && !ant.resultAck && this.s.resultReady) {
        this.s.resultReady = false;
        this.emit("log", "Result ack recebido: Result ready desligado");
      }
      if (novo.errorReset && !ant.errorReset && this.s.erro) {
        this.s.erro = false;
        this.s.codigoErro = 0;
        this.emit("log", "Error reset recebido");
      }
      if (novo.cmdRequest && !ant.cmdRequest) this._comando(novo.cmdNumero, novo.cmdParam);
    }
    if (!novo.trg1 && ant.trg1) this.s.ack1 = false;
    if (!novo.cmdRequest && ant.cmdRequest) {
      this.s.cmdComplete = false;
      this.s.cmdError = false;
    }

    const mudou = ["run", "cmdRequest", "resultAck", "errorReset", "trg1"].some((k) => novo[k] !== ant[k]) ||
      novo.conectado !== ant.conectado;
    if (mudou) {
      this._escreverStatus();
      this.emit("mudou");
    }
  }

  _comando(numero, param) {
    const fim = (ok, result, msg) => {
      this.s.cmdComplete = true;
      this.s.cmdError = !ok;
      this.s.cmdResult = result >>> 0;
      this.emit("log", msg);
      this._escreverStatus();
      this.emit("mudou");
    };
    // A troca de programa é feita só pela tela da câmera
    fim(false, 0, `Comando ${numero} (parâmetro ${param}) do CLP recusado: a troca de programa é feita na própria câmera`);
  }

  clpDesconectou() {
    this.clp = { conectado: false, run: false, trg1: false, resultAck: false, errorReset: false, cmdRequest: false };
    this.s.ack1 = false;
    this.s.cmdComplete = false;
    this.s.cmdError = false;
    this._escreverStatus();
    this.emit("mudou");
  }

  _numero() {
    return String(this.prog.numero).padStart(3, "0");
  }

  // -------------------------------------------------------------------
  // Programas
  // -------------------------------------------------------------------
  /**
   * Carrega outro programa. Durante a carga BUSY fica ligado e READY1
   * desligado; a área de dados e os bits de resultado são zerados.
   */
  carregarPrograma(numero, origem, cb = () => {}) {
    const n = Number(numero);
    const p = this.programas.get(n);
    if (!p) return cb(`programa ${n} não existe`);
    if (this.s.busy || this.s.carregando) return cb("câmera ocupada (BUSY)");
    if (p === this.prog) {
      this.emit("log", `Conf. ${this._numero()} já está carregado`);
      return cb(null);
    }

    this.s.carregando = true;
    this.s.ready1 = false;
    this.s.resultReady = false;
    this.s.resultOR = false;
    this.s.bitsSaida = Buffer.alloc(8);
    this.entrada.fill(0, 24);
    this._escreverStatus();
    this.emit("log", `Carregando Conf. ${String(n).padStart(3, "0")} ${p.nome} (${origem})...`);
    this.emit("mudou");

    this._timerCarga = setTimeout(() => {
      this.prog = p;
      this.ultimaLeitura = null;
      this.s.carregando = false;
      this.s.ready1 = this.s.run;
      this.s.progHoraMs = null;
      this._escreverStatus();
      this.emit("log", `Conf. ${this._numero()} ${p.nome} carregado: ${this.def.descricao}`);
      this.emit("programa", p);
      this.emit("mudou");
      cb(null);
    }, TEMPO_CARGA_MS);
  }

  novoPrograma({ numero, nome, tipo, duplicar }) {
    const n = Number(numero);
    if (!Number.isInteger(n) || n < 0 || n > 999) return "número inválido (0 a 999)";
    if (this.programas.has(n)) return `o programa ${n} já existe`;
    const nm = String(nome || "").trim().toUpperCase().slice(0, 24);
    if (!nm) return "informe o nome";
    if (duplicar) {
      this._criar(n, nm, this.prog.tipo, this.prog.config);
    } else {
      if (!TIPOS[tipo]) return "tipo de inspeção inválido";
      this._criar(n, nm, tipo);
    }
    this.emit("mudou");
    return null;
  }

  excluirPrograma(numero) {
    const n = Number(numero);
    if (!this.programas.has(n)) return "programa não existe";
    if (this.prog.numero === n) return "não é possível excluir o programa carregado";
    this.programas.delete(n);
    this.emit("mudou");
    return null;
  }

  definirPrograma({ numero, nome }) {
    const n = Number(numero);
    if (Number.isInteger(n) && n >= 0 && n <= 999 && n !== this.prog.numero) {
      if (this.programas.has(n)) {
        this.emit("log", `Número ${n} já usado por outro programa`);
      } else {
        this.programas.delete(this.prog.numero);
        this.prog.numero = n;
        this.programas.set(n, this.prog);
      }
    }
    if (typeof nome === "string" && nome.trim()) this.prog.nome = nome.trim().slice(0, 24).toUpperCase();
    this.emit("mudou");
  }

  // -------------------------------------------------------------------
  // Inspeção
  // -------------------------------------------------------------------
  disparar(origem, teste = false) {
    if (this.modo === "programacao" && !teste) {
      this.emit("log", `Trigger de ${origem} ignorado: câmera em modo programação`);
      return;
    }
    if (this.s.busy || this.s.carregando) {
      this.s.erro = true;
      this.s.codigoErro = 1;
      this.emit("log", `Trigger de ${origem} ignorado: câmera ocupada (ERROR ligado)`);
      this._escreverStatus();
      this.emit("mudou");
      return;
    }

    const agora = Date.now();
    if (!teste) {
      this.s.intervaloMs = this._ultimoTrigger ? agora - this._ultimoTrigger : null;
      this._ultimoTrigger = agora;
    }
    this.s.busy = true;
    if (!teste) {
      this.s.ready1 = false;
      this.s.resultReady = false;
    }
    this._escreverStatus();
    this.emit("mudou");
    this.emit("log", teste ? "Medição de teste (modo programação)" : `Inspeção iniciada (${origem})`);
    this.emit("disparo", { teste });

    const tempo = this.config.tempoInspecaoMs * (0.97 + Math.random() * 0.06);
    const prog = this.prog;
    this._timerInspecao = setTimeout(() => this._concluir(origem, teste, tempo, prog), tempo);
  }

  _concluir(origem, teste, tempo, prog) {
    const def = TIPOS[prog.tipo];
    const peca = this.pecas[prog.tipo];
    const resultados = def.executar({ peca, falhas: this.falhas[prog.tipo], config: prog.config, tempo });
    const ok = resultados.every((r) => r.ok);

    if (!teste) {
      def.escreverDados(this.entrada, { resultados, peca, config: prog.config });
      this._calcularBitsSaida(ok, resultados);
      this.s.resultOR = !ok;
      this.s.totalCount = (this.s.totalCount + 1) >>> 0;
      if (!ok) this.s.contNg++;
      this.s.ready1 = true;
      this.s.resultReady = true;
    }
    this.s.busy = false;
    this.s.progHoraMs = Math.round(tempo * 10) / 10;

    this.ultimaLeitura = {
      quando: Date.now(), origem, teste, ok, resultados,
      programa: prog.numero, totalCount: this.s.totalCount, progHoraMs: this.s.progHoraMs,
    };
    this.historico.unshift({
      quando: this.ultimaLeitura.quando, ok, teste, programa: prog.numero,
      totalCount: this.s.totalCount, progHoraMs: this.s.progHoraMs,
    });
    this.historico.length = Math.min(this.historico.length, 30);

    this._escreverStatus();
    this.emit("log",
      (teste ? "Teste concluído: " : `Inspeção ${this.s.totalCount} concluída: `) +
      (ok ? "OK" : `NG (${def.resumoNg(resultados)})`));
    this.emit("inspecao", this.ultimaLeitura);
    this.emit("mudou");
  }

  // -------------------------------------------------------------------
  // Peça, cenários e falhas (painel do simulador)
  // -------------------------------------------------------------------
  definirPeca(dados = {}) {
    const t = this.prog.tipo;
    this.pecas[t] = TIPOS[t].normalizarPeca(dados, this.pecas[t]);
    this.emit("mudou");
  }

  aplicarCenario(id) {
    const c = this.def.cenarios[id];
    if (!c) return null;
    const r = c.gerar(this.peca);
    const descricao = r.descricao;
    delete r.descricao;
    this.pecas[this.prog.tipo] = r;
    this.falhas[this.prog.tipo] = this.def.falhasPadrao();
    this.emit("mudou");
    return descricao;
  }

  definirFalhas(lista) {
    const n = this.def.falhasPadrao().length;
    this.falhas[this.prog.tipo] = Array.from({ length: n }, (_, i) => !!lista[i]);
    this.emit("mudou");
  }

  definirLimites(d) {
    if (!this.def.validarLimites) return;
    this.config.limites = this.def.validarLimites(d, this.config.limites);
    this.emit("mudou");
  }

  // Bits dos bytes 4..11 conforme a tabela de atribuição de saída
  _calcularBitsSaida(totalOk, resultados) {
    const b = Buffer.alloc(8);
    for (const linha of this.config.saidas) {
      const r = linha.item === "STATUS" ? null : resultados.find((x) => x.id === linha.item);
      const okItem = linha.item === "STATUS" ? totalOk : !!(r && r.ok);
      const liga = linha.tempo === "OK" ? okItem : !okItem;
      if (liga) b[linha.byte - 4] |= 1 << linha.bit;
    }
    this.s.bitsSaida = b;
  }

  definirSaidas(lista) {
    if (!Array.isArray(lista)) return;
    const itens = ["STATUS", ...this.def.ferramentas.map((f) => f.id)];
    const usadas = new Set();
    const novas = [];
    for (const l of lista.slice(0, 64)) {
      const byte = Number(l.byte);
      const bit = Number(l.bit);
      if (!Number.isInteger(byte) || byte < 4 || byte > 11) continue;
      if (!Number.isInteger(bit) || bit < 0 || bit > 7) continue;
      if (!itens.includes(l.item) || (l.tempo !== "OK" && l.tempo !== "NG")) continue;
      const end = byte * 8 + bit;
      if (usadas.has(end)) continue;
      usadas.add(end);
      novas.push({ byte, bit, item: l.item, tempo: l.tempo });
    }
    novas.sort((a, b) => a.byte * 8 + a.bit - (b.byte * 8 + b.bit));
    this.config.saidas = novas;
    const u = this.ultimaLeitura;
    if (u && !u.teste) this._calcularBitsSaida(u.ok, u.resultados);
    else this.s.bitsSaida = Buffer.alloc(8);
    this._escreverStatus();
    this.emit("mudou");
  }

  definirModo(modo) {
    if (modo !== "execucao" && modo !== "programacao") return;
    if (modo === this.modo) return;
    this.modo = modo;
    this.s.run = modo === "execucao";
    this.s.ready1 = this.s.run && !this.s.busy && !this.s.carregando;
    if (!this.s.run) this.s.ack1 = false;
    this._escreverStatus();
    this.emit("log", modo === "execucao"
      ? "Modo execução: RUN ligado, aceitando trigger do CLP"
      : "Modo programação: RUN e READY desligados, trigger do CLP ignorado");
    this.emit("mudou");
  }

  definirConfig(c = {}) {
    const n = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
    if (n(c.offsetDados, 24, TAMANHO_ASSEMBLY - 4)) this.config.offsetDados = c.offsetDados;
    if (n(c.tempoInspecaoMs, 20, 10000)) this.config.tempoInspecaoMs = c.tempoInspecaoMs;
    if (typeof c.falhaZera === "boolean") this.config.falhaZera = c.falhaZera;
    if ((c.formato === "DINT" || c.formato === "REAL") && this.config.formato) this.config.formato = c.formato;
    if (n(c.autoIntervaloMs, 500, 60000)) this.global.autoIntervaloMs = c.autoIntervaloMs;
    if (typeof c.autoDisparo === "boolean") this.global.autoDisparo = c.autoDisparo;

    clearInterval(this._timerAuto);
    if (this.global.autoDisparo) {
      this._timerAuto = setInterval(() => {
        if (this.modo === "execucao") this.disparar("automático");
      }, this.global.autoIntervaloMs);
    }
    this.emit("mudou");
  }

  destruir() {
    clearTimeout(this._timerInspecao);
    clearTimeout(this._timerCarga);
    clearInterval(this._timerAuto);
    this.removeAllListeners();
  }

  zerarContagem() {
    this.s.totalCount = 0;
    this.s.contNg = 0;
    this._escreverStatus();
    this.emit("mudou");
  }

  // -------------------------------------------------------------------
  // Bits de status no assembly 100
  // -------------------------------------------------------------------
  _escreverStatus() {
    const s = this.s;
    const e = this.entrada;
    e[0] = (s.cmdComplete ? 0x01 : 0) | (s.cmdError ? 0x02 : 0) | (s.cmdReady && !s.carregando ? 0x04 : 0) |
      (s.resultReady ? 0x08 : 0) | (s.resultOR ? 0x10 : 0);
    e[1] = s.run && s.ready1 && !s.carregando ? 0x01 : 0;
    e[2] = s.ack1 ? 0x01 : 0;
    e[3] = (s.busy || s.carregando ? 0x01 : 0) | (s.erro ? 0x02 : 0) | (s.run ? 0x08 : 0);
    e.fill(0, 4, 12);
    s.bitsSaida.copy(e, 4);
    e.writeUInt16LE(s.codigoErro, 12);
    e.writeUInt32LE(s.totalCount, 16);
    e.writeUInt32LE(s.cmdResult, 20);
  }

  bytesNecessarios() {
    const m = this.def.mapa(this.config);
    return m[m.length - 1].byteFinal + 1;
  }

  estado() {
    const def = this.def;
    return {
      tipo: this.prog.tipo,
      descricaoTipo: def.descricao,
      programa: { numero: this.prog.numero, nome: this.prog.nome },
      programas: [...this.programas.values()]
        .sort((a, b) => a.numero - b.numero)
        .map((p) => ({ numero: p.numero, nome: p.nome, tipo: p.tipo, descricao: TIPOS[p.tipo].descricao })),
      tipos: Object.values(TIPOS).map((t) => ({ tipo: t.tipo, descricao: t.descricao })),
      ferramentas: def.ferramentas,
      cenarios: Object.entries(def.cenarios).map(([id, c]) => ({ id, rotulo: c.rotulo })),
      nomesFalha: def.nomesFalha,
      peca: this.peca,
      falhas: this.falhasAtuais,
      bitsSaida: [...this.s.bitsSaida],
      modo: this.modo,
      historico: this.historico,
      config: { ...this.config, ...this.global },
      sinais: { ...this.s, bitsSaida: undefined },
      clp: this.clp,
      ultimaLeitura: this.ultimaLeitura,
      mapa: def.mapa(this.config),
      bytesNecessarios: this.bytesNecessarios(),
    };
  }
}

module.exports = { SimuladorCVX, TAMANHO_ASSEMBLY };
