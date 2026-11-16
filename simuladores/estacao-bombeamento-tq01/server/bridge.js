'use strict';
// Liga o motor físico ao CLP (Modbus TCP, OPC UA ou OPC DA): laço de 20 ms, fila de escrita, leituras, heartbeats.
// A troca é feita por variáveis com nome próprio (server/tags.js), sem vetores.
const EventEmitter = require('events');
const { createPhysics } = require('./physics');
const { PriorityWriteQueue, TagWriter } = require('./queue');
const { createOpcClient } = require('./opcua-client');
const { createOpcDaClient } = require('./opcda-client');
const { createModbusClient } = require('./modbus-client');
const cat = require('./catalog');
const TG = require('./tags');

const DT = 0.02;

function createBridge(opts = {}) {
  const ev = new EventEmitter();
  const log = opts.log || (() => {});
  const fis = createPhysics(opts.physics || {});
  const fundo = fis.canais.fundoEscala;
  const estadoComm = { clpConectado: false, clpParado: false, hbClp: 0, hbClpTempo: 0, hbSim: 0, hbAcc: 0, ultimaLeitura: 0, modo: 'sem CLP' };
  const ihm = { vel: 75, sp: 2.0, nivel: null };   // IHM do operador: velocidade desejada (%) e nível mostrado (m), via registradores do CLP
  let opc = null, fila = null, writer = null, timer = null, velocidade = 1, congelado = false;
  let desejado = null, conectando = false, supervisorTimer = null;

  // cada sinal é uma variável com nome próprio (server/tags.js); deadband só nas analógicas
  const deadbands = Object.fromEntries(TG.TAGS.filter((t) => t.deadband).map((t) => [t.nome, t.deadband]));
  const { ED, SD } = cat;
  const DI_TAG = { S1_Liga: ED.LIGA, S2_Desliga_NF: ED.DESLIGA, S3_Reset: ED.RESET, S4_Auto: ED.AUTO, S0_Emerg_NF: ED.EMERG, Inv_Rodando: ED.INV_RODANDO, Inv_OK: ED.INV_OK, LSHH: ED.LSHH, LSLL: ED.LSLL };
  const DO_TAG = { H1: SD.H1_VERDE, H2: SD.H2_AMARELO, H3: SD.H3_VERMELHO, H4: SD.H4_SIRENE, Inv_Gira: SD.INV_RUN, Inv_Reset: SD.INV_RESET };
  const doArr = new Array(16).fill(false);
  const vivos = {};   // último valor de cada variável (nos dois sentidos), para a tela

  function valoresSim() {
    const e = fis.entradasCLP();
    const v = {};
    for (const [nome, i] of Object.entries(DI_TAG)) v[nome] = !!e.DI[i];
    v.LT01_Bruto = e.AI_RAW[0];
    v.IHM_Velocidade = ihm.vel;
    v.IHM_Setpoint = ihm.sp;
    v.HB_Sim = estadoComm.hbSim;
    return v;
  }

  function publicarNoCLP() {
    estadoComm.hbAcc += DT;
    if (estadoComm.hbAcc >= 1) { estadoComm.hbAcc = 0; estadoComm.hbSim = (estadoComm.hbSim + 1) & 0xffff; }
    const v = valoresSim();
    Object.assign(vivos, v);
    if (!writer) return;
    for (const t of TG.doSim) writer.escrever(t.nome, v[t.nome], t.prio);
  }

  function aplicarLeitura(tag, valor) {
    vivos[tag] = valor;
    if (tag in DO_TAG) { doArr[DO_TAG[tag]] = !!valor; fis.setDO(doArr); }
    else if (tag === 'Ref_Bruto') fis.setAO([Number(valor) || 0, 0], null);
    else if (tag === 'HB_CLP') { if (valor !== estadoComm.hbClp) { estadoComm.hbClp = valor; estadoComm.hbClpTempo = 0; } }
    else if (tag === 'IHM_Nivel') ihm.nivel = typeof valor === 'number' ? valor : null;
  }

  function passo() {
    if (!congelado) for (let i = 0; i < velocidade; i++) fis.tick(DT);
    // watchdog do CLP
    estadoComm.hbClpTempo += DT;
    estadoComm.clpParado = estadoComm.clpConectado && estadoComm.hbClpTempo > 3;
    if (fis._s.falhas.comunicacao) return; // falha injetada: congela heartbeat e escritas
    publicarNoCLP();
  }

  async function desconectarCLP() {
    desejado = null;
    writer = null;
    if (fila) { fila.parar(); fila = null; }
    if (opc) { const o = opc; opc = null; await o.desconectar(); }
    estadoComm.clpConectado = false; estadoComm.clpParado = false; estadoComm.modo = 'sem CLP';
  }

  // tenta de novo a cada 5 s enquanto houver um CLP desejado e a conexão estiver caída
  async function supervisor() {
    if (!desejado || conectando) return;
    if (opc && estadoComm.clpConectado) return;
    conectando = true;
    try { await conectarCLP(desejado, true); log('CLP reconectado'); }
    catch (e) { estadoComm.ultimoErro = e.message; }
    finally { conectando = false; }
  }

  async function conectarCLP(cfg, interno = false) {
    if (!interno) { await desconectarCLP(); desejado = Object.assign({}, cfg); }
    else { writer = null; if (fila) { fila.parar(); fila = null; } if (opc) { const o = opc; opc = null; await o.desconectar(); } }
    if (!supervisorTimer) supervisorTimer = setInterval(supervisor, 5000);
    opc = cfg.protocolo === 'opcda' ? createOpcDaClient(Object.assign({ log }, cfg)) : cfg.protocolo === 'modbus' ? createModbusClient(Object.assign({ log }, cfg)) : createOpcClient(Object.assign({ log }, cfg));
    fila = new PriorityWriteQueue((items) => opc.escrever(items), Object.assign({}, cfg.protocolo === 'opcda' ? { periodos: { 1: 200, 2: 1000 } } : {}, cfg.fila || {}));
    const tw = new TagWriter(fila, deadbands);
    fila.on('degradou', (lat) => log(`latência ${lat} ms: fila em modo lento`));
    fila.on('recuperou', () => log('fila de volta ao modo normal'));
    fila.on('erro', (e) => log(`escrita: ${e.message}`));
    opc.on('leitura', ({ tag, valor }) => { estadoComm.ultimaLeitura = Date.now(); aplicarLeitura(tag, valor); });
    opc.on('conexao', (ok) => { estadoComm.clpConectado = ok; estadoComm.modo = ok ? 'OPC UA' : 'desconectado'; });
    opc.on('reconectado', () => { tw.ult.clear(); fila.ressincronizar(); });
    try { await opc.conectar(); }
    catch (e) { const o = opc; opc = null; fila.parar(); fila = null; await o.desconectar().catch(() => {}); estadoComm.ultimoErro = e.message; throw e; }
    estadoComm.clpConectado = true; estadoComm.modo = cfg.protocolo === 'opcda' ? 'OPC DA' : cfg.protocolo === 'modbus' ? 'Modbus TCP' : 'OPC UA'; estadoComm.ultimoErro = ''; estadoComm.hbClpTempo = 0;
    // leitura inicial das saídas do CLP e envio do estado completo
    try { const v = await opc.ler(TG.doClp.map((t) => t.nome)); for (const [k, x] of Object.entries(v)) if (x !== undefined && x !== null) aplicarLeitura(k, x); } catch (e) { log(`leitura inicial: ${e.message}`); }
    writer = tw; // só a partir daqui a física publica no CLP
    fila.iniciar();
    return opc.status();
  }

  function iniciar() { if (!timer) timer = setInterval(passo, DT * 1000); }
  async function parar() { if (timer) { clearInterval(timer); timer = null; } if (supervisorTimer) { clearInterval(supervisorTimer); supervisorTimer = null; } await desconectarCLP(); }

  function comando(c) {
    if (c.tipo === 'sim') { if (c.velocidade) velocidade = Math.max(1, Math.min(10, c.velocidade | 0)); if (c.congelar !== undefined) congelado = !!c.congelar; return true; }
    if (c.tipo === 'ihm') { if (typeof c.vel === 'number') ihm.vel = Math.max(0, Math.min(100, Math.round(c.vel))); if (typeof c.sp === 'number') ihm.sp = Math.max(0, Math.min(3, Math.round(c.sp * 100) / 100)); return true; }
    return fis.comando(c);
  }

  function estado() {
    const e = fis.estado();
    e.comm = Object.assign({}, estadoComm, opc ? opc.status() : {}, fila ? { fila: fila.pendentes(), stats: fila.stats, lento: fila.lento } : {}, { desejado: desejado ? { endpoint: desejado.endpoint, prefixo: desejado.prefixo || '', user: desejado.user || '', protocolo: desejado.protocolo || 'opcua', progId: desejado.progId || '', host: desejado.host || '', port: desejado.port || '', unitId: desejado.unitId || '' } : null, conectando });
    e.sim = { velocidade, congelado };
    e.ihm = { vel: ihm.vel, sp: ihm.sp, nivel: ihm.nivel };
    e.tags = Object.assign({}, vivos);
    return e;
  }

  return Object.assign(ev, { fis, iniciar, parar, conectarCLP, desconectarCLP, comando, estado, passo, get fila() { return fila; }, get opc() { return opc; } });
}

module.exports = { createBridge, DT };
