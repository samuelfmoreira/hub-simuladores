/**
 * Simulador de Processo com Sistema de Visão 3D — cliente Modbus TCP
 * Navegador ⇄ Socket.IO ⇄ server.js (cliente Modbus) ⇄ Modbus TCP ⇄ CLP (servidor, ID 1, porta 502, timeout 1000 ms)
 * O cliente é a MÁQUINA: escreve botões/sensores (10 coils, FC5) e lê os atuadores (10 endereços, FC2 ou FC1).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const ModbusRTU = require('modbus-serial');

const PORTA_HTTP = Number(process.env.SIM_HTTP_PORT) || 3000;   // [HUB] porta definida pelo HUB
const UNIT_ID = 1;
const TIMEOUT_MS = 1000;
const POLLING_PADRAO = 200;
const POLLING_MIN = 50;
const ATRASO_MIN = 20;
const ARQ_CONFIG = path.join(__dirname, 'config.json');

// ============================================================ SINAIS
// A posição no vetor é o índice usado em write_coil {index} e io_status[index].
const ESCRITAS = [
  { nome: 'BT_LIGA', rotulo: 'Botão LIGA' },
  { nome: 'BT_DESLIGA', rotulo: 'Botão DESLIGA' },
  { nome: 'BT_EMERGENCIA', rotulo: 'Emergência' },
  { nome: 'S1_ENTRADA', rotulo: 'S1 · Sensor de entrada' },
  { nome: 'S2_INSPECAO', rotulo: 'S2 · Sensor de inspeção' },
  { nome: 'VISAO_OK', rotulo: 'Visão · Peça OK' },
  { nome: 'VISAO_NG', rotulo: 'Visão · Peça NG' },
  { nome: 'CIL_AVANCADO', rotulo: 'Cilindro avançado' },
  { nome: 'S3_SAIDA', rotulo: 'S3 · Sensor de saída' },
  { nome: 'ROBO_FIM', rotulo: 'Robô · Ciclo concluído' },
];
const LEITURAS = [
  { nome: 'MOTOR_ESTEIRA', rotulo: 'Motor da esteira' },
  { nome: 'VISAO_TRIGGER', rotulo: 'Visão · Trigger / Flash' },
  { nome: 'CILINDRO_REJEITO', rotulo: 'Cilindro de rejeito' },
  { nome: 'ROBO_PICK', rotulo: 'Robô · Iniciar pick' },
  { nome: 'LAMP_VERDE', rotulo: 'Sinaleiro verde (OK)' },
  { nome: 'LAMP_VERMELHA', rotulo: 'Sinaleiro vermelho (NG)' },
  { nome: 'LAMP_AMARELA', rotulo: 'Sinaleiro amarelo (alarme)' },
  { nome: 'LAMP_SISTEMA', rotulo: 'Lâmpada sistema ligado' },
  { nome: 'ALIMENTADOR', rotulo: 'Libera alimentador' },
  { nome: 'SIRENE', rotulo: 'Sirene de alarme' },
];
const QTD = 10;
const PADRAO_ESCRITA = Array.from({ length: QTD }, (_, i) => i);                                  // coils 0–9
const PADRAO_LEITURA = Array.from({ length: QTD }, (_, i) => ({ address: 10 + i, type: 'input' })); // 10–19, FC2

// ============================================================ CONFIGURAÇÃO
function validarEnderecos(w, r) {
  const erros = [];
  const ok = n => Number.isInteger(n) && n >= 0 && n <= 65535;
  if (!Array.isArray(w) || w.length !== QTD) erros.push(`writeAddresses precisa ter ${QTD} endereços.`);
  if (!Array.isArray(r) || r.length !== QTD) erros.push(`readAddresses precisa ter ${QTD} itens.`);
  if (erros.length) return erros;
  w.forEach((a, i) => { if (!ok(a)) erros.push(`Escrita ${i}: endereço inválido.`); });
  r.forEach((x, i) => {
    if (!x || !ok(x.address)) erros.push(`Leitura ${i}: endereço inválido.`);
    if (!x || !['input', 'coil'].includes(x.type)) erros.push(`Leitura ${i}: tipo deve ser input ou coil.`);
  });
  if (new Set(w).size !== QTD) erros.push('Há coils de escrita repetidas.');
  const conflito = r.filter(x => x?.type === 'coil' && w.includes(x.address)).map(x => x.address);
  if (conflito.length) erros.push(`Leitura coil no mesmo endereço de uma escrita: ${conflito.join(', ')}.`);
  return erros;
}

function carregarConfig() {
  const padrao = {
    ip: '127.0.0.1',                 // IP local: soft PLC (CODESYS etc.) ou CLP de teste no mesmo PC
    port: 502, pollingRate: POLLING_PADRAO, simulacao: true,
    writeAddresses: [...PADRAO_ESCRITA], readAddresses: PADRAO_LEITURA.map(r => ({ ...r })),
  };
  try {
    const c = { ...padrao, ...JSON.parse(fs.readFileSync(ARQ_CONFIG, 'utf8')) };
    if (c.ip === '192.168.0.10') c.ip = padrao.ip;   // config antiga com o IP de exemplo → IP local
    if (validarEnderecos(c.writeAddresses, c.readAddresses).length) {
      c.writeAddresses = padrao.writeAddresses;
      c.readAddresses = padrao.readAddresses;
    }
    return c;
  } catch {
    return padrao;
  }
}
function salvarConfig() {
  try { fs.writeFileSync(ARQ_CONFIG, JSON.stringify(cfg, null, 2)); } catch { /* segue em memória */ }
}
let cfg = carregarConfig();

// ============================================================ WEB
const app = express();
const semCache = { setHeaders: res => res.setHeader('Cache-Control', 'no-store') };
app.use(express.static(path.join(__dirname, 'public'), semCache));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three'), semCache));
const servidor = http.createServer(app);
const io = new Server(servidor);

const historico = [];
function log(msg) {
  const linha = `[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`;
  historico.push(linha);
  if (historico.length > 150) historico.shift();
  io.emit('log', linha);
  console.log(linha);
}

// Imagem de E/S: { NOME: bool } — escritas (máquina) + leituras (CLP)
const imagem = Object.fromEntries([...ESCRITAS, ...LEITURAS].map(s => [s.nome, false]));
const valoresEscrita = () => ESCRITAS.map(s => !!imagem[s.nome]);
const valoresLeitura = () => LEITURAS.map(s => !!imagem[s.nome]);
function aplicarLeituras(arr) { LEITURAS.forEach((s, i) => { imagem[s.nome] = !!arr[i]; }); }
function zerarLeituras() { aplicarLeituras(new Array(QTD).fill(false)); io.emit('io_status', valoresLeitura()); }

// ============================================================ MODBUS
// Uma conexão = pergunta-e-resposta: UMA transação por vez. Tudo passa pela fila.
let client = null;
let connected = false;
let sessao = 0;                       // muda a cada conexão; respostas atrasadas da anterior são ignoradas
const queue = [];
let queueBusy = false;
let POLLING_RATE_MS = Math.max(POLLING_MIN, Number(cfg.pollingRate) || POLLING_PADRAO);
let pollingAtivo = false;
let pollTimer = null;
let pollGeracao = 0;
const ioStatus = new Array(QTD).fill(false);
const errosConfig = new Set();        // evita repetir o mesmo log a cada ciclo
const stats = { ciclos: 0, leituras: 0, escritas: 0, cicloMs: 0 };
const EXCECOES = { 1: 'Illegal function', 2: 'Illegal data address', 3: 'Illegal data value', 4: 'Slave device failure', 6: 'Slave device busy' };

function enqueueModbus(taskFn, highPriority = false) {
  return new Promise((resolve, reject) => {
    if (!connected) return reject(new Error('Sem conexão com o CLP'));
    const item = { taskFn, resolve, reject, sessao };
    if (highPriority) queue.unshift(item); // escrita: frente da fila
    else queue.push(item);                 // leitura: fim da fila
    processQueue();
  });
}

function processQueue() {
  if (queueBusy || queue.length === 0) return;
  queueBusy = true; // mutex
  const item = queue.shift();
  Promise.resolve()
    .then(() => item.taskFn())
    .then(item.resolve, item.reject)
    .finally(() => {
      if (item.sessao !== sessao) return; // transação de conexão antiga
      queueBusy = false;
      setImmediate(processQueue);
    });
}

function esvaziarFila(motivo) {
  const pendentes = queue.splice(0);
  pendentes.forEach(i => i.reject(new Error(motivo)));
  return pendentes.length;
}

function definirConectado(valor) {
  connected = valor;
  io.emit('status_update', { connected: valor });
  if (valor) sincronizarEscritas();
  else if (!simulando()) zerarLeituras(); // sem CLP: atuadores param
}

async function conectarCLP(ip, port) {
  await desconectarCLP(true);
  sessao++;
  queueBusy = false;
  const c = new ModbusRTU();
  client = c;
  c.on('error', () => {}); // erro de socket nunca derruba o Node
  c.on('close', () => { if (c === client && connected) falhaReal('socket fechado pelo CLP'); });
  log(`Conectando em ${ip}:${port} (ID ${UNIT_ID}, timeout ${TIMEOUT_MS} ms)...`);
  try {
    await c.connectTCP(ip, { port });
    c.setID(UNIT_ID);
    c.setTimeout(TIMEOUT_MS);
  } catch (e) {
    client = null;
    log(`ERRO: não foi possível conectar em ${ip}:${port} — ${e.message}`);
    io.emit('status_update', { connected: false });
    return;
  }
  errosConfig.clear();
  log(`Conectado ao CLP ${ip}:${port}.`);
  definirConectado(true);
  iniciarPolling();
}

async function desconectarCLP(silencioso = false) {
  const estava = connected;
  pararPolling();                               // 1. para o laço
  connected = false;
  const n = esvaziarFila('Desconectado');       // 2. rejeita pendentes
  await fecharSocket();                         // 3. fecha o socket
  if (estava) {
    if (!silencioso) log(`Desconectado do CLP${n ? ` (${n} transação(ões) descartada(s))` : ''}.`);
    definirConectado(false);
  }
}

function fecharSocket() {
  const c = client;
  client = null;
  if (!c) return Promise.resolve();
  c.removeAllListeners('close');
  return new Promise(resolve => {
    if (!c.isOpen) return resolve();
    const t = setTimeout(resolve, 500);
    try { c.close(() => { clearTimeout(t); resolve(); }); } catch { clearTimeout(t); resolve(); }
  });
}

// Timeout / socket fechado = falha real: para tudo e avisa.
function falhaReal(motivo) {
  if (!connected) return;
  log(`ERRO: falha de comunicação (${motivo}). Polling parado — reconecte quando o CLP estiver disponível.`);
  pararPolling();
  connected = false;
  esvaziarFila('Falha de comunicação');
  fecharSocket();
  definirConectado(false);
}

// Exceção Modbus (2/3...) = configuração → loga e segue. Demais = falha real. Retorna true se pode continuar.
function tratarErro(e, contexto, s) {
  if (!connected || s !== sessao) return false;
  if (e && e.modbusCode) {
    if (!errosConfig.has(contexto)) {
      errosConfig.add(contexto);
      log(`ERRO de configuração em ${contexto}: exceção ${e.modbusCode} (${EXCECOES[e.modbusCode] || 'exceção'}). Verifique endereço/tipo.`);
    }
    return true;
  }
  falhaReal(`${contexto}: ${e?.message || e}`);
  return false;
}

function escreverCoil(index, value) {
  const address = cfg.writeAddresses[index];
  const contexto = `escrita coil ${address}`;
  const s = sessao;
  enqueueModbus(() => client.writeCoil(address, !!value), true)
    .then(() => { stats.escritas++; errosConfig.delete(contexto); })
    .catch(e => tratarErro(e, contexto, s));
}

// Envia o estado atual de todas as escritas (após conectar ou mudar o mapa)
function sincronizarEscritas() {
  const s = sessao;
  valoresEscrita().forEach((v, i) => {
    const address = cfg.writeAddresses[i];
    enqueueModbus(() => client.writeCoil(address, v))
      .then(() => { stats.escritas++; })
      .catch(e => tratarErro(e, `escrita coil ${address}`, s));
  });
}

function iniciarPolling() {
  pararPolling();
  pollingAtivo = true;
  const g = ++pollGeracao;
  pollTimer = setTimeout(() => cicloPolling(g), 0);
}
function pararPolling() {
  pollingAtivo = false;
  pollGeracao++;
  clearTimeout(pollTimer);
  pollTimer = null;
}
const vivo = g => pollingAtivo && g === pollGeracao && connected;

// Polling auto-agendado: o próximo ciclo só é marcado quando este termina (proibido setInterval).
async function cicloPolling(g) {
  if (!vivo(g)) return;
  const inicio = Date.now();
  const s = sessao;
  for (let i = 0; i < QTD; i++) {
    if (!vivo(g)) return;
    const { address, type } = cfg.readAddresses[i];
    const contexto = `leitura ${type === 'coil' ? 'coil (FC1)' : 'input (FC2)'} ${address}`;
    try {
      // Leituras individuais: FC1 e FC2 não se misturam na mesma requisição
      const r = await enqueueModbus(() => (type === 'coil' ? client.readCoils(address, 1) : client.readDiscreteInputs(address, 1)));
      ioStatus[i] = !!r.data[0];
      stats.leituras++;
      errosConfig.delete(contexto);
    } catch (e) {
      if (!tratarErro(e, contexto, s)) return;
      ioStatus[i] = false;
    }
  }
  if (!vivo(g)) return;
  const decorrido = Date.now() - inicio;
  stats.ciclos++;
  stats.cicloMs = decorrido;
  aplicarLeituras(ioStatus);
  io.emit('io_status', [...ioStatus]);
  pollTimer = setTimeout(() => cicloPolling(g), Math.max(POLLING_RATE_MS - decorrido, ATRASO_MIN));
}

// ============================================================ PLANTA (física da máquina)
const G = {
  X_INI: -6, X_FIM: 6, MEIA_LARG: 0.6, TOPO: 1.0, VEL: 1.2,
  R: 0.35, ALT: 0.12,
  X_S1: -5.0, X_S2: 0.45, X_S3: 5.55, X_VISAO: 0.1,         // a peça para ~1 raio antes do sensor
  X_CIL: 0, CIL_Z_RECUADO: 0.75, CIL_CURSO: 1.15, CIL_MEIA_LARG: 0.35, CIL_TEMPO: 0.45,
  LIXEIRA: { x: 0, z: -1.65, fundo: 0.06 },
  CAIXA: { x: 7.6, z: -1.4, fundo: 0.06 },
  ROBO_BASE: { x: 6.3, z: -1.4 },
  ROBO_HOME: { x: 6.3, y: 2.0, z: -0.5 },
  ROBO: { H: 0.9, L1: 1.1, L2: 1.1, FERR: 0.3 },
  ALIM_Y: 1.9,
};
const DEFEITOS = { furo_faltante: 'furo faltante', risco: 'risco na superfície', sem_peca: 'sem peça' };
const lerp = (a, b, t) => a + (b - a) * t;
const suave = t => t * t * (3 - 2 * t);
const r3 = v => Math.round(v * 1000) / 1000;

const planta = {
  relogio: 0, pecas: [], proxId: 1, distCorreia: 0,
  botoes: { BT_LIGA: false, BT_DESLIGA: false, BT_EMERGENCIA: false },
  tPressao: {}, timersBotao: {}, entradas: {},
  cil: 0,
  visao: { trigAnt: false, flashSeq: 0, pendenteEm: null, processando: false, ok: false, ng: false, resultadoSeq: 0, resultado: null, defeito: null, variante: 0, bom: null, pecaId: null },
  robo: { tool: { ...G.ROBO_HOME }, ativo: false, fim: false, seg: 0, t: 0, trajeto: null, de: null, segurando: null },
  alimentacao: { auto: true, intervalo: 2.5, defeitoPct: 30 },
  ultimaAlim: -99,
  contadores: { total: 0, ok: 0, ng: 0, perdidas: 0 },
};

// LIGA/DESLIGA ficam no mínimo 250 ms em 1 para o CLP enxergar
function definirBotao(nome, valor) {
  const p = planta;
  clearTimeout(p.timersBotao[nome]);
  if (nome === 'BT_EMERGENCIA') {
    if (p.botoes[nome] !== valor) log(valor ? 'EMERGÊNCIA ACIONADA' : 'Emergência destravada');
    p.botoes[nome] = valor;
    return;
  }
  if (valor) { p.botoes[nome] = true; p.tPressao[nome] = Date.now(); return; }
  const resto = Math.max(0, 250 - (Date.now() - (p.tPressao[nome] || 0)));
  p.timersBotao[nome] = setTimeout(() => { p.botoes[nome] = false; }, resto);
}

function zonaEntradaLivre() {
  return !planta.pecas.some(p => (p.estado === 'esteira' || p.estado === 'caindo') && p.x < G.X_S1 + 1.3);
}
function detecta(xs) {
  return planta.pecas.some(p => p.estado === 'esteira' && Math.abs(p.x - xs) < G.R && Math.abs(p.z) < G.MEIA_LARG);
}
function tween(p, para, dur, durante, final, aoFim) {
  p.estado = durante;
  p.tween = { de: { x: p.x, y: p.y, z: p.z }, para, t: 0, dur, final, aoFim };
}
function avancarTween(p, dt) {
  const tw = p.tween;
  tw.t = Math.min(1, tw.t + dt / tw.dur);
  p.x = lerp(tw.de.x, tw.para.x, tw.t);
  p.z = lerp(tw.de.z, tw.para.z, tw.t);
  p.y = lerp(tw.de.y, tw.para.y, tw.t * tw.t); // t² ≈ queda acelerada
  if (tw.final !== 'esteira') p.ry += dt * 4;
  if (tw.t >= 1) { p.tween = null; p.estado = tw.final; if (tw.aoFim) tw.aoFim(p); }
}
function limitarEmpilhadas(estado, max) {
  const lista = planta.pecas.filter(p => p.estado === estado);
  if (lista.length > max) {
    const remover = new Set(lista.slice(0, lista.length - max));
    planta.pecas = planta.pecas.filter(p => !remover.has(p));
  }
}
function criarPeca(bom) {
  const p = {
    id: planta.proxId++, bom, defeito: bom ? null : (Math.random() < 0.5 ? 'furo_faltante' : 'risco'),
    variante: Math.floor(Math.random() * 6), x: G.X_S1, y: G.ALIM_Y, z: 0, ry: 0, estado: 'caindo',
  };
  tween(p, { x: G.X_S1, y: G.TOPO + G.ALT / 2, z: 0 }, 0.35, 'caindo', 'esteira');
  planta.pecas.push(p);
  planta.ultimaAlim = planta.relogio;
  planta.contadores.total++;
}
function inserirPeca(bom) {
  if (!zonaEntradaLivre()) return log('Alimentador: entrada ocupada, aguarde.');
  criarPeca(!!bom);
}

// Movimento do robô em coordenadas cilíndricas (giro, raio, altura)
function interpRobo(de, para, k) {
  const b = G.ROBO_BASE;
  const cil = p => ({ a: Math.atan2(p.z - b.z, p.x - b.x), r: Math.hypot(p.x - b.x, p.z - b.z), y: p.y });
  const A = cil(de), B = cil(para);
  let da = B.a - A.a;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  const ang = A.a + da * k, raio = lerp(A.r, B.r, k);
  return { x: b.x + raio * Math.cos(ang), y: lerp(A.y, B.y, k), z: b.z + raio * Math.sin(ang) };
}
function iniciarCicloRobo() {
  const r = planta.robo;
  const alvoX = G.X_S3 - G.R;
  const peca = planta.pecas.filter(p => p.estado === 'esteira' && Math.abs(p.x - alvoX) < 0.8)
    .sort((a, b) => Math.abs(a.x - alvoX) - Math.abs(b.x - alvoX))[0];
  const pegar = peca ? { x: peca.x, y: G.TOPO + G.ALT, z: peca.z } : { x: alvoX, y: G.TOPO + G.ALT, z: 0 };
  const acima = { ...pegar, y: pegar.y + 0.6 };
  const caixaAcima = { x: G.CAIXA.x, y: 1.05, z: G.CAIXA.z };
  r.trajeto = [
    { para: acima, dur: 0.7 },
    { para: pegar, dur: 0.4, acao: 'pegar' },
    { para: acima, dur: 0.35 },
    { para: caixaAcima, dur: 0.8 },
    { para: { ...caixaAcima, y: 0.6 }, dur: 0.35, acao: 'soltar' },
    { para: caixaAcima, dur: 0.3 },
    { para: { ...G.ROBO_HOME }, dur: 0.6 },
  ];
  r.seg = 0; r.t = 0; r.de = { ...r.tool }; r.ativo = true;
  log('Robô: iniciando pick.');
}
function roboPegar() {
  const t = planta.robo.tool;
  const p = planta.pecas.find(q => q.estado === 'esteira' && Math.hypot(q.x - t.x, q.z - t.z) < 0.3);
  if (!p) return log('Robô: nenhuma peça sob a ventosa.');
  p.estado = 'robo';
  planta.robo.segurando = p.id;
}
function roboSoltar() {
  const p = planta.pecas.find(q => q.id === planta.robo.segurando);
  planta.robo.segurando = null;
  if (!p) return;
  tween(p, { x: G.CAIXA.x + (Math.random() - 0.5) * 0.5, y: G.CAIXA.fundo + G.ALT / 2 + Math.random() * 0.04, z: G.CAIXA.z + (Math.random() - 0.5) * 0.4 },
    0.3, 'queda_caixa', 'caixa', () => {
      planta.contadores.ok++;
      log(`Peça #${p.id} aprovada e retirada pelo robô.`);
      limitarEmpilhadas('caixa', 12);
    });
}

function passoPlanta(dt, e) {
  const P = planta;
  P.relogio += dt;
  const emergencia = P.botoes.BT_EMERGENCIA;

  // Alimentador: só solta peças se o CLP liberar
  const a = P.alimentacao;
  if (a.auto && e.ALIMENTADOR && P.relogio - P.ultimaAlim >= a.intervalo && zonaEntradaLivre()) {
    criarPeca(Math.random() * 100 >= a.defeitoPct);
  }

  // Correia
  const desloc = e.MOTOR_ESTEIRA ? G.VEL * dt : 0;
  P.distCorreia += desloc;

  // Cilindro (válvula simples, retorno por mola)
  P.cil = Math.min(1, Math.max(0, P.cil + (e.CILINDRO_REJEITO ? 1 : -1) * dt / G.CIL_TEMPO));
  const faceCil = G.CIL_Z_RECUADO - P.cil * G.CIL_CURSO;

  // Peças
  for (const p of P.pecas) {
    if (p.estado === 'esteira') {
      p.x += desloc;
      if (Math.abs(p.x - G.X_CIL) < G.CIL_MEIA_LARG + G.R * 0.8 && p.z + G.R > faceCil) p.z = faceCil - G.R;
      if (p.z < -G.MEIA_LARG) {
        tween(p, { x: G.LIXEIRA.x + (Math.random() - 0.5) * 0.5, y: G.LIXEIRA.fundo + G.ALT / 2 + Math.random() * 0.04, z: G.LIXEIRA.z + (Math.random() - 0.5) * 0.4 },
          0.45, 'queda_rejeito', 'lixeira', () => {
            P.contadores.ng++;
            log(`Peça #${p.id} rejeitada (refugo).`);
            limitarEmpilhadas('lixeira', 12);
          });
      } else if (p.x > G.X_FIM) {
        tween(p, { x: p.x + 0.7, y: G.ALT / 2, z: p.z }, 0.4, 'queda_fim', 'chao', () => {
          P.contadores.perdidas++;
          p.removerEm = P.relogio + 4;
          log(`ERRO: peça #${p.id} caiu no fim da esteira (robô não foi acionado).`);
        });
      }
    } else if (p.estado === 'robo') {
      p.x = P.robo.tool.x; p.y = P.robo.tool.y - G.ALT / 2; p.z = P.robo.tool.z;
    } else if (p.tween) {
      avancarTween(p, dt);
    }
  }
  P.pecas = P.pecas.filter(p => !(p.removerEm && P.relogio > p.removerEm));

  // Sistema de visão: borda de subida do trigger = flash + captura
  const v = P.visao;
  const trig = !!e.VISAO_TRIGGER;
  if (trig && !v.trigAnt) { v.flashSeq++; v.pendenteEm = P.relogio + 0.25; v.processando = true; v.ok = v.ng = false; }
  if (!trig) {
    v.ok = v.ng = false; v.pendenteEm = null; v.processando = false;
  } else if (v.pendenteEm !== null && P.relogio >= v.pendenteEm) {
    v.pendenteEm = null; v.processando = false; v.resultadoSeq++;
    const p = P.pecas.find(q => q.estado === 'esteira' && Math.abs(q.x - G.X_VISAO) < 0.3);
    if (!p) Object.assign(v, { resultado: 'NG', defeito: 'sem_peca', bom: null, pecaId: null, variante: 0 });
    else Object.assign(v, { resultado: p.bom ? 'OK' : 'NG', defeito: p.defeito, bom: p.bom, pecaId: p.id, variante: p.variante });
    v.ok = v.resultado === 'OK';
    v.ng = !v.ok;
    log(`Visão: peça #${v.pecaId ?? '-'} → ${v.resultado}${v.defeito ? ` — ${DEFEITOS[v.defeito]}` : ''}`);
  }
  v.trigAnt = trig;

  // Robô (handshake ROBO_PICK / ROBO_FIM); emergência pausa o movimento
  const r = P.robo;
  if (e.ROBO_PICK && !r.ativo && !r.fim) iniciarCicloRobo();
  if (!e.ROBO_PICK && r.fim) r.fim = false;
  if (r.ativo && !emergencia) {
    const seg = r.trajeto[r.seg];
    r.t = Math.min(1, r.t + dt / seg.dur);
    r.tool = interpRobo(r.de, seg.para, suave(r.t));
    if (r.t >= 1) {
      if (seg.acao === 'pegar') roboPegar();
      if (seg.acao === 'soltar') roboSoltar();
      r.seg++; r.t = 0; r.de = { ...r.tool };
      if (r.seg >= r.trajeto.length) { r.ativo = false; r.fim = true; log('Robô: ciclo concluído.'); }
    }
  }

  // Publica as entradas do CLP; mudou → escreve com prioridade
  const novos = {
    BT_LIGA: P.botoes.BT_LIGA, BT_DESLIGA: P.botoes.BT_DESLIGA, BT_EMERGENCIA: P.botoes.BT_EMERGENCIA,
    S1_ENTRADA: detecta(G.X_S1), S2_INSPECAO: detecta(G.X_S2), VISAO_OK: v.ok, VISAO_NG: v.ng,
    CIL_AVANCADO: P.cil >= 0.98, S3_SAIDA: detecta(G.X_S3), ROBO_FIM: r.fim,
  };
  ESCRITAS.forEach((s, i) => {
    if (P.entradas[s.nome] !== novos[s.nome]) {
      P.entradas[s.nome] = novos[s.nome];
      imagem[s.nome] = novos[s.nome];
      if (connected) escreverCoil(i, novos[s.nome]);
    }
  });
}

// RESET GERAL: esvazia a máquina e volta tudo à condição inicial.
// A emergência NÃO é destravada (é retentiva, só o operador destrava).
function resetarSimulador() {
  const P = planta;
  P.pecas = [];
  P.proxId = 1;
  P.cil = 0;
  P.ultimaAlim = P.relogio;                       // alimentador espera um intervalo antes da 1ª peça
  P.contadores = { total: 0, ok: 0, ng: 0, perdidas: 0 };
  for (const nome of ['BT_LIGA', 'BT_DESLIGA']) { clearTimeout(P.timersBotao[nome]); P.botoes[nome] = false; }
  Object.assign(P.visao, {
    trigAnt: !!imagem.VISAO_TRIGGER,              // evita flash falso se o CLP ainda estiver com o trigger ligado
    pendenteEm: null, processando: false, ok: false, ng: false,
    resultadoSeq: 0, resultado: null, defeito: null, variante: 0, bom: null, pecaId: null,
  });
  Object.assign(P.robo, { tool: { ...G.ROBO_HOME }, ativo: false, fim: false, seg: 0, t: 0, trajeto: null, de: null, segurando: null });
  if (simulando()) {                              // CLP virtual volta desligado e sem peças contadas
    clp.reset();
    zerarLeituras();
  }
  historico.length = 0;
  io.emit('simulador_resetado');
  log(simulando()
    ? 'Simulador resetado: esteira vazia, contadores zerados, CLP virtual desligado. Pressione LIGA.'
    : 'Simulador resetado: esteira vazia e contadores zerados. A lógica do CLP real não é resetada por aqui.');
}

function instantaneo() {
  const P = planta, v = P.visao, r = P.robo;
  return {
    pecas: P.pecas.map(p => ({ id: p.id, bom: p.bom, defeito: p.defeito, variante: p.variante, x: r3(p.x), y: r3(p.y), z: r3(p.z), ry: r3(p.ry), estado: p.estado })),
    correia: r3(P.distCorreia),
    cilindro: r3(P.cil),
    robo: { tool: { x: r3(r.tool.x), y: r3(r.tool.y), z: r3(r.tool.z) }, ativo: r.ativo },
    visao: { flashSeq: v.flashSeq, processando: v.processando, resultadoSeq: v.resultadoSeq, resultado: v.resultado, defeito: v.defeito, variante: v.variante, bom: v.bom, pecaId: v.pecaId },
    contadores: P.contadores,
  };
}

// ============================================================ CLP VIRTUAL (simulação sem CLP)
// Mesma lógica que o CLP real deve executar (ciclo de varredura).
const NOMES_ESTADO = ['TRANSPORTE', 'INSPEÇÃO', 'REJEITO · AVANÇA', 'REJEITO · RECUA', 'ROBÔ · PICK', 'ROBÔ · RETORNO'];
const clp = {
  reset() {
    Object.assign(this, { sistemaOn: false, estado: 0, tEstado: 0, contPecas: 0, pedInsp: false, pedRobo: false,
      ant: { s1: false, s2: false, s3: false }, lampVerde: false, lampVermelha: false, tPisca: 0, tSemEvento: 0, alarmeVisao: false });
  },
  ir(n) { this.estado = n; this.tEstado = 0; },
  scan(e, dtMs) {
    const emerg = e.BT_EMERGENCIA, liga = e.BT_LIGA, s1 = e.S1_ENTRADA, s2 = e.S2_INSPECAO, s3 = e.S3_SAIDA;
    const s1Sobe = s1 && !this.ant.s1, s2Sobe = s2 && !this.ant.s2, s3Sobe = s3 && !this.ant.s3; // R_TRIG
    this.ant = { s1, s2, s3 };
    if (emerg || e.BT_DESLIGA) this.sistemaOn = false; else if (liga) this.sistemaOn = true;
    if (s1Sobe) this.contPecas++;
    if (s2Sobe) this.pedInsp = true;  // memoriza a borda (atraso do Modbus)
    if (s3Sobe) this.pedRobo = true;
    if (s1Sobe || s2Sobe || s3Sobe) this.tSemEvento = 0;

    let motor = false, trigger = false, cilindro = false, robo = false;
    if (!emerg) {
      this.tEstado += dtMs;
      switch (this.estado) {
        case 0:
          if (this.pedInsp) { this.pedInsp = false; this.lampVerde = this.lampVermelha = false; this.ir(1); }
          else if (this.pedRobo) { this.pedRobo = false; this.ir(4); }
          else {
            motor = this.sistemaOn && this.contPecas > 0;
            if (motor && (this.tSemEvento += dtMs) > 12000) { this.contPecas = 0; this.tSemEvento = 0; }
          }
          break;
        case 1:
          trigger = true;
          if (this.tEstado >= 100) { // ignora resultado antigo
            if (e.VISAO_OK) { this.lampVerde = true; this.ir(0); }
            else if (e.VISAO_NG || this.tEstado > 3000) {
              if (!e.VISAO_NG) this.alarmeVisao = true;
              this.lampVermelha = true;
              this.ir(2);
            }
          }
          break;
        case 2: cilindro = true; if (e.CIL_AVANCADO) this.ir(3); break;
        case 3: if (!e.CIL_AVANCADO && !s2) { this.contPecas = Math.max(0, this.contPecas - 1); this.ir(0); } break;
        case 4: robo = true; if (e.ROBO_FIM) this.ir(5); break;
        case 5: if (!e.ROBO_FIM && !s3) { this.contPecas = Math.max(0, this.contPecas - 1); this.ir(0); } break;
      }
    }
    this.tPisca = (this.tPisca + dtMs) % 1000;
    if (liga) this.alarmeVisao = false;
    Object.assign(e, {
      MOTOR_ESTEIRA: motor, VISAO_TRIGGER: trigger, CILINDRO_REJEITO: cilindro, ROBO_PICK: robo,
      LAMP_VERDE: this.lampVerde, LAMP_VERMELHA: this.lampVermelha, LAMP_AMARELA: emerg && this.tPisca < 500,
      LAMP_SISTEMA: this.sistemaOn, ALIMENTADOR: this.sistemaOn && !emerg,
      SIRENE: (emerg || this.alarmeVisao) && this.tPisca < 300,
    });
  },
  diagnostico() { return { nomeEstado: NOMES_ESTADO[this.estado], contPecas: this.contPecas, sistemaOn: this.sistemaOn }; },
};
clp.reset();
const simulando = () => cfg.simulacao && !connected;

// ============================================================ LAÇOS
// Física da máquina (NÃO é polling Modbus — o polling é auto-agendado em cicloPolling)
let ultimo = process.hrtime.bigint();
let ultimoSim = '';
setInterval(() => {
  const agora = process.hrtime.bigint();
  const dt = Math.min(Number(agora - ultimo) / 1e9, 0.1);
  ultimo = agora;
  if (simulando()) {
    clp.scan(imagem, dt * 1000);
    const chave = valoresLeitura().map(Number).join('');
    if (chave !== ultimoSim) { ultimoSim = chave; io.emit('io_status', valoresLeitura()); }
  }
  passoPlanta(dt, imagem);
}, 20);

setInterval(() => {
  io.volatile.emit('estado', { ...instantaneo(), io: imagem, simulando: simulando(), clp: simulando() ? clp.diagnostico() : null });
}, 33);

setInterval(() => {
  io.emit('modbus_stats', { connected, fila: queue.length, pollingRate: POLLING_RATE_MS, ...stats });
}, 1000);

// ============================================================ SOCKET.IO
function pacoteConfig() {
  return {
    ip: cfg.ip, port: cfg.port, simulacao: cfg.simulacao,
    writeAddresses: cfg.writeAddresses, readAddresses: cfg.readAddresses,
    padrao: { writeAddresses: PADRAO_ESCRITA, readAddresses: PADRAO_LEITURA },
    sinais: { escritas: ESCRITAS, leituras: LEITURAS },
    geometria: G,
  };
}

io.on('connection', sock => {
  sock.emit('config_update', pacoteConfig());
  sock.emit('polling_rate_update', POLLING_RATE_MS);
  sock.emit('status_update', { connected });
  sock.emit('io_status', valoresLeitura());
  sock.emit('alimentacao', planta.alimentacao);
  historico.forEach(l => sock.emit('log', l));

  sock.on('connect_plc', async ({ ip, port } = {}) => {
    ip = String(ip || '').trim();
    port = Number(port) || 502;
    if (!ip) return log('ERRO: informe o IP do CLP.');
    if (port < 1 || port > 65535) return log('ERRO: porta inválida.');
    cfg.ip = ip;
    cfg.port = port;
    if (cfg.simulacao) { cfg.simulacao = false; clp.reset(); log('Simulação desativada: a lógica passa a ser a do CLP.'); }
    salvarConfig();
    zerarLeituras();
    io.emit('config_update', pacoteConfig());
    await conectarCLP(ip, port);
  });

  sock.on('disconnect_plc', () => desconectarCLP());

  // Só atualiza a variável: o laço em andamento usa o novo valor no próximo agendamento
  sock.on('set_polling_rate', ms => {
    POLLING_RATE_MS = Math.max(POLLING_MIN, Math.round(Number(ms)) || POLLING_PADRAO);
    cfg.pollingRate = POLLING_RATE_MS;
    salvarConfig();
    io.emit('polling_rate_update', POLLING_RATE_MS);
    log(`Taxa de polling: ${POLLING_RATE_MS} ms.`);
  });

  sock.on('set_config', (dados = {}, callback) => {
    const responder = typeof callback === 'function' ? callback : () => {};
    const w = (dados.writeAddresses || []).map(Number);
    const r = (dados.readAddresses || []).map(x => ({ address: Number(x?.address), type: x?.type }));
    const erros = validarEnderecos(w, r);
    if (erros.length) { log(`ERRO no mapa: ${erros.join(' ')}`); return responder({ success: false, erros }); }
    cfg.writeAddresses = w;
    cfg.readAddresses = r;
    errosConfig.clear();
    salvarConfig();
    if (connected) sincronizarEscritas();
    io.emit('config_update', pacoteConfig());
    log('Mapa de endereços salvo.');
    responder({ success: true });
  });

  // index 0..2 = LIGA, DESLIGA, EMERGÊNCIA (os sensores pertencem à máquina)
  sock.on('write_coil', ({ index, value } = {}) => {
    const s = ESCRITAS[Number(index)];
    if (s && s.nome.startsWith('BT_')) definirBotao(s.nome, !!value);
  });

  sock.on('set_simulacao', ativo => {
    if (ativo && connected) return log('Desconecte o CLP antes de ativar a simulação.');
    cfg.simulacao = !!ativo;
    salvarConfig();
    clp.reset();
    zerarLeituras();
    log(cfg.simulacao ? 'Simulação ativada: a lógica roda no CLP virtual.' : 'Simulação desativada.');
    io.emit('config_update', pacoteConfig());
  });

  sock.on('alimentacao', (d = {}) => {
    const a = planta.alimentacao;
    if (typeof d.auto === 'boolean') a.auto = d.auto;
    if (d.intervalo >= 0.8 && d.intervalo <= 20) a.intervalo = Number(d.intervalo);
    if (d.defeitoPct >= 0 && d.defeitoPct <= 100) a.defeitoPct = Number(d.defeitoPct);
    io.emit('alimentacao', a);
  });
  sock.on('inserirPeca', ({ bom } = {}) => inserirPeca(bom));
  sock.on('resetar_simulador', () => resetarSimulador());
  sock.on('zerarContadores', () => { planta.contadores = { total: 0, ok: 0, ng: 0, perdidas: 0 }; });
});

process.on('unhandledRejection', e => log(`ERRO interno: ${e?.message || e}`));
process.on('uncaughtException', e => log(`ERRO interno: ${e?.message || e}`));

servidor.listen(PORTA_HTTP, () => log(`Simulador no ar: http://localhost:${PORTA_HTTP}${cfg.simulacao ? ' · simulação ativa' : ''}`));
