/**
 * =====================================================================
 *  ADAPTER ETHERNET/IP (lado "dispositivo" / target)
 * =====================================================================
 *  Implementa o mínimo de EtherNet/IP que um scanner (o CLP XP325)
 *  precisa para abrir uma conexão de I/O Classe 1 com o dispositivo:
 *
 *   TCP 44818  Encapsulamento EtherNet/IP (mensagens explícitas)
 *     - ListIdentity / ListServices / ListInterfaces
 *     - RegisterSession / UnRegisterSession
 *     - SendRRData com CIP:
 *         Identity (classe 0x01): Get_Attributes_All, Get_Attribute_Single
 *         Connection Manager (classe 0x06): Forward_Open, Large_Forward_Open,
 *                                           Forward_Close, Unconnected_Send
 *   UDP 44818  ListIdentity por broadcast (ferramentas de varredura)
 *   UDP 2222   I/O implícito (dados cíclicos)
 *     - O->T: o CLP manda as SAÍDAS dele (assembly 101) a cada RPI
 *     - T->O: o simulador manda as ENTRADAS do CLP (assembly 100) a cada RPI
 *
 *  VÁRIAS CÂMERAS
 *   Cada instância desta classe é UMA câmera, com o seu próprio IP
 *   (ipEscuta) e os seus próprios sockets TCP 44818 / UDP 2222. Para ter
 *   câmeras independentes, crie uma instância por IP. Como no CV-X real,
 *   cada câmera aceita um único dono exclusivo (um CLP no controle).
 *
 *  MESMO PC DO CODESYS CONTROL WIN
 *   O scanner e o adapter usam a mesma porta UDP 2222. Para os dois
 *   conviverem no mesmo Windows, o simulador escuta só no SEU IP
 *   (ipEscuta) e manda o T->O para o IP do CODESYS (ipClp). Assim cada
 *   pacote chega ao programa certo pelo endereço de destino.
 *
 *  Tamanho de conexão (Classe 1): inclui os 2 bytes do contador de
 *  sequência e, no O->T, mais 4 bytes do cabeçalho Run/Idle.
 *    dados O->T = tamanho - 6     dados T->O = tamanho - 2
 * =====================================================================
 */

"use strict";

const net = require("net");
const dgram = require("dgram");
const os = require("os");
const { EventEmitter } = require("events");

// ---- Comandos de encapsulamento ----
const CMD = {
  NOP: 0x0000,
  LIST_SERVICES: 0x0004,
  LIST_IDENTITY: 0x0063,
  LIST_INTERFACES: 0x0064,
  REGISTER_SESSION: 0x0065,
  UNREGISTER_SESSION: 0x0066,
  SEND_RR_DATA: 0x006f,
  SEND_UNIT_DATA: 0x0070,
};

// ---- Status de encapsulamento ----
const ENCAP_STATUS = {
  OK: 0x0000,
  INVALID_COMMAND: 0x0001,
  INVALID_SESSION: 0x0064,
  INVALID_LENGTH: 0x0065,
  UNSUPPORTED_PROTOCOL: 0x0069,
};

// ---- Itens do Common Packet Format (CPF) ----
const ITEM = {
  NULL: 0x0000,
  IDENTITY: 0x000c,
  CONNECTED_DATA: 0x00b1,
  UNCONNECTED_DATA: 0x00b2,
  SERVICES: 0x0100,
  SOCKADDR_O2T: 0x8000,
  SOCKADDR_T2O: 0x8001,
  SEQUENCED_ADDRESS: 0x8002,
};

// ---- Serviços CIP ----
const SVC = {
  GET_ATTRIBUTES_ALL: 0x01,
  GET_ATTRIBUTE_SINGLE: 0x0e,
  FORWARD_CLOSE: 0x4e,
  UNCONNECTED_SEND: 0x52,
  FORWARD_OPEN: 0x54,
  LARGE_FORWARD_OPEN: 0x5b,
};

// ---- Status gerais CIP ----
const GS = {
  SUCCESS: 0x00,
  CONNECTION_FAILURE: 0x01,
  PATH_SEGMENT_ERROR: 0x04,
  PATH_DESTINATION_UNKNOWN: 0x05,
  SERVICE_NOT_SUPPORTED: 0x08,
  ATTRIBUTE_NOT_SUPPORTED: 0x14,
};

// ---- Status estendidos de falha de conexão (Forward_Open) ----
const EXT = {
  DUPLICATE_FORWARD_OPEN: 0x0100,
  OWNERSHIP_CONFLICT: 0x0106,
  CONNECTION_NOT_FOUND: 0x0107,
  INVALID_CONNECTION_TYPE: 0x0108,
  INVALID_CONNECTION_SIZE: 0x0109,
  RPI_NOT_SUPPORTED: 0x0111,
  VENDOR_PRODUCT_MISMATCH: 0x0114,
  INVALID_PRODUCED_POINT: 0x012a,
  INVALID_CONSUMED_POINT: 0x012b,
  NO_LISTEN_BASE: 0x0119,
  INVALID_SEGMENT: 0x0315,
};

const TIPO_CONEXAO = { 0: "nula", 1: "multicast", 2: "ponto a ponto" };

// Porta UDP padrão do I/O EtherNet/IP. O T->O é sempre enviado para esta porta
// do CLP (ou para a que ele pedir no Forward_Open). A porta em que a CÂMERA
// recebe o O->T pode ser outra (portaUdp), informada ao CLP na resposta.
const PORTA_IO_PADRAO = 2222;

// Erro CIP com status para devolver ao scanner
class ErroCIP extends Error {
  constructor(geral, estendido, mensagem) {
    super(mensagem);
    this.geral = geral;
    this.estendido = estendido;
  }
}

// ---------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------
function ipv4(endereco) {
  if (!endereco) return "0.0.0.0";
  return endereco.startsWith("::ffff:") ? endereco.slice(7) : endereco;
}

function ipParaInt(ip) {
  return ip.split(".").reduce((acc, p) => ((acc << 8) | Number(p)) >>> 0, 0);
}

function intParaIp(n) {
  return [24, 16, 8, 0].map((s) => (n >>> s) & 0xff).join(".");
}

function mascaraDe(ip) {
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const i of lista || []) {
      if (i.family === "IPv4" && i.address === ip) return i.netmask;
    }
  }
  return "255.255.255.0";
}

/*
 * Endereço multicast do T->O pelo algoritmo da especificação CIP:
 * base 239.192.1.0, índice = (host_id - 1) & 0x3FF, 32 endereços por dispositivo.
 */
function enderecoMulticast(ipLocal) {
  const ip = ipParaInt(ipLocal);
  const mascara = ipParaInt(mascaraDe(ipLocal));
  const hostId = (ip & ~mascara) >>> 0;
  const indice = ((hostId - 1) & 0x3ff) >>> 0;
  return intParaIp((ipParaInt("239.192.1.0") + indice * 32) >>> 0);
}

function sockaddr(tipoItem, ip, porta) {
  const b = Buffer.alloc(4 + 16);
  b.writeUInt16LE(tipoItem, 0);
  b.writeUInt16LE(16, 2);
  b.writeUInt16BE(2, 4);            // sin_family = AF_INET (big endian)
  b.writeUInt16BE(porta, 6);        // sin_port
  b.writeUInt32BE(ipParaInt(ip), 8);// sin_addr
  return b;                          // sin_zero já são 8 bytes zerados
}

function lerCPF(buf, inicio) {
  const itens = [];
  const qtd = buf.readUInt16LE(inicio);
  let o = inicio + 2;
  for (let i = 0; i < qtd; i++) {
    const tipo = buf.readUInt16LE(o);
    const len = buf.readUInt16LE(o + 2);
    itens.push({ tipo, dados: buf.subarray(o + 4, o + 4 + len) });
    o += 4 + len;
  }
  return itens;
}

function montarCPF(itens) {
  const partes = [Buffer.alloc(2)];
  partes[0].writeUInt16LE(itens.length, 0);
  for (const it of itens) {
    if (Buffer.isBuffer(it)) { partes.push(it); continue; }  // item já montado
    const h = Buffer.alloc(4);
    h.writeUInt16LE(it.tipo, 0);
    h.writeUInt16LE(it.dados.length, 2);
    partes.push(h, it.dados);
  }
  return Buffer.concat(partes);
}

/*
 * Lê um caminho EPATH (segmentos lógicos, chave eletrônica, dados).
 * Devolve listas na ordem em que aparecem.
 */
function lerCaminho(buf) {
  const r = { classes: [], instancias: [], pontos: [], atributos: [], chave: null, dados: null, portas: [] };
  let i = 0;
  while (i < buf.length) {
    const seg = buf[i];
    if ((seg & 0xe0) === 0x00) {                   // segmento de porta
      if (seg & 0x10) {
        const tam = buf[i + 1];
        i += 2 + tam + (tam % 2);
      } else {
        i += 2;
      }
      r.portas.push(seg & 0x0f);
      continue;
    }
    switch (seg) {
      case 0x20: r.classes.push(buf[i + 1]); i += 2; break;
      case 0x21: r.classes.push(buf.readUInt16LE(i + 2)); i += 4; break;
      case 0x24: r.instancias.push(buf[i + 1]); i += 2; break;
      case 0x25: r.instancias.push(buf.readUInt16LE(i + 2)); i += 4; break;
      case 0x2c: r.pontos.push(buf[i + 1]); i += 2; break;
      case 0x2d: r.pontos.push(buf.readUInt16LE(i + 2)); i += 4; break;
      case 0x30: r.atributos.push(buf[i + 1]); i += 2; break;
      case 0x31: r.atributos.push(buf.readUInt16LE(i + 2)); i += 4; break;
      case 0x34:                                   // chave eletrônica
        r.chave = {
          vendor: buf.readUInt16LE(i + 2),
          deviceType: buf.readUInt16LE(i + 4),
          productCode: buf.readUInt16LE(i + 6),
          major: buf[i + 8] & 0x7f,
          compativel: (buf[i + 8] & 0x80) !== 0,
          minor: buf[i + 9],
        };
        i += 10;
        break;
      case 0x80: {                                 // dados simples (configuração)
        const palavras = buf[i + 1];
        r.dados = buf.subarray(i + 2, i + 2 + palavras * 2);
        i += 2 + palavras * 2;
        break;
      }
      default:
        throw new ErroCIP(GS.CONNECTION_FAILURE, EXT.INVALID_SEGMENT,
          `segmento de caminho não suportado 0x${seg.toString(16)}`);
    }
  }
  return r;
}

function respostaMR(servico, status, dados = Buffer.alloc(0), adicionais = []) {
  const h = Buffer.alloc(4 + adicionais.length * 2);
  h[0] = servico | 0x80;
  h[1] = 0;
  h[2] = status;
  h[3] = adicionais.length;
  adicionais.forEach((v, k) => h.writeUInt16LE(v, 4 + k * 2));
  return Buffer.concat([h, dados]);
}

// =====================================================================
// CLASSE PRINCIPAL
// =====================================================================
class AdapterEIP extends EventEmitter {
  /**
   * @param {object} op
   *   identidade: { vendorId, deviceType, productCode, revMajor, revMinor, serial, nome }
   *   assemblies: { entrada, saida, configuracao, heartbeatSoEntrada, soEscuta }
   *   tamanhoMin, tamanhoMax: limites de dados (bytes) de cada assembly
   *   rpiMinUs, rpiMaxUs: limites de RPI (µs)
   *   lerEntrada(): Buffer com o assembly de entrada (T->O) completo
   */
  constructor(op) {
    super();
    this.op = op;
    this.portaTcp = op.portaTcp || 44818;
    this.portaUdp = op.portaUdp || 2222;
    this.ipEscuta = op.ipEscuta || "0.0.0.0";   // IP onde o simulador atende
    this.ipClp = op.ipClp || null;              // destino fixo do T->O (null = IP de quem conectou)
    this.reaberturas = 0;                       // quantas vezes o CLP reabriu (não recebe T->O)
    this.ultimaReabertura = null;
    this.sessoes = new Map();       // handle -> { socket }
    this.conexoes = new Map();      // id O->T -> conexão
    this.proximaSessao = 1;
    this.contadorId = (Math.random() * 0xffff) >>> 0;
  }

  // -------------------------------------------------------------------
  iniciar() {
    const ip = this.ipEscuta;
    const onde = ip === "0.0.0.0" ? "todos os IPs" : ip;
    this.clientesTcp = new Set();

    // TCP 44818
    this.tcp = net.createServer((s) => this._novoCliente(s));
    this.tcp.on("error", (e) => this.emit("erro", `TCP ${this.portaTcp} em ${onde}: ${e.message}`));
    this.tcp.listen(this.portaTcp, ip, () =>
      this.emit("log", `EtherNet/IP ouvindo TCP ${this.portaTcp} em ${onde}`));

    // UDP 44818 (ListIdentity por broadcast; só recebe broadcast escutando em todos os IPs)
    this.udpLista = dgram.createSocket({ type: "udp4", reuseAddr: true });
    this.udpLista.on("message", (msg, rinfo) => this._udpEncapsulamento(msg, rinfo));
    this.udpLista.on("error", (e) => this.emit("erro", `UDP ${this.portaTcp} em ${onde}: ${e.message}`));
    this.udpLista.bind(this.portaTcp, ip);

    // UDP 2222 (I/O implícito)
    this.udpIO = dgram.createSocket({ type: "udp4", reuseAddr: true });
    this.udpIO.on("message", (msg, rinfo) => this._receberIO(msg, rinfo));
    this.udpIO.on("error", (e) => this.emit("erro", `UDP ${this.portaUdp} em ${onde}: ${e.message}`));
    this.udpIO.bind(this.portaUdp, ip, () => {
      this.udpIO.setMulticastTTL(1);
      this.emit("log", `I/O implícito ouvindo UDP ${this.portaUdp} em ${onde}`);
    });

    // Vigia de timeout das conexões
    this.vigia = setInterval(() => this._verificarTimeouts(), 20);
  }

  parar() {
    clearInterval(this.vigia);
    for (const c of [...this.conexoes.values()]) this._fecharConexao(c, "comunicação reiniciada");
    for (const s of this.clientesTcp || []) s.destroy();
    this.sessoes.clear();
    const fechar = (x) => new Promise((r) => { try { x ? x.close(() => r()) : r(); } catch (_) { r(); } });
    return Promise.all([fechar(this.tcp), fechar(this.udpLista), fechar(this.udpIO)]);
  }

  // Troca o IP de escuta / IP do CLP e sobe a comunicação de novo
  async reiniciar({ ipEscuta, ipClp, portaUdp }) {
    await this.parar();
    this.ipEscuta = ipEscuta || "0.0.0.0";
    this.ipClp = ipClp || null;
    if (portaUdp) this.portaUdp = portaUdp;
    this.reaberturas = 0;
    this.ultimaReabertura = null;
    this.iniciar();
    this.emit("estado");
  }

  // -------------------------------------------------------------------
  // TCP: encapsulamento
  // -------------------------------------------------------------------
  _novoCliente(socket) {
    const origem = ipv4(socket.remoteAddress);
    this.clientesTcp.add(socket);
    socket.on("close", () => this.clientesTcp.delete(socket));
    this.emit("log", `Cliente TCP conectado: ${origem}`);
    let acumulado = Buffer.alloc(0);

    socket.on("data", (dados) => {
      acumulado = Buffer.concat([acumulado, dados]);
      while (acumulado.length >= 24) {
        const tam = acumulado.readUInt16LE(2);
        if (acumulado.length < 24 + tam) break;
        const pacote = acumulado.subarray(0, 24 + tam);
        acumulado = acumulado.subarray(24 + tam);
        try {
          const resposta = this._processarEncapsulamento(pacote, socket);
          if (resposta) socket.write(resposta);
        } catch (e) {
          this.emit("erro", `Erro ao processar pacote de ${origem}: ${e.message}`);
        }
      }
    });

    socket.on("close", () => {
      for (const [h, s] of this.sessoes) if (s.socket === socket) this.sessoes.delete(h);
      this.emit("log", `Cliente TCP desconectado: ${origem}`);
      this.emit("estado");
    });
    socket.on("error", () => {});
  }

  _cabecalho(comando, dados, sessao, status, contexto) {
    const h = Buffer.alloc(24);
    h.writeUInt16LE(comando, 0);
    h.writeUInt16LE(dados.length, 2);
    h.writeUInt32LE(sessao, 4);
    h.writeUInt32LE(status, 8);
    contexto.copy(h, 12, 0, 8);
    return Buffer.concat([h, dados]);
  }

  _processarEncapsulamento(pacote, socket) {
    const comando = pacote.readUInt16LE(0);
    const sessao = pacote.readUInt32LE(4);
    const contexto = pacote.subarray(12, 20);
    const dados = pacote.subarray(24);
    const ipLocal = ipv4(socket.localAddress);

    switch (comando) {
      case CMD.NOP:
        return null;

      case CMD.LIST_IDENTITY:
        return this._cabecalho(comando, this._itemIdentidade(ipLocal), 0, 0, contexto);

      case CMD.LIST_SERVICES:
        return this._cabecalho(comando, this._itemServicos(), 0, 0, contexto);

      case CMD.LIST_INTERFACES:
        return this._cabecalho(comando, Buffer.from([0, 0]), 0, 0, contexto);

      case CMD.REGISTER_SESSION: {
        if (dados.length < 4 || dados.readUInt16LE(0) !== 1) {
          return this._cabecalho(comando, dados, 0, ENCAP_STATUS.UNSUPPORTED_PROTOCOL, contexto);
        }
        const handle = this.proximaSessao++;
        this.sessoes.set(handle, { socket });
        this.emit("log", `Sessão ${handle} registrada por ${ipv4(socket.remoteAddress)}`);
        this.emit("estado");
        return this._cabecalho(comando, dados, handle, 0, contexto);
      }

      case CMD.UNREGISTER_SESSION:
        this.sessoes.delete(sessao);
        socket.end();
        return null;

      case CMD.SEND_RR_DATA: {
        if (!this.sessoes.has(sessao)) {
          return this._cabecalho(comando, Buffer.alloc(0), sessao, ENCAP_STATUS.INVALID_SESSION, contexto);
        }
        const itens = lerCPF(dados, 6);
        const pedido = itens.find((i) => i.tipo === ITEM.UNCONNECTED_DATA);
        if (!pedido) {
          return this._cabecalho(comando, Buffer.alloc(0), sessao, ENCAP_STATUS.INVALID_LENGTH, contexto);
        }
        const t2oSock = itens.find((i) => i.tipo === ITEM.SOCKADDR_T2O);
        const { mr, extras } = this._processarCIP(pedido.dados, {
          ipOrigem: ipv4(socket.remoteAddress),
          ipLocal,
          portaT2O: t2oSock ? t2oSock.dados.readUInt16BE(2) : PORTA_IO_PADRAO,
        });
        const resp = Buffer.concat([
          Buffer.alloc(6),                       // interface handle + timeout
          montarCPF([
            { tipo: ITEM.NULL, dados: Buffer.alloc(0) },
            { tipo: ITEM.UNCONNECTED_DATA, dados: mr },
            ...extras,
          ]),
        ]);
        return this._cabecalho(comando, resp, sessao, 0, contexto);
      }

      case CMD.SEND_UNIT_DATA:
        // Mensagens explícitas conectadas (Classe 3) não são usadas pelo I/O
        this.emit("log", "SendUnitData (Classe 3) recebido e ignorado");
        return null;

      default:
        return this._cabecalho(comando, Buffer.alloc(0), sessao, ENCAP_STATUS.INVALID_COMMAND, contexto);
    }
  }

  _udpEncapsulamento(msg, rinfo) {
    if (msg.length < 24 || msg.readUInt16LE(0) !== CMD.LIST_IDENTITY) return;
    const ipLocal = this._ipLocalPara(rinfo.address);
    const resp = this._cabecalho(CMD.LIST_IDENTITY, this._itemIdentidade(ipLocal), 0, 0, msg.subarray(12, 20));
    this.udpLista.send(resp, rinfo.port, rinfo.address);
  }

  _ipLocalPara(ipRemoto) {
    const remoto = ipParaInt(ipRemoto);
    for (const lista of Object.values(os.networkInterfaces())) {
      for (const i of lista || []) {
        if (i.family !== "IPv4" || i.internal) continue;
        const m = ipParaInt(i.netmask);
        if ((ipParaInt(i.address) & m) === (remoto & m)) return i.address;
      }
    }
    return "0.0.0.0";
  }

  _itemIdentidade(ipLocal) {
    const id = this.op.identidade;
    const nome = Buffer.from(id.nome, "ascii");
    const d = Buffer.alloc(2 + 16 + 2 + 2 + 2 + 2 + 2 + 4 + 1 + nome.length + 1);
    let o = 0;
    o = d.writeUInt16LE(1, o);                     // versão do encapsulamento
    o = d.writeUInt16BE(2, o);                     // sin_family
    o = d.writeUInt16BE(this.portaTcp, o);         // sin_port
    o = d.writeUInt32BE(ipParaInt(ipLocal), o);    // sin_addr
    o += 8;                                        // sin_zero
    o = d.writeUInt16LE(id.vendorId, o);
    o = d.writeUInt16LE(id.deviceType, o);
    o = d.writeUInt16LE(id.productCode, o);
    d[o++] = id.revMajor;
    d[o++] = id.revMinor;
    o = d.writeUInt16LE(this._statusIdentidade(), o);
    o = d.writeUInt32LE(id.serial, o);
    d[o++] = nome.length;
    nome.copy(d, o); o += nome.length;
    d[o] = 3;                                      // estado: operacional
    return montarCPF([{ tipo: ITEM.IDENTITY, dados: d }]);
  }

  _itemServicos() {
    const d = Buffer.alloc(20);
    d.writeUInt16LE(1, 0);                         // versão
    d.writeUInt16LE(0x0120, 2);                    // CIP via TCP + I/O Classe 0/1 via UDP
    d.write("Communications", 4, "ascii");
    return montarCPF([{ tipo: ITEM.SERVICES, dados: d }]);
  }

  _statusIdentidade() {
    // bit 2 = configurado; bits 4..7 = 6 quando há conexão de I/O em RUN
    const temRun = [...this.conexoes.values()].some((c) => c.run);
    return 0x0004 | (temRun ? 0x0060 : this.conexoes.size ? 0x0050 : 0);
  }

  // -------------------------------------------------------------------
  // CIP (Message Router)
  // -------------------------------------------------------------------
  _processarCIP(req, ctx) {
    const servico = req[0];
    const palavras = req[1];
    const caminho = req.subarray(2, 2 + palavras * 2);
    const dados = req.subarray(2 + palavras * 2);
    let rota;
    try {
      rota = lerCaminho(caminho);
    } catch (e) {
      return { mr: respostaMR(servico, GS.PATH_SEGMENT_ERROR), extras: [] };
    }
    const classe = rota.classes[0];
    const instancia = rota.instancias[0];

    // Identity
    if (classe === 0x01 && instancia === 1) {
      return { mr: this._identity(servico, rota.atributos[0]), extras: [] };
    }

    // Connection Manager
    if (classe === 0x06 && instancia === 1) {
      switch (servico) {
        case SVC.FORWARD_OPEN:
        case SVC.LARGE_FORWARD_OPEN:
          return this._forwardOpen(servico, dados, ctx);
        case SVC.FORWARD_CLOSE:
          return { mr: this._forwardClose(dados, ctx), extras: [] };
        case SVC.UNCONNECTED_SEND: {
          // Mensagem embutida: processa e devolve a resposta dela
          const tam = dados.readUInt16LE(2);
          return this._processarCIP(dados.subarray(4, 4 + tam), ctx);
        }
        default:
          return { mr: respostaMR(servico, GS.SERVICE_NOT_SUPPORTED), extras: [] };
      }
    }

    return { mr: respostaMR(servico, GS.PATH_DESTINATION_UNKNOWN), extras: [] };
  }

  _identity(servico, atributo) {
    const id = this.op.identidade;
    const nome = Buffer.from(id.nome, "ascii");
    const attr = {
      1: () => { const b = Buffer.alloc(2); b.writeUInt16LE(id.vendorId); return b; },
      2: () => { const b = Buffer.alloc(2); b.writeUInt16LE(id.deviceType); return b; },
      3: () => { const b = Buffer.alloc(2); b.writeUInt16LE(id.productCode); return b; },
      4: () => Buffer.from([id.revMajor, id.revMinor]),
      5: () => { const b = Buffer.alloc(2); b.writeUInt16LE(this._statusIdentidade()); return b; },
      6: () => { const b = Buffer.alloc(4); b.writeUInt32LE(id.serial); return b; },
      7: () => Buffer.concat([Buffer.from([nome.length]), nome]),
    };
    if (servico === SVC.GET_ATTRIBUTES_ALL) {
      return respostaMR(servico, GS.SUCCESS, Buffer.concat([1, 2, 3, 4, 5, 6, 7].map((a) => attr[a]())));
    }
    if (servico === SVC.GET_ATTRIBUTE_SINGLE) {
      if (!attr[atributo]) return respostaMR(servico, GS.ATTRIBUTE_NOT_SUPPORTED);
      return respostaMR(servico, GS.SUCCESS, attr[atributo]());
    }
    return respostaMR(servico, GS.SERVICE_NOT_SUPPORTED);
  }

  // -------------------------------------------------------------------
  // FORWARD_OPEN: o CLP abre a conexão de I/O
  // -------------------------------------------------------------------
  _forwardOpen(servico, d, ctx) {
    const grande = servico === SVC.LARGE_FORWARD_OPEN;
    const p = {};
    p.o2tId = d.readUInt32LE(2);
    p.t2oId = d.readUInt32LE(6);
    p.serial = d.readUInt16LE(10);
    p.vendor = d.readUInt16LE(12);
    p.serialOrigem = d.readUInt32LE(14);
    p.multiplicador = d[18];
    let o = 22;
    p.o2tRpi = d.readUInt32LE(o); o += 4;
    const o2tParam = grande ? d.readUInt32LE(o) : d.readUInt16LE(o); o += grande ? 4 : 2;
    p.t2oRpi = d.readUInt32LE(o); o += 4;
    const t2oParam = grande ? d.readUInt32LE(o) : d.readUInt16LE(o); o += grande ? 4 : 2;
    p.transporte = d[o++];
    const palavras = d[o++];
    const caminho = d.subarray(o, o + palavras * 2);

    const decod = (v) => grande
      ? { tamanho: v & 0xffff, tipo: (v >>> 29) & 3 }
      : { tamanho: v & 0x1ff, tipo: (v >>> 13) & 3 };
    p.o2t = decod(o2tParam);
    p.t2o = decod(t2oParam);

    const falha = (estendido, motivo, adicional) => {
      this.emit("log", `Forward_Open recusado (0x${estendido.toString(16).padStart(4, "0")}): ${motivo}`);
      const dd = Buffer.alloc(10);
      dd.writeUInt16LE(p.serial, 0);
      dd.writeUInt16LE(p.vendor, 2);
      dd.writeUInt32LE(p.serialOrigem, 4);
      dd[8] = 0; dd[9] = 0;
      const adicionais = [estendido, ...(adicional !== undefined ? [adicional] : [])];
      return { mr: respostaMR(servico, GS.CONNECTION_FAILURE, dd, adicionais), extras: [] };
    };

    // Caminho: configuração, ponto consumido (O->T) e ponto produzido (T->O)
    let rota;
    try {
      rota = lerCaminho(caminho);
    } catch (e) {
      return falha(EXT.INVALID_SEGMENT, e.message);
    }
    const A = this.op.assemblies;
    const id = this.op.identidade;

    if (rota.chave) {
      const k = rota.chave;
      const ok = (k.vendor === 0 || k.vendor === id.vendorId) &&
        (k.productCode === 0 || k.productCode === id.productCode) &&
        (k.deviceType === 0 || k.deviceType === id.deviceType) &&
        (k.major === 0 || k.major === id.revMajor);
      if (!ok) {
        return falha(EXT.VENDOR_PRODUCT_MISMATCH,
          `chave eletrônica não confere (vendor ${k.vendor}, produto ${k.productCode}, rev ${k.major}.${k.minor})`);
      }
    }

    // Pontos de conexão: pode vir [O->T, T->O] ou [config(instância), O->T, T->O]
    const pontos = rota.pontos.length >= 2 ? rota.pontos : [...rota.instancias.slice(1), ...rota.pontos];
    const consumido = pontos[0];
    const produzido = pontos[1];

    if (produzido !== A.entrada) {
      return falha(EXT.INVALID_PRODUCED_POINT, `assembly de entrada ${produzido} (esperado ${A.entrada})`);
    }
    const soEntrada = consumido === A.heartbeatSoEntrada;
    const soEscuta = consumido === A.soEscuta;
    if (!soEntrada && !soEscuta && consumido !== A.saida) {
      return falha(EXT.INVALID_CONSUMED_POINT, `assembly de saída ${consumido} (esperado ${A.saida})`);
    }

    // RPI
    const { rpiMinUs, rpiMaxUs } = this.op;
    if (p.o2tRpi < rpiMinUs || p.o2tRpi > rpiMaxUs || p.t2oRpi < rpiMinUs || p.t2oRpi > rpiMaxUs) {
      return falha(EXT.RPI_NOT_SUPPORTED, `RPI fora da faixa ${rpiMinUs / 1000}..${rpiMaxUs / 1000} ms`);
    }

    // Tamanhos (Classe 1: +2 bytes de sequência; O->T exclusivo: +4 de Run/Idle)
    const dadosT2O = p.t2o.tamanho - 2;
    if (dadosT2O < this.op.tamanhoMin || dadosT2O > this.op.tamanhoMax) {
      return falha(EXT.INVALID_CONNECTION_SIZE, `tamanho T->O ${p.t2o.tamanho}`, this.op.tamanhoMax + 2);
    }
    let dadosO2T = 0;
    if (!soEntrada && !soEscuta) {
      dadosO2T = p.o2t.tamanho - 6;
      if (dadosO2T < this.op.tamanhoMin || dadosO2T > this.op.tamanhoMax) {
        return falha(EXT.INVALID_CONNECTION_SIZE, `tamanho O->T ${p.o2t.tamanho}`, this.op.tamanhoMax + 6);
      }
    }

    // Tipo de conexão T->O
    if (p.t2o.tipo !== 1 && p.t2o.tipo !== 2) {
      return falha(EXT.INVALID_CONNECTION_TYPE, `tipo T->O ${p.t2o.tipo}`);
    }

    /*
     * REABERTURA PELO PRÓPRIO CLP
     * Se o mesmo CLP manda de novo um Forward_Open com a mesma conexão
     * (mesmo trio serial/vendor/serial do originador), é porque, para ele,
     * a conexão caiu: o CLP não está recebendo os dados da câmera (T->O).
     * Em vez de recusar (o que faria o CLP esperar e tentar de novo), a
     * conexão antiga é fechada e a nova aceita; o caso fica registrado
     * para o diagnóstico na tela.
     */
    for (const c of [...this.conexoes.values()]) {
      if (c.ipOrigem === ctx.ipOrigem &&
          c.serial === p.serial && c.vendor === p.vendor && c.serialOrigem === p.serialOrigem) {
        this.reaberturas++;
        this.ultimaReabertura = { quando: Date.now(), ipClp: ctx.ipOrigem, tx: c.tx, destino: `${c.destino.ip}:${c.destino.porta}` };
        this.emit("log", this._diagnosticoQueda(c, ctx.ipOrigem));
        this._fecharConexao(c, "reaberta pelo CLP");
      }
    }
    for (const c of this.conexoes.values()) {
      // Como no CV-X real: um único dono exclusivo por câmera. Outro CLP que
      // queira controlar esta câmera recebe "Ownership conflict".
      if (!soEntrada && !soEscuta && c.exclusiva) {
        return falha(EXT.OWNERSHIP_CONFLICT, `esta câmera já é controlada por ${c.ipOrigem}`);
      }
    }
    // "Somente escuta" pega carona numa conexão multicast já aberta
    const multicasts = [...this.conexoes.values()].filter((c) => c.multicast && c.tipo !== "somente escuta");
    const base = soEscuta
      ? multicasts.find((c) => c.ipOrigem === ctx.ipOrigem) || multicasts[0]
      : null;
    if (soEscuta && !base) {
      return falha(EXT.NO_LISTEN_BASE, "não há conexão multicast para escutar");
    }

    // ---- Aceita ----
    const multicast = p.t2o.tipo === 1;
    const conexao = {
      o2tId: (0x10000 + this.contadorId++) >>> 0,
      t2oId: base ? base.t2oId : multicast ? (0x20000 + this.contadorId++) >>> 0 : p.t2oId,
      serial: p.serial,
      vendor: p.vendor,
      serialOrigem: p.serialOrigem,
      ipOrigem: ctx.ipOrigem,
      sessao: base ? base.sessao : ctx.ipOrigem,   // de qual CLP são os dados
      exclusiva: !soEntrada && !soEscuta,
      tipo: soEntrada ? "somente entrada" : soEscuta ? "somente escuta" : "dono exclusivo",
      multicast,
      destino: base
        ? base.destino
        : multicast
        ? { ip: enderecoMulticast(ctx.ipLocal), porta: PORTA_IO_PADRAO }
        : { ip: this.ipClp || ctx.ipOrigem, porta: ctx.portaT2O || PORTA_IO_PADRAO },
      o2tRpiUs: p.o2tRpi,
      t2oRpiUs: p.t2oRpi,
      tamanhoO2T: dadosO2T,
      tamanhoT2O: dadosT2O,
      // Timeout da câmera: o calculado pelo CIP, mas nunca menos de 200 ms.
      // No PC (Windows) o simulador não é tempo real; ser tolerante deste
      // lado evita derrubar a conexão por um atraso do próprio Windows.
      timeoutMs: Math.max(200, (p.o2tRpi / 1000) * (4 << Math.min(p.multiplicador, 7))),
      // Timeout que o CLP aplica aos pacotes da câmera (T->O): RPI x multiplicador
      timeoutClpMs: (p.t2oRpi / 1000) * (4 << Math.min(p.multiplicador, 7)),
      multiplicador: 4 << Math.min(p.multiplicador, 7),
      maxIntervaloMs: 0,
      atrasos: 0,
      ultimoTxMs: null,
      ultimoRx: Date.now(),
      run: false,
      seqT2O: 0,
      seqEncap: 0,
      rx: 0,
      tx: 0,
      abertaEm: Date.now(),
    };

    if (multicast) {
      try { this.udpIO.setMulticastInterface(ctx.ipLocal); } catch (_) { /* ignora */ }
    }

    // Mesmo PC: se a conexão "veio" do próprio IP do simulador, o T->O voltaria para ele mesmo
    if (!multicast && !this.ipClp && ctx.ipOrigem === ctx.ipLocal) {
      this.emit("log",
        `ATENÇÃO: o scanner aparece com o mesmo IP do simulador (${ctx.ipOrigem}). ` +
        "Se o CODESYS roda neste PC, informe o IP dele em \"IP do CLP\".");
    }

    // Produção cíclica T->O no RPI pedido (a "somente escuta" usa os pacotes da base)
    if (!base) {
      conexao.timer = setInterval(() => this._produzir(conexao), Math.max(1, Math.round(p.t2oRpi / 1000)));
    }
    this.conexoes.set(conexao.o2tId, conexao);

    this.emit("conexao_aberta", conexao);
    this.emit("log",
      `Conexão de I/O aberta por ${ctx.ipOrigem} (${conexao.tipo}, T->O ${TIPO_CONEXAO[p.t2o.tipo]}): ` +
      `RPI ${p.t2oRpi / 1000} ms, entrada ${dadosT2O} bytes, saída ${dadosO2T} bytes, ` +
      `timeout do CLP ${conexao.timeoutClpMs} ms (x${conexao.multiplicador})`);
    if (conexao.timeoutClpMs < 1000) {
      this.emit("log",
        `ATENÇÃO: o CLP vai derrubar a conexão se um pacote da câmera atrasar mais de ${conexao.timeoutClpMs} ms. ` +
        "Num PC com Windows isso acontece de vez em quando. No CV_X400_Series (aba Connections) use RPI de 20 ms " +
        "e multiplicador de timeout x64 (timeout de 1,28 s), configuração testada com o CODESYS Control Win no mesmo PC.");
    }
    this.emit("estado");

    // Resposta de sucesso
    const r = Buffer.alloc(26);
    r.writeUInt32LE(conexao.o2tId, 0);
    r.writeUInt32LE(conexao.t2oId, 4);
    r.writeUInt16LE(p.serial, 8);
    r.writeUInt16LE(p.vendor, 10);
    r.writeUInt32LE(p.serialOrigem, 12);
    r.writeUInt32LE(p.o2tRpi, 16);                 // API O->T
    r.writeUInt32LE(p.t2oRpi, 20);                 // API T->O
    r[24] = 0; r[25] = 0;                          // sem resposta de aplicação

    const extras = [sockaddr(ITEM.SOCKADDR_O2T, ctx.ipLocal, this.portaUdp)];
    if (multicast) extras.push(sockaddr(ITEM.SOCKADDR_T2O, conexao.destino.ip, PORTA_IO_PADRAO));
    return { mr: respostaMR(servico, GS.SUCCESS, r), extras };
  }

  _forwardClose(d, ctx) {
    const serial = d.readUInt16LE(2);
    const vendor = d.readUInt16LE(4);
    const serialOrigem = d.readUInt32LE(6);
    const c = [...this.conexoes.values()].find((x) => x.ipOrigem === ctx.ipOrigem &&
      x.serial === serial && x.vendor === vendor && x.serialOrigem === serialOrigem);

    const dd = Buffer.alloc(10);
    dd.writeUInt16LE(serial, 0);
    dd.writeUInt16LE(vendor, 2);
    dd.writeUInt32LE(serialOrigem, 4);
    if (!c) return respostaMR(SVC.FORWARD_CLOSE, GS.CONNECTION_FAILURE, dd, [EXT.CONNECTION_NOT_FOUND]);
    this._fecharConexao(c, "Forward_Close recebido");
    return respostaMR(SVC.FORWARD_CLOSE, GS.SUCCESS, dd);
  }

  _fecharConexao(c, motivo) {
    clearInterval(c.timer);
    this.conexoes.delete(c.o2tId);
    // Conexões "somente escuta" dependem de uma multicast ativa
    if (c.multicast && c.tipo !== "somente escuta" &&
        ![...this.conexoes.values()].some((x) => x.multicast && x.tipo !== "somente escuta")) {
      for (const x of [...this.conexoes.values()]) {
        if (x.tipo === "somente escuta") this._fecharConexao(x, "conexão base encerrada");
      }
    }
    this.emit("log", `Conexão de I/O com ${c.ipOrigem} encerrada: ${motivo}`);
    this.emit("conexao_fechada", c);
    this.emit("estado");
  }

  _verificarTimeouts() {
    const agora = Date.now();
    for (const c of [...this.conexoes.values()]) {
      if (c.tipo === "somente escuta") continue;   // não recebe O->T próprio
      if (agora - c.ultimoRx > c.timeoutMs) {
        this._fecharConexao(c, `timeout (sem dados do CLP há ${c.timeoutMs} ms)`);
      }
    }
  }

  /*
   * Explica, com os números medidos, por que o CLP derrubou a conexão:
   *  - durou ~10 s e nunca funcionou: o CLP não recebe o T->O (porta/IP);
   *  - o simulador atrasou um envio além do timeout do CLP: lado do PC/simulador;
   *  - o simulador enviou tudo no prazo: o atraso foi do lado do CLP (CODESYS).
   */
  _diagnosticoQueda(c, ipClp) {
    const durouS = (Date.now() - c.abertaEm) / 1000;
    const maior = Math.round(c.maxIntervaloMs);
    const base = `ATENÇÃO: ${ipClp} derrubou e reabriu a conexão (${this.reaberturas}ª vez, ` +
      `após ${durouS.toFixed(1)} s, ${c.tx} pacotes enviados). `;
    if (durouS < 15 && c.tx > 0 && this.reaberturas >= 2) {
      return base + "Causa provável: o CLP não recebe os dados da câmera (T->O) em " +
        `${c.destino.ip}:${c.destino.porta}. No mesmo PC do CODESYS, mude a 'Porta UDP de I/O' em Utilidade.`;
    }
    if (c.atrasos > 0 || maior > c.timeoutClpMs) {
      return base + `Causa: o SIMULADOR atrasou o envio (maior intervalo ${maior} ms, acima do timeout do CLP ` +
        `de ${c.timeoutClpMs} ms). O PC ficou ocupado; aumente RPI/multiplicador no CLP.`;
    }
    return base + `O simulador enviou todos os pacotes no prazo (maior intervalo ${maior} ms, timeout do CLP ` +
      `${c.timeoutClpMs} ms). Causa: atraso do lado do CLP (CODESYS Control Win não processou a tempo). ` +
      "Aumente o multiplicador de timeout no CLP e confira a 'Bus cycle task' do CODESYS.";
  }

  // -------------------------------------------------------------------
  // I/O IMPLÍCITO
  // -------------------------------------------------------------------
  // T->O: [itens: endereço sequenciado + dados conectados (seq 16 bits + dados)]
  _produzir(c) {
    const entrada = this.op.lerEntrada(c);
    const dados = Buffer.alloc(c.tamanhoT2O);
    entrada.copy(dados, 0, 0, Math.min(entrada.length, c.tamanhoT2O));

    c.seqEncap = (c.seqEncap + 1) >>> 0;
    c.seqT2O = (c.seqT2O + 1) & 0xffff;

    const end = Buffer.alloc(8);
    end.writeUInt32LE(c.t2oId, 0);
    end.writeUInt32LE(c.seqEncap, 4);
    const seq = Buffer.alloc(2);
    seq.writeUInt16LE(c.seqT2O, 0);

    const pacote = montarCPF([
      { tipo: ITEM.SEQUENCED_ADDRESS, dados: end },
      { tipo: ITEM.CONNECTED_DATA, dados: Buffer.concat([seq, dados]) },
    ]);
    this.udpIO.send(pacote, c.destino.porta, c.destino.ip, (err) => {
      if (!err) return;
      c.errosTx = (c.errosTx || 0) + 1;
      if (c.errosTx === 1 || c.errosTx % 500 === 0) {
        this.emit("erro", `Envio T->O para ${c.destino.ip}:${c.destino.porta} falhou (${c.errosTx}x): ${err.message}`);
      }
    });
    c.tx++;

    // Mede o intervalo real entre envios (atrasos do Windows / do Node)
    const agora = performance.now();
    if (c.ultimoTxMs !== null) {
      const gap = agora - c.ultimoTxMs;
      if (gap > c.maxIntervaloMs) c.maxIntervaloMs = gap;
      if (gap > c.timeoutClpMs) {
        c.atrasos++;
        if (c.atrasos === 1 || c.atrasos % 20 === 0) {
          this.emit("log",
            `Atraso no envio para o CLP: ${gap.toFixed(0)} ms entre pacotes, acima do timeout do CLP ` +
            `(${c.timeoutClpMs} ms). Total de atrasos: ${c.atrasos}. Aumente RPI/multiplicador no CLP.`);
        }
      }
    }
    c.ultimoTxMs = agora;
  }

  // O->T: saídas do CLP (com cabeçalho Run/Idle de 32 bits)
  _receberIO(msg, rinfo) {
    let itens;
    try {
      itens = lerCPF(msg, 0);
    } catch (_) {
      return;
    }
    const end = itens.find((i) => i.tipo === ITEM.SEQUENCED_ADDRESS);
    const dados = itens.find((i) => i.tipo === ITEM.CONNECTED_DATA);
    if (!end || !dados) return;

    const c = this.conexoes.get(end.dados.readUInt32LE(0));
    if (!c) return;
    c.ultimoRx = Date.now();
    c.rx++;

    if (c.tipo !== "dono exclusivo") return;       // heartbeat: só mantém viva
    if (dados.dados.length < 6) return;

    const runIdle = dados.dados.readUInt32LE(2);
    const run = (runIdle & 1) === 1;
    if (run !== c.run) {
      c.run = run;
      this.emit("log", `CLP em ${run ? "RUN" : "IDLE"} (cabeçalho Run/Idle)`);
      this.emit("estado");
    }
    this.emit("saidas", dados.dados.subarray(6), run, c);
  }

  // Resumo para a interface
  resumo() {
    return {
      ipEscuta: this.ipEscuta,
      ipClp: this.ipClp,
      portaUdp: this.portaUdp,
      reaberturas: this.reaberturas,
      ultimaReabertura: this.ultimaReabertura,
      sessoes: this.sessoes.size,
      conexoes: [...this.conexoes.values()].map((c) => ({
        ipOrigem: c.ipOrigem,
        sessao: c.sessao,
        tipo: c.tipo,
        multicast: c.multicast,
        destino: `${c.destino.ip}:${c.destino.porta}`,
        rpiMs: c.t2oRpiUs / 1000,
        rpiO2TMs: c.o2tRpiUs / 1000,
        tamanhoT2O: c.tamanhoT2O,
        tamanhoO2T: c.tamanhoO2T,
        run: c.run,
        rx: c.rx,
        tx: c.tx,
        errosTx: c.errosTx || 0,
        timeoutClpMs: c.timeoutClpMs,
        multiplicador: c.multiplicador,
        maxIntervaloMs: Math.round(c.maxIntervaloMs),
        atrasos: c.atrasos,
        timeoutMs: c.timeoutMs,
        desde: c.abertaEm,
      })),
    };
  }
}

module.exports = { AdapterEIP, lerCPF, montarCPF, CMD, ITEM, SVC };
