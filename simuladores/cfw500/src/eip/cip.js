/**
 * =====================================================================
 *  CIP / EtherNet/IP — utilitários de baixo nível
 * =====================================================================
 *  Pilha de protocolos (de baixo para cima):
 *
 *   Ethernet ─ IP ─ TCP 44818 ─ Encapsulamento EIP (24 bytes) ─ CPF ─ CIP (explícito)
 *                 └ UDP 44818 ─ Encapsulamento (ListIdentity/ListServices)
 *                 └ UDP 2222  ─ CPF ─ dados de I/O (implícito, Classe 1)
 *
 *  Tudo em EtherNet/IP é LITTLE-ENDIAN, exceto o "Sockaddr Info" (porta e IP
 *  em ordem de rede/big-endian), herança do sockaddr_in do BSD.
 * =====================================================================
 */
'use strict';

// ------------------------- Encapsulamento ---------------------------
const ENCAP = {
  NOP: 0x0000, LIST_SERVICES: 0x0004, LIST_IDENTITY: 0x0063, LIST_INTERFACES: 0x0064,
  REGISTER_SESSION: 0x0065, UNREGISTER_SESSION: 0x0066, SEND_RR_DATA: 0x006F, SEND_UNIT_DATA: 0x0070,
};
const ENCAP_NOME = Object.fromEntries(Object.entries(ENCAP).map(([k, v]) => [v, k]));
const ENCAP_STATUS = { OK: 0, CMD_INVALIDO: 0x01, MEMORIA: 0x02, DADOS_INCORRETOS: 0x03, SESSAO_INVALIDA: 0x64, TAMANHO_INVALIDO: 0x65, VERSAO: 0x69 };

// ------------------------- Itens CPF --------------------------------
const CPF = {
  NULL: 0x0000, LIST_IDENTITY: 0x000C, CONNECTED_ADDR: 0x00A1, CONNECTED_DATA: 0x00B1,
  UNCONNECTED_DATA: 0x00B2, LIST_SERVICES: 0x0100, SOCKADDR_OT: 0x8000, SOCKADDR_TO: 0x8001, SEQUENCED_ADDR: 0x8002,
};

// ------------------------- Serviços CIP -----------------------------
const SVC = {
  GET_ALL: 0x01, SET_ALL: 0x02, RESET: 0x05, MULTIPLE: 0x0A, GET_SINGLE: 0x0E, SET_SINGLE: 0x10,
  GET_AND_CLEAR: 0x4C, FORWARD_CLOSE: 0x4E, UNCONNECTED_SEND: 0x52, FORWARD_OPEN: 0x54,
  GET_CONN_OWNER: 0x5A, LARGE_FORWARD_OPEN: 0x5B,
};
const SVC_NOME = {
  0x01: 'Get_Attributes_All', 0x02: 'Set_Attributes_All', 0x05: 'Reset', 0x0A: 'Multiple_Service_Packet',
  0x0E: 'Get_Attribute_Single', 0x10: 'Set_Attribute_Single', 0x4C: 'Get_And_Clear', 0x4E: 'Forward_Close',
  0x52: 'Unconnected_Send', 0x54: 'Forward_Open', 0x5A: 'Get_Connection_Owner', 0x5B: 'Large_Forward_Open',
};

// ------------------------- Status gerais ----------------------------
const ST = {
  OK: 0x00, FALHA_CONEXAO: 0x01, RECURSO: 0x02, PARAM_INVALIDO: 0x03, ERRO_SEGMENTO: 0x04, DESTINO_DESCONHECIDO: 0x05,
  SERVICO_NAO_SUPORTADO: 0x08, VALOR_INVALIDO: 0x09, CONFLITO_ESTADO_OBJ: 0x0C, NAO_GRAVAVEL: 0x0E, CONFLITO_ESTADO_DISP: 0x10,
  RESPOSTA_GRANDE: 0x11, DADOS_INSUFICIENTES: 0x13, ATRIBUTO_NAO_SUPORTADO: 0x14, DADOS_DEMAIS: 0x15, OBJETO_INEXISTENTE: 0x16,
  ERRO_EMBUTIDO: 0x1E, PARAMETRO_INVALIDO: 0x20, TAMANHO_PATH: 0x26,
};
const ST_NOME = {
  0x00: 'Sucesso', 0x01: 'Falha de conexão', 0x02: 'Recurso indisponível', 0x03: 'Valor de parâmetro inválido',
  0x04: 'Erro de segmento no path', 0x05: 'Destino do path desconhecido', 0x08: 'Serviço não suportado',
  0x09: 'Valor de atributo inválido', 0x0C: 'Conflito de estado do objeto', 0x0E: 'Atributo não gravável',
  0x10: 'Conflito de estado do dispositivo', 0x11: 'Resposta muito grande', 0x13: 'Dados insuficientes',
  0x14: 'Atributo não suportado', 0x15: 'Dados em excesso', 0x16: 'Objeto não existe', 0x1E: 'Erro em serviço embutido',
  0x20: 'Parâmetro inválido', 0x26: 'Tamanho do path inválido',
};

// Status estendidos do Connection Manager (status geral 0x01)
const EXT = {
  DUPLICADA: 0x0100, TRANSPORTE: 0x0103, CONFLITO_PROPRIEDADE: 0x0106, CONEXAO_NAO_ENCONTRADA: 0x0107,
  PARAM_REDE_INVALIDO: 0x0108, TAMANHO_INVALIDO: 0x0109, RPI_NAO_SUPORTADO: 0x0111, SEM_CONEXOES: 0x0113,
  VENDOR_PRODUTO: 0x0114, TIPO_DISPOSITIVO: 0x0115, REVISAO: 0x0116, PONTO_CONEXAO: 0x0117, SEM_DONO: 0x0119,
  CONFIG_TAMANHO: 0x0126, TAMANHO_OT: 0x0127, TAMANHO_TO: 0x0128, SEGMENTO_INVALIDO: 0x0315,
};
const EXT_NOME = {
  0x0100: 'Conexão em uso / Forward Open duplicado', 0x0103: 'Classe de transporte/trigger não suportada',
  0x0106: 'Conflito de propriedade (já existe Exclusive Owner)', 0x0107: 'Conexão não encontrada',
  0x0108: 'Parâmetro de conexão de rede inválido', 0x0109: 'Tamanho de conexão inválido',
  0x0111: 'RPI não suportado', 0x0113: 'Sem conexões disponíveis', 0x0114: 'Vendor ID ou Product Code não confere',
  0x0115: 'Device Type não confere', 0x0116: 'Revisão não confere', 0x0117: 'Ponto de conexão (assembly) inválido',
  0x0119: 'Listen Only sem conexão Owner aberta', 0x0126: 'Tamanho de configuração inválido',
  0x0127: 'Tamanho O→T (saída) inválido', 0x0128: 'Tamanho T→O (entrada) inválido', 0x0315: 'Tipo de segmento inválido no path',
};

// =====================================================================
//  Escritor de buffer little-endian (evita contas de offset à mão)
// =====================================================================
class Escritor {
  constructor() { this.partes = []; }
  u8(v) { const b = Buffer.alloc(1); b.writeUInt8(v & 0xFF); this.partes.push(b); return this; }
  u16(v) { const b = Buffer.alloc(2); b.writeUInt16LE(v & 0xFFFF); this.partes.push(b); return this; }
  i16(v) { const b = Buffer.alloc(2); b.writeInt16LE(v); this.partes.push(b); return this; }
  u32(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); this.partes.push(b); return this; }
  u16be(v) { const b = Buffer.alloc(2); b.writeUInt16BE(v & 0xFFFF); this.partes.push(b); return this; }
  u32be(v) { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); this.partes.push(b); return this; }
  buf(b) { this.partes.push(Buffer.from(b)); return this; }
  zeros(n) { this.partes.push(Buffer.alloc(n)); return this; }
  /** SHORT_STRING CIP: 1 byte de tamanho + caracteres */
  sstr(s) { this.u8(s.length); this.buf(Buffer.from(s, 'latin1')); return this; }
  /** STRING CIP: UINT tamanho + caracteres (+ pad para tamanho par, usado no TCP/IP Object) */
  str(s, pad = true) { this.u16(s.length); this.buf(Buffer.from(s, 'latin1')); if (pad && s.length % 2) this.u8(0); return this; }
  get length() { return this.partes.reduce((s, b) => s + b.length, 0); }
  fim() { return Buffer.concat(this.partes); }
}

// =====================================================================
//  CPF — Common Packet Format
// =====================================================================
function lerCPF(buf, off = 0) {
  const itens = [];
  if (buf.length < off + 2) return null;
  const n = buf.readUInt16LE(off); off += 2;
  for (let i = 0; i < n; i++) {
    if (buf.length < off + 4) return null;
    const tipo = buf.readUInt16LE(off);
    const len = buf.readUInt16LE(off + 2);
    off += 4;
    if (buf.length < off + len) return null;
    itens.push({ tipo, dados: buf.subarray(off, off + len) });
    off += len;
  }
  return itens;
}

function montarCPF(itens) {
  const w = new Escritor().u16(itens.length);
  for (const it of itens) w.u16(it.tipo).u16(it.dados.length).buf(it.dados);
  return w.fim();
}

/** Sockaddr Info (16 bytes, BIG-ENDIAN): família, porta, IP, 8 zeros */
function sockaddr(ip, porta) {
  const w = new Escritor().u16be(2).u16be(porta);
  ip.split('.').forEach((o) => w.u8(+o));
  return w.zeros(8).fim();
}
function lerSockaddr(b) {
  return { porta: b.readUInt16BE(2), ip: `${b[4]}.${b[5]}.${b[6]}.${b[7]}` };
}

// =====================================================================
//  EPATH — interpretação dos segmentos do path
// =====================================================================
/**
 * Lê um "padded EPATH" e devolve a lista de segmentos.
 * Suporta: lógicos (classe, instância, atributo, ponto de conexão, 8/16/32 bits),
 * chave eletrônica (0x34), segmento de dados simples (0x80), segmento de porta,
 * e segmentos de rede (0x43 production inhibit etc.).
 */
function lerPath(buf) {
  const segs = [];
  let i = 0;
  while (i < buf.length) {
    const s = buf[i];
    const tipo = s & 0xE0;
    if (tipo === 0x20) {                                     // lógico
      const lt = (s >> 2) & 0x07;                             // 0 classe,1 instância,2 elemento,3 ponto conexão,4 atributo,5 especial
      const fmt = s & 0x03;                                   // 0: 8 bits, 1: 16 bits, 2: 32 bits
      const nomes = ['classe', 'instancia', 'elemento', 'ponto', 'atributo', 'especial'];
      if (lt === 5 && fmt === 0) {                            // chave eletrônica 0x34
        if (buf[i + 1] !== 4 || i + 10 > buf.length) throw new Error('chave eletrônica inválida');
        segs.push({
          tipo: 'chave', vendor: buf.readUInt16LE(i + 2), tipoDisp: buf.readUInt16LE(i + 4), produto: buf.readUInt16LE(i + 6),
          maior: buf[i + 8] & 0x7F, compat: (buf[i + 8] & 0x80) !== 0, menor: buf[i + 9],
        });
        i += 10; continue;
      }
      let v;
      if (fmt === 0) { v = buf[i + 1]; i += 2; }
      else if (fmt === 1) { v = buf.readUInt16LE(i + 2); i += 4; }
      else if (fmt === 2) { v = buf.readUInt32LE(i + 2); i += 6; }
      else throw new Error('formato lógico reservado');
      if (v === undefined || Number.isNaN(v)) throw new Error('path truncado');
      segs.push({ tipo: nomes[lt] || 'desconhecido', valor: v });
    } else if (tipo === 0x00) {                              // porta
      const ext = (s & 0x10) !== 0;
      let porta = s & 0x0F;
      let j = i + 1;
      if (ext) {
        const len = buf[j]; j += 1;
        if (porta === 0x0F) { porta = buf.readUInt16LE(j); j += 2; }
        const end = buf.subarray(j, j + len).toString('latin1');
        j += len; if ((j - i) % 2) j += 1;
        segs.push({ tipo: 'porta', porta, link: end });
      } else {
        if (porta === 0x0F) { porta = buf.readUInt16LE(j); j += 2; }
        segs.push({ tipo: 'porta', porta, link: buf[j] }); j += 1;
        if ((j - i) % 2) j += 1;
      }
      i = j;
    } else if (s === 0x80) {                                 // segmento de dados simples
      const words = buf[i + 1];
      segs.push({ tipo: 'dados', dados: buf.subarray(i + 2, i + 2 + words * 2) });
      i += 2 + words * 2;
    } else if (s === 0x43) {                                 // rede: production inhibit time (ms)
      segs.push({ tipo: 'rede', sub: s, valor: buf[i + 1] }); i += 2;
    } else if (s === 0x91) {                                 // simbólico ANSI (tags Logix) — não suportado
      throw new Error('segmento simbólico (tag) não suportado neste dispositivo');
    } else {
      throw new Error(`segmento 0x${s.toString(16)} não suportado`);
    }
  }
  return segs;
}

/** Monta path lógico simples: classe/instância/atributo */
function pathLogico(classe, instancia, atributo) {
  const w = new Escritor();
  if (classe > 0xFF) w.u8(0x21).u8(0).u16(classe); else w.u8(0x20).u8(classe);
  if (instancia > 0xFF) w.u8(0x25).u8(0).u16(instancia); else w.u8(0x24).u8(instancia);
  if (atributo !== undefined) w.u8(0x30).u8(atributo);
  return w.fim();
}

/** Converte IPv4 texto em UDINT (como o CIP guarda IPs: valor numérico em LE) */
function ipParaUdint(ip) { return ip.split('.').reduce((a, o) => ((a << 8) | +o) >>> 0, 0); }
function udintParaIp(v) { return [24, 16, 8, 0].map((s) => (v >>> s) & 0xFF).join('.'); }

function hex(buf, max = 96) {
  const b = buf.subarray(0, max);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ') + (buf.length > max ? ' …' : '');
}

module.exports = {
  ENCAP, ENCAP_NOME, ENCAP_STATUS, CPF, SVC, SVC_NOME, ST, ST_NOME, EXT, EXT_NOME,
  Escritor, lerCPF, montarCPF, sockaddr, lerSockaddr, lerPath, pathLogico, ipParaUdint, udintParaIp, hex,
};
