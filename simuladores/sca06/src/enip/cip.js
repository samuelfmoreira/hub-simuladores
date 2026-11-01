/* =============================================================================
 *  CIP / EtherNet/IP — utilitários de codificação (encapsulação, CPF, EPATH)
 *  Referência: ODVA "The CIP Networks Library" Vol. 1 (CIP) e Vol. 2 (EtherNet/IP)
 *  Tudo little-endian, EXCETO o sockaddr (big-endian, "network order").
 * ===========================================================================*/
'use strict';

// Comandos de encapsulação (Vol. 2, Tabela 2-3.2)
const CMD = {
  NOP: 0x0000, ListServices: 0x0004, ListIdentity: 0x0063, ListInterfaces: 0x0064,
  RegisterSession: 0x0065, UnRegisterSession: 0x0066, SendRRData: 0x006F, SendUnitData: 0x0070,
};
const CMD_NAME = Object.fromEntries(Object.entries(CMD).map(([k, v]) => [v, k]));

// Status de encapsulação
const ENCAP_STATUS = { SUCCESS: 0, INVALID_CMD: 0x01, NO_MEMORY: 0x02, INCORRECT_DATA: 0x03, INVALID_SESSION: 0x64, INVALID_LENGTH: 0x65, UNSUPPORTED_PROTOCOL: 0x69 };

// Itens CPF (Common Packet Format)
const ITEM = { NULL: 0x0000, LIST_IDENTITY: 0x000C, CONNECTED_ADDR: 0x00A1, CONNECTED_DATA: 0x00B1, UNCONNECTED_DATA: 0x00B2, LIST_SERVICES: 0x0100, SOCKADDR_OT: 0x8000, SOCKADDR_TO: 0x8001, SEQUENCED_ADDR: 0x8002 };

// Serviços CIP
const SVC = {
  GetAttributesAll: 0x01, SetAttributesAll: 0x02, Reset: 0x05, MultipleServicePacket: 0x0A,
  GetAttributeSingle: 0x0E, SetAttributeSingle: 0x10, ForwardClose: 0x4E, UnconnectedSend: 0x52,
  ForwardOpen: 0x54, LargeForwardOpen: 0x5B,
};
const SVC_NAME = Object.fromEntries(Object.entries(SVC).map(([k, v]) => [v, k]));

// Status geral CIP (Vol. 1, Apêndice B)
const GS = {
  SUCCESS: 0x00, CONNECTION_FAILURE: 0x01, PATH_SEGMENT_ERROR: 0x04, PATH_DEST_UNKNOWN: 0x05,
  SERVICE_NOT_SUPPORTED: 0x08, INVALID_ATTR_VALUE: 0x09, ALREADY_IN_STATE: 0x0B, OBJECT_STATE_CONFLICT: 0x0C,
  ATTR_NOT_SETTABLE: 0x0E, PRIVILEGE_VIOLATION: 0x0F, DEVICE_STATE_CONFLICT: 0x10, NOT_ENOUGH_DATA: 0x13,
  ATTR_NOT_SUPPORTED: 0x14, TOO_MUCH_DATA: 0x15, OBJECT_DOES_NOT_EXIST: 0x16,
};
const GS_TEXT = {
  0x00: 'Sucesso', 0x01: 'Falha de conexão', 0x04: 'Erro de segmento no path', 0x05: 'Destino do path desconhecido',
  0x08: 'Serviço não suportado', 0x09: 'Valor de atributo inválido', 0x0C: 'Conflito de estado do objeto',
  0x0E: 'Atributo não configurável (somente leitura)', 0x10: 'Conflito de estado do dispositivo', 0x13: 'Dados insuficientes',
  0x14: 'Atributo não suportado', 0x15: 'Dados em excesso', 0x16: 'Objeto não existe',
};

// Status estendido do Connection Manager (Vol. 1, Tabela 3-5.29)
const CM = {
  CONNECTION_IN_USE: 0x0100, TRANSPORT_NOT_SUPPORTED: 0x0103, OWNERSHIP_CONFLICT: 0x0106, CONNECTION_NOT_FOUND: 0x0107,
  INVALID_NCP: 0x0108, INVALID_SIZE: 0x0109, RPI_NOT_SUPPORTED: 0x0111, OUT_OF_CONNECTIONS: 0x0113,
  VENDOR_MISMATCH: 0x0114, DEVTYPE_MISMATCH: 0x0115, REVISION_MISMATCH: 0x0116, INVALID_APP_PATH: 0x0117,
  INVALID_CONFIG_PATH: 0x0118, NON_LISTEN_ONLY_NOT_OPEN: 0x0119, INVALID_SEGMENT: 0x0315,
};
const CM_TEXT = {
  0x0100: 'Conexão já em uso (Forward Open duplicado)', 0x0103: 'Classe de transporte/gatilho não suportada',
  0x0106: 'Conflito de propriedade (já existe um dono "Exclusive Owner")', 0x0107: 'Conexão não encontrada',
  0x0108: 'Parâmetro de conexão de rede inválido', 0x0109: 'Tamanho de conexão inválido',
  0x0111: 'RPI não suportado', 0x0113: 'Sem conexões livres', 0x0114: 'Vendor ID ou Product Code não confere (keying)',
  0x0115: 'Device Type não confere (keying)', 0x0116: 'Revisão não confere (keying)', 0x0117: 'Application path inválido (instância de assembly)',
  0x0118: 'Path de configuração inválido', 0x0119: 'Listen Only sem conexão dona aberta', 0x0315: 'Segmento inválido no path de conexão',
};

// ------------------------------------------------------------------ encapsulação
function parseEncap(buf) {
  if (buf.length < 24) return null;
  const length = buf.readUInt16LE(2);
  if (buf.length < 24 + length) return null;
  return {
    command: buf.readUInt16LE(0), length,
    session: buf.readUInt32LE(4), status: buf.readUInt32LE(8),
    context: buf.subarray(12, 20), options: buf.readUInt32LE(20),
    data: buf.subarray(24, 24 + length), total: 24 + length,
  };
}
function buildEncap(command, session, status, context, data) {
  const h = Buffer.alloc(24);
  h.writeUInt16LE(command, 0); h.writeUInt16LE(data.length, 2);
  h.writeUInt32LE(session >>> 0, 4); h.writeUInt32LE(status >>> 0, 8);
  (context || Buffer.alloc(8)).copy(h, 12, 0, 8); h.writeUInt32LE(0, 20);
  return Buffer.concat([h, data]);
}

// ------------------------------------------------------------------ CPF
function parseCPF(buf, off = 0) {
  const count = buf.readUInt16LE(off); off += 2;
  const items = [];
  for (let i = 0; i < count; i++) {
    if (off + 4 > buf.length) throw new Error('CPF truncado');
    const type = buf.readUInt16LE(off), len = buf.readUInt16LE(off + 2);
    items.push({ type, data: buf.subarray(off + 4, off + 4 + len) });
    off += 4 + len;
  }
  return items;
}
function buildCPF(items) {
  const parts = [Buffer.alloc(2)]; parts[0].writeUInt16LE(items.length, 0);
  for (const it of items) {
    const h = Buffer.alloc(4); h.writeUInt16LE(it.type, 0); h.writeUInt16LE(it.data.length, 2);
    parts.push(h, it.data);
  }
  return Buffer.concat(parts);
}
function sockaddr(port, ip) {          // big-endian!
  const b = Buffer.alloc(16);
  b.writeUInt16BE(2, 0); b.writeUInt16BE(port, 2);
  const o = String(ip || '0.0.0.0').split('.').map(Number);
  for (let i = 0; i < 4; i++) b[4 + i] = o[i] || 0;
  return b;
}
function parseSockaddr(d) {
  if (!d || d.length < 8) return null;
  return { family: d.readUInt16BE(0), port: d.readUInt16BE(2), ip: `${d[4]}.${d[5]}.${d[6]}.${d[7]}` };
}

// ------------------------------------------------------------------ EPATH
/** Decodifica um path lógico (classe/instância/atributo/ponto de conexão/chave eletrônica). */
function parsePath(buf) {
  const r = { segments: [], class: null, instance: null, attribute: null, points: [], key: null, data: null, port: null };
  let i = 0;
  while (i < buf.length) {
    const s = buf[i];
    if (s === 0x20) { r.class = buf[i + 1]; i += 2; }
    else if (s === 0x21) { r.class = buf.readUInt16LE(i + 2); i += 4; }
    else if (s === 0x24) { r.instance = buf[i + 1]; i += 2; }
    else if (s === 0x25) { r.instance = buf.readUInt16LE(i + 2); i += 4; }
    else if (s === 0x2C) { r.points.push(buf[i + 1]); i += 2; }
    else if (s === 0x2D) { r.points.push(buf.readUInt16LE(i + 2)); i += 4; }
    else if (s === 0x30) { r.attribute = buf[i + 1]; i += 2; }
    else if (s === 0x31) { r.attribute = buf.readUInt16LE(i + 2); i += 4; }
    else if (s === 0x34) {                                         // chave eletrônica
      r.key = { vendor: buf.readUInt16LE(i + 2), devType: buf.readUInt16LE(i + 4), product: buf.readUInt16LE(i + 6), major: buf[i + 8] & 0x7F, compat: !!(buf[i + 8] & 0x80), minor: buf[i + 9] };
      i += 10;
    } else if (s === 0x80) { const w = buf[i + 1]; r.data = buf.subarray(i + 2, i + 2 + w * 2); i += 2 + w * 2; }
    else if ((s & 0xE0) === 0x00) {                                // segmento de porta (rota)
      const ext = s & 0x10; if (ext) { const l = buf[i + 1]; i += 2 + l + (l & 1); } else i += 2;
      r.port = s & 0x0F;
    } else { r.error = `Segmento 0x${s.toString(16)} não suportado`; break; }
  }
  return r;
}

function cipReply(service, gs, data = Buffer.alloc(0), ext = []) {
  const h = Buffer.alloc(4 + ext.length * 2);
  h[0] = service | 0x80; h[1] = 0; h[2] = gs; h[3] = ext.length;
  ext.forEach((w, k) => h.writeUInt16LE(w, 4 + k * 2));
  return Buffer.concat([h, data]);
}
function parseRequest(buf) {
  const service = buf[0], words = buf[1];
  return { service, path: buf.subarray(2, 2 + words * 2), data: buf.subarray(2 + words * 2) };
}

const hex = (b, max = 96) => {
  const s = Buffer.from(b).subarray(0, max).toString('hex').replace(/(..)/g, '$1 ').trim();
  return b.length > max ? s + ' …' : s;
};

module.exports = { CMD, CMD_NAME, ENCAP_STATUS, ITEM, SVC, SVC_NAME, GS, GS_TEXT, CM, CM_TEXT, parseEncap, buildEncap, parseCPF, buildCPF, sockaddr, parseSockaddr, parsePath, cipReply, parseRequest, hex };
