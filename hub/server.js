/**
 * =====================================================================
 *  HUB DE SIMULADORES INDUSTRIAIS
 * =====================================================================
 *  node hub/server.js [--porta 4000] [--sem-navegador]
 *
 *  - Catálogo dos simuladores em simuladores/ (cada um com sua ficha simulador.json)
 *  - Inicia / para cada simulador, com IP e porta web definidos pelo HUB
 *  - Rede virtual (placa SIM-HUB) para o CLP / CODESYS e os simuladores no mesmo PC
 *  - Trilha "Aprender" com as aulas de protocolo (hub/aprender/*.md)
 *  - Importação e atualização de simuladores por .zip, com backup
 *
 *  Sem dependências obrigatórias: só a importação de .zip usa o pacote adm-zip.
 * =====================================================================
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const config = require('./lib/config');
const catalogo = require('./lib/catalogo');
const rede = require('./lib/rede');
const importar = require('./lib/importar');
const atualizador = require('./lib/atualizador');
const dev = require('./lib/dev');
const MODO = dev.ATIVO ? 'desenvolvedor' : 'usuario';   // pasta do projeto = desenvolvedor; instalado pelo .exe = usuário
const runtime = require('./lib/runtime');
const { spawn } = require('child_process');
const { Gerenciador } = require('./lib/processos');

const VERSAO = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version;
const PUBLICO = path.join(__dirname, 'public');
const AULAS = path.join(__dirname, 'aprender');
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };

const cfg = config.ler();
// motor escondido (versão do usuário no Windows): as mensagens vão para hub.log, na pasta do HUB
const OCULTO = process.argv.includes('--oculto');
// versão do usuário no Windows aberta com a janela preta (atalho ou .exe antigo): reabre escondido e fecha esta.
// As atualizações não trocam o .exe, então quem só atualizou também passa a abrir sem a janela.
if (!OCULTO && process.platform === 'win32' && MODO === 'usuario' && runtime.sea && !process.argv.includes('--com-janela')) {
  spawn(process.execPath, [...process.argv.slice(2), '--oculto'], { cwd: config.RAIZ, detached: true, stdio: 'ignore', windowsHide: true }).unref();
  process.exit(0);
}
if (OCULTO) {
  const arqLog = path.join(config.RAIZ, 'hub.log');
  try { if (fs.statSync(arqLog).size > 2 * 1024 * 1024) fs.renameSync(arqLog, `${arqLog}.1`); } catch (_) { /* ainda não existe */ }
  const fluxo = fs.createWriteStream(arqLog, { flags: 'a' });
  const escrever = (...x) => fluxo.write(`[${new Date().toLocaleString('pt-BR')}] ${x.map((v) => (typeof v === 'string' ? v : String(v))).join(' ')}\n`);
  console.log = escrever; console.error = escrever; console.warn = escrever;
}
if (arg('porta')) cfg.hubPorta = Number(arg('porta'));
// o HUB do desenvolvedor usa outra porta, para poder ficar aberto junto com o HUB instalado pelo .exe
else if (MODO === 'desenvolvedor' && cfg.hubPorta === 4000) cfg.hubPorta = 4010;
// acabou de ser instalado pelo HUB-Simuladores.exe: nada de assistente, a rede é preparada sozinha
const PRIMEIRA_INSTALACAO = process.argv.includes('--primeira-instalacao');
if (PRIMEIRA_INSTALACAO) config.alterar((c) => { c.primeiraConfigFeita = true; });
const ger = new Gerenciador();

// ------------------------------------------------------------------ eventos ao vivo (SSE)
const clientes = new Set();
function enviar(evento, dados) {
  const msg = `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
  for (const c of clientes) c.write(msg);
}
ger.on('estado', (id, resumo) => enviar('estado', { id, ...resumo }));
ger.on('log', (id, item) => enviar('log', { id, ...item }));
setInterval(() => { for (const c of clientes) c.write(': ping\n\n'); }, 20000);

// ------------------------------------------------------------------ montagem do estado
function estadoSimuladores() {
  return catalogo.listar().map((f) => ({
    ...catalogo.publico(f),
    ipAtribuido: f.rede.precisaIp ? (cfg.ips[f.id] || f.rede.ipSugerido || null) : null,
    modoEscolhido: f.modos ? (cfg.modos[f.id] || f.modos[0].id) : null,
    urlRemota: f.remoto ? (cfg.urlsRemotas[f.id] || f.remoto.urlPadrao || '') : null,
    portaWebPreferida: Number(cfg.portasWeb[f.id]) || f.web.porta,
    backups: importar.listarBackups(f.id),
    execucao: ger.resumo(f.id),
  }));
}

function listarAulas() {
  if (!fs.existsSync(AULAS)) return [];
  return fs.readdirSync(AULAS).filter((n) => n.endsWith('.md')).sort().map((n) => {
    const texto = fs.readFileSync(path.join(AULAS, n), 'utf8');
    const titulo = (texto.match(/^#\s+(.+)$/m) || [])[1] || n;
    const resumo = (texto.match(/^>\s+(.+)$/m) || [])[1] || '';
    return { id: n.replace(/^\d+-/, '').replace(/\.md$/, ''), arquivo: n, titulo, resumo };
  });
}

// ------------------------------------------------------------------ utilidades HTTP
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.eds': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

function json(res, codigo, dados) {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(dados));
}

function corpo(req, limite = 200 * 1024 * 1024) {
  return new Promise((ok, falha) => {
    const partes = []; let total = 0;
    req.on('data', (d) => { total += d.length; if (total > limite) { falha(new Error('Arquivo grande demais')); req.destroy(); } else partes.push(d); });
    req.on('end', () => ok(Buffer.concat(partes)));
    req.on('error', falha);
  });
}
const corpoJson = async (req) => { const b = await corpo(req, 2 * 1024 * 1024); return b.length ? JSON.parse(b.toString('utf8')) : {}; };

function servirArquivo(res, arquivo, extra = {}) {
  fs.readFile(arquivo, (e, dados) => {
    if (e) { res.writeHead(404); return res.end('Não encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(arquivo).toLowerCase()] || 'application/octet-stream', ...extra });
    res.end(dados);
  });
}

/** Junta caminhos sem deixar sair da pasta base. */
function dentro(base, rel) {
  const alvo = path.resolve(base, rel);
  return alvo === base || alvo.startsWith(base + path.sep) ? alvo : null;
}

// ------------------------------------------------------------------ rotas
async function rotear(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);
  const m = req.method;
  let r;

  if (p === '/api/eventos') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    clientes.add(res); avaliarSaida();
    req.on('close', () => { clientes.delete(res); avaliarSaida(); });
    return;
  }

  if (p === '/api/estado' && m === 'GET') {
    return json(res, 200, { hub: { versao: VERSAO, plataforma: process.platform, porta: cfg.hubPorta, node: process.version, modo: MODO }, config: { rede: cfg.rede, primeiraConfigFeita: cfg.primeiraConfigFeita, abrirComo: cfg.abrirComo, abrirTelaAoIniciar: cfg.abrirTelaAoIniciar, atualizacaoAutomatica: cfg.atualizacaoAutomatica }, atualizacao: resumoAtualizacao(), simuladores: estadoSimuladores() });
  }

  // ---------- funções só do desenvolvedor ----------
  const soDev = (p === '/api/importar') || /^\/api\/sim\/[\w.-]+\/(ficha|restaurar)$/.test(p) || p.startsWith('/api/dev/');
  if (soDev && MODO !== 'desenvolvedor' && m !== 'GET') return json(res, 403, { erro: 'Função disponível só na versão do desenvolvedor.' });
  if (p === '/api/dev/situacao' && m === 'GET') {
    if (MODO !== 'desenvolvedor') return json(res, 403, { erro: 'Função disponível só na versão do desenvolvedor.' });
    return json(res, 200, await dev.situacao());
  }
  if (p === '/api/dev/versao' && m === 'PUT') {
    try { const b = await corpoJson(req); return json(res, 200, dev.salvarVersao(b.versao, b.notas)); } catch (e) { return json(res, 400, { erro: e.message }); }
  }
  if (p === '/api/dev/aplicar-zip' && m === 'POST') {
    try { const r = dev.aplicarZip(await corpo(req)); enviar('catalogo', {}); return json(res, 200, r); } catch (e) { return json(res, 400, { erro: e.message }); }
  }
  if (p === '/api/dev/publicar' && m === 'POST') {
    const b = await corpoJson(req);
    const log = (t) => enviar('dev', { texto: t });
    dev.publicar(b.mensagem, log).then((r) => enviar('dev', { fim: true, ok: true, ...r })).catch((e) => { log(`[ERRO] ${e.message}`); enviar('dev', { fim: true, ok: false }); });
    return json(res, 202, { ok: true });
  }
  if (p === '/api/dev/reiniciar' && m === 'POST') { json(res, 200, { ok: true }); setTimeout(reiniciar, 300); return; }

  // ---------- simuladores ----------
  if ((r = p.match(/^\/api\/sim\/([\w.-]+)\/(\w+)(?:\/(.+))?$/))) {
    const [, id, acao, resto] = r;
    const ficha = catalogo.obter(id);
    if (!ficha) return json(res, 404, { erro: `Simulador "${id}" não encontrado.` });

    if (acao === 'iniciar' && m === 'POST') {
      try {
        const b = await corpoJson(req).catch(() => ({}));
        if (b.modo && ficha.modos) config.alterar((c) => { c.modos[id] = b.modo; });
        const r = await ger.iniciar(ficha, cfg, b.modo);
        if (r.estado === 'rodando' && cfg.abrirTelaAoIniciar) {
          const url = `http://localhost:${r.httpPort}${ficha.web.caminho || '/'}`;
          ger.log(id, `Abrindo a tela do simulador: ${url}`, 'hub');
          abrirTela(url);
        }
        return json(res, 200, r);
      } catch (e) { return json(res, e.bloqueio ? 409 : 400, { erro: e.message }); }
    }
    if (acao === 'parar' && m === 'POST') return json(res, 200, await ger.parar(id));
    if (acao === 'reiniciar' && m === 'POST') {
      const modoAtual = ger.resumo(id).modo;
      await ger.parar(id);
      try { return json(res, 200, await ger.iniciar(catalogo.obter(id), cfg, modoAtual)); } catch (e) { return json(res, 400, { erro: e.message }); }
    }
    if (acao === 'instalar' && m === 'POST') {
      ger.instalar(ficha).catch(() => { /* resultado vai pelo log */ });
      return json(res, 202, { ok: true });
    }
    if (acao === 'log' && m === 'GET') return json(res, 200, ger._inst(id).linhas);
    if (acao === 'planejar' && m === 'GET') return json(res, 200, await ger.planejar(ficha, cfg));
    if (acao === 'guia' && m === 'GET') {
      const arq = ficha.arquivos.guia && dentro(ficha.pasta, ficha.arquivos.guia);
      if (!arq || !fs.existsSync(arq)) return json(res, 404, { erro: 'Este simulador não tem guia.' });
      // imagens do guia com endereço relativo (ex.: guia/print.webp) passam pela rota de imagens do simulador
      const texto = fs.readFileSync(arq, 'utf8').replace(/!\[([^\]]*)\]\((?!https?:|\/)([^)\s]+)\)/g,
        (_, alt, rel) => `![${alt}](/api/sim/${encodeURIComponent(id)}/imagem/${rel.split('/').map(encodeURIComponent).join('/')})`);
      return json(res, 200, { texto });
    }
    if (acao === 'imagem' && m === 'GET' && resto) {
      // só imagens de dentro da pasta do simulador (usadas pelos guias)
      if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(resto)) return json(res, 403, { erro: 'Só imagens.' });
      const arq = dentro(ficha.pasta, decodeURIComponent(resto));
      if (!arq || !fs.existsSync(arq)) return json(res, 404, { erro: 'Imagem não encontrada.' });
      return servirArquivo(res, arq, { 'Cache-Control': 'max-age=3600' });
    }
    if (acao === 'icone' && m === 'GET') {
      // desenho próprio do simulador (ficha "icone": "arquivo.svg")
      const arq = /\.(svg|png)$/i.test(ficha.icone || '') && dentro(ficha.pasta, ficha.icone);
      if (!arq || !fs.existsSync(arq)) return json(res, 404, { erro: 'Ícone não encontrado.' });
      return servirArquivo(res, arq, { 'Cache-Control': 'no-cache' });
    }
    if (acao === 'arquivo' && m === 'GET' && resto) {
      const permitidos = [...(ficha.arquivos.eds || []), ...(ficha.arquivos.downloads || [])].map((a) => a.replace(/\\/g, '/'));
      if (!permitidos.includes(resto)) return json(res, 403, { erro: 'Arquivo não listado na ficha.' });
      const arq = dentro(ficha.pasta, resto);
      return servirArquivo(res, arq, { 'Content-Disposition': `attachment; filename="${path.basename(arq)}"` });
    }
    if (acao === 'ficha' && m === 'PUT') {
      try { return json(res, 200, catalogo.publico(catalogo.salvarFicha(id, await corpoJson(req)))); } catch (e) { return json(res, 400, { erro: e.message }); }
    }
    if (acao === 'atribuicao' && m === 'PUT') {
      const b = await corpoJson(req);
      if (b.ip !== undefined && b.ip !== '' && !rede.ehIp(b.ip)) return json(res, 400, { erro: `IP inválido: ${b.ip}` });
      if (b.portaWeb !== undefined && b.portaWeb !== '' && !(Number(b.portaWeb) >= 1024 && Number(b.portaWeb) <= 65535)) return json(res, 400, { erro: 'Porta web deve ficar entre 1024 e 65535.' });
      if (b.urlRemota && !/^https?:\/\/[^\s]+$/i.test(b.urlRemota)) return json(res, 400, { erro: 'Endereço inválido. Use http://IP:porta' });
      config.alterar((c) => {
        if (b.urlRemota !== undefined) { if (b.urlRemota) c.urlsRemotas[id] = b.urlRemota; else delete c.urlsRemotas[id]; }
        if (b.ip !== undefined) { if (b.ip) c.ips[id] = b.ip; else delete c.ips[id]; }
        if (b.portaWeb !== undefined) { if (b.portaWeb) c.portasWeb[id] = Number(b.portaWeb); else delete c.portasWeb[id]; }
      });
      return json(res, 200, { ok: true });
    }
    if (acao === 'remoto' && m === 'GET') {
      // a instância remota (ex.: VM Linux) está no ar?
      const alvo = cfg.urlsRemotas[id] || ficha.remoto?.urlPadrao;
      if (!alvo) return json(res, 404, { erro: 'Sem endereço remoto.' });
      return json(res, 200, { url: alvo, ...(await verificarUrl(alvo)) });
    }
    if (acao === 'restaurar' && m === 'POST') {
      try { const b = await corpoJson(req); await importar.restaurar(id, b.backup, ger); return json(res, 200, { ok: true }); } catch (e) { return json(res, 400, { erro: e.message }); }
    }
    return json(res, 404, { erro: 'Ação desconhecida.' });
  }

  if (p === '/api/parar-todos' && m === 'POST') { await ger.pararTodos(); return json(res, 200, { ok: true }); }
  if (p === '/api/sair' && m === 'POST') { json(res, 200, { ok: true }); console.log('Sair do HUB pedido na tela.'); setTimeout(encerrar, 300); return; }

  // ---------- atualização do HUB ----------
  if (p === '/api/atualizacao' && m === 'GET') return json(res, 200, resumoAtualizacao());
  if (p === '/api/atualizacao/verificar' && m === 'POST') {
    // ?seAntiga=1: só consulta se a última busca tiver mais de 5 minutos (usado quando o usuário volta para a janela)
    const seAntiga = new URL(req.url, 'http://x').searchParams.get('seAntiga');
    if (!seAntiga || !ATU.ultima || Date.now() - ATU.ultima > 5 * 60 * 1000) await verificarAtualizacao();
    return json(res, 200, resumoAtualizacao());
  }
  if (p === '/api/atualizacao/aplicar' && m === 'POST') {
    if (!ATU.info?.disponivel) return json(res, 409, { erro: 'Não há versão nova para instalar.' });
    aplicarAtualizacao('pedido na tela');
    return json(res, 202, resumoAtualizacao());
  }

  // ---------- importação ----------
  if (p === '/api/importar' && m === 'POST') {
    try {
      const buf = await corpo(req);
      const resultado = await importar.importar(buf, ger);
      if (resultado.precisaInstalar) {
        const f = catalogo.obter(resultado.id);
        if (f) ger.instalar(f).catch(() => { /* vai pelo log */ });
      }
      enviar('catalogo', {});
      return json(res, 200, resultado);
    } catch (e) { return json(res, 400, { erro: e.message }); }
  }

  // ---------- rede ----------
  if (p === '/api/rede' && m === 'GET') return json(res, 200, await rede.status(cfg, catalogo.listar()));
  if (p === '/api/rede/aplicar' && m === 'POST') {
    const b = await corpoJson(req);
    try { const resultado = await rede.aplicar(b.acao, cfg, catalogo.listar(), b); return json(res, 200, resultado); } catch (e) { return json(res, 400, { erro: e.message }); }
  }
  if (p === '/api/rede/config' && m === 'PUT') {
    const b = await corpoJson(req);
    if (b.ipClp !== undefined && !rede.ehIp(b.ipClp)) return json(res, 400, { erro: `IP do CLP inválido: ${b.ipClp}` });
    if (b.ipsExtras && b.ipsExtras.some((ip) => !rede.ehIp(ip))) return json(res, 400, { erro: 'Há um IP extra inválido.' });
    config.alterar((c) => {
      if (b.ipClp) c.rede.ipClp = b.ipClp;
      if (b.prefixo) c.rede.prefixo = Math.min(30, Math.max(8, Number(b.prefixo)));
      if (b.ipsExtras) c.rede.ipsExtras = [...new Set(b.ipsExtras)];
    });
    return json(res, 200, { ok: true });
  }

  // ---------- configuração geral ----------
  if (p === '/api/config' && m === 'PUT') {
    const b = await corpoJson(req);
    config.alterar((c) => {
      if (typeof b.primeiraConfigFeita === 'boolean') c.primeiraConfigFeita = b.primeiraConfigFeita;
      if (typeof b.abrirTelaAoIniciar === 'boolean') c.abrirTelaAoIniciar = b.abrirTelaAoIniciar;
      if (typeof b.atualizacaoAutomatica === 'boolean') c.atualizacaoAutomatica = b.atualizacaoAutomatica;
      if (['janela', 'navegador'].includes(b.abrirComo)) c.abrirComo = b.abrirComo;
    });
    return json(res, 200, { ok: true });
  }
  if (p === '/api/contrato' && m === 'GET') {
    const arq = path.join(config.RAIZ, 'modelo-simulador', 'CONTRATO.md');
    if (!fs.existsSync(arq)) return json(res, 404, { erro: 'CONTRATO.md não encontrado na pasta modelo-simulador.' });
    return json(res, 200, { texto: fs.readFileSync(arq, 'utf8') });
  }

  // ---------- aulas ----------
  if (p === '/api/aprender' && m === 'GET') return json(res, 200, listarAulas());
  if ((r = p.match(/^\/api\/aprender\/([\w-]+)$/)) && m === 'GET') {
    const aula = listarAulas().find((a) => a.id === r[1]);
    if (!aula) return json(res, 404, { erro: 'Aula não encontrada.' });
    return json(res, 200, { ...aula, texto: fs.readFileSync(path.join(AULAS, aula.arquivo), 'utf8') });
  }

  // ---------- arquivos estáticos ----------
  if (m === 'GET') {
    const arq = dentro(PUBLICO, p === '/' ? 'index.html' : p.slice(1));
    if (arq && fs.existsSync(arq) && fs.statSync(arq).isFile()) return servirArquivo(res, arq);
    // rotas da interface (#/...) caem no index
    return servirArquivo(res, path.join(PUBLICO, 'index.html'));
  }
  json(res, 404, { erro: 'Não encontrado.' });
}

const servidor = http.createServer((req, res) => {
  rotear(req, res).catch((e) => { console.error(e); if (!res.headersSent) json(res, 500, { erro: e.message }); });
});

let tentativasPorta = 0;
servidor.on('error', (e) => {
  // reinício depois de atualizar: espera a instância anterior liberar a porta
  if (e.code === 'EADDRINUSE' && process.argv.includes('--reiniciando') && tentativasPorta++ < 40) {
    setTimeout(() => servidor.listen(cfg.hubPorta), 500);
    return;
  }
  if (e.code === 'EADDRINUSE') {
    // o HUB já está aberto (ex.: clique de novo no atalho): só mostra a tela dele
    http.get({ host: '127.0.0.1', port: cfg.hubPorta, path: '/api/estado', timeout: 2000 }, (r) => {
      let corpoResp = ''; r.on('data', (d) => { corpoResp += d; });
      r.on('end', () => {
        let outro = null;
        try { outro = JSON.parse(corpoResp).hub; } catch (_) { /* não é o HUB */ }
        if (outro && (outro.modo || 'usuario') === MODO) { console.log('O HUB já está aberto. Mostrando a tela dele.'); abrirTela(`http://localhost:${cfg.hubPorta}`); setTimeout(() => process.exit(0), 1500); return; }
        if (outro) {
          console.error(`\n[ERRO] A porta ${cfg.hubPorta} está com o HUB ${outro.modo === 'desenvolvedor' ? 'do desenvolvedor' : 'do usuário'} ${outro.versao} aberto.`);
          console.error('       Feche aquele HUB e abra este de novo, ou mude "hubPorta" no hub-config.json.\n');
          setTimeout(() => process.exit(1), 15000); return;
        }
        try { throw new Error(); }
        catch (_) { console.error(`\n[ERRO] A porta ${cfg.hubPorta} está ocupada por outro programa. Mude "hubPorta" no hub-config.json.`); setTimeout(() => process.exit(1), 10000); }
      });
    }).on('error', () => process.exit(1));
    return;
  }
  if (e.code === 'EADDRINUSE') {
    console.error(`\n[ERRO] A porta ${cfg.hubPorta} já está em uso. O HUB já está aberto? Acesse http://localhost:${cfg.hubPorta}`);
    console.error('       Ou mude "hubPorta" no hub-config.json.\n');
  } else console.error(e);
  process.exit(1);
});

servidor.listen(cfg.hubPorta, () => {
  const url = `http://localhost:${cfg.hubPorta}`;
  const sims = catalogo.listar();
  console.log('');
  console.log('  ============================================================');
  console.log(`    HUB de Simuladores Industriais  v${VERSAO}`);
  console.log('  ============================================================');
  console.log(`    Tela do HUB: ${url}`);
  console.log(`    Simuladores encontrados: ${sims.length} (${sims.map((s) => s.id).join(', ')})`);
  console.log('    Para encerrar: feche esta janela ou tecle Ctrl+C.');
  console.log('    (os simuladores abertos pelo HUB também são encerrados)');
  console.log('  ============================================================\n');
  if (cfg.abrirNavegador && !process.argv.includes('--sem-navegador')) abrirTela(url);
  try { atualizador.limparSobras(); } catch (_) { /* sem permissão: tudo bem */ }
  if (PRIMEIRA_INSTALACAO && process.platform === 'win32') {
    setTimeout(async () => {
      console.log('  Preparando a rede virtual dos simuladores (o Windows vai pedir permissão uma vez)...');
      try {
        const r = await rede.aplicar('criar', cfg, catalogo.listar());
        console.log(r.ok ? '  [OK] Rede virtual pronta.' : '  A rede virtual não foi criada agora. Dá para criar depois, na aba Rede virtual.');
      } catch (e) { console.log(`  A rede virtual não foi criada: ${e.message}`); }
      enviar('catalogo', {});
    }, 1500);
  }
  // procura versão nova logo depois de abrir, de novo 3 minutos depois (cobre uma versão que acabou de ser publicada)
  // e a cada 30 minutos
  setTimeout(() => verificarAtualizacao({ automatica: true }), 4000);
  setTimeout(() => verificarAtualizacao({ automatica: true }), 3 * 60 * 1000);
  setInterval(() => verificarAtualizacao(), 30 * 60 * 1000);
});

/** Abre uma tela (do HUB ou de um simulador). No Windows, em modo "janela": Edge sem barra de endereço, com cara de programa. */
function abrirTela(url) {
  const comum = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  if (process.platform === 'win32' && cfg.abrirComo === 'janela') {
    exec(`start "" msedge --app="${url}" --window-size=1400,900`, (erro) => { if (erro) exec(comum, () => { /* sem navegador */ }); });
  } else exec(comum, () => { /* sem navegador disponível: tudo bem */ });
}

// ------------------------------------------------------------------ atualização automática
const ATU = { info: null, verificando: false, aplicando: false, ultima: null, erro: null, progresso: [] };
function resumoAtualizacao() {
  const i = ATU.info;
  return {
    atual: VERSAO, configurado: i ? i.configurado : null, motivo: i?.motivo || null, disponivel: !!i?.disponivel, nova: i?.nova || null,
    notas: i?.notas || '', publicadoEm: i?.publicadoEm || null, verificando: ATU.verificando, aplicando: ATU.aplicando,
    ultima: ATU.ultima, erro: ATU.erro, progresso: ATU.progresso.slice(-30), automatica: cfg.atualizacaoAutomatica !== false,
  };
}
async function verificarAtualizacao({ automatica = false } = {}) {
  if (ATU.verificando || ATU.aplicando) return;
  ATU.ultima = Date.now();
  ATU.verificando = true; ATU.erro = null; enviar('atualizacao', resumoAtualizacao());
  try {
    ATU.info = await atualizador.verificar();
    if (ATU.info.disponivel) console.log(`  Atualização disponível: ${ATU.info.atual} → ${ATU.info.nova}`);
  } catch (e) { ATU.erro = `Não foi possível consultar as atualizações: ${e.message}`; }
  ATU.verificando = false; ATU.ultima = Date.now();
  enviar('atualizacao', resumoAtualizacao());
  const rodando = ger.emExecucao().length > 0;
  if (automatica && ATU.info?.disponivel && cfg.atualizacaoAutomatica !== false && !rodando) aplicarAtualizacao('automática ao abrir');
}
async function aplicarAtualizacao(motivo) {
  if (ATU.aplicando) return;
  ATU.aplicando = true; ATU.progresso = [`Atualização ${motivo}: ${VERSAO} → ${ATU.info.nova}`]; ATU.erro = null;
  const log = (t) => { console.log(`  ${t}`); ATU.progresso.push(t); enviar('atualizacao', resumoAtualizacao()); };
  enviar('atualizacao', resumoAtualizacao());
  try {
    await atualizador.baixarEAplicar(ATU.info.manifesto, { gerenciador: ger, log });
    log('Atualização aplicada. Reiniciando o HUB...');
    setTimeout(reiniciar, 800);
  } catch (e) {
    ATU.aplicando = false; ATU.erro = `A atualização falhou: ${e.message}`; log(ATU.erro);
  }
}
/** Inicia uma nova instância do HUB (com o código novo) e encerra esta. */
function reiniciar() {
  const args = runtime.sea ? [] : [path.join(__dirname, 'server.js')];
  const filho = spawn(process.execPath, [...args, '--reiniciando', '--sem-navegador', ...(OCULTO ? ['--oculto'] : [])], { cwd: config.RAIZ, detached: true, stdio: 'ignore', windowsHide: OCULTO });
  filho.unref();
  enviar('reiniciando', {});
  setTimeout(() => process.exit(0), 300);
}

/** Responde algo no endereço? (instância remota de um simulador) */
function verificarUrl(url) {
  return new Promise((ok) => {
    let alvo;
    try { alvo = new URL(url); } catch (_) { return ok({ online: false, motivo: 'endereço inválido' }); }
    const r = http.get({ hostname: alvo.hostname, port: alvo.port || 80, path: alvo.pathname || '/', timeout: 2500 }, (res) => { res.resume(); ok({ online: true, status: res.statusCode }); });
    r.on('timeout', () => { r.destroy(); ok({ online: false, motivo: 'sem resposta' }); });
    r.on('error', (e) => ok({ online: false, motivo: e.code || e.message }));
  });
}

async function encerrar() {
  console.log('\nEncerrando os simuladores...');
  await Promise.race([ger.pararTodos(), new Promise((ok) => setTimeout(ok, 4000))]);
  process.exit(0);
}
/**
 * Versão do usuário (e desenvolvedor sem janela preta): quando a janela do HUB é fechada (nenhuma tela conectada), o motor espera 20 s
 * (tempo de um F5 ou do reinício de uma atualização) e, sem simuladores rodando, encerra sozinho.
 */
let timerSaida = null;
function avaliarSaida() {
  if (MODO !== 'usuario' && !OCULTO) return;   // desenvolvedor com janela preta: só encerra pelo Sair ou fechando a janela preta
  clearTimeout(timerSaida); timerSaida = null;
  if (clientes.size > 0) return;
  timerSaida = setTimeout(() => {
    if (clientes.size > 0) return;
    if (ATU.aplicando || ger.emExecucao().length > 0) { avaliarSaida(); return; }   // espera o simulador ser parado
    console.log('A janela do HUB foi fechada: encerrando.');
    encerrar();
  }, 20000);
}
setTimeout(avaliarSaida, 60000);   // se a tela nunca chegar a abrir, o motor não fica esquecido rodando
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
