'use strict';
// Cliente OPC UA do simulador. O CLP (XP325 ou CODESYS Control Win) é o servidor.
const EventEmitter = require('events');
const {
  OPCUAClient, AttributeIds, DataType, VariantArrayType, TimestampsToReturn, BrowseDirection,
  ClientSubscription, ClientMonitoredItemGroup, MessageSecurityMode, SecurityPolicy, NodeClass, resolveNodeId,
} = require('node-opcua');

// Variáveis da GVL_SIM (uma por sinal, sem vetores) vindas de server/tags.js
const TG = require('./tags');
const DT_OPC = { BOOL: DataType.Boolean, INT: DataType.Int16, UINT: DataType.UInt16, REAL: DataType.Float };
const TAGS = Object.fromEntries(TG.TAGS.map((t) => [t.nome, { dt: DT_OPC[t.tipo], dir: t.dir }]));
const LENTAS = ['HB_CLP', 'IHM_Nivel'];
const RAPIDAS = TG.doClp.map((t) => t.nome).filter((n) => !LENTAS.includes(n));

// valores com escala (× 100) viajam como INT também no OPC: o simulador multiplica ao escrever e divide ao ler
function variant(tag, valor) {
  const t = TAGS[tag], esc = (TG.porNome[tag].mb.escala || 1);
  return { dataType: t.dt, value: t.dt === DataType.Boolean ? !!valor : Math.round(Number(valor) * esc) };
}
function plano(v, tag) { const esc = tag && TG.porNome[tag] ? (TG.porNome[tag].mb.escala || 1) : 1; return esc > 1 && typeof v === 'number' ? v / esc : v; }

function createOpcClient(opts = {}) {
  const ev = new EventEmitter();
  const cfg = Object.assign({
    endpoint: 'opc.tcp://192.168.100.10:4840', user: null, password: null,
    prefixo: null,      // ex.: 'ns=4;s=|var|XP325.Application.GVL_SIM.' (fallback sem navegação)
    gvl: ['GVL_SIMULADOR', 'GVL_SIM'], publishRapida: 100, samplingRapida: 100, publishLenta: 1000, samplingLenta: 1000,
    pollingMs: 500, maxRetry: 2, log: () => {},
  }, opts);
  const st = {
    conectado: false, endpoint: cfg.endpoint, nos: {}, assinaturas: {}, polling: false,
    reconexoes: 0, erros: 0, ultimoErro: '', revisado: {},
  };
  let client = null, session = null, subs = [], pollTimer = null;

  async function acharGVL() {
    if (cfg.prefixo) {
      for (const tag of Object.keys(TAGS)) st.nos[tag] = resolveNodeId(cfg.prefixo + tag);
      return;
    }
    // navegação em profundidade a partir de Objects, pulando Server/Types
    const fila = [{ id: 'i=85', prof: 0 }];
    const visto = new Set();
    let gvlNode = null, gvlNome = "";
    while (fila.length && !gvlNode) {
      const { id, prof } = fila.shift();
      if (visto.has(String(id)) || prof > 10) continue;
      visto.add(String(id));
      const r = await session.browse({ nodeId: id, browseDirection: BrowseDirection.Forward, includeSubtypes: true, nodeClassMask: NodeClass.Object | NodeClass.Variable, resultMask: 63 });
      for (const ref of (r.references || [])) {
        const nome = ref.browseName.name;
        if ([].concat(cfg.gvl).includes(nome)) { gvlNode = ref.nodeId; gvlNome = nome; break; }
        if (nome === 'Server' || nome === 'Types' || nome === 'Views') continue;
        fila.push({ id: ref.nodeId, prof: prof + 1 });
      }
    }
    if (!gvlNode) throw new Error(`GVL "${[].concat(cfg.gvl).join('" ou "')}" não encontrada por navegação; informe o prefixo do NodeId`);
    const r = await session.browse({ nodeId: gvlNode, browseDirection: BrowseDirection.Forward, includeSubtypes: true, nodeClassMask: NodeClass.Variable, resultMask: 63 });
    for (const ref of (r.references || [])) if (TAGS[ref.browseName.name]) st.nos[ref.browseName.name] = ref.nodeId;
    const faltam = Object.keys(TAGS).filter(t => !st.nos[t]);
    if (faltam.length) throw new Error(`Variáveis ausentes na ${gvlNome}: ${faltam.join(', ')}`);
  }

  async function assinar(nome, tags, publish, sampling, prioridade) {
    const sub = ClientSubscription.create(session, {
      requestedPublishingInterval: publish, requestedLifetimeCount: 100, requestedMaxKeepAliveCount: 10,
      maxNotificationsPerPublish: 0, publishingEnabled: true, priority: prioridade,
    });
    await new Promise((res, rej) => { sub.once('started', res); sub.once('internal_error', rej); });
    st.revisado[nome] = { publish: sub.publishingInterval, pedidoPublish: publish, itens: tags.length };
    const itens = tags.map(tag => ({ nodeId: st.nos[tag], attributeId: AttributeIds.Value }));
    const grupo = ClientMonitoredItemGroup.create(sub, itens, { samplingInterval: sampling, discardOldest: true, queueSize: 1 }, TimestampsToReturn.Both);
    grupo.on('changed', (item, dv, idx) => {
      const tag = tags[idx];
      if (dv.statusCode.isGood()) ev.emit('leitura', { tag, valor: plano(dv.value.value, tag), ts: dv.sourceTimestamp });
    });
    grupo.on('initialized', () => {
      const rev = grupo.monitoredItems.map(m => m.result && m.result.revisedSamplingInterval).filter(x => x !== undefined);
      st.revisado[nome].sampling = rev.length ? rev[0] : null; st.revisado[nome].pedidoSampling = sampling;
      cfg.log(`assinatura ${nome}: publish ${publish}->${sub.publishingInterval} ms, sampling ${sampling}->${st.revisado[nome].sampling} ms`);
    });
    grupo.on('err', (e) => { st.erros++; st.ultimoErro = String(e); ev.emit('erro', e); });
    subs.push(sub);
    st.assinaturas[nome] = true;
  }

  async function iniciarPolling() {
    if (pollTimer) return;
    st.polling = true;
    const tags = [...RAPIDAS, ...LENTAS];
    pollTimer = setInterval(async () => {
      if (!session) return;
      try {
        const r = await session.read(tags.map(t => ({ nodeId: st.nos[t], attributeId: AttributeIds.Value })));
        r.forEach((dv, i) => { if (dv.statusCode.isGood()) ev.emit('leitura', { tag: tags[i], valor: plano(dv.value.value, tags[i]) }); });
      } catch (e) { st.erros++; st.ultimoErro = String(e); }
    }, cfg.pollingMs);
  }

  async function conectar() {
    client = OPCUAClient.create({
      endpointMustExist: false, keepSessionAlive: true, applicationName: 'EstacaoBombeamentoSim',
      securityMode: MessageSecurityMode.None, securityPolicy: SecurityPolicy.None,
      connectionStrategy: { initialDelay: 500, maxRetry: cfg.maxRetry ?? 2, maxDelay: 2000 },
      requestedSessionTimeout: 60000, transportTimeout: cfg.transportTimeout || 8000,
    });
    client.on('backoff', (n, delay) => cfg.log(`tentando conectar (${n}), próxima em ${delay} ms`));
    client.on('connection_lost', () => { st.conectado = false; ev.emit('conexao', false); cfg.log('conexão perdida'); });
    client.on('close', () => { st.conectado = false; ev.emit('conexao', false); });
    client.on('connection_reestablished', () => { st.conectado = true; st.reconexoes++; ev.emit('conexao', true); ev.emit('reconectado'); cfg.log('conexão restabelecida'); });
    await client.connect(cfg.endpoint);
    const ident = cfg.user ? { type: 1 /* UserName */, userName: cfg.user, password: cfg.password } : { type: 0 /* Anonymous */ };
    session = await client.createSession(ident);
    await acharGVL();
    st.conectado = true;
    try {
      await assinar('rapida', RAPIDAS, cfg.publishRapida, cfg.samplingRapida, 10);
      await assinar('lenta', LENTAS, cfg.publishLenta, cfg.samplingLenta, 1);
    } catch (e) {
      cfg.log(`assinatura falhou (${e.message}); usando polling`);
      await iniciarPolling();
    }
    ev.emit('conexao', true);
  }

  // writer para a fila: items = [{ tag, valor }]
  async function escrever(items) {
    if (!session || !st.conectado) throw new Error('sem sessão');
    const req = items.map(it => ({ nodeId: st.nos[it.tag], attributeId: AttributeIds.Value, value: { value: variant(it.tag, it.valor) } }));
    const codes = await session.write(req);
    const ruins = codes.map((c, i) => c.isGood() ? null : `${items[i].tag}: ${c.toString()}`).filter(Boolean);
    if (ruins.length) { st.erros++; st.ultimoErro = ruins.join('; '); throw new Error(`escrita recusada: ${ruins.join('; ')}`); }
  }

  async function ler(tags) {
    const r = await session.read(tags.map(t => ({ nodeId: st.nos[t], attributeId: AttributeIds.Value })));
    const out = {}; r.forEach((dv, i) => { out[tags[i]] = plano(dv.value.value, tags[i]); }); return out;
  }

  async function desconectar() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    for (const sb of subs) { try { await sb.terminate(); } catch (e) { /* ignora */ } }
    subs = [];
    try { if (session) await session.close(); } catch (e) { /* ignora */ }
    try { if (client) await client.disconnect(); } catch (e) { /* ignora */ }
    st.conectado = false; session = null; client = null;
  }

  function status() { return { conectado: st.conectado, endpoint: st.endpoint, polling: st.polling, reconexoes: st.reconexoes, erros: st.erros, ultimoErro: st.ultimoErro, assinaturas: st.revisado }; }

  return Object.assign(ev, { conectar, escrever, ler, desconectar, status, TAGS, RAPIDAS, LENTAS });
}

module.exports = { createOpcClient, TAGS };
