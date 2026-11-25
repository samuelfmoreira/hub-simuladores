'use strict';
/**
 * Núcleo do simulador de sensor ultrassônico de nível (LT-01 no tanque TQ-01).
 * Dados técnicos: VEGASON 61, 4…20 mA/HART dois fios (folha 34584 e manual 28775).
 *
 * Regras do HUB:
 *  - determinístico: nada de Math.random() nem Date.now(); o tempo vem do passo(dt);
 *  - uma lista única de parâmetros (PARAMETROS) alimenta a tela, a gravação e o guia;
 *  - só o que o usuário mudou é gravado (paraGravar).
 *
 * O que é modelo didático (não vem do manual): a regra "primeiro eco acima do limiar", as amplitudes da
 * curva de eco e o tempo sem eco até a falha (TEMPO_SEM_ECO). O aparelho real mede a cada 2 s ou mais.
 */
const SENSOR = { zonaMorta: 0.25, feixe: 11, frequencia: 70000, faixa: 5, iMin: 3.8, iMax: 20.5 };
const GEO = { E: 3.0, nivelMax: 2.95, obsDist: 1.20, obsBorda: 0.07 };   // E: plano de referência do sensor até o fundo
const TEMPO_SEM_ECO = 4;      // s sem eco válido até declarar E013
const VAZAO = 0.10;           // m/s de variação de nível com Encher/Esvaziar
const FUNDO_AD = 32767;       // 15 bits: 0–32767 = 4–20 mA
const MODOS_FALHA = [
  { txt: '< 3,6 mA', mA: 3.55 },
  { txt: 'Manter valor', mA: null },
  { txt: '20,5 mA', mA: 20.5 },
  { txt: '22 mA', mA: 22 },
];

const PARAMETROS = [
  { id: 'calMin', nome: 'Calibração mín.', faz: 'Distância que corresponde a 0 % (4 mA)', min: 0.25, max: 5, padrao: 3.0, un: 'm', dec: 3 },
  { id: 'calMax', nome: 'Calibração máx.', faz: 'Distância que corresponde a 100 % (20 mA)', min: 0.25, max: 5, padrao: 0.5, un: 'm', dec: 3 },
  { id: 'atenuacao', nome: 'Atenuação', faz: 'Filtro da medição, em segundos', min: 0, max: 999, padrao: 0, un: 's', dec: 0 },
  { id: 'modoFalha', nome: 'Modo de falha', faz: 'Corrente de saída quando não há valor de medição', min: 0, max: 3, padrao: 0, un: '', dec: 0, opcoes: MODOS_FALHA.map((m) => m.txt) },
  { id: 'supressao', nome: 'Supressão de sinal falso', faz: 'Ignora os ecos fixos gravados (obstáculos do tanque)', min: 0, max: 1, padrao: 0, un: '', dec: 0, opcoes: ['Desligada', 'Ligada'] },
  { id: 'correcaoTemp', nome: 'Correção de temperatura', faz: 'Didático: no aparelho real é fixa, sempre ligada', min: 0, max: 1, padrao: 1, un: '', dec: 0, opcoes: ['Desligada', 'Ligada'] },
];
const MAPA = new Map(PARAMETROS.map((p) => [p.id, p]));

const PROCESSO = {      // campo: [mín, máx, inicial]
  nivel: [0, GEO.nivelMax, 1.0], vazao: [-1, 1, 0], temp: [-20, 80, 20], espuma: [0, 100, 0], obstaculo: [0, 1, 0], cabo: [0, 1, 0],
};

const lim = (v, a, b) => Math.min(b, Math.max(a, v));
const velocidadeSom = (T) => 331.3 + 0.606 * T;
const brutoDe = (mA) => Math.round(lim((mA - 4) / 16 * FUNDO_AD, -8192, FUNDO_AD));

class Nucleo {
  constructor({ salvos = {}, aoGravar = () => {}, log = () => {} } = {}) {
    this.aoGravar = aoGravar; this.log = log;
    this.p = {};
    for (const d of PARAMETROS) this.p[d.id] = d.padrao;
    for (const [k, v] of Object.entries(salvos || {})) if (MAPA.has(k)) this.p[k] = this.limitar(MAPA.get(k), v);
    this.proc = {};
    for (const [k, d] of Object.entries(PROCESSO)) this.proc[k] = d[2];
    this.m = { cReal: 343.42, cUsado: 343.42, ecos: [], sel: null, status: 'ok', erro: null, D: GEO.E - this.proc.nivel, semEco: 0, mA: 10.4, bruto: 13107, tof: 0, ecoFalso: false };
    this.t = 0; this.semente = 12345;
    this.clp = null;              // últimas variáveis recebidas do CLP (null = sem CLP)
    this.passo(0.002);
  }

  limitar(d, v) {
    v = Number(v); if (!Number.isFinite(v)) v = d.padrao;
    if (d.dec === 0) v = Math.round(v);
    return lim(v, d.min, d.max);
  }
  aleatorio() { this.semente = (this.semente * 16807) % 2147483647; return this.semente / 2147483647; }

  // limiar de detecção (dB) na distância x; com a supressão ligada ele sobe sobre o eco fixo gravado
  limiar(x) {
    const k = this.m.cUsado / this.m.cReal;
    let th = 34 - 3 * x;
    if (this.p.supressao) th += 36 * Math.exp(-(((x - GEO.obsDist * k) / 0.11) ** 2));
    return th;
  }

  // ---------------------------------------------------------------- física (passo fixo)
  passo(dt) {
    const pr = this.proc, m = this.m, p = this.p;
    this.t += dt;

    if (pr.vazao !== 0) {
      pr.nivel = lim(pr.nivel + pr.vazao * VAZAO * dt, 0, GEO.nivelMax);
      if (pr.nivel <= 0 || pr.nivel >= GEO.nivelMax) pr.vazao = 0;
    }
    m.cReal = velocidadeSom(pr.temp);
    m.cUsado = p.correcaoTemp ? m.cReal : velocidadeSom(20);
    const k = m.cUsado / m.cReal;             // o sensor converte tempo em distância com a velocidade em que acredita
    const dReal = GEO.E - pr.nivel;

    // dois fios: cabo rompido tira a alimentação do transmissor
    if (pr.cabo) {
      m.ecos = []; m.sel = null; m.status = 'desligado'; m.erro = null; m.semEco = 0; m.ecoFalso = false;
      m.mA = 0; m.bruto = brutoDe(0); m.tof = 0;
      return;
    }

    const ecos = [];
    const aN = Math.min(100, 92 - 20 * Math.log10(Math.max(dReal, 0.05) / 0.25)) - pr.espuma * 0.55 - (pr.vazao !== 0 ? 4 : 0);
    for (let n = 1; n <= 3; n++) {
      const x = n * dReal * k;
      if (x < 3.48) ecos.push({ x, a: aN - (n - 1) * 18 - 20 * Math.log10(n), tipo: n === 1 ? 'nivel' : 'multiplo', n, dReal: n * dReal });
    }
    m.ecoFalso = false;
    if (pr.obstaculo && dReal > GEO.obsDist + 0.04) {
      const dentro = lim((GEO.obsDist * Math.tan(SENSOR.feixe / 2 * Math.PI / 180) - GEO.obsBorda) / 0.06, 0, 1);
      if (dentro > 0) { ecos.push({ x: GEO.obsDist * k, a: 30 + 30 * dentro, tipo: 'falso', n: 1, dReal: GEO.obsDist }); m.ecoFalso = true; }
    }
    ecos.sort((a, b) => a.x - b.x);
    m.ecos = ecos;

    // regra simplificada: primeiro eco acima do limiar, fora da zona morta
    const sel = ecos.find((o) => o.x >= SENSOR.zonaMorta && o.a > this.limiar(o.x)) || null;
    m.sel = sel;
    const spanPequeno = Math.abs(p.calMin - p.calMax) < 0.01;
    if (sel) {
      if (m.erro === 'E013' || m.semEco > 0) m.D = sel.x;
      m.semEco = 0;
      const ruido = pr.vazao !== 0 ? (this.aleatorio() - 0.5) * 0.012 : 0;
      const tau = Math.max(0.25, p.atenuacao);
      m.D += (sel.x + ruido - m.D) * (1 - Math.exp(-dt / tau));
      m.tof = 2 * m.D / m.cUsado * 1000;
      m.status = sel.tipo === 'nivel' ? 'ok' : sel.tipo;      // 'ok' | 'falso' | 'multiplo'
      m.erro = null;
    } else {
      m.semEco += dt;
      if (m.semEco < TEMPO_SEM_ECO) { m.status = 'aguardando'; m.erro = null; } else { m.status = 'falha'; m.erro = 'E013'; }
    }
    if (spanPequeno) { m.status = 'falha'; m.erro = 'E017'; }

    if (m.status !== 'falha') {
      const pct = (p.calMin - m.D) / (p.calMin - p.calMax) * 100;
      m.mA = lim(4 + 16 * pct / 100, SENSOR.iMin, SENSOR.iMax);
    } else if (MODOS_FALHA[p.modoFalha].mA !== null) m.mA = MODOS_FALHA[p.modoFalha].mA;
    m.bruto = brutoDe(m.mA);
  }

  curvaDb(x) {
    const ruido = 12 + 1.6 * Math.sin(x * 47 + this.t * 13) + 1.2 * Math.sin(x * 113 - this.t * 7.3);
    const emissao = lim(100 - Math.max(0, x - 0.17) * 900, 0, 100);
    let pot = Math.pow(10, ruido / 10) + Math.pow(10, emissao / 10);
    for (const o of this.m.ecos) { const d = (x - o.x) / 0.04; pot += Math.pow(10, (o.a - 12 * d * d) / 10); }
    return Math.min(100, 10 * Math.log10(pot));
  }

  // grandezas derivadas, sempre calculadas do mesmo jeito (tela, testes e guia usam estas)
  nivelIndicado() { return GEO.E - this.m.D; }
  pctIndicado() { return (this.p.calMin - this.m.D) / (this.p.calMin - this.p.calMax) * 100; }

  // ---------------------------------------------------------------- comandos da tela
  comando(c) {
    if (c.tipo === 'proc') {
      const d = PROCESSO[c.campo];
      if (!d) return { ok: false, erro: `campo de processo desconhecido: ${c.campo}` };
      let v = Number(c.v); if (!Number.isFinite(v)) return { ok: false, erro: 'valor inválido' };
      if (c.campo === 'vazao') v = Math.sign(v);
      if (c.campo === 'obstaculo' || c.campo === 'cabo') v = v ? 1 : 0;
      this.proc[c.campo] = lim(v, d[0], d[1]);
      if (c.campo === 'nivel') this.proc.vazao = 0;
      if (c.campo === 'cabo') this.log(v ? 'cabo do laço 4–20 mA rompido: transmissor sem alimentação, 0 mA no CLP' : 'cabo do laço 4–20 mA refeito');
      return { ok: true, v: this.proc[c.campo] };
    }
    if (c.tipo === 'param') {
      const d = MAPA.get(String(c.id));
      if (!d) return { ok: false, erro: `parâmetro desconhecido: ${c.id}` };
      this.p[d.id] = this.limitar(d, c.v);
      this.aoGravar();
      this.log(`${d.nome} = ${d.opcoes ? d.opcoes[this.p[d.id]] : this.p[d.id] + ' ' + d.un}`);
      return { ok: true, v: this.p[d.id] };
    }
    if (c.tipo === 'cenario') {       // experiências da aula guiada: volta ao padrão e aplica o que o passo pede
      for (const [k, d] of Object.entries(PROCESSO)) this.proc[k] = d[2];
      for (const d of PARAMETROS) this.p[d.id] = d.padrao;
      for (const [k, v] of Object.entries(c.proc || {})) if (PROCESSO[k]) this.proc[k] = lim(Number(v), PROCESSO[k][0], PROCESSO[k][1]);
      for (const [k, v] of Object.entries(c.par || {})) if (MAPA.has(k)) this.p[k] = this.limitar(MAPA.get(k), v);
      this.m.semEco = 0; this.m.erro = null; this.m.D = GEO.E - this.proc.nivel;
      this.aoGravar();
      return { ok: true };
    }
    return { ok: false, erro: `comando desconhecido: ${c.tipo}` };
  }

  // ---------------------------------------------------------------- ligação com a rede (fachada)
  entradasDoClp() { return { LT01_Bruto: this.m.bruto }; }           // o que o simulador escreve no CLP
  aplicarSaidasDoClp(v) { this.clp = Object.assign(this.clp || {}, v); }               // o que o CLP manda (sinaleiros e IHM)
  redeCaiu() { if (this.clp) this.log('comunicação com o CLP perdida: sinaleiros e IHM do painel apagados'); this.clp = null; }
  semRetorno() { this.clp = null; }                                                    // painel do CLP desligado na sessão

  // ---------------------------------------------------------------- retrato para a tela e gravação
  retrato() {
    const m = this.m, r3 = (v) => Math.round(v * 1000) / 1000;
    const curva = [], limiar = [];
    for (let i = 0; i <= 175; i++) { const x = i * 0.02; curva.push(Math.round(this.curvaDb(x) * 10) / 10); limiar.push(Math.round(this.limiar(x) * 10) / 10); }
    return {
      t: r3(this.t),
      proc: Object.assign({}, this.proc, { nivel: r3(this.proc.nivel) }),
      par: Object.assign({}, this.p),
      med: {
        cReal: r3(m.cReal), cUsado: r3(m.cUsado), status: m.status, erro: m.erro, D: r3(m.D), L: r3(this.nivelIndicado()), pct: Math.round(this.pctIndicado() * 100) / 100,
        mA: Math.round(m.mA * 1000) / 1000, bruto: m.bruto, tof: Math.round(m.tof * 1000) / 1000, semEco: r3(m.semEco), ecoFalso: m.ecoFalso,
        sel: m.sel ? { x: r3(m.sel.x), a: Math.round(m.sel.a * 10) / 10, tipo: m.sel.tipo, dReal: r3(m.sel.dReal) } : null,
        ecos: m.ecos.map((o) => ({ x: r3(o.x), a: Math.round(o.a * 10) / 10, tipo: o.tipo, n: o.n })),
        modoFalha: MODOS_FALHA[this.p.modoFalha].txt,
      },
      curva, limiar, clp: this.clp,
    };
  }
  paraGravar() { const o = {}; for (const d of PARAMETROS) if (this.p[d.id] !== d.padrao) o[d.id] = this.p[d.id]; return o; }
}

module.exports = { Nucleo, PARAMETROS, PROCESSO, SENSOR, GEO, MODOS_FALHA, TEMPO_SEM_ECO, FUNDO_AD, brutoDe, velocidadeSom };
