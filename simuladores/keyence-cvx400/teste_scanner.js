/**
 * =====================================================================
 *  TESTE SEM CLP: scanner EtherNet/IP mínimo
 * =====================================================================
 *  Faz o papel do XP325: abre a conexão de I/O com o simulador, manda
 *  TRG1 a cada 3 s e mostra o que chega no assembly 100 (BUSY, READY,
 *  Result ready e os 6 QR codes decodificados).
 *
 *  Uso:  node teste_scanner.js [ip_do_simulador] [tamanho_bytes] [porta_udp_local]
 *        node teste_scanner.js 127.0.0.1 496
 *        node teste_scanner.js 192.168.100.20 496 2222   (imitando o CODESYS no mesmo PC)
 *  5º parâmetro opcional: IP local de origem (para simular outro CLP)
 *
 *  Opções:
 *   --reabrir      depois de 3 s manda de novo o mesmo Forward_Open (imita o
 *                  CODESYS quando ele não recebe o T->O)
 *   --disco        decodifica a área de dados como o programa DISCO_FUROS
 *                  (carregue o programa 042 na tela do simulador antes)
 *        node teste_scanner.js 127.0.0.1 496 --disco
 * =====================================================================
 */

"use strict";

const net = require("net");
const dgram = require("dgram");
const { lerCPF, montarCPF, CMD, ITEM } = require("./eip-adapter");

// Separa a opção --disco dos parâmetros posicionais
const argv = process.argv.slice(2);
const pos = [];
let DISCO = false;
let REABRIR = false;
for (const a of argv) {
  if (a === "--disco") DISCO = true;
  else if (a === "--reabrir") REABRIR = true;
  else pos.push(a);
}

const IP = pos[0] || "127.0.0.1";
const TAMANHO = Number(pos[1]) || 496;   // bytes de dados de cada assembly
const RPI_US = 10000;                               // 10 ms
const PORTA_LOCAL_UDP = Number(pos[2]) || 2223;
const IP_LOCAL = pos[3] || undefined;  // 2223: o simulador escuta a 2222 em todos os IPs
const OFFSET = 48;
const QRS = [["MAIOR", 54], ["MENOR_1", 10], ["MENOR_2", 10], ["MENOR_3", 10], ["MENOR_4", 10], ["MENOR_5", 10]];

let sessao = 0;
let portaO2T = 2222;
let o2tId = 0;
let t2oId = 0x5000;
const serialConexao = (Math.random() * 0xffff) >>> 0;          // cada execução = um "CLP" diferente
const serialOriginador = (Math.random() * 0xffffffff) >>> 0;
let saida = Buffer.alloc(TAMANHO);
let ultimaEntrada = null;
let seqO2T = 0;
let encapSeq = 0;

function encap(comando, dados) {
  const h = Buffer.alloc(24);
  h.writeUInt16LE(comando, 0);
  h.writeUInt16LE(dados.length, 2);
  h.writeUInt32LE(sessao, 4);
  return Buffer.concat([h, dados]);
}

const tcp = net.connect({ port: 44818, host: IP, localAddress: IP_LOCAL });
const udp = dgram.createSocket({ type: "udp4", reuseAddr: true });
let pendente = null;
let acumulado = Buffer.alloc(0);

tcp.on("data", (d) => {
  acumulado = Buffer.concat([acumulado, d]);
  while (acumulado.length >= 24 && acumulado.length >= 24 + acumulado.readUInt16LE(2)) {
    const tam = 24 + acumulado.readUInt16LE(2);
    const pacote = acumulado.subarray(0, tam);
    acumulado = acumulado.subarray(tam);
    if (pendente) { const p = pendente; pendente = null; p(pacote); }
  }
});

const pedir = (pacote) => new Promise((res) => { pendente = res; tcp.write(pacote); });

function rrData(mr, extras = []) {
  return encap(CMD.SEND_RR_DATA, Buffer.concat([
    Buffer.alloc(6),
    montarCPF([{ tipo: ITEM.NULL, dados: Buffer.alloc(0) }, { tipo: ITEM.UNCONNECTED_DATA, dados: mr }, ...extras]),
  ]));
}

function texto(entrada, inicio, n) {
  let s = "";
  for (let k = 0; k < n; k++) {
    const c = entrada.readInt32LE(inicio + k * 4);
    s += c === 0 ? "·" : String.fromCharCode(c);
  }
  return s;
}

async function main() {
  await new Promise((r) => tcp.once("connect", r));

  // 1) ListIdentity
  const li = await pedir(encap(CMD.LIST_IDENTITY, Buffer.alloc(0)));
  const id = lerCPF(li.subarray(24), 0)[0].dados;
  const nomeLen = id[2 + 16 + 14];
  console.log(`Dispositivo: ${id.subarray(2 + 16 + 15, 2 + 16 + 15 + nomeLen)} ` +
    `(vendor ${id.readUInt16LE(18)}, produto ${id.readUInt16LE(22)}, rev ${id[24]}.${id[25]})`);

  // 2) RegisterSession
  const rs = await pedir(encap(CMD.REGISTER_SESSION, Buffer.from([1, 0, 0, 0])));
  sessao = rs.readUInt32LE(4);
  console.log(`Sessão ${sessao}`);

  // 3) Forward_Open (dono exclusivo, ponto a ponto, assemblies 101/100)
  await new Promise((r) => udp.bind(PORTA_LOCAL_UDP, IP_LOCAL, r));
  const caminho = Buffer.from([0x20, 0x04, 0x24, 0x01, 0x2c, 0x65, 0x2c, 0x64]);
  const fo = Buffer.alloc(36);
  fo[0] = 0x0a; fo[1] = 0x0e;
  fo.writeUInt32LE(0, 2);                       // O->T (o alvo escolhe)
  fo.writeUInt32LE(t2oId, 6);                   // T->O (escolhido por nós)
  fo.writeUInt16LE(serialConexao, 10);
  fo.writeUInt16LE(0x0186, 12);                 // vendor do originador (qualquer)
  fo.writeUInt32LE(serialOriginador, 14);
  fo[18] = 2;                                   // multiplicador de timeout (x16)
  fo.writeUInt32LE(RPI_US, 22);
  fo.writeUInt16LE(0x4800 | (TAMANHO + 6), 26); // ponto a ponto, fixo, prioridade scheduled
  fo.writeUInt32LE(RPI_US, 28);
  fo.writeUInt16LE(0x4800 | (TAMANHO + 2), 32);
  fo[34] = 0x01;                                // classe 1, cíclico
  fo[35] = caminho.length / 2;
  const mr = Buffer.concat([Buffer.from([0x54, 0x02, 0x20, 0x06, 0x24, 0x01]), fo, caminho]);

  const sock = Buffer.alloc(20);
  sock.writeUInt16LE(ITEM.SOCKADDR_T2O, 0);
  sock.writeUInt16LE(16, 2);
  sock.writeUInt16BE(2, 4);
  sock.writeUInt16BE(PORTA_LOCAL_UDP, 6);       // "mande o T->O para esta porta"

  const r = await pedir(rrData(mr, [sock]));
  const itens = lerCPF(r.subarray(24), 6);
  const resp = itens.find((i) => i.tipo === ITEM.UNCONNECTED_DATA).dados;
  if (resp[2] !== 0) {
    console.log(`Forward_Open recusado: status 0x${resp[2].toString(16)} ext 0x${resp.readUInt16LE(4).toString(16)}`);
    process.exit(1);
  }
  o2tId = resp.readUInt32LE(4);
  t2oId = resp.readUInt32LE(8);
  // Porta para onde mandar o O->T: a que a câmera informou (padrão 2222)
  const so2t = itens.find((i) => i.tipo === ITEM.SOCKADDR_O2T);
  portaO2T = so2t ? so2t.dados.readUInt16BE(2) : 2222;
  console.log(`Câmera recebe o O->T na UDP ${portaO2T}`);
  console.log(`Conexão aberta: O->T 0x${o2tId.toString(16)}, T->O 0x${t2oId.toString(16)}, ${TAMANHO} bytes, RPI ${RPI_US / 1000} ms\n`);

  // 4) Recebe T->O
  udp.on("message", (m) => {
    const it = lerCPF(m, 0);
    const dados = it.find((i) => i.tipo === ITEM.CONNECTED_DATA);
    if (dados) ultimaEntrada = dados.dados.subarray(2);
  });

  // 5) Envia O->T no RPI (Run/Idle = RUN)
  setInterval(() => {
    const end = Buffer.alloc(8);
    end.writeUInt32LE(o2tId, 0);
    end.writeUInt32LE(++encapSeq, 4);
    const cab = Buffer.alloc(6);
    cab.writeUInt16LE(++seqO2T & 0xffff, 0);
    cab.writeUInt32LE(1, 2);                    // bit 0 = RUN
    udp.send(montarCPF([
      { tipo: ITEM.SEQUENCED_ADDRESS, dados: end },
      { tipo: ITEM.CONNECTED_DATA, dados: Buffer.concat([cab, saida]) },
    ]), portaO2T, IP);
  }, RPI_US / 1000);

  // Reabertura com o mesmo trio (como o CODESYS faz quando não recebe T->O)
  if (REABRIR) {
    setTimeout(async () => {
      const r2 = await pedir(rrData(mr, [sock]));
      const resp2 = lerCPF(r2.subarray(24), 6).find((i) => i.tipo === ITEM.UNCONNECTED_DATA).dados;
      if (resp2[2] === 0) {
        o2tId = resp2.readUInt32LE(4);
        console.log(`\nReabertura aceita: novo O->T 0x${o2tId.toString(16)}\n`);
      } else {
        console.log(`\nReabertura recusada: ext 0x${resp2.readUInt16LE(4).toString(16)}\n`);
      }
    }, 3000);
  }

  // 6) Ciclo de teste: TRG1 por 100 ms a cada 3 s; Result ack quando Result ready
  setInterval(() => {
    saida[1] |= 0x01;
    setTimeout(() => { saida[1] &= ~0x01; }, 100);
  }, 3000);

  let readyAnterior = false;
  let busyAnterior = false;
  setInterval(() => {
    if (!ultimaEntrada) return;
    const e = ultimaEntrada;
    const busy = (e[3] & 1) !== 0;
    const ready = (e[0] & 0x08) !== 0;
    if (busy && !busyAnterior) console.log("BUSY ligado (inspecionando)...");
    if (ready && !readyAnterior) {
      inspecoes++;
      const b4 = e[4];
      console.log(`Result ready | Total count ${e.readUInt32LE(16)} | Result OR ${(e[0] >> 4) & 1} | ` +
        `Byte 4 = 0b${b4.toString(2).padStart(8, "0")} (bit0 NG, bit1 OK, bit2.. T100.. NG)`);
      if (DISCO) {
        // DINT em mm x 1000 (formato padrão do programa DISCO_FUROS)
        console.log(`   DIAMETRO_EXTERNO  bytes 48..51  ${(e.readInt32LE(48) / 1000).toFixed(3)} mm  (DINT ${e.readInt32LE(48)})`);
        console.log(`   DIAMETRO_INTERNO  bytes 52..55  ${(e.readInt32LE(52) / 1000).toFixed(3)} mm  (DINT ${e.readInt32LE(52)})`);
        console.log(`   QTD_FUROS         bytes 56..59  ${e.readInt32LE(56)}`);
      } else {
        let p = OFFSET;
        for (const [nome, n] of QRS) {
          console.log(`   ${nome.padEnd(8)} bytes ${String(p).padStart(3)}..${String(p + n * 4 - 1).padEnd(3)}  ${texto(e, p, n)}`);
          p += n * 4;
        }
      }
      saida[0] |= 0x08;                          // Result ack
    }
    if (!ready && readyAnterior) saida[0] &= ~0x08;
    busyAnterior = busy;
    readyAnterior = ready;

    if (inspecoes >= 3) {
      fechar();
    }
  }, 5);
}

async function fechar() {
  inspecoes = -999;
  const fc = Buffer.alloc(12);
  fc[0] = 0x0a; fc[1] = 0x0e;
  fc.writeUInt16LE(serialConexao, 2);
  fc.writeUInt16LE(0x0186, 4);
  fc.writeUInt32LE(serialOriginador, 6);
  fc[10] = 4; fc[11] = 0;
  const caminho = Buffer.from([0x20, 0x04, 0x24, 0x01, 0x2c, 0x65, 0x2c, 0x64]);
  const r = await pedir(rrData(Buffer.concat([Buffer.from([0x4e, 0x02, 0x20, 0x06, 0x24, 0x01]), fc, caminho])));
  const resp = lerCPF(r.subarray(24), 6).find((i) => i.tipo === ITEM.UNCONNECTED_DATA).dados;
  console.log(`\nForward_Close: ${resp[2] === 0 ? "OK" : "erro " + resp[2]}`);
  process.exit(0);
}
let inspecoes = 0;

tcp.on("error", (e) => { console.error(`Não conectou em ${IP}:44818 (${e.message}). O simulador está rodando?`); process.exit(1); });
main();
