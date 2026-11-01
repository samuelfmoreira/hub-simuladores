'use strict';
/**
 * Mapa de portas do TBEN-L-SIM: fonte única do contrato de dados.
 * Usado pelo simulador, pelo gerador de GSDML, pela tela 3D e pelo driver
 * (os tamanhos abaixo precisam bater com in_size/out_size em pn-driver/src/app_data.c).
 *
 * Cada porta vira um módulo PROFINET fixo no slot (porta + 1), subslot 1.
 * Entrada do submódulo = dados de processo do device + 1 byte PQI no final.
 * Todos os valores de 16 bits são big-endian, como no PROFINET.
 */

const bit = (l, b, i) => ({ l, t: 'bit', b, i });

/* ---------- Identidade IO-Link dos devices virtuais (fictícia, só para laboratório) ---------- */
const IOL_VENDOR_ID = 0x07A0;
/** Dois modelos por tipo: [0] o original da célula, [1] o substituto "parecido" usado nas trocas */
const MODELS = {
  roller: [
    { pid: 'MDR-24-IOL', product: 'Controlador de rolo motorizado MDR-24-IOL', did: 0x000101 },
    { pid: 'MDR-48-IOL', product: 'Controlador de rolo motorizado MDR-48-IOL (velocidade máx. 60%)', did: 0x000102, maxPct: 60 }],
  laser: [
    { pid: 'LDS-3000-IOL', product: 'Sensor laser LDS-3000-IOL (alcance 3000 mm)', did: 0x000201, range: 3000 },
    { pid: 'LDS-1500-IOL', product: 'Sensor laser LDS-1500-IOL (alcance 1500 mm)', did: 0x000202, range: 1500 }],
  valve: [
    { pid: 'VT4-IOL', product: 'Terminal de válvulas VT4-IOL', did: 0x000301 },
    { pid: 'VT8-IOL', product: 'Terminal de válvulas VT8-IOL', did: 0x000302 }],
  hub: [
    { pid: 'DI16-IOL', product: 'Hub de entradas DI16-IOL', did: 0x000401 },
    { pid: 'DI8-IOL', product: 'Hub de entradas DI8-IOL (só 8 entradas)', did: 0x000402, inputs: 8 }],
  drive: [
    { pid: 'VFD-0K75-IOL', product: 'Inversor VFD-0K75-IOL', did: 0x000501 },
    { pid: 'VFD-0K37-IOL', product: 'Inversor VFD-0K37-IOL (máx. 200 mm/s)', did: 0x000502, maxV: 200 }],
  light: [
    { pid: 'SL4-IOL', product: 'Torre sinaleira SL4-IOL', did: 0x000601 },
    { pid: 'SL3-IOL', product: 'Torre sinaleira SL3-IOL (sem sirene)', did: 0x000602 }]
};

/** Parâmetros de fábrica de um device novo (entram no Data Storage: todos os RW) */
const FACTORY = {
  roller: { 0x18: '', 0x40: 1000 }, laser: { 0x18: '', 0x3C: 1000 }, valve: { 0x18: '' },
  hub: { 0x18: '' }, drive: { 0x18: '', 0x50: 200 }, light: { 0x18: '' }
};
/** Parâmetros comissionados da célula (o que o backup do mestre guarda) */
const COMMISSIONED = [{ 0x40: 300 }, { 0x3C: 750 }, {}, {}, { 0x50: 400 }, { 0x3C: 1000 }, { 0x40: 300 }, {}];

/** Eventos IO-Link usados no simulador (códigos padrão da especificação IO-Link) */
const EVENTS = {
  0x1800: { t: 'Sem device na porta', type: 'erro', origin: 'porta' },
  0x1802: { t: 'Vendor ID incorreto', type: 'erro', origin: 'porta' },
  0x1803: { t: 'Device ID incorreto', type: 'erro', origin: 'porta' },
  0x1806: { t: 'Curto-circuito em L+', type: 'erro', origin: 'porta' },
  0x180A: { t: 'Backup inconsistente: identidade diferente', type: 'aviso', origin: 'porta' },
  0x4000: { t: 'Falha de temperatura: sobrecarga', type: 'erro', origin: 'device' },
  0x5000: { t: 'Falha de hardware do device', type: 'erro', origin: 'device' },
  0x8C00: { t: 'Falha de aplicação específica da tecnologia', type: 'erro', origin: 'device' },
  0x8C20: { t: 'Faixa de medição excedida', type: 'aviso', origin: 'device' },
  0x8C40: { t: 'Manutenção necessária: limpeza', type: 'aviso', origin: 'device' },
  0xFF91: { t: 'Data Storage: pedido de upload', type: 'notificação', origin: 'device' }
};

/** Configuração de porta (registro PROFINET 0x0200, 10 bytes) */
const PORT_CFG_INDEX = 0x0200;
const VDS_TXT = ['Sem verificação', 'Tipo compatível', 'Tipo compatível com Backup + Restore', 'Tipo compatível com Restore'];
const MIN_CYCLE_MS = 2;
function defaultCfg(dev) { return { mode: 1, vds: 2, cycle: 0, vid: IOL_VENDOR_ID, did: MODELS[dev][0].did }; }
function cfgToBytes(c) {
  const b = Buffer.alloc(10);
  b[0] = c.mode; b[1] = c.vds; b[2] = c.cycle; b[3] = 0; b.writeUInt16BE(c.vid, 4); b.writeUInt32BE(c.did >>> 0, 6);
  return b;
}
function cfgFromBytes(b) { return { mode: b[0], vds: b[1], cycle: b[2], vid: b.readUInt16BE(4), did: b.readUInt32BE(6) }; }
function cfgValid(c) {
  return [0, 1].includes(c.mode) && [0, 1, 2, 3].includes(c.vds) && Number.isInteger(c.cycle) && c.cycle >= 0 && c.cycle <= 100 &&
    Number.isInteger(c.vid) && c.vid >= 0 && c.vid <= 0xFFFF && Number.isInteger(c.did) && c.did >= 0 && c.did <= 0xFFFFFF;
}

const DEV = {
  roller: {
    product: 'Controlador de rolo motorizado MDR-IOL', pid: 'MDR-24-IOL',
    out: [bit('Liga motor', 0, 0), bit('Sentido reverso', 0, 1), bit('Reset de falha', 0, 2), { l: 'Velocidade (%)', t: 'u8', b: 1, max: 100 }],
    in: [bit('Rodando', 0, 0), bit('Falha', 0, 1), { l: 'Velocidade atual (%)', t: 'u8', b: 1 }],
    faults: [{ k: 'fx', l: 'Sobrecarga do motor', ev: 0x4000 }],
    isdu: [{ x: 0x40, l: 'Rampa de aceleração (ms)', rw: 'num', min: 50, max: 5000 }]
  },
  laser: {
    product: 'Sensor de distância a laser LDS-IOL', pid: 'LDS-3000-IOL',
    out: [],
    in: [{ l: 'Distância (mm)', t: 'u16', b: 0 }, bit('Medição válida', 2, 0), bit('Saída SP1', 2, 1), { l: 'Qualidade do sinal (%)', t: 'u8', b: 3 }],
    faults: [{ k: 'fx', l: 'Lente suja', ev: 0x8C40 }],
    isdu: [{ x: 0x3C, l: 'Ponto de comutação SP1 (mm)', rw: 'num', min: 50, max: 3000 }]
  },
  valve: {
    product: 'Terminal de válvulas VT4-IOL', pid: 'VT4-IOL',
    out: [bit('Y1 avançar empurrador', 0, 0), bit('Y2 recuar empurrador', 0, 1)],
    in: [bit('Pressão de ar OK', 0, 0), bit('Falha de bobina', 0, 1)],
    faults: [{ k: 'fx', l: 'Sem pressão de ar', ev: 0x8C00 }],
    isdu: [{ x: 0x45, l: 'Ciclos de comutação Y1', get: 'cycles' }]
  },
  hub: {
    product: 'Hub de entradas DI16-IOL', pid: 'DI16-IOL',
    out: [],
    in: [bit('I0 empurrador recuado', 0, 0), bit('I1 empurrador avançado', 0, 1), bit('I2 elevador no fim de curso inferior', 0, 2),
      bit('I3 elevador no fim de curso superior', 0, 3), bit('I4 pallet no elevador', 0, 4), bit('I5 pallet no fim da saída', 0, 5),
      bit('I6 botão partir', 0, 6), bit('I7 botão parar (NF)', 0, 7), bit('I8 botão rearmar', 1, 0), bit('I9 emergência OK (NF)', 1, 1)],
    faults: [], isdu: []
  },
  drive: {
    product: 'Inversor de frequência VFD-IOL', pid: 'VFD-0K75-IOL',
    out: [bit('Habilita', 0, 0), bit('Subir', 0, 1), bit('Descer', 0, 2), bit('Reset de falha', 0, 3), { l: 'Velocidade (mm/s)', t: 'u16', b: 2, max: 400 }],
    in: [bit('Pronto', 0, 0), bit('Em movimento', 0, 1), bit('Falha', 0, 2), bit('Freio liberado', 0, 3), { l: 'Código de falha', t: 'u8', b: 1 }, { l: 'Velocidade atual (mm/s)', t: 'u16', b: 2 }],
    faults: [{ k: 'fx', l: 'Sobrecorrente no inversor (F21)', ev: 0x5000 }],
    isdu: [{ x: 0x50, l: 'Velocidade máxima (mm/s)', rw: 'num', min: 10, max: 400 }]
  },
  light: {
    product: 'Torre sinaleira SL-IOL', pid: 'SL4-IOL',
    out: [bit('Verde', 0, 0), bit('Amarelo', 0, 1), bit('Vermelho', 0, 2), bit('Sirene', 0, 3)],
    in: [], faults: [], isdu: []
  }
};

const PORTS = [
  { n: 0, tag: 'C1', name: 'Esteira de entrada', dev: 'roller', inLen: 2, outLen: 2 },
  { n: 1, tag: 'B1', name: 'Sensor de altura da caixa', dev: 'laser', inLen: 4, outLen: 0 },
  { n: 2, tag: 'Y1', name: 'Válvulas do empurrador', dev: 'valve', inLen: 1, outLen: 1 },
  { n: 3, tag: 'K1', name: 'Hub de entradas digitais', dev: 'hub', inLen: 2, outLen: 0 },
  { n: 4, tag: 'M1', name: 'Inversor do elevador', dev: 'drive', inLen: 4, outLen: 4 },
  { n: 5, tag: 'B2', name: 'Sensor de posição do elevador', dev: 'laser', inLen: 4, outLen: 0 },
  { n: 6, tag: 'C2', name: 'Esteira de saída de pallets', dev: 'roller', inLen: 2, outLen: 2 },
  { n: 7, tag: 'H1', name: 'Torre sinaleira', dev: 'light', inLen: 0, outLen: 1 }
];

/** Códigos de erro de canal PROFINET usados nos diagnósticos das portas */
const DIAG = { SHORT_CIRCUIT: 0x0001, OVERLOAD: 0x0004, LINE_BREAK: 0x0006, ERROR: 0x0009, PARAMETERIZATION: 0x0010 };
/** Evento IO-Link -> erro de canal PROFINET (o código do evento vai no valor adicional) */
const EVENT_DIAG = { 0x1800: DIAG.LINE_BREAK, 0x1806: DIAG.SHORT_CIRCUIT, 0x1802: DIAG.PARAMETERIZATION, 0x1803: DIAG.PARAMETERIZATION, 0x4000: DIAG.OVERLOAD };

/** Erros ISDU devolvidos pelo gateway (padrão IO-Link: 0x80 + código) */
const ISDU_ERR = { NO_COMM: 0x8000, INDEX_NOT_AVAILABLE: 0x8011, ACCESS_DENIED: 0x8023, OUT_OF_RANGE: 0x8030 };

const IOL_CALL_INDEX = 0xB400;  // registro do IOL_CALL (Client Access Point)
const MODULE_ID_BASE = 0x101;
const SUBMODULE_ID_BASE = 0x201;

const u16 = (b, o) => (b[o] << 8) | b[o + 1];
function setU16(b, o, v) { v = Math.max(0, Math.min(65535, Math.round(v))); b[o] = v >> 8; b[o + 1] = v & 255; }
const getF = (buf, f) => f.t === 'bit' ? (buf[f.b] >> f.i) & 1 : f.t === 'u8' ? buf[f.b] : u16(buf, f.b);
function setF(buf, f, v) {
  if (f.t === 'bit') { if (v) buf[f.b] |= (1 << f.i); else buf[f.b] &= ~(1 << f.i); }
  else if (f.t === 'u8') buf[f.b] = Math.max(0, Math.min(f.max || 255, v | 0));
  else setU16(buf, f.b, Math.min(f.max || 65535, v));
}

Object.keys(DEV).forEach(k => { DEV[k].product = MODELS[k][0].product; DEV[k].pid = MODELS[k][0].pid; });

module.exports = {
  DEV, PORTS, DIAG, EVENT_DIAG, ISDU_ERR, IOL_CALL_INDEX, MODULE_ID_BASE, SUBMODULE_ID_BASE,
  IOL_VENDOR_ID, MODELS, FACTORY, COMMISSIONED, EVENTS, PORT_CFG_INDEX, VDS_TXT, MIN_CYCLE_MS,
  defaultCfg, cfgToBytes, cfgFromBytes, cfgValid, u16, setU16, getF, setF
};
