/* =============================================================================
 *  SIMULADOR SCA06 + ECO5 (EtherNet/IP adapter) — servidor principal
 *  ---------------------------------------------------------------------------
 *  node server.js            → http://localhost:3000  (bancada 3D + painéis)
 *
 *  Processos internos:
 *    1. "Firmware" do drive  (public/core/sca06-core.js)   — ciclo de 5 ms
 *    2. Adapter EtherNet/IP  (src/enip/adapter.js)         — TCP 44818, UDP 2222, UDP 44818
 *    3. Modbus TCP (2 conexões, ECO5)  (src/modbus/server.js) — TCP 502 (ou 5020)
 *    4. Servidor WEB do acessório  (/webserver)            — [ETH cap. 10]
 *    5. Scanner didático (mestre virtual)                  — fala EtherNet/IP real com o adapter
 *    6. HTTP + WebSocket para a interface 3D
 * ===========================================================================*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const Core = require('./public/core/sca06-core.js');
const { EnipAdapter } = require('./src/enip/adapter');
const { VirtualScanner } = require('./src/enip/scanner');
const { ModbusServer } = require('./src/modbus/server');
const webserver = require('./src/web/drive-webserver');

const ROOT = __dirname;
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
// [HUB] quando iniciado pelo HUB, as variáveis de ambiente têm prioridade sobre o config.json
if (process.env.SIM_HTTP_PORT) cfg.httpPort = Number(process.env.SIM_HTTP_PORT);
if (process.env.SIM_IP) cfg.enip.bindAddress = process.env.SIM_IP;
if (process.env.SIM_IP && process.env.SIM_IP !== '0.0.0.0') cfg.enip.hostIp = process.env.SIM_IP;   // IP informado no ListIdentity (Scan do CODESYS)
if (process.env.SIM_MODBUS) cfg.modbus.port = Number(process.env.SIM_MODBUS);
const EEPROM = path.join(ROOT, 'data', 'eeprom.json');

// ------------------------------------------------------------------ "EEPROM"
let saved = {};
if (cfg.persistParams && fs.existsSync(EEPROM)) { try { saved = JSON.parse(fs.readFileSync(EEPROM, 'utf8')); } catch (_) { } }
let persistTimer = null;
const persist = (obj) => {
  if (!cfg.persistParams) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => { fs.mkdirSync(path.dirname(EEPROM), { recursive: true }); fs.writeFileSync(EEPROM, JSON.stringify(obj, null, 1)); }, 400);
};

// ------------------------------------------------------------------ eventos p/ interface
const logBuf = [];
const pushLog = (e) => { logBuf.push(e); if (logBuf.length > 400) logBuf.shift(); };

const drive = new Core.SCA06Drive({ saved, onPersist: persist, onLog: (e) => pushLog({ t: Date.now(), dir: 'drv', proto: 'SCA06', summary: e.msg, level: e.level }) });
const adapter = new EnipAdapter(drive, cfg.enip);
adapter.on('log', (e) => pushLog(e));
adapter.on('info', (m) => { pushLog({ t: Date.now(), dir: 'info', proto: 'ENIP', summary: m }); console.log('[ENIP]', m); });
adapter.on('warn', (m) => console.warn('[ENIP]', m));
adapter.on('error', (e) => { console.error(`\n[ENIP] ERRO: ${e.message}`); if (e.code === 'EADDRINUSE') console.error('       Outra aplicação já usa a porta 44818/2222 (outro simulador? RSLinx?). Feche-a e tente de novo.\n'); });
adapter.start();

const scanner = new VirtualScanner();
scanner.on('log', (e) => pushLog(e));

let modbus = null;
function startModbus(port, isFallback) {
  modbus = new ModbusServer(drive, { port, bind: cfg.enip.bindAddress, maxConnections: cfg.modbus.maxConnections, online: () => adapter.online() });   // [HUB] Modbus no mesmo IP do adapter
  modbus.on('log', (e) => pushLog({ t: Date.now(), ...e }));
  modbus.on('listening', (p) => console.log(`[MBTCP] Modbus TCP ouvindo na porta ${p}${isFallback ? ' (porta 502 indisponível; rode como administrador para usar 502)' : ''}`));
  modbus.on('error', (e) => { if (!isFallback && (e.code === 'EACCES' || e.code === 'EADDRINUSE')) startModbus(cfg.modbus.fallbackPort, true); else console.warn('[MBTCP]', e.message); });
  modbus.start();
}
if (cfg.modbus.enabled) startModbus(cfg.modbus.port, false);

// ------------------------------------------------------------------ laço do "firmware"
let last = process.hrtime.bigint();
setInterval(() => {
  const now = process.hrtime.bigint();
  const dt = Math.min(0.05, Number(now - last) / 1e9); last = now;
  drive.step(dt);
}, 5);

// ------------------------------------------------------------------ HTTP estático
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.eds': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/webserver')) return webserver.handle(req, res, drive, url);
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  let file;
  if (p.startsWith('/docs/')) file = path.join(ROOT, p);
  else file = path.join(ROOT, 'public', p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ------------------------------------------------------------------ WebSocket
const wss = new WebSocketServer({ server });
const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.logIdx = Math.max(0, logBuf.length - 150);
  ws.send(JSON.stringify({
    t: 'init', defs: Core.DEFS, params: drive.allParams(), diFuncs: Core.DI_FUNCS, codes: Core.CODES,
    info: { httpPort: cfg.httpPort, enip: { tcp: cfg.enip.tcpPort, udp: cfg.enip.udpPort }, modbusPort: modbus ? modbus.port : null, deviceIp: adapter.deviceIp(), identity: adapter.id, backend: true }
  }));
  ws.on('message', async (raw) => {
    let m; try { m = JSON.parse(raw); } catch (_) { return; }
    const reply = (o) => ws.readyState === 1 && ws.send(JSON.stringify(Object.assign({ t: 'reply', id: m.id }, o)));
    try {
      if (m.t === 'param') { const r = drive.write(m.n, m.v, 'ui'); if (r.ok && m.hmi) drive.hmiFlash(m.n); reply({ result: r }); }
      else if (m.t === 'bench') drive.benchSet(m.key, !!m.value);
      else if (m.t === 'hmi') drive.hmiKey(m.key);
      else if (m.t === 'scanner') reply({ result: await scannerOp(m) });
    } catch (e) { reply({ error: e.message }); }
  });
  ws.on('close', () => clients.delete(ws));
});

async function scannerOp(m) {
  switch (m.op) {
    case 'connect': await scanner.connect(m.host || (cfg.enip.bindAddress !== '0.0.0.0' ? cfg.enip.bindAddress : '127.0.0.1'), cfg.enip.tcpPort); return { ok: true, identity: await scanner.listIdentity() };   // [HUB] adapter preso a um IP
    case 'disconnect': scanner.disconnect(); return { ok: true };
    case 'identity': return { ok: true, identity: await scanner.listIdentity() };
    case 'open': await scanner.forwardOpen({ inWords: m.inWords, outWords: m.outWords, rpiMs: m.rpiMs || 20, cfgInst: m.cfgInst || 1 }); return { ok: true };
    case 'close': await scanner.forwardClose(); return { ok: true };
    case 'out': if (Array.isArray(m.words)) scanner.out = m.words.map(w => w | 0); return { ok: true };
    case 'run': scanner.run = !!m.value; return { ok: true };
    case 'get': return await scanner.getParam(m.n);
    case 'set': return await scanner.setParam(m.n, m.v);
  }
  return { ok: false };
}

setInterval(() => {
  if (!clients.size) { drive.takeDirty(); return; }
  const v = drive.view();
  const params = drive.takeDirty();
  const conns = adapter.connectionsView();
  const sc = scanner.view();
  const stats = adapter.stats;
  for (const ws of clients) {
    if (ws.readyState !== 1) continue;
    const logs = logBuf.slice(ws.logIdx); ws.logIdx = logBuf.length;
    ws.send(JSON.stringify({ t: 'view', v, params, conns, scanner: sc, stats, logs, deviceIp: adapter.deviceIp() }));
  }
}, 33);

server.listen(cfg.httpPort, () => {
  console.log('\n  ┌──────────────────────────────────────────────────────────────┐');
  console.log('  │  WEG SCA06 + ECO5 — Simulador EtherNet/IP (adapter)          │');
  console.log('  └──────────────────────────────────────────────────────────────┘');
  console.log(`  Bancada 3D ........... http://localhost:${cfg.httpPort}`);
  console.log(`  Servidor WEB (ECO5) .. http://localhost:${cfg.httpPort}/webserver/`);
  console.log(`  EtherNet/IP .......... TCP ${cfg.enip.tcpPort} | UDP ${cfg.enip.udpPort} (I/O) | IP do adapter: ${adapter.deviceIp()}`);
  console.log(`  Assemblies ........... Entrada (T→O) = 100 | Saída (O→T) = 150 | Config = qualquer (tamanho 0)\n`);
});
process.on('SIGINT', () => { scanner.disconnect(); process.exit(0); });
