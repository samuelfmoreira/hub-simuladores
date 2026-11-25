'use strict';
/**
 * Sessões independentes: cada aluno (ou bancada) tem o seu tanque, o seu transmissor e a sua conexão com o seu CLP.
 * Um aluno não enxerga nem atrapalha o outro. Duas sessões nunca conectam no mesmo IP:porta.
 *
 * Troca com o CLP com varredura controlada (por sessão):
 *   escrita   FC16 LT01_Bruto, só quando muda mais que a banda morta   no máximo a cada 200 ms   prioridade 1
 *   sincronismo   FC16 LT01_Bruto   a cada 1 s   prioridade 2
 *   leitura   FC02 (5 sinaleiros) + FC04 (Nivel_Pct)   a cada 250 ms   prioridade 1   SÓ com o retorno do CLP ligado
 * O retorno do CLP (sinaleiros e IHM do painel) é opcional por sessão. Desligado, o simulador só envia o nível:
 * no máximo ~6 requisições por segundo. Ligado, no máximo ~14. Sempre uma de cada vez, com 10 ms entre frames.
 * Se o CLP demora (tempo médio de resposta > 200 ms), os períodos triplicam até ele se recuperar (< 120 ms).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Nucleo } = require('./nucleo');
const TG = require('./tags');
const { ClienteModbus } = require('./modbus/cliente');
const { criarClpDemo } = require('./modbus/clp-demo');

const REDE = { leituraMs: 250, escritaMs: 200, sincMs: 1000, fatorLento: 3, rtLento: 200, rtNormal: 120, reconexaoMs: 5000 };
const ALVO_PADRAO = { host: '192.168.100.10', port: 502, unitId: 1 };     // IP pré-definido pedido pelo Samuel (o aluno troca na aba CLP)
const MAX_SESSOES = 60;
const LAYOUT = 'v2';                // v2 (1.1.0): IP pré-definido novo; sessões da v1 com o IP antigo de fábrica são migradas uma vez
const DIAS_GUARDADA = 7;
const DISCRETOS = TG.doClp.filter((t) => t.mb.t === 'discrete');
const BANDA = TG.porNome.LT01_Bruto.deadband;

const hora = () => new Date().toLocaleTimeString('pt-BR');
function limparNome(n) { return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 28); }
function validarAlvo(a) {
  const host = String((a && a.host) || '').trim(), port = Number(a && a.port), unitId = Number(a && a.unitId);
  if (!/^[A-Za-z0-9.\-]{1,64}$/.test(host)) throw new Error('IP do CLP inválido (exemplo: 192.168.100.10)');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('porta inválida (o padrão do Modbus TCP é 502)');
  if (!Number.isInteger(unitId) || unitId < 0 || unitId > 255) throw new Error('Unit ID inválido (0 a 255; o padrão é 1)');
  return { host, port, unitId };
}
function traduzir(e, alvo) {
  const m = String((e && e.message) || e);
  if (/ECONNREFUSED/.test(m)) return `o PC ${alvo.host} recusou a conexão na porta ${alvo.port}: o CLP está em RUN e com o Modbus TCP Slave Device configurado?`;
  if (/EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|sem resposta/.test(m)) return `sem resposta de ${alvo.host}:${alvo.port}: confira o IP do CLP, o cabo ou a rede e o firewall do Windows`;
  if (/ENOTFOUND/.test(m)) return `endereço ${alvo.host} não encontrado`;
  if (/exceção Modbus 2/.test(m)) return 'o CLP respondeu, mas não tem esse endereço: confira as áreas do Modbus TCP Slave Device (1 holding register; com o retorno do CLP ligado, também 1 input register e 8 discrete inputs)';
  if (/exceção Modbus 1/.test(m)) return 'o CLP respondeu, mas não aceita a função pedida: habilite as áreas de bits (Discrete Bit Areas) no Modbus TCP Slave Device';
  return m;
}

class Sessao {
  constructor(gerente, { id, nome, alvo, par, ultimoUso, retorno }) {
    this.g = gerente; this.id = id; this.nome = nome;
    this.alvo = Object.assign({}, ALVO_PADRAO, alvo);       // o CLP do aluno (fica gravado)
    this.conexao = null;                                     // onde está conectado agora (o CLP do aluno ou o de demonstração)
    this.retorno = !!retorno;                                // true = lê do CLP os sinaleiros e o valor da IHM do painel
    this.mensagens = [];
    this.nucleo = new Nucleo({ salvos: par, aoGravar: () => gerente.gravar(), log: (m) => this.log(m) });
    this.cli = null; this.demo = null;
    this.rede = { desejado: false, conectado: false, tentando: false, erro: '', aviso: '', endpoint: '', demo: false, lento: false, reconexoes: 0 };
    this.t = { leitura: 0, escrita: 0, sinc: 0, tentativa: 0 };
    this.enviado = null;
    this.telas = 0; this.ultimoUso = ultimoUso || Date.now();
  }
  log(msg) { this.mensagens.push({ h: hora(), msg }); if (this.mensagens.length > 30) this.mensagens.shift(); this.g.log(`[${this.nome}] ${msg}`); }
  tocar() { this.ultimoUso = Date.now(); }
  get ativa() { return this.telas > 0 || this.rede.desejado || Date.now() - this.ultimoUso < 5 * 60000; }

  // ---------------------------------------------------------------- conexão
  async conectar(alvo) {
    const a = validarAlvo(alvo || this.alvo);
    const outra = this.g.quemUsa(a, this);
    if (outra) throw new Error(`a sessão "${outra.nome}" já está conectada em ${a.host}:${a.port}. Cada aluno usa o IP do seu próprio CLP`);
    await this.desconectar(true);
    this.alvo = a; this.conexao = a; this.rede.desejado = true; this.rede.demo = false; this.rede.reconexoes = 0;
    this.g.gravar();
    await this._abrir();
    if (!this.rede.conectado) throw new Error(this.rede.erro || 'não foi possível conectar');
  }
  async ligarDemo() {
    await this.desconectar(true);
    this.demo = criarClpDemo({ port: 1502 });
    const u = await this.demo.iniciar();
    this.conexao = { host: u.host, port: u.port, unitId: 1 }; this.rede.desejado = true; this.rede.demo = true; this.rede.reconexoes = 0;
    if (!this.retorno) { this.retorno = true; this.g.gravar(); }      // a demonstração existe para ver os sinaleiros e a IHM
    this.log(`CLP de demonstração ligado em ${u.host}:${u.port}`);
    await this._abrir();
    if (!this.rede.conectado) throw new Error(this.rede.erro || 'não foi possível ligar o CLP de demonstração');
  }
  async desconectar(silencioso) {
    const estava = this.rede.desejado;
    this.rede.desejado = false; this.rede.demo = false; this.rede.erro = ''; this.rede.aviso = '';
    if (this.cli) { const c = this.cli; this.cli = null; c.fechar(); }
    this.rede.conectado = false; this.rede.lento = false; this.rede.endpoint = '';
    this.nucleo.redeCaiu();
    if (this.demo) { const d = this.demo; this.demo = null; await d.parar(); }
    if (estava && !silencioso) this.log('desconectado do CLP');
  }
  async _abrir() {
    if (this.rede.tentando || !this.conexao) return;
    const alvo = this.conexao;
    this.rede.tentando = true; this.t.tentativa = Date.now();
    const cli = new ClienteModbus({ host: alvo.host, port: alvo.port, unitId: alvo.unitId });
    this.cli = cli;
    cli.on('erro', (e) => { if (this.cli === cli) this.rede.erro = traduzir(e, alvo); });
    cli.on('fechou', (estava) => {
      if (this.cli !== cli) return;
      this.cli = null; this.rede.conectado = false; this.rede.lento = false; this.rede.aviso = '';
      this.nucleo.redeCaiu();
      if (estava) this.log(`conexão com o CLP encerrada${this.rede.desejado ? ': nova tentativa a cada 5 s' : ''}`);
    });
    try {
      await cli.conectar();
      await cli.pedir({ key: 'teste', priority: 0, fc: 16, retries: 0, address: TG.porNome.LT01_Bruto.mb.a, getValues: () => [this.nucleo.m.bruto] });   // a primeira escrita prova que o holding 0 existe
      if (this.cli !== cli) return;
      this.rede.conectado = true; this.rede.erro = ''; this.rede.endpoint = `${alvo.host}:${alvo.port} · Unit ID ${alvo.unitId}`;
      this.enviado = null; this.t.leitura = this.t.escrita = this.t.sinc = 0; this.rede.aviso = '';
      this.log(`conectado ao CLP em ${alvo.host}:${alvo.port}`);
    } catch (e) {
      if (this.cli === cli) { this.rede.erro = traduzir(e, alvo); this.cli = null; }
      cli.fechar();
    } finally { this.rede.tentando = false; }
  }

  // ---------------------------------------------------------------- varredura controlada (chamada a cada 50 ms)
  tick(agora) {
    const cli = this.cli;
    if (!cli || !this.rede.conectado) {
      if (this.rede.desejado && !this.rede.tentando && agora - this.t.tentativa >= REDE.reconexaoMs) { this.rede.reconexoes++; this._abrir(); }
      return;
    }
    const rt = cli.est.rtMedio;
    if (!this.rede.lento && rt > REDE.rtLento) { this.rede.lento = true; this.log(`o CLP está demorando (${Math.round(rt)} ms): varredura reduzida para não sobrecarregar`); }
    else if (this.rede.lento && rt < REDE.rtNormal) { this.rede.lento = false; this.log('o CLP voltou a responder rápido: varredura normal'); }
    const k = this.rede.lento ? REDE.fatorLento : 1;

    // retorno do CLP (opcional): sinaleiros e valor da IHM. Desligado, nada é lido do CLP.
    if (!this.retorno) { if (this.nucleo.clp) this.nucleo.semRetorno(); this.rede.aviso = ''; }
    else if (agora - this.t.leitura >= REDE.leituraMs * k) {
      this.t.leitura = agora;
      const falhou = (e) => { if (this.cli === cli && /exceção/.test(e.message)) this.rede.aviso = traduzir(e, this.conexao); };
      cli.pedir({ key: 'ler-sd', priority: 1, fc: 2, address: 0, quantity: TG.nDiscretos }).then((bits) => {
        if (this.cli !== cli || !this.retorno) return;
        const v = {}; for (const t of DISCRETOS) v[t.nome] = bits[t.mb.a];
        this.nucleo.aplicarSaidasDoClp(v);
      }).catch(falhou);
      cli.pedir({ key: 'ler-sa', priority: 1, fc: 4, address: 0, quantity: TG.nInputs }).then((regs) => {
        if (this.cli !== cli || !this.retorno) return;
        this.nucleo.aplicarSaidasDoClp({ Nivel_Pct: regs[TG.porNome.Nivel_Pct.mb.a] / TG.porNome.Nivel_Pct.mb.escala });
        this.rede.aviso = '';
      }).catch(falhou);
    }

    const bruto = this.nucleo.m.bruto;
    if (agora - this.t.escrita >= REDE.escritaMs * k && (this.enviado === null || Math.abs(bruto - this.enviado) >= BANDA)) {
      this.t.escrita = agora;
      cli.pedir({ key: 'esc-ea', priority: 1, fc: 16, address: TG.porNome.LT01_Bruto.mb.a, getValues: () => [this.nucleo.m.bruto] })
        .then((v) => { if (this.cli === cli) this.enviado = v[0]; }).catch(() => {});
    }
    if (agora - this.t.sinc >= REDE.sincMs * (k > 1 ? 2.5 : 1)) {
      this.t.sinc = agora;
      cli.pedir({ key: 'sinc', priority: 2, fc: 16, address: TG.porNome.LT01_Bruto.mb.a, getValues: () => [this.nucleo.m.bruto] })
        .then((v) => { if (this.cli === cli) this.enviado = v[0]; }).catch(() => {});
    }
  }

  estadoRede() {
    const c = this.cli, e = c ? c.est : null, k = this.rede.lento ? REDE.fatorLento : 1;
    return Object.assign({}, this.rede, {
      alvo: this.alvo, retorno: this.retorno,
      periodos: { leitura: this.retorno ? REDE.leituraMs * k : 0, escrita: REDE.escritaMs * k, sinc: REDE.sincMs * (k > 1 ? 2.5 : 1) },
      est: e ? { enviadas: e.enviadas, ok: e.ok, timeouts: e.timeouts, excecoes: e.excecoes, erros: e.erros, retentativas: e.retentativas, porPrioridade: e.porPrioridade,
        taxa: Math.round(c.taxa() * 10) / 10, rtUltimo: e.rtUltimo, rtMedio: Math.round(e.rtMedio * 10) / 10, rtMax: e.rtMax, fila: c.fila.countByPriority(), descartadas: c.fila.dropped } : null,
      enviado: this.enviado,
    });
  }
  retrato() { return Object.assign(this.nucleo.retrato(), { id: this.id, nome: this.nome, rede: this.estadoRede(), mensagens: this.mensagens.slice(-12) }); }

  async comando(c) {
    this.tocar();
    try {
      if (c.tipo === 'conectar') { await this.conectar({ host: c.host, port: Number(c.port), unitId: Number(c.unitId) }); return { ok: true }; }
      if (c.tipo === 'desconectar') { await this.desconectar(); return { ok: true }; }
      if (c.tipo === 'demo') { if (c.ligado) await this.ligarDemo(); else await this.desconectar(); return { ok: true }; }
      if (c.tipo === 'retorno') { this.retorno = !!c.ligado; this.t.leitura = 0; this.g.gravar(); this.log(this.retorno ? 'retorno do CLP ligado: sinaleiros no painel e IHM com o valor calculado pelo CLP' : 'retorno do CLP desligado: o simulador só envia o LT01_Bruto; a IHM mostra o valor enviado'); return { ok: true }; }
      if (c.tipo === 'renomear') { const n = limparNome(c.nome); if (!n) return { ok: false, erro: 'digite um nome' }; this.nome = this.g.nomeLivre(n, this); this.g.gravar(); return { ok: true, nome: this.nome }; }
    } catch (e) { return { ok: false, erro: e.message }; }
    return this.nucleo.comando(c);
  }
  paraGravar() { return { id: this.id, nome: this.nome, alvo: this.alvo, retorno: this.retorno, par: this.nucleo.paraGravar(), ultimoUso: this.ultimoUso }; }
}

class Gerente {
  constructor({ pastaDados, log = () => {} }) {
    this.pasta = pastaDados; this.arquivo = path.join(pastaDados, 'sessoes.json'); this.log = log;
    this.sessoes = new Map(); this.timerGravar = null;
    this.carregar();
  }
  carregar() {
    try {
      const d = JSON.parse(fs.readFileSync(this.arquivo, 'utf8'));
      if (d.__layout !== LAYOUT && d.__layout !== 'v1') { this.log('sessões gravadas por uma versão antiga foram descartadas'); return; }
      const limite = Date.now() - DIAS_GUARDADA * 86400000;
      for (const s of d.sessoes || []) {
        if (!(s && s.id && s.nome && (s.ultimoUso || 0) > limite)) continue;
        if (d.__layout === 'v1' && s.alvo && s.alvo.host === '192.168.100.10') delete s.alvo;      // era só o valor de fábrica antigo
        this.sessoes.set(s.id, new Sessao(this, s));
      }
    } catch (_) { /* primeira vez: sem arquivo */ }
  }
  gravar() {
    clearTimeout(this.timerGravar);
    this.timerGravar = setTimeout(() => this.gravarAgora(), 500);
  }
  gravarAgora() {
    clearTimeout(this.timerGravar);
    try {
      fs.mkdirSync(this.pasta, { recursive: true });          // recria a pasta depois de "Restaurar original"
      fs.writeFileSync(this.arquivo, JSON.stringify({ __layout: LAYOUT, sessoes: [...this.sessoes.values()].map((s) => s.paraGravar()) }, null, 1));
    } catch (e) { this.log(`não consegui gravar as sessões: ${e.message}`); }
  }
  nomeLivre(nome, exceto) {
    const usados = new Set([...this.sessoes.values()].filter((s) => s !== exceto).map((s) => s.nome.toLowerCase()));
    if (!usados.has(nome.toLowerCase())) return nome;
    for (let i = 2; i < 99; i++) if (!usados.has(`${nome} ${i}`.toLowerCase())) return `${nome} ${i}`;
    return nome;
  }
  criar(nome) {
    if (this.sessoes.size >= MAX_SESSOES) throw new Error(`limite de ${MAX_SESSOES} sessões: exclua as que não estão em uso`);
    let n = limparNome(nome); if (!n) n = `Bancada ${this.sessoes.size + 1}`;
    let id; do { id = crypto.randomBytes(3).toString('hex'); } while (this.sessoes.has(id));
    const s = new Sessao(this, { id, nome: this.nomeLivre(n) });
    this.sessoes.set(id, s); this.log(`sessão criada: ${s.nome} (${id})`); this.gravar();
    return s;
  }
  obter(id) { return this.sessoes.get(String(id || '')) || null; }
  async excluir(id) { const s = this.obter(id); if (!s) return false; await s.desconectar(true); this.sessoes.delete(s.id); this.log(`sessão excluída: ${s.nome}`); this.gravar(); return true; }
  quemUsa(alvo, exceto) {
    for (const s of this.sessoes.values()) if (s !== exceto && s.rede.desejado && s.conexao && s.conexao.host === alvo.host && s.conexao.port === alvo.port) return s;
    return null;
  }
  lista() { return [...this.sessoes.values()].map((s) => ({ id: s.id, nome: s.nome, telas: s.telas, conectado: s.rede.conectado, demo: s.rede.demo, clp: s.rede.conectado ? s.rede.endpoint : '' })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })); }
  passo(dt, passoFixo) { for (const s of this.sessoes.values()) if (s.ativa) for (let t = 0; t < dt; t += passoFixo) s.nucleo.passo(passoFixo); }
  tick(agora) { for (const s of this.sessoes.values()) s.tick(agora); }
  async encerrar() { for (const s of this.sessoes.values()) await s.desconectar(true); this.gravarAgora(); }
}

module.exports = { Gerente, Sessao, REDE, ALVO_PADRAO, MAX_SESSOES };
