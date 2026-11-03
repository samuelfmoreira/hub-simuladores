'use strict';
/**
 * Mapa da conexão EtherNet/IP do TBEN-L-SIM: onde fica cada campo de cada porta nas
 * palavras de entrada (T→O) e de saída (O→T). Os nomes são os da GVL_TBEN (codesys/).
 *
 * Cada porta começa num endereço par, para as WORDs ficarem alinhadas. Dentro da porta,
 * os campos vêm na ordem do IO-Link; as WORDs vão em little-endian (ordem do CIP e do
 * CODESYS), por isso no EtherNet/IP não é preciso trocar bytes (xTrocarBytes = FALSE).
 * O IO-Link e a simulação usam big-endian: a conversão é feita aqui.
 */
// campos de cada porta: [nome, deslocamento dentro da porta, tamanho em bytes]
const ENTRADAS = [
  { n: 0, campos: [['X0_In_Status', 0, 1], ['X0_In_Speed', 1, 1]] },
  { n: 1, campos: [['X1_In_Dist', 0, 2], ['X1_In_Flags', 2, 1], ['X1_In_Quality', 3, 1]] },
  { n: 2, campos: [['X2_In_Status', 0, 1]] },
  { n: 3, campos: [['X3_In_B0', 0, 1], ['X3_In_B1', 1, 1]] },
  { n: 4, campos: [['X4_In_Status', 0, 1], ['X4_In_Fault', 1, 1], ['X4_In_Speed', 2, 2]] },
  { n: 5, campos: [['X5_In_Dist', 0, 2], ['X5_In_Flags', 2, 1], ['X5_In_Quality', 3, 1]] },
  { n: 6, campos: [['X6_In_Status', 0, 1], ['X6_In_Speed', 1, 1]] },
  { n: 7, campos: [] },
];
const SAIDAS = [
  { n: 0, campos: [['X0_Out_Ctrl', 0, 1], ['X0_Out_Speed', 1, 1]] },
  { n: 2, campos: [['X2_Out_Valves', 0, 1]] },
  { n: 4, campos: [['X4_Out_Ctrl', 0, 1], ['X4_Out_Res', 1, 1], ['X4_Out_Speed', 2, 2]] },
  { n: 6, campos: [['X6_Out_Ctrl', 0, 1], ['X6_Out_Speed', 1, 1]] },
  { n: 7, campos: [['X7_Out_Lamps', 0, 1]] },
];

/** Monta a lista linear de itens (campos, PQI e preenchimentos) com o endereço de cada um. */
function montar(portas, comPqi) {
  const itens = []; let pos = 0;
  for (const p of portas) {
    const ini = pos; let usado = 0;
    for (const [nome, off, tam] of p.campos) { itens.push({ nome, porta: p.n, off, tam, pos: ini + off }); usado = Math.max(usado, off + tam); }
    pos = ini + usado;
    if (comPqi) { itens.push({ nome: `X${p.n}_PQI`, porta: p.n, pqi: true, tam: 1, pos }); pos += 1; }
    if (pos % 2) { itens.push({ nome: `X${p.n}_reservado`, porta: p.n, reserva: true, tam: 1, pos }); pos += 1; }
  }
  return { itens, bytes: pos };
}
const IN = montar(ENTRADAS, true);
const OUT = montar(SAIDAS, false);

/** Imagem de entrada (bytes da conexão T→O) a partir dos dados de processo e do PQI de cada porta. */
function empacotarEntradas(INp, PQI) {
  const b = Buffer.alloc(IN.bytes);
  for (const it of IN.itens) {
    if (it.reserva) continue;
    if (it.pqi) { b[it.pos] = PQI[it.porta] & 0xFF; continue; }
    const d = INp[it.porta];
    if (it.tam === 1) b[it.pos] = d[it.off] & 0xFF;
    else { b[it.pos] = d[it.off + 1] & 0xFF; b[it.pos + 1] = d[it.off] & 0xFF; }   // WORD: big-endian (IO-Link) → little-endian (CIP)
  }
  return b;
}
/** Bytes da conexão O→T → saídas de cada porta (WORDs de volta para big-endian). */
function desempacotarSaidas(buf, out) {
  for (const it of OUT.itens) {
    if (it.reserva || it.pos + it.tam > buf.length) continue;
    const d = out[it.porta];
    if (it.tam === 1) d[it.off] = buf[it.pos];
    else { d[it.off] = buf[it.pos + 1]; d[it.off + 1] = buf[it.pos]; }
  }
}
module.exports = { IN, OUT, empacotarEntradas, desempacotarSaidas };
