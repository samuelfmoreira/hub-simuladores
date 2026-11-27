'use strict';
/**
 * Núcleo do simulador de sensor ultrassônico de nível (LT-01 no tanque TQ-01).
 * Dados técnicos e árvore de parâmetros: VEGASON 61, 4…20 mA/HART dois condutores (folha 34584, manual 28775-EN,
 * capítulo 6, e guia rápido 51852-PT, de onde vêm os nomes dos menus em português).
 *
 * Regras do HUB:
 *  - determinístico: nada de Math.random() nem Date.now(); o tempo vem do passo(dt);
 *  - uma lista única de parâmetros (PARAMETROS) alimenta o módulo de ajuste, a gravação e o guia;
 *  - só o que o usuário mudou é gravado (paraGravar).
 *
 * O que é modelo didático (não vem do manual): a regra "primeiro eco acima do limiar", as amplitudes da curva de eco,
 * a confiabilidade em dB (margem do eco sobre o limiar) e o tempo sem eco até a falha (TEMPO_SEM_ECO).
 * Medium, Vessel form, Display unit e Unit of measurement são guardados, mas não mudam a física.
 */
const SENSOR = { zonaMorta: 0.25, feixe: 11, frequencia: 70000, faixa: 5 };
const GEO = { E: 3.0, nivelMax: 2.95, obsDist: 1.20, obsBorda: 0.07 };   // E: plano de referência do sensor até o fundo
const TEMPO_SEM_ECO = 4;      // s sem eco válido até declarar E013
const TEMPO_SIMULACAO = 600;  // a simulação da saída termina sozinha 10 min depois da última tecla (manual)
const VAZAO = 0.10;           // m/s de variação de nível com Encher/Esvaziar
const FUNDO_AD = 32767;       // 15 bits: 0–32767 = 4–20 mA
const MODOS_FALHA = [         // a ordem interna é esta; o menu do aparelho mostra Hold value, 20.5 mA, 22 mA, < 3.6 mA
  { txt: '< 3,6 mA', mA: 3.55 },
  { txt: 'Manter valor', mA: null },
  { txt: '20,5 mA', mA: 20.5 },
  { txt: '22 mA', mA: 22 },
];
const I_MIN = [3.8, 4], I_MAX = [20, 20.5];

// menu: número do item no módulo de ajuste do aparelho. padrao: valor do simulador já comissionado para o TQ-01.
// reset: valor depois de Service > Reset (tabela do manual); sem "reset" = o Reset não mexe. pref: não volta nas experiências da aula.
const PARAMETROS = [
  { id: 'calMinPct', menu: '1.1', nome: 'Min. adjustment (%)', faz: 'Porcentagem do ponto de mínimo', min: 0, max: 100, padrao: 0, reset: 0, un: '%', dec: 2 },
  { id: 'calMin', menu: '1.1', nome: 'Min. adjustment (distância)', faz: 'Distância que corresponde à porcentagem de mínimo (tanque vazio)', min: 0, max: 5, padrao: 3.0, reset: 5, un: 'm(d)', dec: 3 },
  { id: 'calMaxPct', menu: '1.2', nome: 'Max. adjustment (%)', faz: 'Porcentagem do ponto de máximo', min: 0, max: 100, padrao: 100, reset: 100, un: '%', dec: 2 },
  { id: 'calMax', menu: '1.2', nome: 'Max. adjustment (distância)', faz: 'Distância que corresponde à porcentagem de máximo (tanque cheio)', min: 0, max: 5, padrao: 0.5, reset: 0, un: 'm(d)', dec: 3 },
  { id: 'meio', menu: '1.3', nome: 'Medium', faz: 'Tipo de produto (guardado; não muda a simulação)', min: 0, max: 3, padrao: 0, reset: 0, un: '', dec: 0, opcoes: ['Liquid', 'Solid: Powder/Dust', 'Solid: Granular/Pellets', 'Solid: Ballast/Pebbels'] },
  { id: 'forma', menu: '1.4', nome: 'Vessel form', faz: 'Forma do reservatório (guardado; não muda a simulação)', min: 0, max: 5, padrao: 0, un: '', dec: 0, opcoes: ['Storage tank', 'Stilling tube', 'Open vessel', 'Stirred vessel', 'Silo', 'Bunker'] },
  { id: 'atenuacao', menu: '1.5', nome: 'Damping', faz: 'Filtro da medição, em segundos', min: 0, max: 999, padrao: 0, reset: 0, un: 's', dec: 0 },
  { id: 'linearizacao', menu: '1.6', nome: 'Linearisation curve', faz: 'Converte nível em volume para tanque cilíndrico deitado ou esférico', min: 0, max: 2, padrao: 0, reset: 0, un: '', dec: 0, opcoes: ['Linear', 'Horiz. cylinder', 'Spherical tank'] },
  { id: 'valorExibido', menu: '2.1', nome: 'Displayed value', faz: 'O que o visor mostra na tela de medição', min: 0, max: 5, padrao: 4, reset: 1, un: '', dec: 0, opcoes: ['Height', 'Distance', 'Current', 'Scaled', 'Percent', 'Lin. percent'] },
  { id: 'unidadeEscala', menu: '2.2', nome: 'Display unit', faz: 'Unidade do valor escalonado', min: 0, max: 3, padrao: 0, un: '', dec: 0, opcoes: ['m³', 'l', 'm', ''] },
  { id: 'escala0', menu: '2.3', nome: 'Scaling 0 %', faz: 'Valor escalonado em 0 %', min: 0, max: 9999.9, padrao: 0, un: '', dec: 1 },
  { id: 'escala100', menu: '2.3', nome: 'Scaling 100 %', faz: 'Valor escalonado em 100 %', min: 0, max: 9999.9, padrao: 100, un: '', dec: 1 },
  { id: 'luz', menu: '2.4', nome: 'Backlight', faz: 'Iluminação do visor', min: 0, max: 1, padrao: 0, un: '', dec: 0, opcoes: ['Switched off', 'Switched on'], pref: true },
  { id: 'ajusteEstendido', menu: '4.2', nome: 'Extended setting', faz: 'Variação rápida de nível (> 1 m/min): menos média, resposta mais rápida e mais ruído', min: 0, max: 1, padrao: 0, un: '', dec: 0, opcoes: ['None', 'Quick level change'] },
  { id: 'caracteristica', menu: '4.3', nome: 'Current output: characteristic', faz: 'Sentido da saída', min: 0, max: 1, padrao: 0, reset: 0, un: '', dec: 0, opcoes: ['4-20 mA', '20-4 mA'] },
  { id: 'modoFalha', menu: '4.3', nome: 'Current output: failure mode', faz: 'Corrente de saída quando não há valor de medição', min: 0, max: 3, padrao: 0, reset: 0, un: '', dec: 0, opcoes: MODOS_FALHA.map((m) => m.txt) },
  { id: 'iMinSel', menu: '4.3', nome: 'Current output: min. current', faz: 'Corrente mínima em operação', min: 0, max: 1, padrao: 0, reset: 1, un: '', dec: 0, opcoes: ['3,8 mA', '4 mA'] },
  { id: 'iMaxSel', menu: '4.3', nome: 'Current output: max. current', faz: 'Corrente máxima em operação', min: 0, max: 1, padrao: 1, reset: 0, un: '', dec: 0, opcoes: ['20 mA', '20,5 mA'] },
  { id: 'idioma', menu: '4.7', nome: 'Idioma', faz: 'Idioma do visor: os textos em português seguem o guia rápido 51852-PT; os em inglês, o manual 28775-EN', min: 0, max: 1, padrao: 0, un: '', dec: 0, opcoes: ['Português', 'English'], pref: true },
  { id: 'sil', menu: '4.8', nome: 'SIL', faz: 'Com SIL ativado, os modos de falha Hold value e 20.5 mA e o Multidrop ficam bloqueados', min: 0, max: 1, padrao: 0, un: '', dec: 0, opcoes: ['Not activated', 'Activated'] },
  { id: 'hartMulti', menu: '4.9', nome: 'HART mode', faz: 'Multidrop fixa a saída em 4 mA: a medição só sai pelo HART', min: 0, max: 1, padrao: 0, un: '', dec: 0, opcoes: ['Standard', 'Multidrop'] },
  { id: 'correcaoTemp', menu: '—', nome: 'Correção de temperatura', faz: 'Didático: no aparelho real é fixa, sempre ligada (não existe no menu)', min: 0, max: 1, padrao: 1, un: '', dec: 0, opcoes: ['Desligada', 'Ligada'] },
];
const MAPA = new Map(PARAMETROS.map((p) => [p.id, p]));
const TAG_PADRAO = 'LT-01', TAG_RESET = 'Sensor';

const PROCESSO = {      // campo: [mín, máx, inicial]
  nivel: [0, GEO.nivelMax, 1.0], vazao: [-1, 1, 0], temp: [-20, 80, 20], espuma: [0, 100, 0], obstaculo: [0, 1, 0], cabo: [0, 1, 0],
};

const lim = (v, a, b) => Math.min(b, Math.max(a, v));
const velocidadeSom = (T) => 331.3 + 0.606 * T;
const brutoDe = (mA) => Math.round(lim((mA - 4) / 16 * FUNDO_AD, -8192, FUNDO_AD));
const limparTag = (t) => String(t == null ? '' : t).replace(/[^A-Za-z0-9 \-]/g, '').slice(0, 12).trimEnd();
// curvas de linearização: nível em % -> volume em %
function linearizar(curva, pct) {
  if (curva === 0) return pct;
  const h = lim(pct / 100, 0, 1);
  if (curva === 1) { const a = 1 - 2 * h; return (Math.acos(a) - a * Math.sqrt(1 - a * a)) / Math.PI * 100; }     // cilindro deitado
  return h * h * (3 - 2 * h) * 100;                                                                                // esfera
}

class Nucleo {
  constructor({ salvos = {}, aoGravar = () => {}, log = () => {} } = {}) {
    this.aoGravar = aoGravar; this.log = log;
    this.p = {}; this.tag = TAG_PADRAO; this.falsos = [];     // falsos: ecos gravados pela supressão de sinal falso [{ x, a }]
    for (const d of PARAMETROS) this.p[d.id] = d.padrao;
    for (const [k, v] of Object.entries(salvos || {})) if (MAPA.has(k)) this.p[k] = this.limitar(MAPA.get(k), v);
    if (salvos && typeof salvos.__tag === 'string') this.tag = limparTag(salvos.__tag);
    if (salvos && Array.isArray(salvos.__falsos)) this.falsos = salvos.__falsos.filter((f) => f && Number.isFinite(f.x) && Number.isFinite(f.a)).slice(0, 8).map((f) => ({ x: +f.x, a: +f.a }));
    this.proc = {};
    for (const [k, d] of Object.entries(PROCESSO)) this.proc[k] = d[2];
    const D0 = GEO.E - this.proc.nivel;
    this.m = { cReal: 343.42, cUsado: 343.42, ecos: [], sel: null, status: 'ok', erro: null, D: D0, semEco: 0, mA: 10.4, bruto: 13107, tof: 0, ecoFalso: false, pctNivel: 40, pct: 40, confiab: 0 };
    this.picos = { dMin: D0, dMax: D0, tMin: this.proc.temp, tMax: this.proc.temp };
    this.sim = { ativa: false, modo: 'pct', valor: 0, resta: 0 };      // Service > Simulation: saída forçada
    this.t = 0; this.semente = 12345;
    this.clp = null;              // últimas variáveis recebidas do CLP (null = sem retorno do CLP)
    this.passo(0.002);
    this.picos.dMin = this.picos.dMax = this.m.D;
  }

  limitar(d, v) {
    v = Number(v); if (!Number.isFinite(v)) v = d.padrao;
    const f = Math.pow(10, d.dec); v = Math.round(v * f) / f;
    return lim(v, d.min, d.max);
  }
  aleatorio() { this.semente = (this.semente * 16807) % 2147483647; return this.semente / 2147483647; }

  // limiar de detecção (dB) na distância x; a supressão de sinal falso sobe o limiar sobre cada eco gravado
  limiarBase(x) { return 34 - 3 * x; }
  limiar(x) {
    let th = this.limiarBase(x);
    for (const f of this.falsos) th += Math.max(0, f.a + 8 - this.limiarBase(f.x)) * Math.exp(-(((x - f.x) / 0.11) ** 2));
    return th;
  }

  // ---------------------------------------------------------------- física (passo fixo)
  passo(dt) {
    const pr = this.proc, m = this.m, p = this.p;
    this.t += dt;
    if (this.sim.ativa) { this.sim.resta -= dt; if (this.sim.resta <= 0) { this.sim.ativa = false; this.log('simulação da saída encerrada sozinha (10 min sem tecla)'); } }

    if (pr.vazao !== 0) {
      pr.nivel = lim(pr.nivel + pr.vazao * VAZAO * dt, 0, GEO.nivelMax);
      if (pr.nivel <= 0 || pr.nivel >= GEO.nivelMax) pr.vazao = 0;
    }
    this.picos.tMin = Math.min(this.picos.tMin, pr.temp); this.picos.tMax = Math.max(this.picos.tMax, pr.temp);
    m.cReal = velocidadeSom(pr.temp);
    m.cUsado = p.correcaoTemp ? m.cReal : velocidadeSom(20);
    const k = m.cUsado / m.cReal;             // o sensor converte tempo em distância com a velocidade em que acredita
    const dReal = GEO.E - pr.nivel;

    // dois fios: cabo rompido tira a alimentação do transmissor
    if (pr.cabo) {
      m.ecos = []; m.sel = null; m.status = 'desligado'; m.erro = null; m.semEco = 0; m.ecoFalso = false; m.confiab = 0;
      m.mA = 0; m.bruto = brutoDe(0); m.tof = 0; this.sim.ativa = false;
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
    const spanPequeno = Math.abs(p.calMin - p.calMax) < 0.01 || Math.abs(p.calMaxPct - p.calMinPct) < 0.01;
    if (sel) {
      if (m.erro === 'E013' || m.semEco > 0) m.D = sel.x;
      m.semEco = 0;
      const rapido = p.ajusteEstendido === 1;
      const ruido = pr.vazao !== 0 ? (this.aleatorio() - 0.5) * (rapido ? 0.03 : 0.012) : 0;
      const tau = Math.max(rapido ? 0.06 : 0.25, p.atenuacao);
      m.D += (sel.x + ruido - m.D) * (1 - Math.exp(-dt / tau));
      m.tof = 2 * m.D / m.cUsado * 1000;
      m.status = sel.tipo === 'nivel' ? 'ok' : sel.tipo;      // 'ok' | 'falso' | 'multiplo'
      m.erro = null;
      m.confiab = Math.max(0, sel.a - this.limiarBase(sel.x));
      this.picos.dMin = Math.min(this.picos.dMin, m.D); this.picos.dMax = Math.max(this.picos.dMax, m.D);
    } else {
      m.semEco += dt; m.confiab = 0;
      if (m.semEco < TEMPO_SEM_ECO) { m.status = 'aguardando'; m.erro = null; } else { m.status = 'falha'; m.erro = 'E013'; }
    }
    if (spanPequeno) { m.status = 'falha'; m.erro = 'E017'; }

    // do nível à corrente: calibração (dois pontos), linearização, característica e limites
    const iMin = I_MIN[p.iMinSel], iMax = I_MAX[p.iMaxSel];
    const corrente = (pct) => lim(p.caracteristica ? 20 - 16 * pct / 100 : 4 + 16 * pct / 100, iMin, iMax);
    if (!spanPequeno) {
      m.pctNivel = p.calMinPct + (p.calMin - m.D) * (p.calMaxPct - p.calMinPct) / (p.calMin - p.calMax);
      m.pct = linearizar(p.linearizacao, m.pctNivel);
    }
    if (this.sim.ativa) m.mA = this.sim.modo === 'mA' ? lim(this.sim.valor, 3.6, 22) : corrente(this.sim.valor);
    else if (m.status !== 'falha') m.mA = corrente(m.pct);
    else if (MODOS_FALHA[p.modoFalha].mA !== null) m.mA = MODOS_FALHA[p.modoFalha].mA;
    if (p.hartMulti) m.mA = 4;                 // Multidrop: corrente fixa em 4 mA, mesmo em falha
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
  pctIndicado() { return this.m.pct; }
  escalado() { return this.p.escala0 + this.m.pct / 100 * (this.p.escala100 - this.p.escala0); }

  // ---------------------------------------------------------------- supressão de sinal falso (Service 4.1)
  // Grava como falsos todos os ecos que estão ANTES da distância informada. Distância grande demais grava o próprio nível.
  supressao(acao, dist) {
    if (acao === 'apagar') { this.falsos = []; this.log('supressão de sinal falso apagada'); this.aoGravar(); return { ok: true, n: 0 }; }
    const d = Number(dist);
    if (!Number.isFinite(d) || d <= 0 || d > SENSOR.faixa) return { ok: false, erro: 'distância até o produto inválida (0 a 5 m)' };
    if (this.m.status === 'desligado') return { ok: false, erro: 'transmissor sem alimentação' };
    const novos = this.m.ecos.filter((o) => o.x >= 0.15 && o.x < d - 0.12).map((o) => ({ x: Math.round(o.x * 1000) / 1000, a: Math.round(o.a * 10) / 10 }));
    if (acao === 'atualizar') { for (const f of novos) if (!this.falsos.some((g) => Math.abs(g.x - f.x) < 0.06)) this.falsos.push(f); }
    else this.falsos = novos;
    this.falsos = this.falsos.slice(0, 8);
    const pegouNivel = novos.some((f) => this.m.ecos.some((o) => o.tipo === 'nivel' && Math.abs(o.x - f.x) < 0.01));
    this.log(`supressão de sinal falso ${acao === 'atualizar' ? 'atualizada' : 'criada'} até ${d.toFixed(3)} m: ${this.falsos.length} eco(s) gravado(s)${pegouNivel ? ' — ATENÇÃO: o eco do nível entrou junto (distância grande demais)' : ''}`);
    this.aoGravar();
    return { ok: true, n: this.falsos.length, pegouNivel };
  }

  // ---------------------------------------------------------------- comandos da tela e do módulo de ajuste
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
      if (c.id === 'supressao') return this.supressao(Number(c.v) ? 'criar' : 'apagar', (GEO.E - this.proc.nivel) * this.m.cUsado / this.m.cReal);   // atalho da Bancada: usa a distância certa
      const d = MAPA.get(String(c.id));
      if (!d) return { ok: false, erro: `parâmetro desconhecido: ${c.id}` };
      const v = this.limitar(d, c.v);
      if (this.p.sil && d.id === 'modoFalha' && (v === 1 || v === 2)) return { ok: false, erro: 'bloqueado pelo SIL: use < 3.6 mA ou 22 mA' };
      if (this.p.sil && d.id === 'hartMulti' && v === 1) return { ok: false, erro: 'bloqueado pelo SIL' };
      this.p[d.id] = v;
      if (d.id === 'sil' && v === 1) { if (this.p.modoFalha === 1 || this.p.modoFalha === 2) this.p.modoFalha = 0; this.p.hartMulti = 0; }
      this.aoGravar();
      this.log(`${d.menu !== '—' ? d.menu + ' ' : ''}${d.nome} = ${d.opcoes ? d.opcoes[this.p[d.id]] : this.p[d.id].toFixed(d.dec) + (d.un ? ' ' + d.un : '')}`);
      return { ok: true, v: this.p[d.id] };
    }
    if (c.tipo === 'tag') { this.tag = limparTag(c.v) || TAG_RESET; this.aoGravar(); this.log(`1.7 Sensor-TAG = ${this.tag}`); return { ok: true, v: this.tag }; }
    if (c.tipo === 'supressao') return this.supressao(c.acao, c.dist);
    if (c.tipo === 'simular') {         // Service 4.4: força a saída de corrente para testar o laço e o CLP
      if (c.modo === 'parar') { if (this.sim.ativa) this.log('simulação da saída encerrada'); this.sim.ativa = false; return { ok: true }; }
      if (c.modo === 'manter') { if (this.sim.ativa) this.sim.resta = TEMPO_SIMULACAO; return { ok: true }; }
      if (this.m.status === 'desligado') return { ok: false, erro: 'transmissor sem alimentação' };
      const v = Number(c.v); if (!Number.isFinite(v)) return { ok: false, erro: 'valor inválido' };
      this.sim = c.modo === 'mA' ? { ativa: true, modo: 'mA', valor: lim(v, 3.6, 22), resta: TEMPO_SIMULACAO } : { ativa: true, modo: 'pct', valor: lim(v, -10, 110), resta: TEMPO_SIMULACAO };
      this.log(`simulação da saída: ${this.sim.modo === 'mA' ? this.sim.valor.toFixed(2) + ' mA' : this.sim.valor.toFixed(1) + ' %'}`);
      return { ok: true, v: this.sim.valor };
    }
    if (c.tipo === 'reset') {           // Service 4.5
      if (c.qual === 'picos') { this.picos = { dMin: this.m.D, dMax: this.m.D, tMin: this.proc.temp, tMax: this.proc.temp }; this.log('4.5 Reset: valores de pico'); return { ok: true }; }
      for (const d of PARAMETROS) if ('reset' in d) this.p[d.id] = d.reset;
      if (c.qual === 'fabrica') this.p.ajusteEstendido = 0;
      this.tag = TAG_RESET; this.m.semEco = 0;
      this.aoGravar(); this.log(`4.5 Reset (${c.qual === 'fabrica' ? 'default setting' : 'basic adjustment'}): calibração de volta a 0 % = 5,000 m e 100 % = 0,000 m. É preciso calibrar de novo`);
      return { ok: true };
    }
    if (c.tipo === 'cenario') {       // experiências da aula guiada e "Restaurar tudo": volta ao simulador comissionado
      for (const [k, d] of Object.entries(PROCESSO)) this.proc[k] = d[2];
      for (const d of PARAMETROS) if (!d.pref) this.p[d.id] = d.padrao;
      this.tag = TAG_PADRAO; this.falsos = []; this.sim.ativa = false;
      for (const [k, v] of Object.entries(c.proc || {})) if (PROCESSO[k]) this.proc[k] = lim(Number(v), PROCESSO[k][0], PROCESSO[k][1]);
      for (const [k, v] of Object.entries(c.par || {})) if (MAPA.has(k)) this.p[k] = this.limitar(MAPA.get(k), v);
      this.m.semEco = 0; this.m.erro = null; this.m.D = GEO.E - this.proc.nivel;
      this.picos = { dMin: this.m.D, dMax: this.m.D, tMin: this.proc.temp, tMax: this.proc.temp };
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
    const m = this.m, r3 = (v) => Math.round(v * 1000) / 1000, r1 = (v) => Math.round(v * 10) / 10;
    const curva = [], limiar = [];
    for (let i = 0; i <= 175; i++) { const x = i * 0.02; curva.push(r1(this.curvaDb(x))); limiar.push(r1(this.limiar(x))); }
    return {
      t: r3(this.t),
      proc: Object.assign({}, this.proc, { nivel: r3(this.proc.nivel) }),
      par: Object.assign({}, this.p, { supressao: this.falsos.length ? 1 : 0 }),
      tag: this.tag, falsos: this.falsos,
      med: {
        cReal: r3(m.cReal), cUsado: r3(m.cUsado), status: m.status, erro: m.erro, D: r3(m.D), L: r3(this.nivelIndicado()),
        pct: Math.round(m.pct * 100) / 100, pctNivel: Math.round(m.pctNivel * 100) / 100, altura: r3(this.p.calMin - m.D), escalado: r1(this.escalado()),
        mA: r3(m.mA), bruto: m.bruto, tof: r3(m.tof), semEco: r3(m.semEco), ecoFalso: m.ecoFalso, confiab: Math.round(m.confiab),
        sel: m.sel ? { x: r3(m.sel.x), a: r1(m.sel.a), tipo: m.sel.tipo, dReal: r3(m.sel.dReal) } : null,
        ecos: m.ecos.map((o) => ({ x: r3(o.x), a: r1(o.a), tipo: o.tipo, n: o.n })),
        modoFalha: MODOS_FALHA[this.p.modoFalha].txt,
        picos: { dMin: r3(this.picos.dMin), dMax: r3(this.picos.dMax), tMin: r1(this.picos.tMin), tMax: r1(this.picos.tMax) },
        sim: this.sim.ativa ? { modo: this.sim.modo, valor: this.sim.valor, resta: Math.ceil(this.sim.resta) } : null,
      },
      curva, limiar, clp: this.clp,
    };
  }
  paraGravar() {
    const o = {};
    for (const d of PARAMETROS) if (this.p[d.id] !== d.padrao) o[d.id] = this.p[d.id];
    if (this.tag !== TAG_PADRAO) o.__tag = this.tag;
    if (this.falsos.length) o.__falsos = this.falsos;
    return o;
  }
}

module.exports = { Nucleo, PARAMETROS, PROCESSO, SENSOR, GEO, MODOS_FALHA, TEMPO_SEM_ECO, TEMPO_SIMULACAO, FUNDO_AD, I_MIN, I_MAX, brutoDe, velocidadeSom, linearizar };
