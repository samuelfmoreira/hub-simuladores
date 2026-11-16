'use strict';
// Catálogo do processo simplificado: um tanque abastecido por uma bomba com inversor.
//   Entrada analógica: LT-01, nível do tanque, 4–20 mA (EA0)
//   Saída analógica:   referência de velocidade do CFW500, 0–10 V (SA0)
//   Perturbação:       válvula manual HV-01 na saída do tanque (consumo), ajustada pelo instrutor

const ED = { LIGA: 0, DESLIGA: 1, RESET: 2, AUTO: 3, EMERG: 4, INV_RODANDO: 5, INV_OK: 6, LSHH: 7, LSLL: 8 };
const SD = { H1_VERDE: 0, H2_AMARELO: 1, H3_VERMELHO: 2, H4_SIRENE: 3, INV_RUN: 4, INV_RESET: 5 };
const EA = { LT01: 0 };
const SA = { INV_REF: 0 };
const N_EA = 4, N_SA = 2; // canais do XP325 virtual expostos (só EA0 e SA0 são usados)

// Transmissor: faixa calibrada do instrumento (independe do modo do canal no CLP)
const transmissores = [
  { id: 'LT-01', ea: EA.LT01, tipo: 'nível ultrassônico', sinal: '4-20', min: 0, max: 3.5, unidade: 'm', tau: 1.0, ruido: 0.005 },
];

// Canais do XP325 virtual. 'modo' é o que o aluno configura no MasterTool/CODESYS.
// fundoEscala: contagem do A/D no fundo de escala. 15 bits (0..32767) = padrão do CODESYS.
const canaisPadrao = {
  fundoEscala: 32767,
  ea: [
    { ch: 0, tag: 'LT-01', modo: '4-20' },
    { ch: 1, tag: 'reserva', modo: '4-20' },
    { ch: 2, tag: 'reserva', modo: '4-20' },
    { ch: 3, tag: 'reserva', modo: '4-20' },
  ],
  sa: [
    { ch: 0, tag: 'B-01 referência', modo: '0-10V', engMin: 0, engMax: 100, unidade: '%' },
    { ch: 1, tag: 'reserva', modo: '0-10V', engMin: 0, engMax: 100, unidade: '%' },
  ],
};

const componentes = [
  { id: 'S1', tipo: 'botoeira', cor: 'verde', contato: 'NA', tag: 'S1 liga', fiacao: { di: ED.LIGA, borne: 'X1:1' }, momentaneo: true },
  { id: 'S2', tipo: 'botoeira', cor: 'vermelha', contato: 'NF', tag: 'S2 desliga', fiacao: { di: ED.DESLIGA, borne: 'X1:2' }, momentaneo: true },
  { id: 'S3', tipo: 'botoeira', cor: 'azul', contato: 'NA', tag: 'S3 reset', fiacao: { di: ED.RESET, borne: 'X1:3' }, momentaneo: true },
  { id: 'S4', tipo: 'seletor', posicoes: ['manual', 'auto'], contato: 'NA', tag: 'S4 auto/manual', fiacao: { di: ED.AUTO, borne: 'X1:4' } },
  { id: 'S0', tipo: 'cogumelo', cor: 'vermelha', contato: 'NF', tag: 'S0 emergência', fiacao: { di: ED.EMERG, borne: 'X1:5', hardware: 'segundo contato NF em série com a DI1 do inversor (corta o gira/para sem depender do CLP)' }, trava: true },
  { id: 'H1', tipo: 'sinaleiro', cor: 'verde', tag: 'H1 em operação', fiacao: { do: SD.H1_VERDE, borne: 'X2:1' } },
  { id: 'H2', tipo: 'sinaleiro', cor: 'amarela', tag: 'H2 alarme', fiacao: { do: SD.H2_AMARELO, borne: 'X2:2' } },
  { id: 'H3', tipo: 'sinaleiro', cor: 'vermelha', tag: 'H3 falha', fiacao: { do: SD.H3_VERMELHO, borne: 'X2:3' } },
  { id: 'H4', tipo: 'sirene', tag: 'H4 sirene', fiacao: { do: SD.H4_SIRENE, borne: 'X2:4' } },
  { id: 'Q1', tipo: 'disjuntor', tag: 'Q1 disjuntor-motor de alimentação do CFW500 (manual, no quadro)', manual: true },
  { id: 'CFW500', tipo: 'inversor', tag: 'Inversor CFW500 (B-01)',
    // padrão de fábrica do CFW500: DI1 gira/para (P0263 = 1), DI3 reset (P0265 = 20), DO1 "sem falha" (P0275 = 13), DO2 "F > Fx" (P0276 = 2)
    fiacao: { DI1: { de: 'DO', idx: SD.INV_RUN }, DI3: { de: 'DO', idx: SD.INV_RESET }, AI1: { de: 'AO', idx: SA.INV_REF }, DO2: { para: 'DI', idx: ED.INV_RODANDO }, DO1: { para: 'DI', idx: ED.INV_OK } } },
  { id: 'B-01', tipo: 'motobomba', tag: 'B-01 bomba de enchimento', alimentacao: 'CFW500' },
  { id: 'HV-01', tipo: 'valvula-manual', tag: 'HV-01 válvula de consumo (saída do tanque)', instrutor: true },
  { id: 'LSHH-01', tipo: 'chave-nivel', tag: 'LSHH-01 nível muito alto', fiacao: { di: ED.LSHH }, nivel: 2.8, hist: 0.05 },
  { id: 'LSLL-01', tipo: 'chave-nivel', tag: 'LSLL-01 nível muito baixo', fiacao: { di: ED.LSLL }, nivel: 0.3, hist: 0.05 },
  { id: 'LT-01', tipo: 'transmissor', tag: 'LT-01 nível ultrassônico', fiacao: { ai: EA.LT01 } },
];

module.exports = { ED, SD, EA, SA, N_EA, N_SA, transmissores, canaisPadrao, componentes };
