'use strict';
// XP325 falso: servidor OPC UA com a mesma GVL_SIM do projeto MasterTool e um
// "programa do aluno" de demonstração. Serve para testar o simulador sem o CLP real
// e como referência do que o CLP deve fazer. Não substitui a validação na bancada.
const { OPCUAServer, DataType, VariantArrayType, makeAccessLevelFlag, StatusCodes } = require('node-opcua');

const TG = require('../tags');
const { criarProgramaDemo } = require('./programa-demo');
const OPC_T = { BOOL: 'Boolean', INT: 'Int16', UINT: 'UInt16', REAL: 'Float' };
// nome, tipo OPC, 0 (escalar), escritor — uma variável por sinal, sem vetores
const DEF = TG.TAGS.map((t) => [t.nome, OPC_T[t.tipo], 0, t.dir]);

function zero(tipo, n) {
  if (n === 0) return tipo === 'Boolean' ? false : 0;
  if (tipo === 'Int16') return new Int16Array(n);
  if (tipo === 'Float') return new Float32Array(n);
  return new Array(n).fill(false);
}

async function criarServidorFalso(opts = {}) {
  const port = opts.port || 4840;
  const fundo = opts.fundoEscala || 32767;
  const server = new OPCUAServer({
    port, resourcePath: '', allowAnonymous: true, nodeset_filename: undefined,
    buildInfo: { productName: 'XP325-falso', manufacturerName: 'simulador', softwareVersion: '0.1.0' },
    serverCapabilities: { maxSessions: 50, operationLimits: { maxNodesPerRead: 1000, maxNodesPerWrite: 1000, maxMonitoredItemsPerCall: 1000, maxNodesPerBrowse: 1000 } },
  });
  await server.initialize();
  const as = server.engine.addressSpace;
  const ns = as.getOwnNamespace();
  // Mesma hierarquia que o CODESYS/MasterTool expõe
  const deviceSet = ns.addFolder(as.rootFolder.objects, { browseName: 'DeviceSet' });
  const dev = ns.addObject({ organizedBy: deviceSet, browseName: opts.nomeDispositivo || 'XP325' });
  const res = ns.addObject({ componentOf: dev, browseName: 'Resources' });
  const app = ns.addObject({ componentOf: res, browseName: 'Application' });
  const gv = ns.addObject({ componentOf: app, browseName: 'GlobalVars' });
  const gvl = ns.addObject({ componentOf: gv, browseName: 'GVL_SIMULADOR' });
  const vars = {};
  for (const [nome, tipo, n, escritor] of DEF) {
    const v = zero(tipo, n);
    vars[nome] = ns.addVariable({
      componentOf: gvl, browseName: nome, nodeId: `s=|var|XP325.Application.GVL_SIMULADOR.${nome}`,
      dataType: tipo, valueRank: n ? 1 : -1, arrayDimensions: n ? [n] : null,
      accessLevel: makeAccessLevelFlag(escritor === 'sim' ? 'CurrentRead | CurrentWrite' : 'CurrentRead'),
      minimumSamplingInterval: 100,
      value: { dataType: DataType[tipo], arrayType: n ? VariantArrayType.Array : VariantArrayType.Scalar, value: v },
    });
  }
  const esc = (nome) => (TG.porNome[nome] ? TG.porNome[nome].mb.escala || 1 : 1);
  const le = (nome) => { const v = vars[nome].readValue().value.value; return typeof v === 'number' ? v / esc(nome) : v; };
  const escreve = (nome, valor) => {
    const [, tipo, n] = DEF.find(d => d[0] === nome);
    let v = tipo === 'Boolean' ? !!valor : tipo === 'Float' ? Number(valor) : Math.round(Number(valor) * esc(nome));
    if (n) v = tipo === 'Int16' ? Int16Array.from(valor) : tipo === 'Float' ? Float32Array.from(valor) : valor.map(Boolean);
    vars[nome].setValueFromSource({ dataType: DataType[tipo], arrayType: n ? VariantArrayType.Array : VariantArrayType.Scalar, value: v }, StatusCodes.Good);
  };

  // ---------------- programa de demonstração ("aluno"), o mesmo do CLP Modbus falso ----------------
  const prog = criarProgramaDemo({ le, escreve, fundo, demo: opts.demo });
  const plc = prog.plc, DEMO = prog.DEMO;
  let timer = null;
  const scan = prog.scan;

  async function iniciar() {
    await server.start();
    if (opts.demo !== false) timer = setInterval(() => scan(DEMO.scanMs / 1000), DEMO.scanMs);
    return server.getEndpointUrl();
  }
  async function parar() { if (timer) clearInterval(timer); await server.shutdown(100); }

  return { server, vars, le, escreve, iniciar, parar, plc, endpoint: () => server.getEndpointUrl() };
}

module.exports = { criarServidorFalso, DEF };

if (require.main === module) {
  const port = Number(process.argv[2] || process.env.OPC_PORT || 4840);
  criarServidorFalso({ port }).then(async (f) => {
    const url = await f.iniciar();
    console.log(`XP325 falso ouvindo em ${url}  (programa de demonstração ativo)`);
    process.on('SIGINT', async () => { await f.parar(); process.exit(0); });
  }).catch(e => { console.error(e); process.exit(1); });
}
