'use strict';
// Conversões de escala do XP325 virtual.
// Transmissor: engenharia -> sinal (mA ou V), com a faixa calibrada do instrumento.
// Canal do CLP: sinal -> contagem bruta (INT) conforme o MODO configurado no canal.
// Sub e sobrefaixa são preservadas para o aluno detectar fio rompido (< 3,8 mA).

const LIM = { subMA: 0, sobreMA: 20.5, subV: 0, sobreV: 10.5 };

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

// --- Transmissor -------------------------------------------------------------
// Converte valor de engenharia para o sinal que o instrumento gera. Falhas:
// 'ok' | 'fioRompido' (0 mA/0 V) | 'travado' (último valor) | 'curto' (sobrefaixa)
function engParaSinal(tx, eng, falha, ultimo) {
  if (falha === 'fioRompido') return 0;
  if (falha === 'travado' && ultimo !== undefined) return ultimo;
  const frac = (eng - tx.min) / (tx.max - tx.min);
  let s;
  if (tx.sinal === '4-20') s = clamp(4 + 16 * frac, 4, LIM.sobreMA); // transmissor sadio não vai abaixo de 4 mA
  else if (tx.sinal === '0-20') s = clamp(20 * frac, 0, LIM.sobreMA);
  else s = clamp(10 * frac, 0, LIM.sobreV);
  if (falha === 'curto') s = tx.sinal === '0-10V' ? LIM.sobreV : 21.5;
  return s;
}

// --- Canal de entrada do CLP ---------------------------------------------------
// raw em contagem (INT) e "eng" como o CLP veria se escalonasse o canal pela faixa
// nominal do modo (0..fundo). Deixa negativo abaixo de 4 mA no modo 4-20.
function sinalParaRaw(modoCanal, sinal, fundo) {
  let frac;
  if (modoCanal === '4-20') frac = (sinal - 4) / 16;
  else if (modoCanal === '0-20') frac = sinal / 20;
  else frac = sinal / 10;
  // o A/D satura: um pouco abaixo de zero (detecção de fio rompido) e um pouco acima do fundo
  frac = clamp(frac, -0.25, 1.03);
  return Math.round(frac * fundo);
}

// Engenharia que o CLP obteria do canal, usando a faixa do transmissor (o que o
// aluno deve programar). Serve para AI_ENG: o simulador entrega o valor como se
// o escalonamento estivesse correto PARA O MODO CONFIGURADO NO CANAL.
function rawParaEng(modoCanal, raw, fundo, tx) {
  const frac = raw / fundo;
  // se o modo do canal não bate com o transmissor, o erro aparece aqui (didático)
  return tx.min + frac * (tx.max - tx.min);
}

// Engenharia pela faixa calibrada do TRANSMISSOR (base de AI_ENG: o valor que o
// instrumento está reportando, com ruído, atraso e falhas, mas sem erro de canal).
function sinalParaEngTx(tx, sinal) {
  let frac;
  if (tx.sinal === '4-20') frac = (sinal - 4) / 16;
  else if (tx.sinal === '0-20') frac = sinal / 20;
  else frac = sinal / 10;
  return tx.min + frac * (tx.max - tx.min);
}

// Sinal que o canal "entende" a partir do raw (para exibir nos painéis)
function rawParaSinal(modoCanal, raw, fundo) {
  const frac = raw / fundo;
  if (modoCanal === '4-20') return 4 + 16 * frac;
  if (modoCanal === '0-20') return 20 * frac;
  return 10 * frac;
}

// --- Canal de saída do CLP -----------------------------------------------------
// raw (0..fundo) escrito pelo CLP -> sinal elétrico na saída
function rawSaidaParaSinal(modoCanal, raw, fundo) {
  const frac = clamp(raw / fundo, 0, 1);
  if (modoCanal === '4-20') return 4 + 16 * frac;
  if (modoCanal === '0-20') return 20 * frac;
  return 10 * frac;
}
// eng (engMin..engMax, p.ex. 0..100 %) escrito pelo CLP em AO_ENG -> sinal
function engSaidaParaSinal(modoCanal, eng, cfgSa) {
  const frac = clamp((eng - cfgSa.engMin) / (cfgSa.engMax - cfgSa.engMin), 0, 1);
  if (modoCanal === '4-20') return 4 + 16 * frac;
  if (modoCanal === '0-20') return 20 * frac;
  return 10 * frac;
}

// Atuador: sinal recebido -> fração de comando (0..1), conforme o tipo de sinal
// que o ATUADOR espera (ex.: CFW500 AI1 em 0-10 V; posicionador FV-01 em 4-20 mA).
function sinalParaComando(tipoAtuador, sinal) {
  if (tipoAtuador === '4-20') return clamp((sinal - 4) / 16, 0, 1);
  if (tipoAtuador === '0-20') return clamp(sinal / 20, 0, 1);
  return clamp(sinal / 10, 0, 1);
}

// RTD: entrada direta em °C (bruto = °C × escala)
function rtdParaRaw(tempC, escala) { return Math.round(tempC * escala); }

module.exports = {
  LIM, clamp, engParaSinal, sinalParaRaw, rawParaEng, rawParaSinal, sinalParaEngTx,
  rawSaidaParaSinal, engSaidaParaSinal, sinalParaComando, rtdParaRaw,
};
