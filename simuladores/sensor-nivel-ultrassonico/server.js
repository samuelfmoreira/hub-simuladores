'use strict';
/**
 * Sensor ultrassônico de nível LT-01: servidor do simulador (padrão do HUB de simuladores).
 *
 * Contrato do HUB:
 *   SIM_HTTP_PORT  porta da tela (sozinho: PORT ou 3320)
 *   SIM_IP         este simulador é CLIENTE Modbus TCP (não abre servidor de protocolo); o valor é só informativo
 *   HUB=1          iniciado pelo HUB: não abre navegador
 * Dados do usuário só em data/ (listada em preservarAoAtualizar; "Restaurar original" apaga a pasta).
 *
 * Vários alunos ao mesmo tempo: cada navegador entra numa SESSÃO (src/sessoes.js) com o seu tanque, o seu
 * transmissor e a sua conexão com o seu CLP. O CLP de demonstração de cada sessão escuta só em 127.0.0.1.
 *
 * Sem dependências: http + Server-Sent Events (tela ao vivo) + POST para os comandos.
 * O núcleo (src/nucleo.js) roda em passo fixo de 2 ms.
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Gerente } = require('./src/sessoes');
const TG = require('./src/tags');
const { PARAMETROS, SENSOR, GEO, FUNDO_AD } = require('./src/nucleo');
const { LIMITES } = require('./src/modbus/programa-demo');
const pkg = require('./package.json');

// ---------------------------------------------------------------- contrato do HUB
const PORTA_WEB = Number(process.env.SIM_HTTP_PORT || process.env.PORT || 3320);
const IP = process.env.SIM_IP || '0.0.0.0';
const NO_HUB = process.env.HUB === '1';
const PASTA_DADOS = path.join(__dirname, 'data');

function log(msg) { console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`); }   // aparece em "Mensagens do simulador"

// ---------------------------------------------------------------- sessões e núcleo
const gerente = new Gerente({ pastaDados: PASTA_DADOS, log });
const PASSO = 0.002;                  // 2 ms
let ultimo = process.hrtime.bigint();
setInterval(() => {
  const agora = process.hrtime.bigint();
  let dt = Number(agora - ultimo) / 1e9; ultimo = agora;
  dt = Math.min(dt, 0.1);             // o PC travou: não "pula" a física
  gerente.passo(dt, PASSO);
}, 10);
setInterval(() => gerente.tick(Date.now()), 50);      // varredura controlada da rede, por sessão

// ---------------------------------------------------------------- tela (arquivos estáticos + API)
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.pdf': 'application/pdf',
  '.ico': 'image/x-icon', '.st': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };
const assinantes = new Map();         // resposta SSE -> sessão

function json(res, cod, obj) { res.writeHead(cod, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }
function corpo(req) {
  return new Promise((resolve, reject) => {
    let c = '';
    req.on('data', (d) => { c += d; if (c.length > 1e5) { req.destroy(); reject(new Error('corpo grande demais')); } });
    req.on('end', () => { try { resolve(JSON.parse(c || '{}')); } catch (e) { reject(new Error('JSON inválido')); } });
    req.on('error', reject);
  });
}
function enderecos() {                // IPs deste PC, para o professor passar aos alunos
  const out = [];
  for (const lista of Object.values(os.networkInterfaces())) for (const i of lista || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  return out;
}
const textoArquivo = (rel) => { try { return fs.readFileSync(path.join(__dirname, rel), 'utf8'); } catch (_) { return ''; } };

const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url || '/', 'http://x');
  const rota = decodeURIComponent(u.pathname);
  const sessao = () => gerente.obter(u.searchParams.get('s'));
  try {
    if (rota === '/api/info') {
      return json(res, 200, { nome: 'Sensor ultrassônico de nível LT-01', versao: pkg.version, porta: PORTA_WEB, hub: NO_HUB, enderecos: enderecos(),
        tags: TG.tabelaDocs(), parametros: PARAMETROS, sensor: SENSOR, geo: GEO, fundoAd: FUNDO_AD, limitesDemo: LIMITES,
        st: { gvl: textoArquivo('docs/GVL_SIM.st'), io: textoArquivo('docs/PRG_Modbus_IO.st'), nivel: textoArquivo('docs/PRG_Nivel.st') } });
    }
    if (rota === '/api/sessoes' && req.method === 'GET') return json(res, 200, { sessoes: gerente.lista() });
    if (rota === '/api/sessoes' && req.method === 'POST') {
      const c = await corpo(req);
      if (c.excluir) return json(res, 200, { ok: await gerente.excluir(c.excluir) });
      const s = gerente.criar(c.nome);
      return json(res, 200, { ok: true, id: s.id, nome: s.nome });
    }
    if (rota === '/api/estado') { const s = sessao(); return s ? json(res, 200, s.retrato()) : json(res, 404, { ok: false, erro: 'sessão não encontrada' }); }
    if (rota === '/api/eventos') {        // estado ao vivo da sessão, 10 vezes por segundo
      const s = sessao();
      if (!s) return json(res, 404, { ok: false, erro: 'sessão não encontrada' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify(s.retrato())}\n\n`);
      assinantes.set(res, s); s.telas++; s.tocar();
      req.on('close', () => { if (assinantes.delete(res)) { s.telas = Math.max(0, s.telas - 1); s.tocar(); } });
      return;
    }
    if (rota === '/api/comando' && req.method === 'POST') {
      const s = sessao();
      if (!s) return json(res, 404, { ok: false, erro: 'sessão não encontrada' });
      return json(res, 200, await s.comando(await corpo(req)));
    }
  } catch (e) { return json(res, 400, { ok: false, erro: e.message }); }

  // arquivos estáticos (só dentro de public/)
  const arq = path.resolve(PUB, '.' + (rota === '/' ? '/index.html' : rota));
  if (!arq.startsWith(PUB) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end('não encontrado'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(arq).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(arq).pipe(res);
});
setInterval(() => {
  for (const [r, s] of assinantes) {
    if (!gerente.obter(s.id)) { r.write('event: fim\ndata: {}\n\n'); r.end(); assinantes.delete(r); continue; }   // sessão excluída
    r.write(`data: ${JSON.stringify(s.retrato())}\n\n`);
  }
}, 100);

srv.on('error', (e) => { log(e.code === 'EADDRINUSE' ? `a porta ${PORTA_WEB} da tela já está em uso` : `erro na tela: ${e.message}`); process.exit(1); });
srv.listen(PORTA_WEB, '0.0.0.0', () => {
  log(`Sensor ultrassônico de nível LT-01 v${pkg.version} pronto: http://localhost:${PORTA_WEB}${NO_HUB ? ' (iniciado pelo HUB)' : ''} | cliente Modbus TCP, IP informado: ${IP}`);
  const ips = enderecos();
  if (ips.length) log(`outros PCs da rede abrem por: ${ips.map((i) => `http://${i}:${PORTA_WEB}`).join('  ou  ')}`);
  if (!NO_HUB && process.env.OPEN_BROWSER === '1') {
    require('child_process').exec(`start "" http://localhost:${PORTA_WEB}`, { shell: 'cmd.exe' });   // só no Windows
  }
});

let encerrando = false;
async function encerrar() { if (encerrando) return; encerrando = true; log('encerrando'); try { await gerente.encerrar(); } catch (_) { /* ok */ } setTimeout(() => process.exit(0), 300); }
process.on('SIGINT', encerrar); process.on('SIGTERM', encerrar);
