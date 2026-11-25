'use strict';
// Endereçamento único do simulador, sem vetores: cada sinal é UMA variável com nome próprio e UM endereço.
// A mesma tabela alimenta o cliente Modbus, o CLP de demonstração, a tela (aba CLP) e o guia.
//   dir 'sim' = o simulador escreve, o CLP lê      dir 'clp' = o CLP escreve, o simulador lê
//   mb: tabela Modbus e endereço (base 0) no CODESYS "Modbus TCP Slave Device"; escala: inteiro × escala no Modbus
//   tipo: tipo da variável na GVL_SIM do CLP (BOOL, INT, UINT, REAL)
//   prio: prioridade na fila (1 = analógica em lote)
// O retorno do CLP (sinaleiros e IHM) é OPCIONAL por sessão: desligado, o simulador só escreve o LT01_Bruto.

const TAGS = [
  // ---------------- simulador -> CLP: entrada analógica (holding registers -> %IW)
  { nome: 'LT01_Bruto', dir: 'sim', tipo: 'INT', mb: { t: 'holding', a: 0 }, prio: 1, deadband: 8,
    desc: 'Nível LT-01, contagem do A/D: 0–32767 = 4–20 mA = 0–100 % (negativo abaixo de 4 mA; cabo rompido = −8192)' },
  // ---------------- CLP -> simulador: sinaleiros do painel (discrete inputs <- %QX)
  { nome: 'LALL_01', dir: 'clp', tipo: 'BOOL', mb: { t: 'discrete', a: 0 }, desc: 'Alarme de nível muito baixo (sinaleiro H1)' },
  { nome: 'LAL_01', dir: 'clp', tipo: 'BOOL', mb: { t: 'discrete', a: 1 }, desc: 'Alarme de nível baixo (sinaleiro H2)' },
  { nome: 'LAH_01', dir: 'clp', tipo: 'BOOL', mb: { t: 'discrete', a: 2 }, desc: 'Alarme de nível alto (sinaleiro H3)' },
  { nome: 'LAHH_01', dir: 'clp', tipo: 'BOOL', mb: { t: 'discrete', a: 3 }, desc: 'Alarme de nível muito alto (sinaleiro H4)' },
  { nome: 'Falha_LT01', dir: 'clp', tipo: 'BOOL', mb: { t: 'discrete', a: 4 }, desc: 'Falha do transmissor ou do laço 4–20 mA (sinaleiro H5)' },
  // ---------------- CLP -> simulador: valor para a IHM (input registers <- %QW)
  { nome: 'Nivel_Pct', dir: 'clp', tipo: 'REAL', mb: { t: 'input', a: 0, escala: 100 }, un: '%',
    desc: 'Nível calculado pelo CLP em % (Modbus: × 100; 4000 = 40,00 %). É o que a IHM do painel mostra' },
];

const PREFIXO = { coil: '0', discrete: '1', input: '3', holding: '4' };
const FC = { coil: { escreve: 15, le: 1 }, discrete: { le: 2 }, holding: { escreve: 16, le: 3 }, input: { le: 4 } };
const porNome = Object.fromEntries(TAGS.map((t) => [t.nome, t]));
const doSim = TAGS.filter((t) => t.dir === 'sim');
const doClp = TAGS.filter((t) => t.dir === 'clp');
const nDiscretos = Math.max(...doClp.filter((t) => t.mb.t === 'discrete').map((t) => t.mb.a)) + 1;
const nInputs = Math.max(...doClp.filter((t) => t.mb.t === 'input').map((t) => t.mb.a)) + 1;
const nHolding = Math.max(...doSim.filter((t) => t.mb.t === 'holding').map((t) => t.mb.a)) + 1;

// endereço CODESYS do Modbus TCP Slave Device (início em %IW0 / %QX0.0 / %QW0)
function codesys(t) {
  const a = t.mb.a;
  if (t.mb.t === 'coil') return `%IX${Math.floor(a / 8)}.${a % 8}`;
  if (t.mb.t === 'discrete') return `%QX${Math.floor(a / 8)}.${a % 8}`;
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

module.exports = { TAGS, porNome, doSim, doClp, nDiscretos, nInputs, nHolding, codesys, classico, tabelaDocs, FC };
