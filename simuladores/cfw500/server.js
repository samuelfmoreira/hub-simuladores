/**
 * =====================================================================
 *  SIMULADOR CFW500 + EtherNet/IP (Adapter) + Esteira 3D
 * =====================================================================
 *  Uso:   node server.js [--ip 192.168.0.14] [--http 8080] [--modbus 502]
 *
 *   --ip      IP da placa de rede onde o "CFW500" vai responder (padrão: todas)
 *   --http    porta da interface web (padrão 8080)
 *   --modbus  porta do servidor Modbus TCP (padrão 502; usa 5020 se 502 não for permitido)
 *
 *  Portas usadas pelo inversor simulado:
 *    TCP 44818  EtherNet/IP explícito (sessão, Forward Open, leitura de parâmetros)
 *    UDP 44818  ListIdentity (descoberta na rede)
 *    UDP 2222   EtherNet/IP implícito (I/O cíclico)
 *    TCP 502    Modbus TCP (até 2 clientes)
 *
 *  IHM do painel (cliente Modbus TCP): conecta no servidor Modbus do CLP
 *  (IP/porta configurados na aba "IHM Modbus"; salvo em data/ihm-modbus.json)
 * =====================================================================
 */
'use strict';

const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');

const { Conveyor } = require('./src/plant/conveyor');
const { CFW500 } = require('./src/drive/cfw500');
const { HMI } = require('./src/drive/hmi');
const { LIST, MAP, formatar } = require('./src/drive/params');
const { FALHAS, ALARMES } = require('./src/drive/faults');
const { AdapterEIP } = require('./src/eip/adapter');
const { ServidorModbus } = require('./src/modbus/server');
const { ScannerEIP } = require('./src/scanner/scanner');
const { IHMModbus } = require('./src/ihm/ihm-modbus');

// ------------------------- argumentos -------------------------------
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : (process.env[n.toUpperCase()] || d); };
const BIND_IP = arg('ip', '0.0.0.0');
const HTTP_PORT = +arg('http', 8080);
const MODBUS_PORT = +arg('modbus', 502);

// ------------------------- objetos principais -----------------------
const planta = new Conveyor();
const drive = new CFW500(planta);
const hmi = new HMI(drive);
const eip = new AdapterEIP(drive, { bindIp: BIND_IP });
const modbus = new ServidorModbus(drive, { porta: MODBUS_PORT, bindIp: BIND_IP });
const ihm = new IHMModbus();   // IHM do painel = cliente Modbus TCP do CLP do aluno

// ------------------------- servidor web -----------------------------
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three')));
app.use('/eds', express.static(path.join(__dirname, 'eds')));
const srv = http.createServer(app);
const io = new Server(srv);

// ------------------------- log de eventos ---------------------------
const eventos = [];
function evento(tipo, txt) {
  const e = { t: Date.now(), tipo, txt };
  eventos.push(e); if (eventos.length > 300) eventos.shift();
  io.emit('evento', e);
}
const logsProto = [];
eip.on('log', (l) => { logsProto.push(l); if (logsProto.length > 600) logsProto.shift(); io.emit('proto', l); });
eip.on('erro', (m) => { console.error('ERRO EtherNet/IP: ' + m); evento('erro', m); });
eip.on('ipAlterado', (ip) => { modbus.mudarIp(ip); evento('rede', `CFW500 agora responde em ${ip === '0.0.0.0' ? 'todas as placas de rede' : ip}`); });
eip.on('resetIdentity', () => { evento('rede', 'Identity Reset recebido pela rede: reinicializando o inversor'); drive.desligar(); setTimeout(() => drive.ligar(), 600); });
modbus.on('log', (m) => evento('modbus', m));
ihm.on('log', (m) => evento('ihm', m));
drive.on('log', (m) => evento('info', m));
drive.on('falha', (f) => evento('falha', `F${String(f.cod).padStart(4, '0')} – ${f.nome}`));
drive.on('param', (p) => { if ((p.origem !== 'net' || ![684, 685].includes(p.n)) && !(p.n === 121 && p.origem === 'hmi')) evento('param', `P${String(p.n).padStart(4, '0')} = ${formatar(MAP.get(p.n), p.valor)} (${p.origem})`); });

// ------------------------- laço de simulação ------------------------
const DT = 0.005;          // passo do modelo do inversor (5 ms)
let tAnt = process.hrtime.bigint();
let acum = 0;
// SIM_MANUAL=1 (modo gravação de vídeo): o tempo da simulação só avança por GET /__passo?ms=40
const MANUAL = process.env.SIM_MANUAL === '1';
if (!MANUAL) setInterval(() => {
  const t = process.hrtime.bigint();
  acum += Number(t - tAnt) / 1e9; tAnt = t;
  if (acum > 0.25) acum = 0.25; // proteção se o PC "travar"
  while (acum >= DT) { drive.passo(DT); hmi.passo(DT); acum -= DT; }
  if (drive.sujo && Date.now() - (drive.tSalvo || 0) > 2000) { drive.salvarEEPROM(); drive.tSalvo = Date.now(); }
}, 5);

// ------------------------- scanner virtual (CLP simulado) -----------
let scanner = null;
const scnEstado = () => scanner ? {
  ativo: true, conectado: !!scanner.conn, run: scanner.run, saidas: scanner.saidas, entradas: scanner.entradas,
  conn: scanner.conn && { idOT: scanner.conn.idOT.toString(16), idTO: scanner.conn.idTO.toString(16), rpi: scanner.conn.rpi, rx: scanner.conn.rx, tx: scanner.conn.tx, grupo: scanner.conn.grupo },
  p0403: scanner.p0403, erro: scanner.ultimoErro,
} : { ativo: false };

async function scannerConectar(o) {
  if (scanner) await scannerDesconectar();
  // [HUB] com o adapter preso a um IP, 127.0.0.1 não alcança o inversor: usa o IP do adapter
  let host = o.host || '127.0.0.1';
  if (host === '127.0.0.1' && eip.bindIp && eip.bindIp !== '0.0.0.0') host = eip.bindIp;
  scanner = new ScannerEIP({ host, portaIOLocal: +o.portaLocal || 2223 });
  scanner.on('erro', (m) => { if (scanner) scanner.ultimoErro = m; });
  scanner.on('timeout', () => { if (scanner) scanner.ultimoErro = 'Timeout T→O (sem dados do adapter)'; });
  try {
    await scanner.conectar();
    evento('scanner', `Scanner virtual: sessão registrada em ${scanner.host}`);
    // leitura explícita de P0403 para converter Hz -> 13 bits (8192 = P0403)
    scanner.p0403 = await scanner.lerParam(403);
    const nS = 2 + (+o.extraSaida || 0); const nE = 2 + (+o.extraEntrada || 0);
    await scanner.forwardOpen({ rpi: +o.rpi || 10, palavrasSaida: nS, palavrasEntrada: nE, multicast: !!o.multicast, pontoOT: +o.pontoOT || 100, pontoTO: +o.pontoTO || 150 });
    scanner.ultimoErro = null;
    evento('scanner', `Scanner virtual: Forward Open OK (RPI ${o.rpi || 10} ms, ${nS} palavras de saída, ${nE} de entrada)`);
  } catch (e) {
    scanner.ultimoErro = e.message;
    evento('erro', `Scanner virtual: ${e.message}`);
  }
}
async function scannerDesconectar(semFC) {
  if (!scanner) return;
  const s = scanner; scanner = null;
  if (semFC) { s.pararIO(); try { s.sock.destroy(); } catch { /* */ } evento('scanner', 'Scanner virtual: parou de transmitir (simula cabo rompido/CLP desligado)'); return; }
  await s.fechar().catch(() => {});
  evento('scanner', 'Scanner virtual: Forward Close + sessão encerrada');
}

// ------------------------- Socket.IO --------------------------------
io.on('connection', (sock) => {
  sock.emit('init', {
    params: LIST.map((p) => ({ n: p.n, nome: p.nome, min: p.min, max: p.max, def: p.def, dec: p.dec, un: p.un, ro: p.ro, cfg: p.cfg, g: p.g, op: p.op, hex: p.hex, net: p.net })),
    falhas: FALHAS, alarmes: ALARMES, eventos, proto: logsProto.slice(-200),
    portas: { http: HTTP_PORT, modbus: modbus.porta, bind: BIND_IP },
    ihm: ihm.info(),
    ips: eip.interfaces(),
  });

  // ---- IP do inversor (como no CFW500: P0810 = 0, P0811..P0815 e P0849 = 1) ----
  sock.on('ips', (cb) => { if (cb) cb(eip.interfaces()); });
  sock.on('eipIp', ({ ip, cidr, padrao }, cb) => {
    const ok = (r) => { if (cb) cb(r); };
    if (padrao) {
      const r = drive.escrever(810, 1, 'ui'); if (r) return ok({ erro: r.msg });
      drive.escrever(849, 1, 'ui'); evento('param', 'IP: P0810 = 1 e P0849 = 1 (volta ao IP de inicialização)'); return ok({ ok: true });
    }
    const oct = String(ip || '').trim().split('.').map(Number);
    if (oct.length !== 4 || oct.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return ok({ erro: 'IP inválido' });
    const lista = [[810, 0], [811, oct[0]], [812, oct[1]], [813, oct[2]], [814, oct[3]], [815, Math.max(1, Math.min(31, +cidr || 24))]];
    for (const [n, v] of lista) { const r = drive.escrever(n, v, 'ui'); if (r) return ok({ erro: `P0${n}: ${r.msg}` }); }
    drive.escrever(849, 1, 'ui');
    evento('param', `IP: P0810 = 0, P0811..P0814 = ${oct.join('.')}, P0815 = ${lista[5][1]}, P0849 = 1`);
    ok({ ok: true });
  });

  // ---- IHM do painel (cliente Modbus TCP) ----
  sock.on('ihmCmd', async ({ id, valor }, cb) => { const r = await ihm.comando(id, valor); if (cb) cb(r); });
  sock.on('ihmCfg', (c, cb) => { ihm.configurar(c); io.emit('ihmInfo', ihm.info()); if (cb) cb({ ok: true }); });
  sock.on('ihmPadrao', (cb) => { ihm.padrao(); io.emit('ihmInfo', ihm.info()); if (typeof cb === 'function') cb({ ok: true }); });
  sock.on('ihmCom', (lig, cb) => { if (lig) ihm.iniciar(); else ihm.parar(); io.emit('ihmInfo', ihm.info()); if (typeof cb === 'function') cb({ ok: true, ativo: !!lig, alvo: `${ihm.cfg.ip}:${ihm.cfg.porta}` }); });
  sock.on('ihmLog', (on) => { if (on) sock.join('ihmlog'); else sock.leave('ihmlog'); });

  sock.on('tecla', ({ tecla, pressionada }) => hmi.tecla(tecla, pressionada));
  sock.on('di', ({ i, v }) => { if (i >= 0 && i < 4) drive.di[i] = !!v; });   // DI5/DI6 = sensores da esteira
  sock.on('ai1', (v) => { drive.ai1Volts = Math.max(0, Math.min(10, +v || 0)); });
  sock.on('param', ({ n, valor }, cb) => { const r = drive.escrever(+n, Math.round(+valor), 'ui'); if (cb) cb(r); });
  sock.on('energia', (lig) => { if (lig && !drive.ligado) drive.ligar(); else if (!lig && drive.ligado) drive.desligar(); });
  sock.on('injecao', ({ nome, v }) => {
    if (nome === 'rede') drive.redeVac = +v;
    else if (nome === 'cabo') eip.setLink(!v);
    else if (nome in drive.inj || nome === 'curto') drive.inj[nome] = !!v;
    evento('injecao', `Injeção: ${nome} = ${v}`);
  });
  sock.on('esteira', (o) => {
    if (o.acao === 'caixa') planta.adicionarCaixa(+o.massa || undefined);
    if (o.acao === 'limpar') planta.limpar();
    if (o.acao === 'travar') { planta.travada = !!o.v; evento('injecao', o.v ? 'Esteira TRAVADA (objeto preso)' : 'Esteira destravada'); }
    if (o.acao === 'auto') planta.alimentador.auto = !!o.v;
    if (o.acao === 'intervalo') planta.alimentador.intervalo = Math.max(0.5, +o.v || 4);
    if (o.acao === 'massa') planta.cfg.massaCaixa = Math.max(1, Math.min(200, +o.v || 20));
    if (o.acao === 'inclinacao') planta.cfg.inclinacao = Math.max(-15, Math.min(15, +o.v || 0));
    if (o.acao === 'zerar') { planta.contEntregues = 0; planta.contDevolvidas = 0; }
  });
  sock.on('presetRede', (cb) => {
    // Parametrização típica para comandar pela EtherNet/IP (motor parado!)
    const lista = [[220, 1, 'Sempre Remoto'], [222, 11, 'Referência pela rede'], [226, 9, 'Sentido pela rede'], [227, 4, 'Gira/Para pela rede'],
      [228, 5, 'JOG pela rede'], [105, 5, '1ª/2ª rampa pela rede'], [313, 1, 'Erro de rede: para por rampa']];
    const erros = lista.map(([n, v]) => [n, drive.escrever(n, v, 'ui')]).filter(([, r]) => r);
    evento('param', erros.length ? `Preset rede: ${erros.map(([n, r]) => `P${n}: ${r.msg}`).join('; ')}` : 'Preset aplicado: P0220=1, P0222=11, P0226=9, P0227=4, P0228=5, P0105=5, P0313=1');
    if (typeof cb === 'function') cb(erros.length ? { erro: erros.map(([n, r]) => `P${String(n).padStart(4, '0')}: ${r.msg}`).join(' · ') }
      : { ok: true, itens: lista.map(([n, v, t]) => `P${String(n).padStart(4, '0')} = ${v} — ${t}`) });
  });
  sock.on('presetTutorial', (cb) => {
    // Tudo o que o projeto do Guia (IHM Modbus + CODESYS) precisa: comando pela rede + corrente na 3ª palavra de entrada
    const lista = [[220, 1, 'Sempre Remoto'], [222, 11, 'Referência pela rede'], [226, 9, 'Sentido pela rede'], [227, 4, 'Gira/Para pela rede'],
      [228, 5, 'JOG pela rede'], [105, 5, '1ª/2ª rampa pela rede'], [313, 1, 'Erro de rede: para por rampa'],
      [820, 3, '3ª palavra de entrada = corrente (P0003)'], [849, 1, 'Aplica a configuração Ethernet']];
    const erros = lista.map(([n, v]) => [n, drive.escrever(n, v, 'ui')]).filter(([, r]) => r);
    evento('param', erros.length ? `Preparar para o tutorial: ${erros.map(([n, r]) => `P${n}: ${r.msg}`).join('; ')}` : 'Preparado para o tutorial: rede + P0820 = 3 + P0849 = 1');
    if (typeof cb === 'function') cb(erros.length ? { erro: erros.map(([n, r]) => `P${String(n).padStart(4, '0')}: ${r.msg}`).join(' · ') }
      : { ok: true, itens: lista.map(([n, v, t]) => `P${String(n).padStart(4, '0')} = ${v} — ${t}`) });
  });
  sock.on('fabrica', (hz, cb) => {
    // P0204 = 5 (60 Hz) ou 6 (50 Hz): carrega o padrão de fábrica, igual à HMI do inversor
    const op = +hz === 50 ? 6 : 5;
    const r = drive.escrever(204, op, 'ui');
    if (!r) { drive.salvarEEPROM(); evento('param', `Padrão de fábrica ${op === 5 ? '60' : '50'} Hz carregado (P0204 = ${op})`); }
    if (typeof cb === 'function') cb(r ? { erro: r.msg } : { ok: true, op });
  });
  sock.on('scanner', async (o, cb) => {
    const fim = (r) => { if (typeof cb === 'function') cb(r); };
    if (o.acao === 'conectar') { await scannerConectar(o); fim(scanner && scanner.conn && !scanner.ultimoErro ? { ok: true, rpi: scanner.conn.rpi } : { erro: (scanner && scanner.ultimoErro) || 'falha ao conectar' }); }
    if (o.acao === 'desconectar') { const tinha = !!scanner; await scannerDesconectar(false); fim(tinha ? { ok: true } : { erro: 'o CLP virtual não estava conectado' }); }
    if (o.acao === 'cortar') { const tinha = !!scanner; await scannerDesconectar(true); fim(tinha ? { ok: true } : { erro: 'o CLP virtual não estava conectado' }); }
    if (!scanner) return;
    if (o.acao === 'saidas' && Array.isArray(o.v)) o.v.forEach((x, i) => { if (i < scanner.saidas.length) scanner.saidas[i] = (+x) & 0xFFFF; });
    if (o.acao === 'run') scanner.run = !!o.v;
  });
});

// difusão periódica do estado (~25 Hz)
function difundir(volatil) {
  const vals = {};
  for (const p of LIST) vals[p.n] = drive.get(p.n);
  (volatil ? io.volatile : io).emit('estado', { drive: drive.estado(), hmi: hmi.display(), eip: eip.estado(), vals, scanner: scnEstado(), ihm: ihm.estado(), modbus: { porta: modbus.porta, clientes: modbus.clientes.size, telegramas: modbus.telegramas } });
}
if (!MANUAL) setInterval(() => difundir(true), 40);
else app.get('/__passo', (req, res) => {
  const n = Math.round((+req.query.ms || 40) / 1000 / DT);
  for (let i = 0; i < n; i++) { drive.passo(DT); hmi.passo(DT); }
  difundir(false);
  res.send('ok');
});

// telegramas do cliente Modbus da IHM (só para quem está com a aba aberta)
let tQuadros = 0;
setInterval(() => {
  const q = ihm.pegarQuadros(tQuadros);
  if (q.length) { tQuadros = q[q.length - 1].t; io.to('ihmlog').emit('ihmQuadros', q); }
}, 300);

// ------------------------- inicialização ----------------------------
eip.iniciar();
modbus.bindIp = eip.bindIp;   // o Modbus do módulo responde no mesmo IP do EtherNet/IP
modbus.iniciar();
srv.listen(HTTP_PORT, () => {
  const ifs = eip.interfaces().filter((i) => !i.interno).map((i) => i.ip).join(', ') || '127.0.0.1';
  console.log('==============================================================');
  console.log('  Simulador WEG CFW500 + EtherNet/IP Adapter + Esteira 3D');
  console.log('==============================================================');
  console.log(`  Interface web : http://localhost:${HTTP_PORT}`);
  console.log(`  EtherNet/IP   : TCP/UDP 44818 e UDP 2222 em ${eip.bindIp === '0.0.0.0' ? ifs : eip.bindIp}${eip.origemIp === 'parâmetros' ? ' (IP de P0811..P0814)' : ''}`);
  console.log(`  Modbus TCP    : porta ${modbus.porta}`);
  console.log(`  IHM (cliente) : CLP em ${ihm.cfg.ip}:${ihm.cfg.porta} ${ihm.cfg.ativo ? '(comunicação ativa)' : '(parada — ative na aba IHM Modbus)'}`);
  console.log('  Assemblies    : O→T 100 (saída) | T→O 150 (entrada) | Config 1 (0 bytes)');
  console.log('==============================================================');
});

process.on('SIGINT', () => { drive.salvarEEPROM(); process.exit(0); });
