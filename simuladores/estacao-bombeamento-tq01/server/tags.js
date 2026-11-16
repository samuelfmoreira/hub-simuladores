'use strict';
// Endereçamento único da estação, sem vetores: cada sinal é UMA variável com nome próprio e UM endereço.
// Canal analógico como no hardware: o CLP lê a contagem do A/D (LT01_Bruto) e escreve a contagem do D/A (Ref_Bruto).
// A mesma tabela alimenta o Modbus, o OPC UA, o OPC DA, os CLPs de demonstração, a tela e o guia.
//   dir 'sim' = o simulador escreve, o CLP lê      dir 'clp' = o CLP escreve, o simulador lê
//   mb: tabela Modbus e endereço (base 0) no CODESYS "Modbus TCP Slave Device"; escala: inteiro × escala no Modbus
//   tipo: tipo da variável na GVL_SIM do CLP (BOOL, INT, UINT). Não há REAL na troca: valores com casas decimais
//   viajam como INT × 100 em todos os protocolos (escala), e o programa do CLP divide/multiplica por 100.
//   prio: prioridade na fila de escrita (0 imediato, 1 lote de 100 ms, 2 lote de 1 s)

const TAGS = [
  // ---------------- simulador -> CLP: entradas digitais (coils -> %IX)
  { nome: 'S1_Liga',        dir: 'sim', tipo: 'BOOL', mb: { t: 'coil', a: 0 }, prio: 0, desc: 'Botoeira S1 liga (NA): 1 enquanto pressionada' },
  { nome: 'S2_Desliga_NF',  dir: 'sim', tipo: 'BOOL', mb: { t: 'coil', a: 1 }, prio: 0, desc: 'Botoeira S2 desliga (NF): 1 em repouso, 0 pressionada' },
  { nome: 'S3_Reset',       dir: 'sim', tipo: 'BOOL', mb: { t: 'coil', a: 2 }, prio: 0, desc: 'Botoeira S3 reset (NA)' },
  { nome: 'S4_Auto',        dir: 'sim', tipo: 'BOOL', mb: { t: 'coil', a: 3 }, prio: 0, desc: 'Seletor S4: 1 = automático, 0 = manual' },
  { nome: 'S0_Emerg_NF',    dir: 'sim', tipo: 'BOOL', mb: { t: 'coil', a: 4 }, prio: 0, desc: 'Emergência S0 (NF): 1 destravado, 0 acionado' },
  { nome: 'Inv_Rodando',    dir: 'sim', tipo: 'BOOL', mb: { t: 'coil', a: 5 }, prio: 0, desc: 'Relé DO2 do CFW500 (F > Fx): inversor acima de 3 Hz' },
  { nome: 'Inv_OK',         dir: 'sim', tipo: 'BOOL', mb: { t: 'coil', a: 6 }, prio: 0, desc: 'Relé DO1 do CFW500 (sem falha): 0 = falha ou sem alimentação' },
  { nome: 'LSHH',           dir: 'sim', tipo: 'BOOL', mb: { t: 'coil', a: 7 }, prio: 0, desc: 'Chave de nível muito alto LSHH-01 (2,8 m)' },
  { nome: 'LSLL',           dir: 'sim', tipo: 'BOOL', mb: { t: 'coil', a: 8 }, prio: 0, desc: 'Chave de nível muito baixo LSLL-01 (0,3 m)' },
  // ---------------- simulador -> CLP: entrada analógica e IHM (holding registers -> %IW)
  { nome: 'LT01_Bruto',     dir: 'sim', tipo: 'INT',  mb: { t: 'holding', a: 0 }, prio: 1, deadband: 65, desc: 'Nível LT-01, contagem do A/D: 0–32767 = 4–20 mA = 0–3,5 m (negativo abaixo de 4 mA)' },
  { nome: 'HB_Sim',         dir: 'sim', tipo: 'UINT', mb: { t: 'holding', a: 1 }, prio: 2, desc: 'Heartbeat do simulador: +1 por segundo' },
  { nome: 'IHM_Velocidade', dir: 'sim', tipo: 'INT',  mb: { t: 'holding', a: 2 }, prio: 1, un: '%', desc: 'IHM: velocidade da bomba pedida pelo operador, em % (0–100)' },
  { nome: 'IHM_Setpoint',   dir: 'sim', tipo: 'INT',  mb: { t: 'holding', a: 3, escala: 100 }, prio: 1, un: 'm', desc: 'IHM: setpoint de nível para o automático, em cm (0–300; 200 = 2,00 m)' },
  // ---------------- CLP -> simulador: saídas digitais (discrete inputs <- %QX)
  { nome: 'H1',             dir: 'clp', tipo: 'BOOL', mb: { t: 'discrete', a: 0 }, desc: 'Sinaleiro verde — em operação' },
  { nome: 'H2',             dir: 'clp', tipo: 'BOOL', mb: { t: 'discrete', a: 1 }, desc: 'Sinaleiro amarelo — alarme' },
  { nome: 'H3',             dir: 'clp', tipo: 'BOOL', mb: { t: 'discrete', a: 2 }, desc: 'Sinaleiro vermelho — falha' },
  { nome: 'H4',             dir: 'clp', tipo: 'BOOL', mb: { t: 'discrete', a: 3 }, desc: 'Sirene' },
  { nome: 'Inv_Gira',       dir: 'clp', tipo: 'BOOL', mb: { t: 'discrete', a: 4 }, desc: 'DI1 do CFW500: gira/para (em série com o 2º NF do S0)' },
  { nome: 'Inv_Reset',      dir: 'clp', tipo: 'BOOL', mb: { t: 'discrete', a: 5 }, desc: 'DI3 do CFW500: reset de falha (borda de subida)' },
  // ---------------- CLP -> simulador: saída analógica e IHM (input registers <- %QW)
  { nome: 'Ref_Bruto',      dir: 'clp', tipo: 'INT',  mb: { t: 'input', a: 0 }, desc: 'Referência de velocidade, contagem do D/A: 0–32767 = 0–10 V = 0–60 Hz' },
  { nome: 'HB_CLP',         dir: 'clp', tipo: 'UINT', mb: { t: 'input', a: 1 }, desc: 'Heartbeat do CLP: +1 a cada 0,5 s' },
  { nome: 'IHM_Nivel',      dir: 'clp', tipo: 'INT',  mb: { t: 'input', a: 2, escala: 100 }, un: 'm', desc: 'Nível que o CLP manda a IHM mostrar, em cm (152 = 1,52 m)' },
];

const PREFIXO = { coil: '0', discrete: '1', input: '3', holding: '4' };
const FC = { coil: { escreve: 15, le: 1 }, discrete: { le: 2 }, holding: { escreve: 16, le: 3 }, input: { le: 4 } };
const porNome = Object.fromEntries(TAGS.map((t) => [t.nome, t]));
const doSim = TAGS.filter((t) => t.dir === 'sim');
const doClp = TAGS.filter((t) => t.dir === 'clp');

// Configuração do "Modbus TCP Slave Device" no CODESYS. O CODESYS põe as áreas em sequência na imagem de E/S:
//   entradas (%I): primeiro os holding registers (%IW0..), depois os coils, a partir do byte 2 × nHolding;
//   saídas   (%Q): primeiro os input registers (%QW0..), depois os discrete inputs, a partir do byte 2 × nInput.
// Com 4 holding e 3 input registers: coils em %IX8.0 e discrete inputs em %QX6.0.
const SLAVE = { porta: 502, unitId: 1, holding: 4, input: 3, coils: 9, discrete: 6 };   // exatamente o que a estação usa
function codesys(t) {
  const a = t.mb.a;
  if (t.mb.t === 'coil') { const b0 = 2 * SLAVE.holding; return `%IX${b0 + Math.floor(a / 8)}.${a % 8}`; }
  if (t.mb.t === 'discrete') { const b0 = 2 * SLAVE.input; return `%QX${b0 + Math.floor(a / 8)}.${a % 8}`; }
  if (t.mb.t === 'holding') return `%IW${a}`;
  return `%QW${a}`;
}
const classico = (t) => `${PREFIXO[t.mb.t]}${String(t.mb.a + 1).padStart(4, '0')}`;
const nomeTabela = { coil: 'coil', discrete: 'discrete input', holding: 'holding register', input: 'input register' };

function tabelaDocs() {
  return TAGS.map((t) => ({
    nome: t.nome, dir: t.dir, sentido: t.dir === 'sim' ? 'simulador → CLP' : 'CLP → simulador', tipo: t.tipo,
    tabela: nomeTabela[t.mb.t], fc: `FC${t.dir === 'sim' ? FC[t.mb.t].escreve : FC[t.mb.t].le}`, endereco: t.mb.a,
    classico: classico(t), codesys: codesys(t), escala: t.mb.escala || 1, un: t.un || '', desc: t.desc,
  }));
}

module.exports = { TAGS, porNome, doSim, doClp, codesys, classico, tabelaDocs, FC, SLAVE };
