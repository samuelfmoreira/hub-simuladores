'use strict';
// Testes: node tools/test-sim.js [fisica|fila|opcua|opcda|modbus|tudo]
const assert = require('assert');
const fs = require('fs'), path = require('path');
const { createPhysics } = require('../server/physics');
const { PriorityWriteQueue, TagWriter } = require('../server/queue');
const { ED, SD } = require('../server/catalog');

const resultados = [];
async function teste(nome, fn) {
  const t0 = Date.now();
  try { await fn(); resultados.push([nome, 'ok', Date.now() - t0]); console.log(`  ok   ${nome}`); }
  catch (e) { resultados.push([nome, 'FALHOU', Date.now() - t0]); console.log(`  FALHOU ${nome}: ${e.message}`); if (process.env.DEBUG) console.log(e.stack); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const EEPROM = path.join(__dirname, '..', 'server', 'data', 'eeprom.json');
function roda(ph, segundos) { const n = Math.round(segundos / 0.02); for (let i = 0; i < n; i++) ph.tick(0.02); return ph.estado(); }
function novaFisica(extra = {}) { try { fs.unlinkSync(EEPROM); } catch (e) { /* sem EEPROM */ } return createPhysics(Object.assign({ ruido: false }, extra)); }
const fRef = (ph, pct) => pct / 100 * ph.drive.getParam(134);   // 10 V na AI1 = P0134
function ligarBomba(ph, pct = 75) {
  const dO = new Array(16).fill(false); dO[SD.INV_RUN] = true; ph.setDO(dO);
  ph.setAO([Math.round(pct / 100 * ph.canais.fundoEscala), 0], null);   // contagem do D/A, como no hardware
}

// ------------------------------------------------------------------ física
async function fisica() {
  console.log('Física');
  await teste('primeira energização deixa o CFW500 parametrizado para a bancada analógica', () => {
    const ph = novaFisica(); const P = ph.drive.params();
    assert(ph.drive.real, 'modelo real do CFW500'); assert.strictEqual(P[220], 1); assert.strictEqual(P[134], 60); assert.strictEqual(P[233], 0); assert.strictEqual(P[251], 5);
  });
  await teste('bomba a 75 % (45 Hz) enche o tanque; a 100 % entram ~18 m³/h', () => {
    const ph = novaFisica(); ph.comando({ tipo: 'cons', valor: 0 });
    ligarBomba(ph, 75);
    let e = roda(ph, 30);
    assert(Math.abs(e.inv.fHz - fRef(ph, 75)) < 0.5, `f = ${e.inv.fHz}`);
    assert(e.qIn > 10 && e.qIn < 14, `vazão ${e.qIn}`);
    assert(e.di[ED.INV_RODANDO] && e.di[ED.INV_OK], 'retornos do inversor');
    const h1 = e.h; e = roda(ph, 120); assert(e.h > h1 + 0.15, `nível subiu ${h1} -> ${e.h}`);
    ligarBomba(ph, 100); e = roda(ph, 30); assert(e.qIn > 17 && e.qIn < 20, `vazão a 100 % ${e.qIn}`);
  });
  await teste('abaixo de ~36 Hz a bomba não vence a altura estática (vazão zero)', () => {
    const ph = novaFisica(); ligarBomba(ph, 40); const e = roda(ph, 30);
    assert(Math.abs(e.inv.fHz - 24) < 0.5 && e.qIn === 0, `f ${e.inv.fHz} q ${e.qIn}`);
  });
  await teste('Ref_Bruto 24575 (75 % de 32767) = 7,5 V = 45 Hz', () => {
    const ph = novaFisica(); ligarBomba(ph, 75); const e = roda(ph, 30);
    assert(Math.abs(e.inv.fHz - fRef(ph, 75)) < 0.5 && Math.abs(e.ao.sinais.ref.valor - 7.5) < 0.01, `f = ${e.inv.fHz}`);
  });
  await teste('inversor em LOC ignora o comando do CLP', () => {
    const ph = novaFisica(); ligarBomba(ph, 75); ph.comando({ tipo: 'param', n: 220, v: 2 }); const e = roda(ph, 20);
    assert(e.inv.fHz === 0 && e.inv.locRem === 'LOC', `f = ${e.inv.fHz} ${e.inv.locRem}`);
  });
  await teste('botão Parametrizar: volta REM, 60 Hz e sinal da AI1 igual ao canal SA0', () => {
    const ph = novaFisica(); ph.comando({ tipo: 'param', n: 220, v: 2 }); ph.comando({ tipo: 'param', n: 134, v: 66 }); ph.comando({ tipo: 'canal', grupo: 'sa', ch: 0, modo: '4-20' });
    ph.comando({ tipo: 'comissionar' }); const r = ph.ultimoComissionamento(); const P = ph.drive.params();
    assert(r.erros.length === 0 && P[220] === 1 && P[134] === 60 && P[233] === 1, JSON.stringify({ r, P }));
    ligarBomba(ph, 75); roda(ph, 20); ph.comando({ tipo: 'comissionar' }); assert(ph.ultimoComissionamento().erros.length === 1, 'recusa com o motor girando');
  });
  await teste('emergência: o 2º NF do S0 corta a DI1 por hardware, mesmo com o CLP mandando girar', () => {
    const ph = novaFisica(); ligarBomba(ph, 75); roda(ph, 20);
    ph.comando({ tipo: 'cogumelo', acionado: true }); let e = roda(ph, 0.1);
    assert(!e.di[ED.EMERG] && e.do[SD.INV_RUN] && !e.quadro.di1 && e.inv.power, 'DI1 cortada com o CLP ainda mandando');
    e = roda(ph, 15); assert(e.inv.fHz < 1 && !e.di[ED.INV_RODANDO] && e.di[ED.INV_OK], `motor parou pela rampa ${e.inv.fHz}`);
  });
  await teste('disjuntor Q1: desligado tira a alimentação (relés caem); religado volta ao boot', () => {
    const ph = novaFisica(); ligarBomba(ph, 75); roda(ph, 20);
    ph.comando({ tipo: 'disjuntor', on: false }); let e = roda(ph, 15);
    assert(!e.quadro.q1 && !e.inv.power && e.inv.fHz < 1 && !e.di[ED.INV_OK], `sem força ${e.inv.fHz}`);
    ph.comando({ tipo: 'falha', nome: 'disjuntor', on: true }); ph.comando({ tipo: 'disjuntor', on: true }); e = roda(ph, 3); assert(e.inv.power && e.di[ED.INV_OK], 'religou');
  });
  await teste('canal SA0 em 4–20 mA com a AI1 em 0–10 V: referência errada (didático)', () => {
    const ph = novaFisica(); ligarBomba(ph, 75); ph.comando({ tipo: 'canal', grupo: 'sa', ch: 0, modo: '4-20' }); const e = roda(ph, 30);
    assert(Math.abs(e.inv.fHz - fRef(ph, 40)) < 1, `f = ${e.inv.fHz} (esperado ${fRef(ph, 40)})`);
  });
  await teste('fio rompido no LT-01: 0 mA, bruto negativo (−8192), engenharia negativa', () => {
    const ph = novaFisica(); ph.comando({ tipo: 'falha', nome: 'fioRompidoLT01', on: true }); const e = roda(ph, 1); const m = e.sensores['LT-01'];
    assert(m.sinal === 0 && m.st === 'fioRompido', `sinal ${m.sinal} ${m.st}`);
    assert(m.raw === -Math.round(0.25 * ph.canais.fundoEscala), `raw ${m.raw}`); assert(m.eng < 0, `eng ${m.eng}`);
    const in1 = ph.entradasCLP(); assert(in1.AI_RAW[0] === m.raw, 'chega como LT01_Bruto');
  });
  await teste('canal EA0 em 0–20 mA com transmissor 4–20: bruto deslocado, AI_ENG continua certo', () => {
    const ph = novaFisica(); const certo = roda(ph, 2).sensores['LT-01'].raw;
    ph.comando({ tipo: 'canal', grupo: 'ea', ch: 0, modo: '0-20' }); const m = roda(ph, 2).sensores['LT-01'];
    assert(m.raw > certo + 1000, `raw ${m.raw} vs ${certo}`); assert(Math.abs(m.engCanal - 1.9) < 0.1, `engCanal ${m.engCanal}`); assert(Math.abs(m.eng - 1.5) < 0.01, 'AI_ENG');
  });
  await teste('consumo esvazia o tanque: LSLL atua com histerese; a 75 % enche de volta e LSHH atua', () => {
    const ph = novaFisica({ params: { hInicial: 0.5 } }); ph.comando({ tipo: 'cons', valor: 1 });
    let e = roda(ph, 800); assert(e.h < 0.25 && e.di[ED.LSLL], `h ${e.h} LSLL ${e.di[ED.LSLL]}`);
    ligarBomba(ph, 100); ph.comando({ tipo: 'cons', valor: 0 }); e = roda(ph, 150); assert(!e.di[ED.LSLL], `LSLL soltou h=${e.h}`);
    e = roda(ph, 1100); assert(e.di[ED.LSHH] && e.transbordo, `h ${e.h} LSHH ${e.di[ED.LSHH]}`);
  });
  await teste('falha do inversor: relé OK cai, motor para por inércia, reset pela DI3', () => {
    const ph = novaFisica(); ligarBomba(ph, 75); roda(ph, 20);
    ph.comando({ tipo: 'falha', nome: 'inversor', on: true }); let e = roda(ph, 15);
    assert(!e.di[ED.INV_OK] && e.inv.falha && e.inv.fHz < 1, `ok ${e.di[ED.INV_OK]} falha ${e.inv.codFalha} f ${e.inv.fHz}`);
    ph.comando({ tipo: 'falha', nome: 'inversor', on: false });
    const dO = ph.estado().do; dO[SD.INV_RESET] = true; ph.setDO(dO); roda(ph, 0.2); dO[SD.INV_RESET] = false; ph.setDO(dO);
    e = roda(ph, 20); assert(e.di[ED.INV_OK] && e.inv.fHz > 40, `voltou f=${e.inv.fHz}`);
  });
  await teste('botoeiras: NA/NF e trava do cogumelo', () => {
    const ph = novaFisica(); let e = roda(ph, 0.1);
    assert(!e.di[ED.LIGA] && e.di[ED.DESLIGA] && e.di[ED.EMERG], 'repouso');
    ph.comando({ tipo: 'btn', id: 'S2', down: true }); e = roda(ph, 0.1); assert(!e.di[ED.DESLIGA], 'S2 NF abre');
    ph.comando({ tipo: 'btn', id: 'S2', down: false }); ph.comando({ tipo: 'btn', id: 'S1', down: true }); e = roda(ph, 0.1); assert(e.di[ED.LIGA] && e.di[ED.DESLIGA], 'S1 NA fecha');
    ph.comando({ tipo: 'cogumelo' }); e = roda(ph, 0.1); assert(!e.di[ED.EMERG], 'S0 travado');
    ph.comando({ tipo: 'cogumelo' }); e = roda(ph, 0.1); assert(e.di[ED.EMERG], 'S0 destravado');
    ph.comando({ tipo: 'seletor', pos: 'auto' }); e = roda(ph, 0.1); assert(e.di[ED.AUTO], 'S4 auto');
  });
  await teste('ruído e atraso do LT-01 dentro do especificado', () => {
    try { fs.unlinkSync(EEPROM); } catch (e) { /* ok */ }
    const ph = createPhysics({}); const vals = []; for (let i = 0; i < 250; i++) { ph.tick(0.02); vals.push(ph.estado().sensores['LT-01'].eng); }
    const med = vals.reduce((a, b) => a + b) / vals.length, sd = Math.sqrt(vals.reduce((a, b) => a + (b - med) ** 2, 0) / vals.length);
    assert(Math.abs(med - 1.5) < 0.01 && sd > 0.001 && sd < 0.02, `média ${med} desvio ${sd}`);
  });
}

// ------------------------------------------------------------------ fila
async function fila() {
  console.log('Fila de escrita');
  function escritorFalso(latMs = 5, falhar = () => false) {
    const chamadas = [];
    const w = async (items) => { chamadas.push(items.map(i => ({ tag: i.tag, valor: Array.isArray(i.valor) ? i.valor.slice() : i.valor }))); await sleep(typeof latMs === 'function' ? latMs() : latMs); if (falhar(items)) throw new Error('recusado'); };
    return { w, chamadas };
  }
  await teste('coalescência: 5 valores no mesmo tag viram 1 escrita com o último', async () => {
    const { w, chamadas } = escritorFalso(); const q = new PriorityWriteQueue(w, { periodos: { 1: 50, 2: 500 } }); q.iniciar();
    for (let i = 1; i <= 5; i++) q.enfileirar('AI_RAW', [i], 1); await sleep(120); q.parar();
    assert.strictEqual(chamadas.length, 1); assert.deepStrictEqual(chamadas[0][0].valor, [5]);
  });
  await teste('P0 sai imediatamente, antes de qualquer tick', async () => {
    const { w, chamadas } = escritorFalso(); const q = new PriorityWriteQueue(w, { periodos: { 1: 500, 2: 5000 } }); q.iniciar();
    q.enfileirar('AI_RAW', [1], 1); q.enfileirar('DI', [true], 0); await sleep(30); q.parar();
    assert.strictEqual(chamadas.length, 1); assert.strictEqual(chamadas[0][0].tag, 'DI'); assert.strictEqual(q.pendentes()[1], 1);
  });
  await teste('uma requisição em voo: P0 espera a resposta anterior e sai logo depois', async () => {
    const { w, chamadas } = escritorFalso(150); const q = new PriorityWriteQueue(w, { periodos: { 1: 1000, 2: 5000 } }); q.iniciar();
    q.enfileirar('DI', [true], 0); await sleep(20); q.enfileirar('DI', [false], 0);
    await sleep(60); assert.strictEqual(chamadas.length, 1, 'não disparou em paralelo'); await sleep(200); q.parar();
    assert.strictEqual(chamadas.length, 2); assert.deepStrictEqual(chamadas[1][0].valor, [false]);
  });
  await teste('degradação adaptativa com latência alta e recuperação', async () => {
    let lat = 300; const { w } = escritorFalso(() => lat);
    const q = new PriorityWriteQueue(w, { periodos: { 1: 20, 2: 2000 }, periodosLentos: { 1: 300, 2: 2500 }, janela: 3, limiarMs: 200, recuperaMs: 80 }); q.iniciar();
    let n = 0; const iv = setInterval(() => q.enfileirar('AI_RAW', [n++], 1), 10);
    await sleep(1200); assert(q.lento, 'entrou em modo lento'); assert.strictEqual(q.periodo(1), 300);
    lat = 5; await sleep(1500); clearInterval(iv); q.parar(); assert(!q.lento, 'recuperou');
  });
  await teste('erro de escrita: contabiliza e reenvia na próxima', async () => {
    let vez = 0; const { w, chamadas } = escritorFalso(1, () => ++vez === 1);
    const q = new PriorityWriteQueue(w, { periodos: { 1: 40, 2: 5000 } }); q.iniciar(); q.enfileirar('AI_RAW', [7], 1); await sleep(150); q.parar();
    assert.strictEqual(q.stats.erros, 1); assert(chamadas.length >= 2 && chamadas[1][0].valor[0] === 7);
  });
  await teste('ressincronizar reenvia o último valor de cada tag, P0 primeiro', async () => {
    const { w, chamadas } = escritorFalso(1); const q = new PriorityWriteQueue(w, { periodos: { 1: 30, 2: 60 } }); q.iniciar();
    q.enfileirar('AI_RAW', [1], 1); q.enfileirar('DI', [true], 0); q.enfileirar('HB_Sim', 3, 2); await sleep(150); const antes = chamadas.length;
    q.ressincronizar(); await sleep(150); q.parar(); const depois = chamadas.slice(antes).flat().map(i => i.tag);
    assert(depois[0] === 'DI' && depois.includes('AI_RAW') && depois.includes('HB_Sim'), depois.join(','));
  });
  await teste('TagWriter: deadband por elemento e detecção de mudança', () => {
    const q = { enfileirar() { this.n = (this.n || 0) + 1; } }; const tw = new TagWriter(q, { AI_ENG: [0.01, 0.5], AI_RAW: 60 });
    assert(tw.escrever('AI_ENG', [1.0, 10], 1)); assert(!tw.escrever('AI_ENG', [1.005, 10.4], 1)); assert(tw.escrever('AI_ENG', [1.02, 10.4], 1));
    assert(tw.escrever('DI', [true, false], 0)); assert(!tw.escrever('DI', [true, false], 0)); assert(tw.escrever('DI', [true, true], 0));
    assert(tw.escrever('AI_RAW', [1000], 1)); assert(!tw.escrever('AI_RAW', [1050], 1)); assert(tw.escrever('AI_RAW', [1100], 1)); assert.strictEqual(q.n, 6);
  });
}

// ------------------------------------------------------------------ cenário comum de integração (CLP de demonstração)
async function cenarioClp(ponte, verifica) {
  await teste('entradas chegam no CLP por nome (botoeiras em repouso, LT-01 em 15 bits e em metros)', async () => {
    await sleep(800);
    const v = await verifica();
    assert(v.S2_Desliga_NF && v.S0_Emerg_NF && !v.S1_Liga, 'contatos em repouso');
    const esperado = Math.round((4 + 16 * 1.5 / 3.5 - 4) / 16 * 32767);
    assert(Math.abs(v.LT01_Bruto - esperado) < 120, `LT01_Bruto ${v.LT01_Bruto} vs ${esperado}`);
    assert(Math.abs(v.IHM_Velocidade - 75) < 0.01 && Math.abs(v.IHM_Setpoint - 2) < 0.01, 'IHM');
  });
  await teste('heartbeat nos dois sentidos e inversor alimentado por Q1', async () => {
    await sleep(1500); const e = ponte.estado(); assert(e.comm.hbClp > 0 && !e.comm.clpParado, `HB_CLP ${e.comm.hbClp}`); assert(e.quadro.q1 && e.di[ED.INV_OK], 'Q1 / inversor OK'); assert(typeof e.tags.IHM_Nivel === 'number' && Math.abs(e.tags.IHM_Nivel - e.h) < 0.1, `IHM_Nivel ${e.tags.IHM_Nivel}`);
  });
  await teste('S1 parte a bomba via CLP: Inv_Gira -> inversor -> Inv_Rodando -> H1, 45 Hz, tanque enchendo', async () => {
    ponte.comando({ tipo: 'btn', id: 'S1', down: true }); await sleep(250); ponte.comando({ tipo: 'btn', id: 'S1', down: false });
    await sleep(700); let e = ponte.estado(); assert(e.do[SD.INV_RUN] && Math.abs(e.ao.raw[0] - 24575) < 3, `DO4 ${e.do[SD.INV_RUN]} Ref_Bruto ${e.ao.raw[0]}`);
    await sleep(7000); e = ponte.estado(); assert(e.inv.fHz > 40 && e.di[ED.INV_RODANDO] && e.do[SD.H1_VERDE], `f ${e.inv.fHz}`); assert(e.qIn > 8, `vazão ${e.qIn}`);
  });
  await teste('fio rompido: CLP desliga a bomba e sinaliza falha; reset limpa', async () => {
    ponte.comando({ tipo: 'falha', nome: 'fioRompidoLT01', on: true }); await sleep(900);
    let e = ponte.estado(); assert(!e.do[SD.INV_RUN] && e.do[SD.H3_VERMELHO], `DO ${e.do.join('')}`);
    ponte.comando({ tipo: 'falha', nome: 'fioRompidoLT01', on: false });
    ponte.comando({ tipo: 'btn', id: 'S3', down: true }); await sleep(250); ponte.comando({ tipo: 'btn', id: 'S3', down: false }); await sleep(500);
    e = ponte.estado(); assert(!e.do[SD.H3_VERMELHO], 'reset');
  });
  await teste('sem erros, latência baixa, até 15 escritas/s', async () => {
    await sleep(1500); const c = ponte.estado().comm; assert.strictEqual(c.stats.erros, 0, c.ultimoErro); assert(c.stats.lat < 50, `lat ${c.stats.lat}`); assert(c.stats.eps <= 15, `eps ${c.stats.eps}`);
  });
}

async function opcua() {
  console.log('OPC UA com XP325 falso');
  const { criarServidorFalso } = require('../server/fake/xp325-fake-server'); const { createBridge } = require('../server/bridge');
  try { fs.unlinkSync(EEPROM); } catch (e) { /* ok */ }
  const falso = await criarServidorFalso({ port: 4851 }); const url = await falso.iniciar();
  const ponte = createBridge({ log: () => {}, physics: { ruido: false } });
  try {
    await teste('conecta, acha a GVL_SIMULADOR por navegação e cria as duas assinaturas', async () => {
      const st = await ponte.conectarCLP({ endpoint: url }); assert(st.conectado && st.assinaturas.rapida && st.assinaturas.lenta, JSON.stringify(st)); assert.strictEqual(st.assinaturas.rapida.publish, 100);
    });
    ponte.iniciar();
    await cenarioClp(ponte, async () => Object.fromEntries(require('../server/tags').doSim.map((t) => [t.nome, falso.le(t.nome)])));
    await teste('watchdog: falha de comunicação injetada congela HB_Sim e o CLP vai para seguro', async () => {
      ponte.comando({ tipo: 'falha', nome: 'comunicacao', on: true }); await sleep(1200); const h0 = falso.le('HB_Sim'); await sleep(3500);
      assert.strictEqual(falso.le('HB_Sim'), h0, 'HB_Sim congelou'); assert(!falso.le('Inv_Gira') && falso.plc.comFalha, 'CLP detectou'); ponte.comando({ tipo: 'falha', nome: 'comunicacao', on: false });
    });
    await teste('conexão por prefixo de NodeId (sem navegação)', async () => {
      const { createOpcClient } = require('../server/opcua-client'); const cli = createOpcClient({ endpoint: url, prefixo: 'ns=1;s=|var|XP325.Application.GVL_SIMULADOR.' });
      await cli.conectar(); const v = await cli.ler(['HB_CLP', 'Inv_Gira', 'Ref_Bruto']); await cli.desconectar(); assert(typeof v.HB_CLP === 'number' && typeof v.Inv_Gira === 'boolean' && typeof v.Ref_Bruto === 'number', JSON.stringify(v));
    });
  } finally { await ponte.parar(); await falso.parar(); }
}

async function opcda() {
  console.log('OPC DA com ponte simulada');
  const { createBridge } = require('../server/bridge'); try { fs.unlinkSync(EEPROM); } catch (e) { /* ok */ }
  const ponte = createBridge({ log: () => {}, physics: { ruido: false } });
  try {
    await teste('conecta pela ponte (processo externo, protocolo JSON por linha)', async () => {
      const st = await ponte.conectarCLP({ protocolo: 'opcda', comando: { cmd: process.execPath, args: [path.join(__dirname, 'opcda', 'fake-ponte.js')] } });
      assert(st.conectado && st.protocolo === 'opcda' && st.itens === 22, JSON.stringify(st));
    });
    ponte.iniciar();
    await teste('heartbeat pela ponte; S1 parte a bomba', async () => {
      await sleep(1500); let e = ponte.estado(); assert(e.comm.hbClp > 0, 'HB');
      ponte.comando({ tipo: 'btn', id: 'S1', down: true }); await sleep(300); ponte.comando({ tipo: 'btn', id: 'S1', down: false }); await sleep(7000);
      e = ponte.estado(); assert(e.inv.fHz > 40 && e.di[ED.INV_RODANDO], `f ${e.inv.fHz}`);
    });
  } finally { await ponte.parar(); }
}

async function modbus() {
  console.log('Modbus TCP com CLP falso');
  const { criarClpModbusFalso } = require('../server/fake/clp-modbus-fake'); const { createBridge } = require('../server/bridge'); const TG = require('../server/tags');
  try { fs.unlinkSync(EEPROM); } catch (e) { /* ok */ }
  const falso = criarClpModbusFalso({ port: 1512, host: '127.0.0.1' }); await falso.iniciar();
  const ponte = createBridge({ log: () => {}, physics: { ruido: false } });
  try {
    await teste('conecta no servidor Modbus e valida o heartbeat', async () => {
      const st = await ponte.conectarCLP({ protocolo: 'modbus', host: '127.0.0.1', port: 1512, unitId: 1 }); assert(st.conectado && st.protocolo === 'modbus', JSON.stringify(st));
    });
    ponte.iniciar();
    await cenarioClp(ponte, async () => Object.fromEntries(TG.doSim.map((t) => [t.nome, falso.le(t.nome)])));
    await teste('endereços crus: coil 1 = S2_Desliga_NF, holding 0 = LT01_Bruto, holding 2 = IHM em %, holding 3 = IHM em cm, input 0 = Ref_Bruto', async () => {
      assert(falso.coils[1] === true && falso.coils[4] === true && falso.coils[0] === false, 'coils');
      assert(Math.abs(falso.holding[0] - ponte.estado().tags.LT01_Bruto) < 200, `holding 0 ${falso.holding[0]}`);
      assert(falso.holding[2] === 75 && falso.holding[3] === 200, `IHM ${falso.holding[2]} ${falso.holding[3]}`);
    });
    await teste('fio rompido chega negativo no holding register 0', async () => {
      ponte.comando({ tipo: 'falha', nome: 'fioRompidoLT01', on: true }); await sleep(900); assert(falso.holding[0] < -400, `holding 0 ${falso.holding[0]}`); ponte.comando({ tipo: 'falha', nome: 'fioRompidoLT01', on: false });
    });
  } finally { await ponte.parar(); await falso.parar(); }
}

(async () => {
  const qual = process.argv[2] || 'tudo';
  if (qual === 'fisica' || qual === 'tudo') await fisica();
  if (qual === 'fila' || qual === 'tudo') await fila();
  if (qual === 'opcua' || qual === 'tudo') await opcua();
  if (qual === 'opcda' || qual === 'tudo') await opcda();
  if (qual === 'modbus' || qual === 'tudo') await modbus();
  const falhas = resultados.filter(r => r[1] !== 'ok').length;
  console.log(`\n${resultados.length} testes, ${falhas} falha(s)`);
  process.exit(falhas ? 1 : 0);
})();
