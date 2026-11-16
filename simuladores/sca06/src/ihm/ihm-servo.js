/**
 * =====================================================================
 *  IHM VIRTUAL DO PAINEL DO SERVO SV-01 — Cliente Modbus TCP
 * =====================================================================
 *  Arquitetura da aula (igual à IHM do CFW500):
 *
 *    IHM (este simulador)  ──Modbus TCP──►  CLP (servidor Modbus)
 *                                            │
 *                                            └──EtherNet/IP──►  SCA06
 *
 *  A IHM não fala com o servo: ela só lê/escreve tags no CLP. O programa
 *  do CLP (PRG_IHM_Servo, no guia) escolhe o modo e comanda o SCA06 pela
 *  Função Posicionador (P0202 = 3): velocidade, torque, posição absoluta
 *  e posição relativa (pulso), sem reconfigurar o drive.
 *
 *  Cada elemento da tela da IHM está ligado a uma tag configurável:
 *  área Modbus, endereço, tipo de dado, escala e limites.
 * =====================================================================
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { ClienteModbus } = require('../modbus/client');

const ARQ = path.join(__dirname, '..', '..', 'data', 'ihm-servo.json');

// Áreas Modbus (nomenclatura do protocolo e a referência "Modicon" que muitos softwares mostram)
const AREAS = {
  coil: { nome: 'Coil', fcLer: 1, fcEsc: 5, bits: true, escrita: true, prefixo: 0 },
  di: { nome: 'Discrete Input', fcLer: 2, bits: true, escrita: false, prefixo: 1 },
  ir: { nome: 'Input Register', fcLer: 4, bits: false, escrita: false, prefixo: 3 },
  hr: { nome: 'Holding Register', fcLer: 3, fcEsc: 6, bits: false, escrita: true, prefixo: 4 },
};
// Tipos de dado (registradores). Em coil/discrete input o tipo é sempre BOOL.
const TIPOS = {
  BOOL: { palavras: 1, num: false },   // registrador inteiro: 0 = FALSO, ≠0 = VERDADEIRO
  BIT: { palavras: 1, num: false },    // um bit (0..15) dentro do registrador
  INT: { palavras: 1, num: true, min: -32768, max: 32767 },
  UINT: { palavras: 1, num: true, min: 0, max: 65535 },
  DINT: { palavras: 2, num: true, min: -2147483648, max: 2147483647 },
  UDINT: { palavras: 2, num: true, min: 0, max: 4294967295 },
  REAL: { palavras: 2, num: true, real: true },
};

// Papel de cada tag na tela da IHM (fixo); o resto é configurável pelo aluno.
const PAPEIS = [
  { id: 'habilita', desc: 'Botão Habilitar geral', dir: 'esc', num: false, modos: ['alternar', 'pulso'] },
  { id: 'partir', desc: 'Botão Partir/Parar (velocidade e torque)', dir: 'esc', num: false, modos: ['alternar', 'pulso'] },
  { id: 'disparo', desc: 'Botão Ir / Pulso (posição)', dir: 'esc', num: false, modos: ['pulso'] },
  { id: 'stop', desc: 'Botão STOP', dir: 'esc', num: false, modos: ['pulso'] },
  { id: 'reset', desc: 'Botão Reset de falha', dir: 'esc', num: false, modos: ['pulso'] },
  { id: 'modo', desc: 'Modo de controle (1 velocidade, 2 torque, 3 absoluta, 4 relativa)', dir: 'esc', num: true },
  { id: 'velRef', desc: 'Referência de velocidade', dir: 'esc', num: true },
  { id: 'torqueRef', desc: 'Referência de corrente (torque)', dir: 'esc', num: true },
  { id: 'destino', desc: 'Destino da posição absoluta', dir: 'esc', num: true },
  { id: 'passo', desc: 'Passo da posição relativa (pulso)', dir: 'esc', num: true },
  { id: 'velPos', desc: 'Velocidade de posicionamento', dir: 'esc', num: true },
  { id: 'habilitado', desc: 'Sinal: servo habilitado', dir: 'ler', num: false },
  { id: 'movendo', desc: 'Sinal: motor girando', dir: 'ler', num: false },
  { id: 'emPosicao', desc: 'Sinal: em posição', dir: 'ler', num: false },
  { id: 'falha', desc: 'Sinal: servo em falha', dir: 'ler', num: false },
  { id: 'pronto', desc: 'Sinal: pronto para novo comando', dir: 'ler', num: false },
  { id: 'velAtual', desc: 'Display velocidade atual', dir: 'ler', num: true },
  { id: 'corrente', desc: 'Display corrente do motor', dir: 'ler', num: true },
  { id: 'posicao', desc: 'Display posição atual', dir: 'ler', num: true },
  { id: 'passos', desc: 'Display passos concluídos', dir: 'ler', num: true },
  { id: 'modoAtual', desc: 'Display modo ativo no CLP', dir: 'ler', num: true },
];

// Mapa padrão: botões em COILS, sinais em DISCRETE INPUTS, números em registradores (INT, 1 registrador cada).
// No "ModbusTCP Slave Device" do CODESYS ative as áreas de bit (Coils / Discrete Inputs).
//   Coils e Holding Registers  -> a IHM escreve, o CLP lê (%IX / %IW)
//   Discrete Inputs e Input Registers -> o CLP escreve, a IHM lê (%QX / %QW)
const R = (nome, area, end, extra = {}) => Object.assign({ nome, area, end, tipo: area === 'coil' || area === 'di' ? 'BOOL' : 'INT', bit: 0, ativo: true }, extra);
const PADRAO = {
  ip: '192.168.100.10', porta: 502, unitId: 1, varredura: 100, timeout: 1000, ordem32: 'baixaPrimeiro', ativo: false,
  titulo: 'SERVO SV-01',
  tags: {
    habilita: R('CMD_HABILITA', 'coil', 0, { modo: 'alternar', pulsoMs: 300 }),
    partir: R('CMD_PARTIR', 'coil', 1, { modo: 'alternar', pulsoMs: 300 }),
    disparo: R('CMD_DISPARO', 'coil', 2, { modo: 'pulso', pulsoMs: 300 }),
    stop: R('CMD_STOP', 'coil', 3, { modo: 'pulso', pulsoMs: 300 }),
    reset: R('CMD_RESET', 'coil', 4, { modo: 'pulso', pulsoMs: 500 }),
    modo: R('SP_MODO', 'hr', 0, { fator: 1, offset: 0, dec: 0, un: '', min: 1, max: 4 }),
    velRef: R('SP_VELOCIDADE', 'hr', 1, { fator: 1, offset: 0, dec: 0, un: 'rpm', min: -3000, max: 3000 }),
    torqueRef: R('SP_CORRENTE', 'hr', 2, { fator: 0.1, offset: 0, dec: 1, un: 'A', min: -3, max: 3 }),
    destino: R('SP_DESTINO', 'hr', 3, { fator: 0.1, offset: 0, dec: 1, un: '°', min: 0, max: 359.9 }),
    passo: R('SP_PASSO', 'hr', 4, { fator: 0.1, offset: 0, dec: 1, un: '°', min: 0.1, max: 359.9 }),
    velPos: R('SP_VEL_POS', 'hr', 5, { fator: 1, offset: 0, dec: 0, un: 'rpm', min: 1, max: 3000 }),
    habilitado: R('ST_HABILITADO', 'di', 0),
    movendo: R('ST_MOVENDO', 'di', 1),
    emPosicao: R('ST_EM_POSICAO', 'di', 2),
    falha: R('ST_FALHA', 'di', 3),
    pronto: R('ST_PRONTO', 'di', 4),
    velAtual: R('VEL_ATUAL', 'ir', 0, { fator: 1, offset: 0, dec: 0, un: 'rpm', min: -3000, max: 3000 }),
    corrente: R('CORRENTE', 'ir', 1, { fator: 0.1, offset: 0, dec: 1, un: 'A', min: -10, max: 10 }),
    posicao: R('POSICAO', 'ir', 2, { fator: 0.1, offset: 0, dec: 1, un: '°', min: 0, max: 360 }),
    passos: R('PASSOS', 'ir', 3, { tipo: 'UINT', fator: 1, offset: 0, dec: 0, un: '', min: 0, max: 65535 }),
    modoAtual: R('MODO_ATUAL', 'ir', 4, { fator: 1, offset: 0, dec: 0, un: '', min: 0, max: 4 }),
  },
};

const num = (v, d, a = -Infinity, b = Infinity) => { const x = Number(v); return Number.isFinite(x) ? Math.min(b, Math.max(a, x)) : d; };
const clone = (o) => JSON.parse(JSON.stringify(o));

/** Saneia uma configuração vinda da interface (ou do arquivo) */
function sanear(c) {
  const o = clone(PADRAO);
  if (!c || typeof c !== 'object') return o;
  o.ip = String(c.ip ?? o.ip).trim().slice(0, 64) || o.ip;
  o.porta = Math.round(num(c.porta, o.porta, 1, 65535));
  o.unitId = Math.round(num(c.unitId, o.unitId, 0, 255));
  o.varredura = Math.round(num(c.varredura, o.varredura, 20, 5000));
  o.timeout = Math.round(num(c.timeout, o.timeout, 100, 10000));
  o.ordem32 = c.ordem32 === 'altaPrimeiro' ? 'altaPrimeiro' : 'baixaPrimeiro';
  o.ativo = !!c.ativo;
  o.titulo = String(c.titulo ?? o.titulo).slice(0, 24) || o.titulo;
  for (const p of PAPEIS) {
    const t = o.tags[p.id]; const e = (c.tags || {})[p.id];
    if (!e) continue;
    t.nome = String(e.nome ?? t.nome).replace(/[^\w.]/g, '_').slice(0, 32) || t.nome;
    let area = AREAS[e.area] ? e.area : t.area;
    if (p.dir === 'esc' && !AREAS[area].escrita) area = AREAS[t.area].escrita ? t.area : 'hr';
    if (p.num && AREAS[area].bits) area = p.dir === 'esc' ? 'hr' : 'ir';
    t.area = area;
    t.end = Math.round(num(e.end, t.end, 0, 65535));
    let tipo = TIPOS[e.tipo] ? e.tipo : t.tipo;
    if (AREAS[area].bits) tipo = 'BOOL';
    else if (p.num && !TIPOS[tipo].num) tipo = 'INT';
    else if (!p.num && TIPOS[tipo].num) tipo = 'BOOL';
    t.tipo = tipo;
    t.bit = Math.round(num(e.bit, 0, 0, 15));
    t.ativo = e.ativo !== false;
    if (p.num) {
      t.fator = num(e.fator, t.fator ?? 1); if (t.fator === 0) t.fator = 1;
      t.offset = num(e.offset, t.offset ?? 0);
      t.dec = Math.round(num(e.dec, t.dec ?? 0, 0, 4));
      t.un = String(e.un ?? t.un ?? '').slice(0, 8);
      t.min = num(e.min, t.min ?? 0); t.max = num(e.max, t.max ?? 100);
      if (t.max <= t.min) t.max = t.min + 1;
    }
    if (p.modos) {
      t.modo = p.modos.includes(e.modo) ? e.modo : p.modos[0];
      t.pulsoMs = Math.round(num(e.pulsoMs, t.pulsoMs ?? 300, 50, 5000));
    }
  }
  return o;
}

/** Referência "Modicon" (ex.: HR 0 -> 40001) só para ajudar a conferir no CLP */
const modicon = (area, end) => `${AREAS[area].prefixo}${String(end + 1).padStart(5, '0')}`;

class IHMServo extends EventEmitter {
  constructor() {
    super();
    this.cfg = this.carregar();
    this.valores = {};       // id -> { v, raw, ok, erro }
    this.cli = null;
    this.status = 'parado';  // parado | conectando | online | erro
    this.erro = '';
    this.tUltimaVarredura = 0;
    this.varrendo = false;
    this.quadros = [];
    this.ciclos = 0;
    this.dividir = {};       // área -> true quando a leitura em bloco deu "endereço ilegal"
    this.ultimoEscrito = {};
    this.pulsos = new Map();
    if (this.cfg.ativo) setTimeout(() => this.iniciar(), 500);
  }

  carregar() {
    try { return sanear(JSON.parse(fs.readFileSync(ARQ, 'utf8'))); } catch { return clone(PADRAO); }
  }

  salvar() {
    try { fs.mkdirSync(path.dirname(ARQ), { recursive: true }); fs.writeFileSync(ARQ, JSON.stringify(this.cfg, null, 2)); } catch { /* */ }
  }

  configurar(c) {
    const ativo = this.cfg.ativo;
    this.cfg = sanear({ ...c, ativo });
    this.salvar();
    this.valores = {}; this.dividir = {};
    this.emit('log', `IHM: configuração salva (${this.cfg.ip}:${this.cfg.porta}, Unit ID ${this.cfg.unitId}, varredura ${this.cfg.varredura} ms)`);
    if (this.cli) { this.parar(true); this.iniciar(); }
  }

  padrao() { this.configurar({ ...clone(PADRAO) }); }

  // ------------------------------------------------------------------
  iniciar() {
    this.parar(true);
    this.cfg.ativo = true; this.salvar();
    const c = this.cfg;
    this.cli = new ClienteModbus({ host: c.ip, porta: c.porta, unitId: c.unitId, timeout: c.timeout });
    this.status = 'conectando'; this.erro = '';
    this.cli.on('conectado', () => {
      this.status = 'online'; this.erro = '';
      this.emit('log', `IHM: conectada ao servidor Modbus ${c.ip}:${c.porta}`);
    });
    this.cli.on('desconectado', () => {
      this.status = 'erro'; this.erro = 'conexão TCP encerrada pelo servidor';
      this.emit('log', `IHM: conexão com ${c.ip}:${c.porta} encerrada`);
    });
    this.cli.on('erroConexao', (m) => {
      if (this.erro !== m) this.emit('log', `IHM: ${m}`);
      this.status = 'erro'; this.erro = m;
    });
    this.cli.on('quadro', (q) => { q.t = Date.now(); this.quadros.push(q); if (this.quadros.length > 400) this.quadros.splice(0, 100); });
    this.cli.conectar();
    this.tmr = setInterval(() => this.ciclo(), c.varredura);
    this.tmrRecon = setInterval(() => { if (this.cli && !this.cli.conectado && !this.cli.conectando) { this.status = this.erro ? 'erro' : 'conectando'; this.cli.conectar(); } }, 2000);
  }

  parar(interno) {
    clearInterval(this.tmr); clearInterval(this.tmrRecon);
    for (const t of this.pulsos.values()) clearTimeout(t);
    this.pulsos.clear();
    if (this.cli) { this.cli.removeAllListeners(); this.cli.fechar(); this.cli = null; }
    this.status = 'parado'; this.erro = '';
    this.valores = {};
    if (!interno) { this.cfg.ativo = false; this.salvar(); this.emit('log', 'IHM: comunicação Modbus parada'); }
  }

  // ------------------------------------------------------------------
  //  Varredura: lê em blocos contíguos por área (como uma IHM real)
  // ------------------------------------------------------------------
  blocos() {
    const porArea = {};
    for (const p of PAPEIS) {
      const t = this.cfg.tags[p.id];
      if (!t.ativo) continue;
      const w = AREAS[t.area].bits ? 1 : TIPOS[t.tipo].palavras;
      (porArea[t.area] ||= []).push({ id: p.id, ini: t.end, fim: t.end + w - 1 });
    }
    const out = [];
    for (const [area, l] of Object.entries(porArea)) {
      l.sort((a, b) => a.ini - b.ini);
      const max = AREAS[area].bits ? 256 : 100;
      if (this.dividir[area]) {          // servidor recusou o bloco: lê tag a tag
        for (const x of l) out.push({ area, ini: x.ini, qt: x.fim - x.ini + 1, ids: [x.id] });
        continue;
      }
      let b = null;
      for (const x of l) {
        if (b && x.ini <= b.ini + b.qt + 8 && x.fim - b.ini + 1 <= max) { b.qt = Math.max(b.qt, x.fim - b.ini + 1); b.ids.push(x.id); } else {
          b = { area, ini: x.ini, qt: x.fim - x.ini + 1, ids: [x.id] }; out.push(b);
        }
      }
    }
    return out;
  }

  async ciclo() {
    if (!this.cli || !this.cli.conectado || this.varrendo) return;
    this.varrendo = true;
    let algumOk = false;
    try {
      for (const b of this.blocos()) {
        const A = AREAS[b.area];
        try {
          const dados = A.bits ? await this.cli.lerBits(A.fcLer, b.ini, b.qt) : await this.cli.lerRegs(A.fcLer, b.ini, b.qt);
          algumOk = true;
          for (const id of b.ids) {
            const t = this.cfg.tags[id];
            const raw = dados.slice(t.end - b.ini, t.end - b.ini + (A.bits ? 1 : TIPOS[t.tipo].palavras));
            this.valores[id] = { ...this.decodificar(t, raw), ok: true, erro: '' };
          }
        } catch (e) {
          if (e.tipo === 'excecao' && e.codigo === 2 && b.ids.length > 1 && !this.dividir[b.area]) {
            this.dividir[b.area] = true;
            this.emit('log', `IHM: o servidor recusou a leitura em bloco de ${A.nome}s (${b.ini}..${b.ini + b.qt - 1}); lendo tag a tag`);
          }
          for (const id of b.ids) this.valores[id] = { ...(this.valores[id] || {}), ok: false, erro: e.message };
          if (e.tipo === 'conexao') break;
          if (e.tipo === 'timeout') { this.status = 'erro'; this.erro = e.message; }
        }
      }
      if (algumOk) { this.tUltimaVarredura = Date.now(); this.ciclos++; if (this.cli?.conectado) { this.status = 'online'; this.erro = ''; } }
    } finally { this.varrendo = false; }
  }

  // ------------------------------------------------------------------
  //  Conversão de dados
  // ------------------------------------------------------------------
  palavras32(raw) { return this.cfg.ordem32 === 'baixaPrimeiro' ? [raw[1], raw[0]] : [raw[0], raw[1]]; } // -> [alta, baixa]

  decodificar(t, raw) {
    if (AREAS[t.area].bits) return { v: !!raw[0], raw: raw[0] ? 1 : 0 };
    const w = raw[0] ?? 0;
    let x;
    switch (t.tipo) {
      case 'BOOL': return { v: w !== 0, raw: w };
      case 'BIT': return { v: ((w >> t.bit) & 1) === 1, raw: w };
      case 'INT': x = w > 32767 ? w - 65536 : w; break;
      case 'UINT': x = w; break;
      default: {
        const [hi, lo] = this.palavras32(raw);
        const b = Buffer.alloc(4); b.writeUInt16BE(hi & 0xFFFF, 0); b.writeUInt16BE(lo & 0xFFFF, 2);
        x = t.tipo === 'DINT' ? b.readInt32BE(0) : t.tipo === 'UDINT' ? b.readUInt32BE(0) : b.readFloatBE(0);
      }
    }
    return { v: x * t.fator + t.offset, raw: x };
  }

  codificar(t, eng) {
    const T = TIPOS[t.tipo];
    let x = (eng - t.offset) / t.fator;
    if (!T.real) x = Math.round(x);
    if (T.min !== undefined) x = Math.min(T.max, Math.max(T.min, x));
    if (T.palavras === 1) return [x & 0xFFFF];
    const b = Buffer.alloc(4);
    if (t.tipo === 'REAL') b.writeFloatBE(x, 0); else if (t.tipo === 'DINT') b.writeInt32BE(x, 0); else b.writeUInt32BE(x >>> 0, 0);
    const hi = b.readUInt16BE(0); const lo = b.readUInt16BE(2);
    return this.cfg.ordem32 === 'baixaPrimeiro' ? [lo, hi] : [hi, lo];
  }

  async escreverBool(t, v) {
    const c = this.cli;
    if (t.area === 'coil') return c.escreverBit(t.end, v);
    if (t.tipo === 'BOOL') return c.escreverReg(t.end, v ? 1 : 0);
    // BIT dentro de registrador: lê, modifica e escreve (como fazem as IHMs)
    const [w] = await c.lerRegs(3, t.end, 1);
    return c.escreverReg(t.end, v ? (w | (1 << t.bit)) : (w & ~(1 << t.bit)));
  }

  // ------------------------------------------------------------------
  //  Comandos vindos da tela da IHM
  // ------------------------------------------------------------------
  async comando(id, valor) {
    const p = PAPEIS.find((x) => x.id === id);
    const t = this.cfg.tags[id];
    if (!p || p.dir !== 'esc' || !t) return { erro: 'tag inválida' };
    if (!t.ativo) return { erro: `tag ${t.nome} desabilitada` };
    if (!this.cli || !this.cli.conectado) return { erro: 'IHM sem comunicação com o CLP' };
    try {
      if (p.num) {
        const eng = Number(valor);
        if (!Number.isFinite(eng)) return { erro: 'valor inválido' };
        if (eng < t.min || eng > t.max) return { erro: `fora da faixa (${t.min} a ${t.max} ${t.un})` };
        const regs = this.codificar(t, eng);
        if (regs.length === 1) await this.cli.escreverReg(t.end, regs[0]); else await this.cli.escreverRegs(t.end, regs);
        this.valores[id] = { v: eng, raw: regs[0], ok: true, erro: '' };
        this.emit('log', `IHM: ${t.nome} ← ${eng.toFixed(t.dec)} ${t.un}`);
        return { ok: true };
      }
      if (t.modo === 'pulso') {
        await this.escreverBool(t, true);
        this.valores[id] = { v: true, ok: true, erro: '' };
        clearTimeout(this.pulsos.get(id));
        this.pulsos.set(id, setTimeout(() => {
          this.pulsos.delete(id);
          if (this.cli?.conectado) this.escreverBool(t, false).catch((e) => this.emit('log', `IHM: ${t.nome} (fim do pulso): ${e.message}`));
        }, t.pulsoMs));
        this.emit('log', `IHM: pulso em ${t.nome} (${t.pulsoMs} ms)`);
        return { ok: true };
      }
      // alternar: inverte o valor atual da própria tag (lido do CLP)
      const atual = this.valores[id]?.ok ? !!this.valores[id].v : !!this.ultimoEscrito[id];
      const novo = typeof valor === 'boolean' ? valor : !atual;
      await this.escreverBool(t, novo);
      this.ultimoEscrito[id] = novo;
      this.valores[id] = { v: novo, ok: true, erro: '' };
      this.emit('log', `IHM: ${t.nome} ← ${novo ? 'TRUE' : 'FALSE'}`);
      return { ok: true };
    } catch (e) {
      this.emit('log', `IHM: falha ao escrever ${t.nome}: ${e.message}`);
      return { erro: e.message };
    }
  }

  // ------------------------------------------------------------------
  estado() {
    const comOk = this.status === 'online' && Date.now() - this.tUltimaVarredura < Math.max(1500, this.cfg.timeout * 2 + this.cfg.varredura);
    return {
      status: this.status, comOk, erro: this.erro, ativo: !!this.cli, ciclos: this.ciclos,
      valores: this.valores, stats: this.cli ? this.cli.stats : null,
    };
  }

  info() {
    return { cfg: this.cfg, papeis: PAPEIS, areas: AREAS, tipos: Object.keys(TIPOS), padrao: PADRAO,
      modicon: Object.fromEntries(PAPEIS.map((p) => [p.id, modicon(this.cfg.tags[p.id].area, this.cfg.tags[p.id].end)])) };
  }

  pegarQuadros(desde) { return this.quadros.filter((q) => q.t > desde).slice(-80); }
}

module.exports = { IHMServo, PAPEIS, AREAS, TIPOS, PADRAO, sanear };
