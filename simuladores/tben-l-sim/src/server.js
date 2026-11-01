'use strict';
/**
 * TBEN-L-SIM: servidor do simulador.
 *   - roda a planta (core/sim.js) a cada 5 ms
 *   - escolhe quem comanda as saídas: CLP demo, manual ou CODESYS (via PROFINET)
 *   - conversa com o driver PROFINET (pn/driver-bridge.js)
 *   - serve a cena 3D e o painel (public/) por HTTP + WebSocket
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { PORTS, DEV, IOL_CALL_INDEX, EVENTS, MODELS, VDS_TXT, cfgFromBytes } = require('./core/portmap');
const { Sim } = require('./core/sim');
const { DemoPlc } = require('./core/demo-plc');
const isdu = require('./core/isdu');
const { DriverBridge } = require('./pn/driver-bridge');
const iolCall = require('./pn/iol-call');

// ---------- Configuração ----------
const DEFAULTS = {
  http: { host: '0.0.0.0', port: 8080 },
  mode: 'demo',
  driver: { enabled: true, autostart: true, interface: 'enp0s8', stationName: 'tben-l-sim', storage: '/var/lib/tben-sim', verbose: true, echoToConsole: false },
  ipc: { nodePort: 50100, driverPort: 50101 }
};
function loadConfig() {
  const file = path.resolve(__dirname, '../config.json');
  const user = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const merge = (a, b) => { for (const k of Object.keys(b)) a[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) ? merge({ ...(a[k] || {}) }, b[k]) : b[k]; return a; };
  const cfg = merge(JSON.parse(JSON.stringify(DEFAULTS)), user);
  if (process.env.TBEN_IFACE) cfg.driver.interface = process.env.TBEN_IFACE;
  if (process.env.TBEN_NO_DRIVER || process.argv.includes('--sem-profinet')) cfg.driver.enabled = false;
  if (process.env.PORT) cfg.http.port = +process.env.PORT;
  if (process.env.SIM_HTTP_PORT) cfg.http.port = +process.env.SIM_HTTP_PORT;   // [HUB] porta definida pelo HUB
  return cfg;
}
const cfg = loadConfig();

// ---------- Núcleo ----------
const logHistory = [];
let wss = null;
const sim = new Sim();
function log(e) {
  const entry = { t: e.t || Date.now(), text: e.text, kind: e.kind || 'info' };
  logHistory.push(entry); if (logHistory.length > 150) logHistory.shift();
  broadcast({ type: 'log', entry });
}
sim.on('log', log);
sim.on('iolEvent', e => broadcast({ type: 'iolEvent', e }));
const plc = new DemoPlc((text, kind) => log({ text, kind }));
const OUT_DEMO = PORTS.map(p => new Uint8Array(p.outLen));
const OUT_MANUAL = PORTS.map(p => new Uint8Array(p.outLen));
let mode = ['demo', 'manual', 'codesys'].includes(cfg.mode) ? cfg.mode : 'demo';

let bridge = null;
if (cfg.driver.enabled) {
  bridge = new DriverBridge(cfg);
  bridge.on('log', log);
  bridge.on('ar', on => log({ text: on ? 'CODESYS conectado: relação de aplicação (AR) PROFINET ativa' : 'Conexão PROFINET encerrada: saídas no estado seguro (zeradas)', kind: on ? 'ok' : 'diag' }));
  bridge.on('iolcall', req => {
    const res = iolCall.handle(sim, req);
    bridge.iolReply(res.buf);
    const idx = '0x' + (res.index || 0).toString(16).toUpperCase().padStart(4, '0');
    const err = res.ok ? '' : ` recusado (erro 0x${res.buf.subarray(8, 10).toString('hex').toUpperCase()})`;
    log({ text: `IOL_CALL do CLP: ${res.write ? 'escrita' : 'leitura'} na porta ${res.port} (X${res.port - 1}), índice ${idx}${res.ok ? ' OK' : err}`, kind: res.ok ? 'ok' : 'diag' });
  });
  bridge.on('portcfg', (n, bytes) => {
    const r = sim.configure(n, cfgFromBytes(bytes), 'CLP');
    if (!r.ok) log({ text: `X${n}: configuração de porta enviada pelo CLP recusada (${r.msg})`, kind: 'diag' });
  });
  bridge.start();
}

function outFor(n) {
  if (mode === 'demo') return OUT_DEMO[n];
  if (mode === 'manual') return OUT_MANUAL[n];
  return (bridge && bridge.outFor(n)) || sim.ZERO[n];
}

// ---------- Laço de simulação ----------
let last = process.hrtime.bigint();
setInterval(() => {
  const now = process.hrtime.bigint();
  const dt = Math.min(0.05, Number(now - last) / 1e9); last = now;
  if (mode === 'demo') plc.scan(dt, sim.IN, sim.PQI, OUT_DEMO);
  sim.step(dt, outFor);
  if (bridge) bridge.sendInputs(sim.IN, sim.PQI, sim.diagCodes());
}, 5);

// ---------- Estado para a tela ----------
const hex = a => Array.from(a);
function statePacket() {
  return {
    type: 'state', mode,
    world: sim.snapshot(),
    io: { IN: sim.IN.map(hex), PQI: hex(sim.PQI), OUT: PORTS.map(p => hex(outFor(p.n))) },
    ports: sim.portInfo(),
    plc: mode === 'demo' ? { state: plc.state, step: plc.stepText(), msg: plc.msg } : null,
    pn: bridge ? { driver: !!bridge.proc || bridge.ipcAlive, ipc: bridge.ipcAlive, ar: bridge.arConnected } : null,
    estop: sim.W.estop, feed: sim.W.feed, boxH: sim.W.boxH
  };
}

// ---------- HTTP ----------
const PUB = path.resolve(__dirname, '../public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.xml': 'application/xml', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/api/portmap') { res.writeHead(200, { 'Content-Type': MIME['.json'] }); return res.end(JSON.stringify({ PORTS, DEV, IOL_CALL_INDEX, EVENTS, MODELS })); }
  const VENDOR = { '/vendor/three.min.js': 'three/build/three.min.js', '/vendor/OrbitControls.js': 'three/examples/js/controls/OrbitControls.js' };
  if (VENDOR[url]) {
    try { const f = require.resolve(VENDOR[url]); res.writeHead(200, { 'Content-Type': MIME['.js'] }); return fs.createReadStream(f).pipe(res); }
    catch (_) { res.writeHead(404); return res.end('Rode npm install'); }
  }
  if (url.startsWith('/gsdml/')) {
    const f = path.resolve(__dirname, '../gsdml', path.basename(url));
    if (fs.existsSync(f)) { res.writeHead(200, { 'Content-Type': MIME['.xml'], 'Content-Disposition': `attachment; filename="${path.basename(f)}"` }); return fs.createReadStream(f).pipe(res); }
  }
  const file = path.join(PUB, url === '/' ? 'index.html' : url);
  if (!file.startsWith(PUB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Não encontrado'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

// ---------- WebSocket ----------
wss = new WebSocketServer({ server });
function broadcast(msg) { const s = JSON.stringify(msg); wss && wss.clients.forEach(c => { if (c.readyState === 1) c.send(s); }); }
wss.on('connection', ws => {
  const gsdml = fs.existsSync(path.resolve(__dirname, '../gsdml')) ? fs.readdirSync(path.resolve(__dirname, '../gsdml')).filter(f => f.endsWith('.xml')) : [];
  ws.send(JSON.stringify({ type: 'init', PORTS, DEV, MODELS, VDS_TXT, events: sim.S.map(st => st.events), logs: logHistory, gsdml, driverEnabled: !!bridge, iface: cfg.driver.interface, station: cfg.driver.stationName }));
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (_) { return; }
    handle(m, ws);
  });
});
function handle(m, ws) {
  const W = sim.W;
  switch (m.t) {
    case 'pb': if (['start', 'stop', 'reset'].includes(m.key)) W.pb[m.key] = !!m.v; break;
    case 'estop': W.estop = !!m.v; log({ text: W.estop ? 'Emergência pressionada: relé de segurança cortou a energia dos atuadores' : 'Emergência destravada. Pressione Rearmar', kind: W.estop ? 'diag' : 'info' }); break;
    case 'feed': W.feed = !!m.v; break;
    case 'boxH': if ([0.25, 0.30, 0.35].includes(+m.v)) { W.boxH = +m.v; log({ text: `Novas caixas com ${Math.round(W.boxH * 1000)} mm de altura` }); } break;
    case 'scene': sim.reset(); plc.reset(); break;
    case 'mode':
      if (!['demo', 'manual', 'codesys'].includes(m.mode) || m.mode === mode) break;
      if (m.mode === 'codesys' && !bridge) { log({ text: 'Modo CODESYS indisponível: o driver PROFINET está desativado em config.json', kind: 'diag' }); break; }
      mode = m.mode; OUT_DEMO.forEach(o => o.fill(0)); OUT_MANUAL.forEach(o => o.fill(0)); plc.reset();
      log({ text: mode === 'demo' ? 'CLP demo assumiu a célula. Pressione Partir' : mode === 'manual' ? 'Modo manual: comande as saídas pela aba Dados de processo' : (bridge.arConnected ? 'CODESYS assumiu a célula' : 'Modo CODESYS: aguardando o controlador conectar. Saídas zeradas até lá') });
      break;
    case 'fault': {
      const st = sim.S[m.port]; if (!st || !['disc', 'short', 'fx'].includes(m.k)) break;
      st[m.k] = !!m.v; log({ text: `X${m.port} ${PORTS[m.port].tag}: falha "${m.label || m.k}" ${st[m.k] ? 'injetada' : 'removida'}`, kind: st[m.k] ? 'diag' : 'info' });
      break;
    }
    case 'cfg': {
      if (mode === 'codesys' && bridge && bridge.arConnected) { log({ text: 'Com o CODESYS conectado, a configuração da porta vem do CLP (registro 0x0200). Altere no CODESYS.', kind: 'diag' }); break; }
      const r = sim.configure(m.port, m.cfg, 'tela');
      if (!r.ok) log({ text: `X${m.port}: configuração recusada (${r.msg})`, kind: 'diag' });
      break;
    }
    case 'replace': if (sim.S[m.port] && [0, 1].includes(m.alt)) sim.replaceDevice(m.port, m.alt); break;
    case 'dsClear': if (sim.S[m.port]) sim.clearBackup(m.port); break;
    case 'out': if (mode === 'manual' && OUT_MANUAL[m.port] && Array.isArray(m.data)) m.data.slice(0, OUT_MANUAL[m.port].length).forEach((v, i) => { OUT_MANUAL[m.port][i] = v & 255; }); break;
    case 'isduList': ws.send(JSON.stringify({ type: 'isduList', port: m.port, conn: sim.conn(m.port), rows: isdu.list(sim, m.port) })); break;
    case 'isduWrite': {
      const r = isdu.writeValue(sim, m.port, m.x, m.v);
      const idx = '0x' + m.x.toString(16).toUpperCase().padStart(4, '0');
      log({ text: r.ok ? `X${m.port} ${PORTS[m.port].tag}: ISDU ${idx} gravado com ${r.value}` : `X${m.port}: escrita ISDU ${idx} recusada, ${r.msg}`, kind: r.ok ? 'ok' : 'diag' });
      ws.send(JSON.stringify({ type: 'isduList', port: m.port, conn: sim.conn(m.port), rows: isdu.list(sim, m.port) }));
      break;
    }
  }
}
setInterval(() => broadcast(statePacket()), 50);

server.listen(cfg.http.port, cfg.http.host, () => {
  console.log(`TBEN-L-SIM pronto em http://${cfg.http.host === '0.0.0.0' ? 'localhost' : cfg.http.host}:${cfg.http.port}`);
  console.log(`Modo inicial: ${mode}. Driver PROFINET: ${bridge ? 'ativo na interface ' + cfg.driver.interface : 'desativado'}`);
  log({ text: `Simulador iniciado em modo ${mode}` });
});
const stop = () => { if (bridge) bridge.stop(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
