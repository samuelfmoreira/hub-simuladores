'use strict';
/**
 * IOL_CALL (IO-Link Integration para PROFINET): o CLP escreve o pedido no
 * registro 0xB400 (Client Access Point) e lê a resposta no mesmo registro.
 *
 * Pedido:   [0]=0x08 função estendida  [1]=porta (1..8)  [2..3]=FI_Index 65098 (0xFE4A)
 *           [4]=controle: 0x02 ler, 0x03 escrever       [5..6]=índice ISDU  [7]=subíndice
 *           [8..]=dados (só na escrita)
 * Resposta: mesmo cabeçalho; controle igual ao pedido em caso de sucesso (leitura traz
 *           os dados a partir do byte 8); controle 0x80 em caso de erro, seguido de 2 bytes
 *           com o código de erro IO-Link (ex.: 0x8011 índice inexistente).
 *
 * Observação: a estrutura segue o IOL_CALL, mas não foi validada byte a byte contra
 * a especificação nem contra o bloco IOL_CALL do CODESYS.
 */
const isdu = require('../core/isdu');
const { ISDU_ERR } = require('../core/portmap');

const EXT_FUNC = 0x08, FI_INDEX = 0xFE4A, CTRL_READ = 0x02, CTRL_WRITE = 0x03, CTRL_ERROR = 0x80;

function handle(sim, req) {
  const hdr = Buffer.alloc(8);
  req.copy(hdr, 0, 0, Math.min(8, req.length));
  const fail = code => { hdr[4] = CTRL_ERROR; return { buf: Buffer.concat([hdr, Buffer.from([code >> 8, code & 255])]), ok: false, code }; };
  if (req.length < 8 || req[0] !== EXT_FUNC || req.readUInt16BE(2) !== FI_INDEX) return { ...fail(ISDU_ERR.INDEX_NOT_AVAILABLE), port: req[1] || 0, index: 0 };
  const port = req[1], ctrl = req[4], index = req.readUInt16BE(5);
  if (port < 1 || port > 8 || (ctrl !== CTRL_READ && ctrl !== CTRL_WRITE)) return { ...fail(ISDU_ERR.INDEX_NOT_AVAILABLE), port, index };
  const res = isdu.access(sim, port - 1, ctrl === CTRL_WRITE, index, req.subarray(8));
  if (!res.ok) return { ...fail(res.err), port, index, write: ctrl === CTRL_WRITE };
  return { buf: Buffer.concat([hdr, res.data]), ok: true, port, index, write: ctrl === CTRL_WRITE };
}

/** Monta um pedido (útil para testes e para conferir o que o CLP deve enviar) */
function request(port, write, index, data = Buffer.alloc(0)) {
  const h = Buffer.from([EXT_FUNC, port, FI_INDEX >> 8, FI_INDEX & 255, write ? CTRL_WRITE : CTRL_READ, index >> 8, index & 255, 0]);
  return Buffer.concat([h, data]);
}

module.exports = { handle, request };
