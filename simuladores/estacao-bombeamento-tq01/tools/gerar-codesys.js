'use strict';
// Gera mastertool/GVL_SIM.st e tags-modbus-tq01.csv a partir da tabela única (server/tags.js),
// para que nomes, tipos, endereços e comentários sejam EXATAMENTE os da tabela "Variáveis e endereços" da tela.
// Uso: node tools/gerar-codesys.js [pasta-de-saída]
const fs = require('fs'), path = require('path');
const TG = require('../server/tags');
const out = process.argv[2] || path.join(__dirname, '..', 'mastertool');
const linhas = TG.tabelaDocs();
const largura = Math.max(...linhas.map((l) => l.nome.length));
const tabNome = { coil: 'coil', 'discrete input': 'discrete input', 'holding register': 'holding register', 'input register': 'input register' };
// comentário = exatamente a coluna "Significado" da tabela da tela (o endereço já está no AT)
const comentario = (l) => `(* ${l.desc.replace(/\*\)/g, '* )')} *)`;
const conta = (tab) => linhas.filter((l) => l.tabela === tab).length;
const decl = (l) => `    ${l.nome.padEnd(largura)} AT ${l.codesys.padEnd(7)} : ${`${l.tipo};`.padEnd(6)}  ${comentario(l)}`;

const gvl = `(* =====================================================================================
   GVL_SIM — Estação TQ-01 · CODESYS como servidor Modbus TCP (Modbus TCP Slave Device)
   Gerada da tabela "Variáveis e endereços" do simulador: as mesmas ${linhas.length} variáveis, com o mesmo nome,
   tipo, endereço e significado. Cada uma está presa ao seu endereço com AT: não há programa de cópia.
   O comentário de cada variável é o texto da coluna "Significado" da tabela.

   Canal analógico como no hardware: LT01_Bruto é a contagem do A/D (0..32767 = 4..20 mA) e Ref_Bruto é a
   contagem do D/A (0..32767 = 0..10 V); o escalonamento é feito no seu programa.
   IHM: velocidade em % inteiro (75 = 75 %); setpoint e nível em centímetros (200 = 2,00 m).

   Configure o Modbus TCP Slave Device assim (aba de configuração):
       porta ${TG.SLAVE.porta} · Unit ID ${TG.SLAVE.unitId} · Holding registers ${TG.SLAVE.holding} · Input registers ${TG.SLAVE.input} · Coils ${TG.SLAVE.coils} · Discrete inputs ${TG.SLAVE.discrete}
   Com isso o CODESYS coloca, na aba "Modbus TCP Slave Device I/O Mapping":
       Holding Registers em %IW0 · Coils em %IB${2 * TG.SLAVE.holding} (%IX${2 * TG.SLAVE.holding}.0…) · Input Registers em %QW0 · Discrete Inputs em %QB${2 * TG.SLAVE.input} (%QX${2 * TG.SLAVE.input}.0…)
   Se algum endereço inicial for diferente no seu projeto, ajuste os AT abaixo (ou mude as quantidades acima).
   ===================================================================================== *)
VAR_GLOBAL
    (* ================= Simulador → CLP (o simulador escreve, o CLP lê) ================= *)
${linhas.filter((l) => l.dir === 'sim').map(decl).join('\n')}

    (* ================= CLP → simulador (o CLP escreve, o simulador lê) ================= *)
${linhas.filter((l) => l.dir === 'clp').map(decl).join('\n')}
END_VAR
`;

const csv = ['Variável;Tipo;Modbus;CODESYS;Clássico;Significado;Sentido', ...linhas.map((l) => [l.nome, l.tipo, `${l.tabela} ${l.endereco}`, l.codesys, l.classico, l.desc, l.sentido].join(';'))].join('\n') + '\n';

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'GVL_SIM.st'), gvl);
// mesma lista sem AT, para ligar pela coluna "Variable" da aba de mapeamento do Modbus TCP Slave Device
const semAT = gvl.replace('GVL_SIM — Estação TQ-01', 'GVL_SIMULADOR — Estação TQ-01').replace(/Cada uma está presa ao seu endereço com AT: não há programa de cópia\./, 'SEM AT: ligue cada uma ao seu canal pela coluna "Variable" da aba de mapeamento\n   (botão "...", Application.GVL_SIMULADOR.<nome>). Não use AT junto com o mapeamento.')
  .replace(/ AT %[IQ][XWB][\d.]+\s*/g, (m) => ' '.repeat(m.length));
const interna = `
    (* ================= Variáveis internas do CLP (não vão para a rede) ================= *)
    ${'IHM_Nivel_Real'.padEnd(largura + 11)} : ${'REAL;'.padEnd(6)}  (* Nível do tanque em metros (IHM_Nivel / 100) *)
    ${'IHM_Nivel_SP_Real'.padEnd(largura + 11)} : ${'REAL;'.padEnd(6)}  (* Nível que o operador envia através da IHM, neste caso já convertido *)
    ${'IHM_Nivel_SP_Liga'.padEnd(largura + 11)} : ${'REAL;'.padEnd(6)}  (* Liga a bomba abaixo deste nível (SP − histerese) *)
    ${'IHM_Nivel_SP_Desl'.padEnd(largura + 11)} : ${'REAL;'.padEnd(6)}  (* Desliga a bomba acima deste nível (SP + histerese) *)
END_VAR`;
fs.writeFileSync(path.join(out, 'GVL_SIMULADOR.st'), semAT.replace(/\nEND_VAR\s*$/, interna + '\n'));
fs.writeFileSync(path.join(out, 'tags-modbus-tq01.csv'), '\ufeff' + csv);
try { fs.unlinkSync(path.join(out, 'PRG_Escala_x100.st')); } catch (e) { /* já não existe */ }
console.log(`gerados em ${out}: GVL_SIM.st (com AT), GVL_SIMULADOR.st (sem AT), tags-modbus-tq01.csv (${linhas.length} variáveis)`);
