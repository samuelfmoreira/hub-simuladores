'use strict';
/**
 * Bancada CFW500: servidor do simulador (modelo do HUB de simuladores).
 *
 * Contrato do HUB:
 *   SIM_HTTP_PORT  porta da tela (sozinho: PORT ou 3350)
 *   HUB=1          iniciado pelo HUB (sozinho, OPEN_BROWSER=1 abre o navegador)
 * Este simulador não fala com CLP: é uma bancada de ligação. Toda a simulação (circuito, inversor, motor) roda no
 * navegador, em public/core/, e o que o aluno monta fica guardado no próprio navegador (localStorage).
 * Por isso este servidor só entrega os arquivos da tela e não guarda estado: cada aluno que abre a página (cada aba, cada PC
 * da rede) tem a sua SESSÃO INDEPENDENTE, e não há limite de alunos ao mesmo tempo. Sem dependências.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORTA_WEB = Number(process.env.SIM_HTTP_PORT || process.env.PORT || 3350);
const NO_HUB = process.env.HUB === '1';
function log(msg) { console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`); }   // aparece em "Mensagens do simulador"

const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8' };

const srv = http.createServer((req, res) => {
  let url; try { url = decodeURIComponent((req.url || '/').split('?')[0]); } catch (_) { res.writeHead(400); return res.end('endereço inválido'); }
  const arq = path.resolve(PUB, '.' + (url === '/' ? '/index.html' : url));          // só dentro de public/
  if (!arq.startsWith(PUB) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end('não encontrado'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(arq).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(arq).pipe(res);
});
srv.on('error', (e) => { log(e.code === 'EADDRINUSE' ? `a porta ${PORTA_WEB} da tela já está em uso` : `erro na tela: ${e.message}`); process.exit(1); });
srv.listen(PORTA_WEB, '0.0.0.0', () => {
  log(`Bancada CFW500 pronta: http://localhost:${PORTA_WEB}${NO_HUB ? ' (iniciada pelo HUB)' : ''}`);
  if (!NO_HUB && process.env.OPEN_BROWSER === '1') require('child_process').exec(`start "" http://localhost:${PORTA_WEB}`, { shell: 'cmd.exe' });   // só no Windows
});
function encerrar() { log('encerrando'); srv.close(); setTimeout(() => process.exit(0), 200); }
process.on('SIGINT', encerrar); process.on('SIGTERM', encerrar);
