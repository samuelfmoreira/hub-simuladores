'use strict';
// Servidor do simulador: HTTP (vistas) + WebSocket (estado a 20 Hz, comandos) + ponte com o CLP.
// Uso: node server/server.js [--endpoint opc.tcp://IP:4840] [--prefixo "ns=4;s=|var|XP325.Application.GVL_SIMULADOR."]
//                             [--clp-falso [porta]] [--sem-clp] [--http PORTA] [--ip IP]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { createBridge } = require('./bridge');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
// config.json (ao lado de package.json): o que o usuário salvou pela tela
const ARQ_CFG = path.join(__dirname, '..', 'config', 'config.json');
function lerConfig() { try { return JSON.parse(fs.readFileSync(ARQ_CFG, 'utf8')); } catch (e) { return {}; } }
function salvarConfig(c) { try { fs.mkdirSync(path.dirname(ARQ_CFG), { recursive: true }); fs.writeFileSync(ARQ_CFG, JSON.stringify(c, null, 2)); } catch (e) { console.log(`não consegui salvar config.json: ${e.message}`); } }
const SALVO = lerConfig();
// [HUB] conexão gravada pela versão antiga (só OPC UA, sem "protocolo"): descarta uma vez,
// para a estação abrir no Modbus TCP, o caminho principal da aula
if (SALVO.endpoint && !SALVO.protocolo) {
  console.log('conexão OPC UA da versão antiga descartada: a estação abre no Modbus TCP');
  delete SALVO.endpoint; delete SALVO.prefixo; delete SALVO.user; delete SALVO.senha;
  salvarConfig(SALVO);
}
const CFG = {
  ip: opt('--ip', process.env.HOST || SALVO.ip || '0.0.0.0'), // a tela pode escutar em todas as placas (contrato do HUB)
  http: Number(opt('--http', process.env.SIM_HTTP_PORT || process.env.PORT || SALVO.httpPort || 3050)),
  endpoint: opt('--endpoint', process.env.OPC_ENDPOINT || null),   // só linha de comando/ambiente; o salvo entra abaixo
  prefixo: opt('--prefixo', process.env.OPC_PREFIX || SALVO.prefixo || null),
  user: opt('--user', process.env.OPC_USER || SALVO.user || null), password: opt('--senha', process.env.OPC_PASS || SALVO.senha || null),
  clpFalso: opt('--clp-falso', null), semClp: args.includes('--sem-clp'),
  fundoEscala: Number(process.env.FUNDO_ESCALA || SALVO.fundoEscala || 32767),
  abrirNavegador: args.includes('--abrir') || process.env.OPEN_BROWSER === '1',
};
// aceita só o IP ("192.168.0.10") ou o endpoint completo
function normalizarEndpoint(e) { e = String(e || '').trim(); if (!e) return null; if (!/^opc\.tcp:\/\//i.test(e)) e = `opc.tcp://${e}${/:\d+$/.test(e) ? '' : ':4840'}`; return e; }

const LOGS = []; let broadcastLog = () => {};
const log = (m) => { const l = `[${new Date().toLocaleTimeString('pt-BR')}] ${m}`; console.log(l); LOGS.push(l); if (LOGS.length > 300) LOGS.shift(); broadcastLog(l); };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

async function main() {
  const ponte = createBridge({ log, physics: { canais: Object.assign({}, require('./catalog').canaisPadrao, { fundoEscala: CFG.fundoEscala }) } });
  ponte.iniciar();

  let falso = null;
  if (CFG.clpFalso && !CFG.semClp) {
    const { criarServidorFalso } = require('./fake/xp325-fake-server');
    const porta = CFG.clpFalso === true ? 4840 : Number(CFG.clpFalso);
    falso = await criarServidorFalso({ port: porta, fundoEscala: CFG.fundoEscala });
    const url = await falso.iniciar();
    log(`XP325 falso em ${url} (programa de demonstração)`);
    CFG.endpoint = CFG.endpoint || url;
  }
  async function conectar(c) {
    if (c.protocolo === 'modbus') {
      const host = String(c.host || c.endpoint || '127.0.0.1').replace(/^opc\.tcp:\/\//, '').split(':')[0].trim() || '127.0.0.1';
      const cfg = { protocolo: 'modbus', host, port: Number(c.port) || 502, unitId: Number(c.unitId) || 1, endpoint: `modbus://${host}:${Number(c.port) || 502}` };
      const st = await ponte.conectarCLP(cfg);
      log(`CLP conectado por Modbus TCP: ${st.endpoint}`);
      return st;
    }
    if (c.protocolo === 'opcda') {
      const cfg = { protocolo: 'opcda', endpoint: 'opcda://localhost', progId: c.progId || 'CoDeSys.OPC.DA', prefixo: c.prefixo || 'PLC.Application.GVL_SIMULADOR.' };
      const st = await ponte.conectarCLP(cfg);
      log(`CLP conectado por OPC DA: ${st.endpoint}`);
      return st;
    }
    const cfg = { protocolo: 'opcua', endpoint: normalizarEndpoint(c.endpoint), prefixo: c.prefixo || null, user: c.user || null, password: c.senha || c.password || null };
    if (!cfg.endpoint) throw new Error('informe o IP do CLP');
    const st = await ponte.conectarCLP(cfg);
    log(`CLP conectado: ${st.endpoint} ${JSON.stringify(st.assinaturas)}`);
    return st;
  }
  let falsoModbus = null;
  // [HUB] o CLP Modbus de demonstração fica só neste PC, sempre na porta 502 do Modbus, num endereço de loopback
  // próprio (127.0.0.50): não disputa a 502 do CODESYS (192.168.100.10) nem a dos CLPs de teste dos outros simuladores.
  // Se o Windows recusar o endereço, volta para 127.0.0.1 numa porta alternativa (1502–1510) e avisa.
  let hostDemoModbus = '127.0.0.50', portaDemoModbus = 502;
  async function iniciarDemoModbus() {
    if (!falsoModbus) {
      const { criarClpModbusFalso } = require('./fake/clp-modbus-fake');
      const tentativas = [{ host: '127.0.0.50', port: 502 }, ...Array.from({ length: 9 }, (_, i) => ({ host: '127.0.0.1', port: 1502 + i }))];
      let ultimoErro = null;
      for (const t of tentativas) {
        if (falsoModbus) break;
        const s = criarClpModbusFalso({ port: t.port, host: t.host, fundoEscala: CFG.fundoEscala });
        try {
          const url = await s.iniciar();
          falsoModbus = s; hostDemoModbus = t.host; portaDemoModbus = t.port;
          log(`CLP Modbus falso em ${url} (programa de demonstração)${t.port !== 502 ? ' — aviso: 127.0.0.50:502 indisponível neste PC' : ''}`);
        } catch (e) { ultimoErro = e; try { if (s.parar) await s.parar(); } catch (_) { /* não abriu */ } }
      }
      if (!falsoModbus) throw new Error(`não consegui abrir o CLP Modbus de demonstração: ${ultimoErro && ultimoErro.message}`);
    }
    return conectar({ protocolo: 'modbus', host: hostDemoModbus, port: portaDemoModbus, unitId: 1 });
  }
  // [HUB] a 4840 é do servidor OPC UA do CODESYS Control Win: o XP325 de demonstração nunca a ocupa
  // (senão o CODESYS não conseguiria abrir o servidor dele depois) e usa a primeira livre de 4841 a 4850.
  let portaDemo = 4841;
  async function iniciarDemo() {
    if (!falso) {
      const { criarServidorFalso } = require('./fake/xp325-fake-server');
      let ultimoErro = null;
      for (let p = 4841; p <= 4850 && !falso; p++) {
        let s = null;
        try {
          s = await criarServidorFalso({ port: p, fundoEscala: CFG.fundoEscala });
          const url = await s.iniciar();
          falso = s; portaDemo = p;
          log(`XP325 falso em ${url} (programa de demonstração)`);
        } catch (e) {
          ultimoErro = e;
          try { if (s && s.parar) await s.parar(); } catch (_) { /* não chegou a abrir */ }
        }
      }
      if (!falso) throw new Error(`não consegui abrir o XP325 de demonstração (portas 4841 a 4850 ocupadas): ${ultimoErro && ultimoErro.message}`);
    }
    return conectar({ endpoint: `opc.tcp://127.0.0.1:${portaDemo}` });
  }
  if (CFG.semClp) log('sem CLP (--sem-clp)');
  else if (CFG.endpoint) {
    conectar({ endpoint: CFG.endpoint, prefixo: CFG.prefixo, user: CFG.user, password: CFG.password })
      .catch(e => log(`CLP: ${e.message} (o simulador segue sem CLP e tenta de novo a cada 5 s)`));
  } else if (SALVO.protocolo === 'modbus') {
    conectar({ protocolo: 'modbus', host: SALVO.host, port: SALVO.port, unitId: SALVO.unitId })
      .catch(e => log(`CLP (Modbus): ${e.message} (o simulador segue sem CLP e tenta de novo a cada 5 s)`));
  } else if (SALVO.protocolo === 'opcda') {
    conectar({ protocolo: 'opcda', progId: SALVO.progId, prefixo: SALVO.prefixo })
      .catch(e => log(`CLP (OPC DA): ${e.message} (o simulador segue sem CLP e tenta de novo a cada 5 s)`));
  } else if (SALVO.endpoint) {
    conectar({ endpoint: SALVO.endpoint, prefixo: SALVO.prefixo, user: SALVO.user, password: SALVO.senha })
      .catch(e => log(`CLP: ${e.message} (o simulador segue sem CLP e tenta de novo a cada 5 s)`));
  } else log('sem CLP: conecte pela tela (IP do CLP) ou use o CLP de demonstração');

  const pub = path.join(__dirname, '..', 'public');
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    if (p === '/api/histerese') { const q = Object.fromEntries(new URL(req.url, 'http://x').searchParams); res.writeHead(200, { 'Content-Type': MIME['.json'] }); return res.end(JSON.stringify(require('./lab-histerese').comparar(q))); }
    if (p === '/api/tags' || p === '/api/modbus-mapa') { res.writeHead(200, { 'Content-Type': MIME['.json'] }); return res.end(JSON.stringify(require('./tags').tabelaDocs())); }
    if (p === '/api/estado') { res.writeHead(200, { 'Content-Type': MIME['.json'] }); return res.end(JSON.stringify(ponte.estado())); }
    let base = pub;
    if (p.startsWith('/mastertool/')) { base = path.join(__dirname, '..'); }
    const f = path.join(base, p);
    if (!f.startsWith(base) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('não encontrado'); }
    const ext = path.extname(f);
    res.writeHead(200, { 'Content-Type': ext === '.st' ? 'text/plain; charset=utf-8' : (MIME[ext] || 'application/octet-stream') });
    fs.createReadStream(f).pipe(res);
  });
  const wss = new WebSocketServer({ server: srv });
  broadcastLog = (l) => { for (const c of wss.clients) if (c.readyState === 1) c.send(JSON.stringify({ log: l })); };
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ logs: LOGS }));
    ws.on('message', async (m) => {
      try {
        const c = JSON.parse(m);
        if (c.tipo === 'clp') {
          try {
            if (c.acao === 'conectar') { await conectar(c); const salvo = lerConfig(); Object.assign(salvo, { protocolo: c.protocolo || 'opcua', endpoint: c.protocolo === 'opcua' ? normalizarEndpoint(c.endpoint) : (salvo.endpoint || ''), prefixo: c.prefixo || '', user: c.user || '', senha: c.senha || '', progId: c.progId || '', host: c.host || '', port: c.port || '', unitId: c.unitId || '' }); salvarConfig(salvo); }
            else if (c.acao === 'demo') await (c.protocolo === 'modbus' ? iniciarDemoModbus() : iniciarDemo());
            else if (c.acao === 'desconectar') { await ponte.desconectarCLP(); log('CLP desconectado pela tela'); }
            ws.send(JSON.stringify({ clp: 'ok', acao: c.acao }));
          } catch (e) { log(`CLP: ${e.message}`); ws.send(JSON.stringify({ clp: 'erro', acao: c.acao, erro: e.message })); }
          return;
        }
        if (c.tipo === 'canal' && c.fundoEscala) { const salvo = lerConfig(); salvo.fundoEscala = c.fundoEscala; salvarConfig(salvo); }
        if (c.tipo === 'comissionar') {
          ponte.comando(c); const r = (ponte.fis.ultimoComissionamento && ponte.fis.ultimoComissionamento()) || { aplicados: [], erros: ['inversor sem função de comissionamento'] };
          log(`CFW500 parametrizado para a bancada: ${r.aplicados.length ? r.aplicados.join(', ') : 'nada a mudar'}${r.erros.length ? ' · erros: ' + r.erros.join('; ') : ''}`);
          ws.send(JSON.stringify({ comissionar: r })); return;
        }
        if (!ponte.comando(c)) ws.send(JSON.stringify({ erro: 'comando desconhecido', c }));
      } catch (e) { ws.send(JSON.stringify({ erro: e.message })); }
    });
  });
  setInterval(() => {
    if (!wss.clients.size) return;
    const s = JSON.stringify({ estado: ponte.estado() });
    for (const c of wss.clients) if (c.readyState === 1) c.send(s);
  }, 50);
  srv.listen(CFG.http, CFG.ip, () => {
    log(`vistas em http://${CFG.ip}:${CFG.http}`);
    if (CFG.abrirNavegador) { const url = `http://${CFG.ip === '0.0.0.0' ? '127.0.0.1' : CFG.ip}:${CFG.http}`; const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`; require('child_process').exec(cmd, () => {}); }
  });
  srv.on('error', (e) => { log(e.code === 'EADDRINUSE' ? `a porta ${CFG.http} já está em uso: o simulador já está aberto? Feche a outra janela ou mude httpPort no config.json` : `HTTP: ${e.message}`); process.exit(1); });

  process.on('SIGINT', async () => { log('encerrando'); await ponte.parar(); if (falso) await falso.parar(); if (falsoModbus) await falsoModbus.parar(); process.exit(0); });
}
main().catch(e => { console.error(e); process.exit(1); });
