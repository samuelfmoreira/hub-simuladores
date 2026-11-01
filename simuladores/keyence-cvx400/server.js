/**
 * =====================================================================
 *  SIMULADOR DO SISTEMA DE VISÃO KEYENCE CV-X400 — SERVIDOR
 * =====================================================================
 *  - VÁRIAS CÂMERAS INDEPENDENTES: cada câmera tem o seu IP e a sua própria
 *    pilha EtherNet/IP (TCP 44818 + UDP 2222 presos ao IP dela), o seu
 *    modelo CV-X (sinais, programas, peça, contadores) e o seu CLP dono.
 *    Dois CLPs, cada um apontando para o IP de uma câmera, ficam totalmente
 *    separados, inclusive no tráfego EtherNet/IP.
 *  - Identidade do EDS Keyence_5005_0102.eds (CV-X400 Series).
 *  - Programas 041 INSPECAO_ETIQUETA e 042 DISCO_FUROS (ver programas.js).
 *  - Interface web na porta 3001 (a 3000 fica livre para o supervisório).
 * =====================================================================
 */

"use strict";

const path = require("path");
const fs = require("fs");
const http = require("http");
const os = require("os");
const express = require("express");
const { Server } = require("socket.io");
const { AdapterEIP } = require("./eip-adapter");
const { SimuladorCVX } = require("./cvx");

const WEB_PORT = Number(process.env.SIM_HTTP_PORT) || 3001;   // [HUB] porta definida pelo HUB

// Prioridade alta no Windows: o envio cíclico para o CLP sofre menos atraso
// quando o PC está ocupado (não precisa de administrador).
try { os.setPriority(0, os.constants.priority.PRIORITY_HIGH); } catch (_) { }

// Identidade conforme o EDS (VendCode, ProdType, ProdCode, MajRev, MinRev)
const IDENTIDADE = {
  vendorId: 367,            // Keyence Corporation
  deviceType: 43,           // Generic Device
  productCode: 5005,        // CV-X400 Series
  revMajor: 1,
  revMinor: 1,
  serial: 0x00c0ffee,
  nome: "CV-X400 Series",
};

// ---------------------------------------------------------------------
// CÂMERAS (guardadas em config_cameras.json)
//   [{ id, nome, ip, ipClp, portaUdp }]
//   portaUdp: porta em que a câmera recebe o O->T (2222 padrão). No mesmo
//             PC do CODESYS, usar outra (ex.: 2223) evita disputar a 2222.
//   ip:    IP em que a câmera atende ("0.0.0.0" = todos; só com 1 câmera)
//   ipClp: destino fixo do T->O (vazio = IP de quem abriu a conexão)
// O configurar_rede_virtual.bat cria os IPs no Windows e grava este arquivo.
// ---------------------------------------------------------------------
const ARQ_CAMERAS = path.join(__dirname, "config_cameras.json");
const ARQ_REDE_ANTIGO = path.join(__dirname, "config_rede.json");

const ehIpv4 = (t) => /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(t) &&
  t.split(".").every((n) => Number(n) <= 255);

function lerConfigCameras() {
  try {
    const c = JSON.parse(fs.readFileSync(ARQ_CAMERAS, "utf8").replace(/^\uFEFF/, ""));
    const lista = (c.cameras || []).filter((x) => x && (x.ip === "0.0.0.0" || ehIpv4(x.ip)));
    if (lista.length) return lista;
  } catch (_) { /* sem arquivo: usa o padrão */ }
  // Compatibilidade com a versão de uma câmera só (config_rede.json)
  try {
    const r = JSON.parse(fs.readFileSync(ARQ_REDE_ANTIGO, "utf8"));
    return [{ nome: "Câmera 1", ip: r.ipEscuta || "0.0.0.0", ipClp: r.ipClp || "" }];
  } catch (_) {
    // [HUB] sem config_cameras.json: a 1a câmera usa o IP atribuído pelo HUB
    return [{ nome: "Câmera 1", ip: process.env.SIM_IP || "0.0.0.0", ipClp: "" }];
  }
}

function salvarConfigCameras() {
  const lista = [...cameras.values()].map((c) => ({ nome: c.nome, ip: c.ip, ipClp: c.ipClp || "", portaUdp: c.portaUdp }));
  fs.writeFileSync(ARQ_CAMERAS, JSON.stringify({ cameras: lista }, null, 2));
}

const cameras = new Map();   // id -> { id, nome, ip, ipClp, cvx, adapter, erroRede }
let proximoId = 1;

function ipsLocais() {
  const lista = [];
  for (const [nome, ifs] of Object.entries(os.networkInterfaces())) {
    for (const i of ifs || []) {
      if (i.family === "IPv4" && !i.internal) lista.push({ interface: nome, ip: i.address, mascara: i.netmask });
    }
  }
  return lista;
}

/*
 * Regras de IP: cada câmera precisa de um IP diferente, existente neste PC.
 * "Todos os IPs" (0.0.0.0) só é permitido quando existe uma única câmera,
 * porque ocuparia as portas 44818/2222 de todos os IPs.
 */
function validarIp(ip, idIgnorar) {
  if (!ip) return "informe o IP da câmera";
  const outras = [...cameras.values()].filter((c) => c.id !== idIgnorar);
  if (ip === "0.0.0.0") {
    return outras.length ? "\"Todos os IPs\" só pode ser usado com uma única câmera" : null;
  }
  if (!ehIpv4(ip)) return `IP inválido: ${ip}`;
  if (!ipsLocais().some((i) => i.ip === ip)) return `o IP ${ip} não existe neste PC (rode o configurar_rede_virtual.bat)`;
  if (outras.some((c) => c.ip === "0.0.0.0")) return "outra câmera está em \"Todos os IPs\"; mude ela para um IP próprio antes";
  if (outras.some((c) => c.ip === ip)) return `o IP ${ip} já é usado por outra câmera`;
  return null;
}

const portaValida = (p) => Number.isInteger(p) && p >= 1024 && p <= 65535;

function criarCamera({ nome, ip, ipClp, portaUdp }) {
  const id = String(proximoId++);
  const porta = portaValida(Number(portaUdp)) ? Number(portaUdp) : 2222;
  const cam = { id, nome: nome || `Câmera ${id}`, ip, ipClp: ipClp || "", portaUdp: porta, erroRede: null };
  const cvx = new SimuladorCVX();
  const adapter = new AdapterEIP({
    identidade: { ...IDENTIDADE, serial: (IDENTIDADE.serial + Number(id)) >>> 0 },
    assemblies: { entrada: 100, saida: 101, configuracao: 1, heartbeatSoEntrada: 254, soEscuta: 255 },
    tamanhoMin: 2,
    tamanhoMax: 1436,
    rpiMinUs: 1000,           // Param100 do EDS: 1 ms ..
    rpiMaxUs: 10000000,       //                 .. 10 s
    lerEntrada: () => cvx.lerEntrada(),
    ipEscuta: ip,
    ipClp: ipClp || null,
    portaUdp: porta,
  });
  cam.cvx = cvx;
  cam.adapter = adapter;

  // Eventos da câmera (modelo CV-X)
  cvx.on("log", (m) => log(m, cam));
  cvx.on("mudou", agendarEstado);
  cvx.on("disparo", () => {
    for (const sock of io.sockets.sockets.values()) {
      if (sock.data.camera === id) sock.emit("flash");
    }
  });

  // Eventos da rede desta câmera
  adapter.on("log", (m) => log(m, cam));
  adapter.on("erro", (m) => {
    if (/EADDRINUSE|EADDRNOTAVAIL|EACCES/.test(m)) cam.erroRede = m;
    log("ERRO: " + m, cam);
    agendarEstado();
  });
  adapter.on("estado", agendarEstado);
  adapter.on("saidas", (buf, run) => cvx.receberSaidas(buf, run));
  adapter.on("conexao_fechada", () => {
    if (![...adapter.conexoes.values()].some((c) => c.tipo === "dono exclusivo")) cvx.clpDesconectou();
  });

  cameras.set(id, cam);
  adapter.iniciar();
  return cam;
}

async function removerCamera(cam) {
  await cam.adapter.parar();
  cam.cvx.destruir();
  cameras.delete(cam.id);
}

function resumoCamera(cam) {
  const cx = [...cam.adapter.conexoes.values()];
  const dono = cx.find((c) => c.tipo === "dono exclusivo");
  const u = cam.cvx.ultimaLeitura;
  return {
    id: cam.id,
    nome: cam.nome,
    ip: cam.ip,
    ipClp: cam.ipClp,
    portaUdp: cam.portaUdp,
    reaberturas: cam.adapter.reaberturas,
    clp: dono ? dono.ipOrigem : null,
    online: cx.length > 0,
    run: !!(dono && dono.run),
    totalCount: cam.cvx.s.totalCount,
    ultimo: u ? (u.ok ? "ok" : "ng") : null,
    modo: cam.cvx.modo,
    programa: cam.cvx.prog.numero,
    erroRede: cam.erroRede,
  };
}

// ---------------------------------------------------------------------
// Web
// ---------------------------------------------------------------------
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(
  express.static(path.join(__dirname, "public"), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => res.set("Cache-Control", "no-store"),
  })
);

/*
 * EVENTOS: vão para a tela (painel Eventos) e para o arquivo eventos.log.
 * NÃO são escritos na janela do console: no Windows, escrever no console é
 * síncrono, e se alguém clicar/selecionar texto na janela preta (edição
 * rápida) o programa INTEIRO congela até a seleção ser desfeita. Com ele
 * congelado, a câmera para de enviar e o CLP derruba a conexão.
 */
const ARQ_EVENTOS = path.join(__dirname, "eventos.log");
try {
  if (fs.statSync(ARQ_EVENTOS).size > 5 * 1024 * 1024) fs.renameSync(ARQ_EVENTOS, ARQ_EVENTOS + ".1");
} catch (_) { /* arquivo ainda não existe */ }
const arquivoEventos = fs.createWriteStream(ARQ_EVENTOS, { flags: "a" });
arquivoEventos.on("error", () => { /* disco cheio etc.: só não grava */ });

function log(msg, cam = null) {
  const prefixo = cam ? `[${cam.nome}] ` : "";
  const agora = new Date();
  const linha = `[${agora.toLocaleTimeString("pt-BR")}] ${prefixo}${msg}`;
  arquivoEventos.write(`${agora.toLocaleDateString("pt-BR")} ${linha}\n`);
  io.emit("log", { linha, sessao: cam ? cam.id : null });
}

/*
 * DETECTOR DE PROGRAMA PARADO
 * Um relógio de 50 ms mede se o Node ficou travado. Se passar de 300 ms,
 * nenhuma câmera enviou dados nesse tempo: registra o aviso (é a causa
 * mais comum de "Connection timed out" e "Message request timed out").
 */
let tickAnterior = Date.now();
setInterval(() => {
  const agora = Date.now();
  const parado = agora - tickAnterior - 50;
  tickAnterior = agora;
  if (parado > 300) {
    log(`ATENÇÃO: o simulador ficou parado por ${(parado / 1000).toFixed(1)} s e não enviou dados aos CLPs. ` +
      "Causa comum: clicar ou selecionar texto na janela preta do simulador (o Windows pausa o programa). " +
      "Não clique nela; para sair da seleção, aperte Esc.");
  }
}, 50);

// Estado para um navegador: lista de câmeras + a câmera que ele está olhando
function montarEstado(idCamera) {
  const cam = cameras.get(idCamera);
  const geral = {
    rede: { ips: ipsLocais(), portaTcp: 44818, portaUdp: 2222, identidade: IDENTIDADE },
    sessoes: [...cameras.values()].map(resumoCamera),
    ipsEmUso: [...cameras.values()].map((c) => c.ip),
    sessaoId: null,
    sessao: null,
    eip: { ipEscuta: "0.0.0.0", ipClp: null, sessoes: 0, conexoes: [] },
  };
  if (!cam) return geral;
  const e = cam.cvx.estado();
  geral.sessaoId = cam.id;
  geral.camera = resumoCamera(cam);
  geral.eip = cam.adapter.resumo();
  geral.sessao = { ...e, bytes: [...cam.cvx.lerEntrada().subarray(0, Math.max(e.bytesNecessarios, 64))] };
  return geral;
}

// Agrupa mudanças: no máximo 1 envio a cada 100 ms para cada navegador
let envioPendente = null;
function agendarEstado() {
  if (envioPendente) return;
  envioPendente = setTimeout(() => {
    envioPendente = null;
    for (const sock of io.sockets.sockets.values()) {
      if (!cameras.has(sock.data.camera)) sock.data.camera = cameras.keys().next().value || null;
      sock.emit("estado", montarEstado(sock.data.camera));
    }
  }, 100);
}
setInterval(agendarEstado, 1000);   // contadores de pacotes

// ---------------------------------------------------------------------
// Socket.IO (cada navegador escolhe qual câmera está vendo)
// ---------------------------------------------------------------------
io.on("connection", (socket) => {
  socket.data.camera = cameras.keys().next().value || null;
  socket.emit("estado", montarEstado(socket.data.camera));

  const atual = () => cameras.get(socket.data.camera);
  // Executa a ação na câmera escolhida por este navegador
  const naSessao = (fn) => (...args) => {
    const s = atual();
    if (s) fn(s, ...args);
  };

  socket.on("selecionar_sessao", (id) => {
    if (!cameras.has(id)) return;
    socket.data.camera = id;
    socket.emit("estado", montarEstado(id));
  });

  // ---- Câmeras ----
  socket.on("adicionar_camera", (c = {}) => {
    const ip = c.ip || "";
    const erro = validarIp(ip, null);
    if (erro) { log(`Câmera não criada: ${erro}`); return; }
    const ipClp = (c.ipClp || "").trim();
    if (ipClp && !ehIpv4(ipClp)) { log(`Câmera não criada: IP do CLP inválido (${ipClp})`); return; }
    const cam = criarCamera({ nome: String(c.nome || "").trim().slice(0, 30) || undefined, ip, ipClp, portaUdp: Number(c.portaUdp) || 2222 });
    salvarConfigCameras();
    log(`Câmera criada no IP ${ip}`, cam);
    socket.data.camera = cam.id;
    agendarEstado();
  });

  socket.on("remover_sessao", async (id) => {
    const cam = cameras.get(id);
    if (!cam) return;
    if (cameras.size === 1) { log("Precisa existir pelo menos uma câmera", cam); return; }
    if (cam.adapter.conexoes.size) { log("Não é possível remover: há um CLP conectado a esta câmera", cam); return; }
    await removerCamera(cam);
    salvarConfigCameras();
    log(`${cam.nome} (${cam.ip}) removida`);
    agendarEstado();
  });

  socket.on("set_rede", naSessao(async (cam, c = {}) => {
    const ip = c.ipEscuta || "0.0.0.0";
    const ipClp = (c.ipClp || "").trim();
    const nome = String(c.nome || "").trim().slice(0, 30);
    const erro = validarIp(ip, cam.id);
    if (erro) { log(`Rede não alterada: ${erro}`, cam); return; }
    if (ipClp && !ehIpv4(ipClp)) { log(`IP do CLP inválido: ${ipClp}`, cam); return; }
    if (ipClp && ipClp === ip) { log("O IP do CLP não pode ser o mesmo IP da câmera", cam); return; }
    const porta = Number(c.portaUdp) || 2222;
    if (!portaValida(porta) || porta === 44818) { log(`Porta UDP de I/O inválida: ${c.portaUdp}`, cam); return; }
    if (nome) cam.nome = nome;
    cam.portaUdp = porta;
    cam.ip = ip;
    cam.ipClp = ipClp;
    cam.erroRede = null;
    salvarConfigCameras();
    log(`Rede: câmera em ${ip === "0.0.0.0" ? "todos os IPs" : ip}, O->T recebido na UDP ${porta}, ` +
      `T->O para ${ipClp || "o IP de quem conectar"}. Reiniciando a comunicação...`, cam);
    await cam.adapter.reiniciar({ ipEscuta: ip, ipClp: ipClp || null, portaUdp: porta });
    cam.cvx.clpDesconectou();
  }));

  // ---- Peça, cenários e falhas ----
  socket.on("set_peca", naSessao((s, dados = {}) => {
    s.cvx.definirPeca(dados);
    log("Peça alterada manualmente", s);
  }));

  // Cenário de teste; com "todos", vale para as câmeras com programa do mesmo tipo
  socket.on("cenario", (id, todos) => {
    const cam = atual();
    if (!cam) return;
    const tipo = cam.cvx.prog.tipo;
    const alvo = todos ? [...cameras.values()].filter((s) => s.cvx.prog.tipo === tipo) : [cam];
    for (const s of alvo) {
      const d = s.cvx.aplicarCenario(id);
      if (d) log(`Cenário: ${d}`, s);
    }
  });

  socket.on("set_falhas", naSessao((s, lista) => {
    if (!Array.isArray(lista)) return;
    s.cvx.definirFalhas(lista);
    const ativos = s.cvx.def.nomesFalha.filter((_, i) => lista[i]);
    log(ativos.length ? `Falha simulada em: ${ativos.join(", ")}` : "Sem falhas simuladas", s);
  }));

  // ---- Programas ----
  socket.on("carregar_programa", naSessao((s, numero) => {
    s.cvx.carregarPrograma(numero, "tela", (erro) => { if (erro) log(`Troca de programa recusada: ${erro}`, s); });
  }));

  socket.on("novo_programa", naSessao((s, p = {}) => {
    const erro = s.cvx.novoPrograma(p);
    log(erro ? `Programa não criado: ${erro}`
      : `Programa ${String(p.numero).padStart(3, "0")} ${String(p.nome).toUpperCase()} criado` +
        (p.duplicar ? ` (cópia do Conf. ${String(s.cvx.prog.numero).padStart(3, "0")})` : ""), s);
  }));

  socket.on("excluir_programa", naSessao((s, numero) => {
    const erro = s.cvx.excluirPrograma(numero);
    log(erro ? `Programa não excluído: ${erro}` : `Programa ${String(numero).padStart(3, "0")} excluído`, s);
  }));

  socket.on("set_limites", naSessao((s, d = {}) => {
    s.cvx.definirLimites(d);
    log(`Tolerâncias: ${JSON.stringify(s.cvx.config.limites)}`, s);
  }));

  // Botão Exec da tela: em programação vira medição de teste
  socket.on("disparar", (todos) => {
    const alvo = todos ? [...cameras.values()] : [atual()].filter(Boolean);
    alvo.forEach((s) => s.cvx.disparar("botão Exec", s.cvx.modo === "programacao" && !todos));
  });

  socket.on("set_modo", naSessao((s, modo) => s.cvx.definirModo(modo)));

  socket.on("set_saidas", naSessao((s, lista) => {
    s.cvx.definirSaidas(lista);
    const nomes = s.cvx.config.saidas.map((l) =>
      `${String(l.byte).padStart(4, "0")}:bit${l.bit} ${l.item === "STATUS" ? "Status Total" : l.item} ${l.tempo}`);
    log(`Atribuição de saída: ${nomes.join(" | ") || "nenhuma linha"}`, s);
  }));

  socket.on("set_programa", naSessao((s, p = {}) => {
    s.cvx.definirPrograma(p);
    log(`Programa: Conf. ${String(s.cvx.prog.numero).padStart(3, "0")} ${s.cvx.prog.nome}`, s);
  }));

  socket.on("set_config", naSessao((s, c = {}) => {
    s.cvx.definirConfig(c);
    log(`Configuração: ${JSON.stringify(s.cvx.config)}`, s);
  }));

  socket.on("zerar_contagem", naSessao((s) => {
    s.cvx.zerarContagem();
    log("Contadores zerados (Cont e Cont NG)", s);
  }));
});

// ---------------------------------------------------------------------
server.on("error", (err) => {
  console.error(err.code === "EADDRINUSE"
    ? `A porta ${WEB_PORT} já está em uso. Feche o outro simulador e tente de novo.`
    : `Erro no servidor web: ${err.message}`);
  process.exit(1);
});

server.listen(WEB_PORT, () => {
  console.log(`Simulador de visão em http://localhost:${WEB_PORT}`);
  console.log("Os eventos aparecem na tela do simulador e no arquivo eventos.log.");
  console.log("NÃO clique nem selecione texto nesta janela: o Windows pausa o programa e os CLPs perdem a conexão.");
  console.log("Para encerrar o simulador, feche esta janela.");
  console.log("IPs deste PC:", ipsLocais().map((i) => i.ip).join(", ") || "nenhum");

  // Sobe as câmeras configuradas. IP que sumiu do PC: a câmera é criada e
  // mostra o erro na tela, para o usuário corrigir em Utilidade.
  const lista = lerConfigCameras();
  const usados = new Set();
  for (const c of lista) {
    let ip = c.ip;
    if (lista.length > 1 && ip === "0.0.0.0") continue;
    if (usados.has(ip)) continue;
    usados.add(ip);
    const cam = criarCamera({ nome: c.nome, ip, ipClp: c.ipClp, portaUdp: c.portaUdp });
    if (ip !== "0.0.0.0" && !ipsLocais().some((i) => i.ip === ip)) {
      cam.erroRede = `o IP ${ip} não existe neste PC (rode o configurar_rede_virtual.bat)`;
    }
    console.log(`${cam.nome}: ${ip === "0.0.0.0" ? "todos os IPs" : ip}`);
  }
  if (!cameras.size) criarCamera({ nome: "Câmera 1", ip: "0.0.0.0", ipClp: "" });
});

process.on("SIGINT", async () => {
  for (const c of [...cameras.values()]) await removerCamera(c);
  process.exit(0);
});
