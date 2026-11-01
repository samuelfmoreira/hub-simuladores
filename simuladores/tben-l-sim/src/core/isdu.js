'use strict';
/**
 * Parâmetros ISDU dos devices virtuais. A mesma tabela atende a tela web e o
 * CLP (via IOL_CALL no registro 0xB400, ver src/pn/iol-call.js).
 *
 * Codificação no barramento:
 *   textos -> bytes UTF-8 (até 32)          parâmetros numéricos RW -> UINT16 big-endian
 *   contadores -> UDINT big-endian          0x0024 status do device -> 1 byte
 */
const { DEV, PORTS, ISDU_ERR } = require('./portmap');

const STATUS_TXT = { 0: '0 (device OK)', 1: '1 (manutenção necessária)', 2: '2 (fora da especificação)', 4: '4 (falha)' };

function table(sim, n) {
  const p = PORTS[n], d = DEV[p.dev], st = sim.S[n], dev = st.dev;
  return [
    { x: 0x10, l: 'Nome do fabricante', v: 'Simulab Automação', kind: 'str' },
    { x: 0x12, l: 'Nome do produto', v: dev.product, kind: 'str' },
    { x: 0x13, l: 'ID do produto', v: dev.pid, kind: 'str' },
    { x: 0x15, l: 'Número de série', v: dev.serial, kind: 'str' },
    { x: 0x17, l: 'Revisão de firmware', v: 'V1.2.0', kind: 'str' },
    { x: 0x18, l: 'Tag da aplicação', v: dev.params[0x18], kind: 'str', rw: 'str' },
    { x: 0x24, l: 'Status do device', v: st.status, text: STATUS_TXT[st.status], kind: 'u8' },
    ...d.isdu.map(it => it.get
      ? { x: it.x, l: it.l, v: st[it.get], kind: 'u32' }
      : { x: it.x, l: it.l, v: dev.params[it.x], kind: 'u16', rw: it.rw, min: it.min, max: it.max })
  ];
}

function list(sim, n) { return table(sim, n).map(r => ({ ...r, text: r.text || String(r.v) })); }

/** Escrita com valor já em JS (tela ou CLP). Atualiza o Data Storage conforme a configuração da porta. */
function writeValue(sim, n, x, value) {
  if (!sim.conn(n)) return { ok: false, err: ISDU_ERR.NO_COMM, msg: 'porta sem comunicação IO-Link' };
  const r = table(sim, n).find(i => i.x === x);
  if (!r) return { ok: false, err: ISDU_ERR.INDEX_NOT_AVAILABLE, msg: 'índice inexistente' };
  if (!r.rw) return { ok: false, err: ISDU_ERR.ACCESS_DENIED, msg: 'parâmetro somente leitura' };
  const params = sim.S[n].dev.params;
  if (r.rw === 'num') {
    const v = Number(value);
    if (!Number.isFinite(v) || v < r.min || v > r.max) return { ok: false, err: ISDU_ERR.OUT_OF_RANGE, msg: `valor fora da faixa ${r.min} a ${r.max}` };
    params[x] = Math.round(v);
  } else params[x] = String(value).slice(0, 32);
  sim.paramWritten(n);
  return { ok: true, value: params[x] };
}

function encode(r) {
  if (r.kind === 'str') return Buffer.from(String(r.v), 'utf8').subarray(0, 32);
  if (r.kind === 'u8') return Buffer.from([r.v & 255]);
  if (r.kind === 'u16') { const b = Buffer.alloc(2); b.writeUInt16BE(r.v & 0xFFFF); return b; }
  const b = Buffer.alloc(4); b.writeUInt32BE(r.v >>> 0); return b;
}

/** Acesso em bytes (CLP). Devolve { ok, data } ou { ok:false, err } */
function access(sim, n, write, x, data) {
  if (!sim.conn(n)) return { ok: false, err: ISDU_ERR.NO_COMM };
  const r = table(sim, n).find(i => i.x === x);
  if (!r) return { ok: false, err: ISDU_ERR.INDEX_NOT_AVAILABLE };
  if (!write) return { ok: true, data: encode(r) };
  let value;
  if (r.rw === 'num') { if (data.length < 2) return { ok: false, err: ISDU_ERR.OUT_OF_RANGE }; value = data.readUInt16BE(0); }
  else value = data.toString('utf8').replace(/\0+$/, '');
  const res = writeValue(sim, n, x, value);
  return res.ok ? { ok: true, data: Buffer.alloc(0) } : { ok: false, err: res.err };
}

module.exports = { list, writeValue, access, STATUS_TXT };
