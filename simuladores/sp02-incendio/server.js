'use strict';
/**
 * Simulador Sistema de Incêndio — cliente Modbus TCP (exercício SP02)
 * Servidor web local: serve a interface (pasta public) e a API das sessões.
 * Sem dependências externas: só Node.js.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { SessionManager } = require('./src/session-manager');
const { COILS, DISCRETE_INPUTS, KP } = require('./src/process-sim');
const { sswMeta } = require('./src/ssw05');
const pkg = require('./package.json');
const testPlc = require('./tools/clp-teste');
const os = require('os');

// Rodando como .exe (empacotado)? Então os dados vão para %LOCALAPPDATA%, que sempre aceita gravação.
const PACKAGED = !!process.pkg;
const PORT = parseInt(process.env.SIM_HTTP_PORT || process.env.PORT || '3000', 10);   // [HUB] porta da tela definida pelo HUB
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC = path.join(__dirname, 'public');
const OPEN_BROWSER = PACKAGED || process.env.OPEN_BROWSER === '1';
const DATA_DIR = PACKAGED
  ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'SimuladorSP02')
  : path.join(__dirname, 'config');
process.title = 'Simulador Sistema de Incendio (Modbus TCP)';
let plcTest = null; // CLP virtual de teste embutido

/** Na primeira execução do .exe no Windows, cria o atalho na área de trabalho. */
function firstRunShortcut() {
  if (!PACKAGED || process.platform !== 'win32') return;
  const flag = path.join(DATA_DIR, 'atalho-criado-v2');
  if (fs.existsSync(flag)) return;
  const exe = process.execPath.replace(/'/g, "''");
  const dir = path.dirname(process.execPath).replace(/'/g, "''");
  const ps = [
    "$d=[Environment]::GetFolderPath('Desktop')",
    "$o=Join-Path $d 'Simulador SP02.lnk'; if (Test-Path $o) { Remove-Item $o -ErrorAction SilentlyContinue }",
    "$s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d 'Simulador Sistema de Incendio.lnk'))",
    `$s.TargetPath='${exe}'`, `$s.WorkingDirectory='${dir}'`,
    "$s.Description='Simulador Sistema de Incendio (Modbus TCP)'", '$s.Save()',
  ].join('; ');
  require('child_process').execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { windowsHide: true }, (err) => {
    if (!err) {
      try { fs.writeFileSync(flag, new Date().toISOString()); } catch (_) { /* */ }
      console.log('  Atalho "Simulador Sistema de Incêndio" criado na área de trabalho.');
    }
  });
}

function openBrowser() {
  if (!OPEN_BROWSER) return;
  const url = `http://localhost:${PORT}`;
  const { exec } = require('child_process');
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}
let manager = null; // criado só depois que a porta abrir (evita 2 instâncias gravando o mesmo arquivo)

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.json': 'application/json; charset=utf-8',
};

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 100000) { reject(new Error('Corpo muito grande')); req.destroy(); } });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(new Error('JSON inválido')); } });
    req.on('error', reject);
  });
}

function serveStatic(pathname, res) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Não encontrado'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

async function api(req, res, parts) {
  const m = req.method;
  // /api/meta
  if (parts[0] === 'meta' && m === 'GET') {
    return json(res, 200, { version: pkg.version, coils: COILS, discreteInputs: DISCRETE_INPUTS, kp: KP, ssw: sswMeta() });
  }
  // /api/test-plc  — CLP virtual de teste embutido
  if (parts[0] === 'test-plc') {
    if (m === 'GET') return json(res, 200, { running: !!plcTest, port: plcTest?.port || null });
    if (m === 'POST' && parts[1] === 'start') {
      const b = await body(req);
      const port = Math.min(65535, Math.max(1, parseInt(b.port, 10) || 502));
      if (plcTest) return json(res, 200, { running: true, port: plcTest.port });
      try {
        plcTest = await testPlc.start(port, (t) => console.log('  ' + t));
      } catch (e) {
        const msg = e.code === 'EADDRINUSE' ? `A porta ${port} já está em uso por outro programa (CLP, CODESYS ou outro simulador).` : e.message;
        return json(res, 409, { error: msg });
      }
      return json(res, 200, { running: true, port: plcTest.port });
    }
    if (m === 'POST' && parts[1] === 'stop') {
      if (plcTest) { await plcTest.close(); plcTest = null; }
      return json(res, 200, { running: false });
    }
  }
  if (parts[0] !== 'sessions') return json(res, 404, { error: 'Rota inexistente' });

  // /api/sessions/mine — sessão própria deste PC (pelo IP de quem acessa)
  if (parts[1] === 'mine' && m === 'GET') {
    let ip = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    const key = ip === '127.0.0.1' || ip === '::1' || ip === '' ? 'local' : ip;
    const s = manager.forClient(key);
    return json(res, 200, { id: s.id, name: s.name, owner: key });
  }
  // /api/sessions
  if (parts.length === 1) {
    if (m === 'GET') return json(res, 200, manager.list());
    if (m === 'POST') { const b = await body(req); const s = manager.create(b.name); return json(res, 201, { id: s.id, name: s.name }); }
  }

  const s = manager.get(parts[1]);
  if (!s) return json(res, 404, { error: 'Sessão não encontrada' });

  if (parts.length === 2) {
    if (m === 'PATCH') { const b = await body(req); manager.rename(s.id, b.name); return json(res, 200, { id: s.id, name: s.name }); }
    if (m === 'DELETE') { manager.remove(s.id); return json(res, 200, { ok: true }); }
  }

  switch (parts[2]) {
    case 'stream': {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 2000\n\n');
      s.attach(res);
      const ka = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) { /* */ } }, 15000);
      req.on('close', () => { clearInterval(ka); s.detach(res); });
      return undefined;
    }
    case 'config': { const b = await body(req); s.setConfig(b); return json(res, 200, s.config); }
    case 'connect': s.connect(); return json(res, 200, { ok: true });
    case 'disconnect': s.disconnect(); return json(res, 200, { ok: true });
    case 'clear-log': s.clearLogs(); return json(res, 200, { ok: true });
    case 'action': { const b = await body(req); s.sim.action(b); return json(res, 200, { ok: true }); }
    default: return json(res, 404, { error: 'Rota inexistente' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    if (parts[0] === 'api') {
      if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) return json(res, 405, { error: 'Método não permitido' });
      await api(req, res, parts.slice(1));
    } else {
      serveStatic(url.pathname, res);
    }
  } catch (e) {
    if (!res.headersSent) json(res, 400, { error: e.message });
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  A porta ${PORT} já está em uso. O simulador provavelmente já está aberto em outra janela.`);
    console.error(`  Abrindo no navegador: http://localhost:${PORT}\n`);
    openBrowser();
    setTimeout(() => process.exit(1), 1500);
    return;
  } else {
    console.error(e);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  manager = new SessionManager(path.join(DATA_DIR, 'sessions.json'));
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log('');
  console.log(`  Simulador Sistema de Incêndio (Modbus TCP)  v${pkg.version}`);
  console.log(`  Neste PC:        http://localhost:${PORT}`);
  ips.forEach((ip) => console.log(`  Em outros PCs:   http://${ip}:${PORT}`));
  console.log(`  Dados salvos em:  ${DATA_DIR}`);
  console.log('');
  console.log('  Mantenha esta janela aberta enquanto usar o simulador.');
  console.log('  Para encerrar, feche esta janela.');
  console.log('');
  openBrowser();
  firstRunShortcut();
});

function shutdown() {
  if (manager) manager.shutdown();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
