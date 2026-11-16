/**
 * =====================================================================
 *  BANCO DE PARÂMETROS DO CFW500 (Firmware V1.8X)
 * =====================================================================
 *  Fonte: WEG - Manual de Programação CFW500 V1.8X (doc. 10001469555)
 *         "Referência Rápida dos Parâmetros, Alarmes e Falhas"
 *         + Manual Ethernet CFW500 (doc. 10003256298 rev. 03)
 *
 *  REGRA IMPORTANTE (igual ao inversor real):
 *  Todo parâmetro é armazenado como um INTEIRO de 16 bits, SEM casas
 *  decimais. Ex.: P0100 = 10,0 s é guardado como 100.
 *  É exatamente esse inteiro que trafega na rede (Modbus TCP, EtherNet/IP
 *  explícito classe A2h atributo 5, e nas palavras de I/O cíclicas).
 *
 *  Campos de cada parâmetro:
 *    n    número               nome  descrição curta (como na HMI)
 *    min  mínimo (bruto)       max   máximo (bruto)
 *    def  padrão de fábrica    dec   casas decimais (só para exibição)
 *    un   unidade              ro    somente leitura
 *    cfg  só altera com motor parado (propriedade "cfg" do manual)
 *    g    grupos de acesso da HMI (READ, BASIC, MOTOR, I/O, NET, HMI, SPLC, STARTUP)
 *    op   tabela de opções {valor: 'texto'}
 *    hex  exibido em hexadecimal (palavras de bits)
 *    net  só pode ser escrito pela rede (P0684, P0685, P0695...)
 * =====================================================================
 */

'use strict';

const LIST = [];
function def(n, nome, min, max, padrao, o = {}) {
  LIST.push({
    n, nome, min, max, def: padrao,
    dec: o.dec || 0, un: o.un || '', ro: !!o.ro, cfg: !!o.cfg,
    g: o.g || [], op: o.op || null, hex: !!o.hex, net: !!o.net,
  });
}
// Atalho para listas de opções "0 = xxx, 1 = yyy ..."
const ops = (...txt) => Object.fromEntries(txt.map((t, i) => [i, t]));

// ---------------------------------------------------------------------
// Dados do modelo simulado: CFW500A04P3T4 (380-480 V / 4,3 A)
// P0029 = 9 -> "380-480 V / 4,3 A"
// ---------------------------------------------------------------------
const INOM = 43; // 4,3 A (bruto, 1 casa decimal)

// ============================ LEITURA (READ) ==========================
def(0, 'Acesso aos Parâmetros', 0, 9999, 0);
def(1, 'Referência Velocidade', 0, 65535, 0, { ro: true, g: ['READ'] });   // escala P0208/P0209/P0210
def(2, 'Velocidade de Saída', 0, 65535, 0, { ro: true, g: ['READ'] });
def(3, 'Corrente do Motor', 0, 2000, 0, { ro: true, dec: 1, un: 'A', g: ['READ'] });
def(4, 'Tensão Barram. CC (Ud)', 0, 2000, 0, { ro: true, un: 'V', g: ['READ'] });
def(5, 'Frequência de Saída', 0, 5000, 0, { ro: true, dec: 1, un: 'Hz', g: ['READ'] });
def(6, 'Estado do Inversor', 0, 7, 0, { ro: true, g: ['READ'],
  op: ops('Ready', 'Run', 'Subtensão', 'Falha', 'Autoajuste', 'Configuração', 'Frenagem CC', 'Estado Dormir') });
def(7, 'Tensão de Saída', 0, 2000, 0, { ro: true, un: 'V', g: ['READ'] });
def(9, 'Torque no Motor', -10000, 10000, 0, { ro: true, dec: 1, un: '%', g: ['READ'] });
def(10, 'Potência de Saída', 0, 65535, 0, { ro: true, dec: 1, un: 'kW', g: ['READ'] });
def(11, 'Fator de Potência', -100, 100, 0, { ro: true, dec: 2, g: ['READ'] });
def(12, 'Estado DI8 a DI1', 0, 255, 0, { ro: true, hex: true, g: ['READ', 'I/O'] });
def(13, 'Estado DO5 a DO1', 0, 31, 0, { ro: true, hex: true, g: ['READ', 'I/O'] });
def(14, 'Valor de AO1', 0, 1000, 0, { ro: true, dec: 1, un: '%', g: ['READ', 'I/O'] });
def(15, 'Valor de AO2', 0, 1000, 0, { ro: true, dec: 1, un: '%', g: ['READ', 'I/O'] });
def(16, 'Valor de FO em %', 0, 1000, 0, { ro: true, dec: 1, un: '%', g: ['READ', 'I/O'] });
def(17, 'Valor de FO em Hz', 0, 20000, 0, { ro: true, un: 'Hz', g: ['READ', 'I/O'] });
def(18, 'Valor de AI1', -1000, 1000, 0, { ro: true, dec: 1, un: '%', g: ['READ', 'I/O'] });
def(19, 'Valor de AI2', -1000, 1000, 0, { ro: true, dec: 1, un: '%', g: ['READ', 'I/O'] });
def(20, 'Valor de AI3', -1000, 1000, 0, { ro: true, dec: 1, un: '%', g: ['READ', 'I/O'] });
def(21, 'Valor de FI em %', -1000, 1000, 0, { ro: true, dec: 1, un: '%', g: ['READ', 'I/O'] });
def(22, 'Valor de FI em Hz', 0, 20000, 0, { ro: true, un: 'Hz', g: ['READ', 'I/O'] });
def(23, 'Versão de SW Princ.', 0, 65535, 182, { ro: true, dec: 2, g: ['READ'] });
def(24, 'Versão de SW Sec.', 0, 65535, 110, { ro: true, dec: 2, g: ['READ'] });
def(27, 'Config. Mod. Plug-in', 0, 63, 11, { ro: true, g: ['READ'],
  op: { 0: 'Sem Plug-in', 1: 'CFW500-IOS', 2: 'CFW500-IOD', 3: 'CFW500-IOAD', 4: 'CFW500-IOR', 5: 'CFW500-CUSB',
    6: 'CFW500-CCAN', 7: 'CFW500-CRS232', 8: 'CFW500-CPDP', 9: 'CFW500-CRS485', 11: 'CFW500-CETH-IP/CEMB-TCP/CEPN-IO' } });
def(29, 'Config. HW Potência', 0, 63, 9, { ro: true, g: ['READ'],
  op: { 9: '380-480 V / 4,3 A' } });
def(30, 'Temp. Módulo Potência', -20, 150, 25, { ro: true, un: '°C', g: ['READ'] });
def(37, 'Sobrecarga Motor Ixt', 0, 100, 0, { ro: true, un: '%', g: ['READ'] });
def(40, 'Variável Processo PID', 0, 30000, 0, { ro: true, dec: 1, g: ['READ'] });
def(41, 'Valor do Setpoint PID', 0, 30000, 0, { ro: true, dec: 1, g: ['READ'] });
def(47, 'Estado CONFIG', 0, 999, 0, { ro: true, g: ['READ'] });
def(48, 'Alarme Atual', 0, 999, 0, { ro: true, g: ['READ'] });
def(49, 'Falha Atual', 0, 999, 0, { ro: true, g: ['READ'] });
// Histórico de falhas (Seção 15.15)
for (const [base, ord] of [[50, 'Últ.'], [60, '2ª'], [70, '3ª']]) {
  def(base, ord === 'Últ.' ? 'Última Falha' : (ord === '2ª' ? 'Segunda Falha' : 'Terceira Falha'), 0, 999, 0, { ro: true, g: ['READ'] });
  def(base + 1, `Corrente ${ord} Falha`, 0, 2000, 0, { ro: true, dec: 1, un: 'A', g: ['READ'] });
  def(base + 2, `Barram. CC ${ord} Falha`, 0, 2000, 0, { ro: true, un: 'V', g: ['READ'] });
  def(base + 3, `Frequência ${ord} Falha`, 0, 5000, 0, { ro: true, dec: 1, un: 'Hz', g: ['READ'] });
  def(base + 4, `Temp. ${ord} Falha`, -20, 150, 0, { ro: true, un: '°C', g: ['READ'] });
  def(base + 5, `Estado Lóg. ${ord} Falha`, 0, 65535, 0, { ro: true, hex: true, g: ['READ'] });
}

// ============================ RAMPAS ==================================
def(100, 'Tempo Aceleração', 1, 9990, 100, { dec: 1, un: 's', g: ['BASIC'] });
def(101, 'Tempo Desaceleração', 1, 9990, 100, { dec: 1, un: 's', g: ['BASIC'] });
def(102, 'Tempo Acel. 2ª Rampa', 1, 9990, 100, { dec: 1, un: 's' });
def(103, 'Tempo Desac. 2ª Rampa', 1, 9990, 100, { dec: 1, un: 's' });
def(104, 'Rampa S', 0, 1, 0, { cfg: true, op: ops('Inativa', 'Ativa') });
def(105, 'Seleção 1ª/2ª Rampa', 0, 6, 2, { g: ['I/O'],
  op: ops('1ª Rampa', '2ª Rampa', 'DIx', 'Serial/USB', 'Reservado', 'CO/DN/DP', 'SoftPLC') });
def(106, 'Tempo da 3ª Rampa', 1, 9990, 50, { dec: 1, un: 's' });

// ====================== REFERÊNCIAS DE VELOCIDADE =====================
def(120, 'Backup da Ref. Veloc.', 0, 2, 1, { op: ops('Inativo', 'Ativo', 'Backup por P0121') });
def(121, 'Referência via HMI', 0, 5000, 30, { dec: 1, un: 'Hz' });
def(122, 'Referência JOG', -5000, 5000, 50, { dec: 1, un: 'Hz' });
[30, 100, 200, 300, 400, 500, 600, 660].forEach((v, i) =>
  def(124 + i, `Ref. ${i + 1} Multispeed`, -5000, 5000, v, { dec: 1, un: 'Hz' }));
def(133, 'Velocidade Mínima', 0, 5000, 30, { dec: 1, un: 'Hz', g: ['BASIC'] });
def(134, 'Velocidade Máxima', 0, 5000, 660, { dec: 1, un: 'Hz', g: ['BASIC'] });
def(135, 'Corrente Máxima Saída', 0, 2000, Math.round(1.5 * INOM), { dec: 1, un: 'A', g: ['BASIC', 'MOTOR'] });

// ========================== CONTROLE V/f ==============================
def(136, 'Boost de Torque Manual', 0, 300, 30, { dec: 1, un: '%', g: ['BASIC', 'MOTOR'] });
def(137, 'Boost de Torque Autom.', 0, 300, 0, { dec: 1, un: '%', g: ['MOTOR'] });
def(138, 'Compensação Escorreg.', -100, 100, 0, { dec: 1, un: '%', g: ['MOTOR'] });
def(139, 'Filtro Corrente Saída', 0, 9999, 50, { un: 'ms' });
def(140, 'Filtro Comp. Escorreg.', 0, 9999, 500, { un: 'ms' });
def(142, 'Tensão Saída Máxima', 0, 1000, 1000, { dec: 1, un: '%', cfg: true });
def(143, 'Tensão Saída Intermed.', 0, 1000, 667, { dec: 1, un: '%', cfg: true });
def(144, 'Tensão Saída Mínima', 0, 1000, 333, { dec: 1, un: '%', cfg: true });
def(145, 'Freq. Início Enf. Campo', 0, 5000, 600, { dec: 1, un: 'Hz', cfg: true });
def(146, 'Freq. Saída Intermed.', 0, 5000, 400, { dec: 1, un: 'Hz', cfg: true });
def(147, 'Freq. Saída Baixa', 0, 5000, 200, { dec: 1, un: 'Hz', cfg: true });
def(150, 'Tipo Regul. Ud V/f', 0, 3, 0, { cfg: true, g: ['MOTOR'],
  op: ops('Hold_Ud e Desac_LC', 'Acel_Ud e Desac_LC', 'Hold_Ud e Hold_LC', 'Acel_Ud e Hold_LC') });
def(151, 'Nível Regul. Barram. CC', 339, 1200, 800, { un: 'V', g: ['MOTOR'] });
def(152, 'Ganho Prop. Regul. Ud', 0, 999, 150, { dec: 2, g: ['MOTOR'] });
def(153, 'Nível Frenagem Reost.', 339, 1200, 750, { un: 'V', g: ['MOTOR'] });
def(156, 'Corr. Sobrecarga Vel.Nom.', 0, 2000, Math.round(1.1 * INOM), { dec: 1, un: 'A', g: ['MOTOR'] });
def(157, 'Corr. Sobrecarga 50 %', 0, 2000, INOM, { dec: 1, un: 'A', g: ['MOTOR'] });
def(158, 'Corr. Sobrecarga 5 %', 0, 2000, Math.round(0.8 * INOM), { dec: 1, un: 'A', g: ['MOTOR'] });
def(178, 'Fluxo Nominal', 0, 1500, 1000, { dec: 1, un: '%', g: ['MOTOR'] });

// ============================ HMI =====================================
def(200, 'Senha', 0, 9999, 0, { g: ['HMI'] });
def(202, 'Tipo de Controle', 0, 5, 0, { cfg: true, g: ['STARTUP'],
  op: { 0: 'V/f', 1: 'Sem Função', 2: 'Sem Função', 3: 'Sem Função', 4: 'Sem Função', 5: 'VVW' } });
def(203, 'Sel. Função Especial', 0, 3, 0, { cfg: true, op: { 0: 'Nenhuma', 1: 'PID via AI1', 2: 'PID via AI3', 3: 'PID via FI' } });
def(204, 'Carrega/Salva Parâm.', 0, 15, 0, { cfg: true,
  op: { 0: 'Sem Função', 5: 'Carrega WEG 60 Hz', 6: 'Carrega WEG 50 Hz', 7: 'Carrega Usuário 1', 8: 'Carrega Usuário 2',
    9: 'Salva Usuário 1', 10: 'Salva Usuário 2', 11: 'Carrega Padrão SoftPLC' } });
def(205, 'Parâmetro Display Princ.', 0, 1500, 2, { g: ['HMI'] });
def(206, 'Parâmetro Display Secund.', 0, 1500, 1, { g: ['HMI'] });
def(207, 'Parâmetro para Barra', 0, 1500, 3, { g: ['HMI'] });
def(208, 'Referência Nominal', 1, 65535, 600, { g: ['HMI'] });
const UNIDADES = ops('Sem Unidade', 'V', 'A', 'rpm', 's', 'ms', 'N', 'm', 'Nm', 'mA', '%', '°C', 'CV', 'Hz', 'HP', 'h', 'W', 'kW', 'kWh', 'H');
def(209, 'Unidade Eng. Ref.', 0, 19, 13, { g: ['HMI'], op: UNIDADES });
def(210, 'Forma Indicação Ref.', 0, 3, 1, { g: ['HMI'], op: ops('wxyz', 'wxy.z', 'wx.yz', 'w.xyz') });
def(213, 'Fator Escala da Barra', 1, 65535, INOM, { g: ['HMI'] });
def(216, 'Iluminação HMI', 0, 1, 1, { cfg: true, g: ['HMI'], op: ops('Desliga', 'Liga') });
def(217, 'Frequência para Dormir', 0, 5000, 0, { dec: 1, un: 'Hz' });
def(218, 'Tempo para Dormir', 0, 999, 0, { un: 's' });

// ================= COMANDO LÓGICO (Capítulo 7) ========================
def(220, 'Seleção LOC/REM', 0, 11, 2, { cfg: true, g: ['I/O'],
  op: ops('Sempre Local', 'Sempre Remoto', 'Tecla HMI (LOC)', 'Tecla HMI (REM)', 'Entrada Digital (DIx)',
    'Serial/USB (LOC)', 'Serial/USB (REM)', 'Sem Função', 'Sem Função', 'CO/DN/PB/Eth (LOC)', 'CO/DN/PB/Eth (REM)', 'SoftPLC') });
const OP_REF = ops('Teclas HMI', 'AI1', 'AI2', 'AI3', 'FI', 'AI1 + AI2 > 0', 'AI1 + AI2', 'E.P.', 'Multispeed',
  'Serial/USB', 'Sem Função', 'CO/DN/PB/Eth', 'SoftPLC', 'Sem Função', 'AI1 > 0', 'AI2 > 0', 'AI3 > 0', 'FI > 0');
def(221, 'Sel. Referência LOC', 0, 17, 0, { cfg: true, g: ['I/O'], op: OP_REF });
def(222, 'Sel. Referência REM', 0, 17, 1, { cfg: true, g: ['I/O'], op: OP_REF });
const OP_GIRO = ops('Horário', 'Anti-horário', 'Tecla HMI (H)', 'Teclas HMI (AH)', 'DIx', 'Serial/USB (H)', 'Serial/USB (AH)',
  'Sem Função', 'Sem Função', 'CO/DN/PB/Eth (H)', 'CO/DN/PB/Eth (AH)', 'Sem Função', 'SoftPLC');
const OP_GP = ops('Tecla HMI', 'DIx', 'Serial/USB', 'Sem Função', 'CO/DN/PB/Eth', 'SoftPLC');
const OP_JOG = ops('Inativo', 'Teclas HMI', 'DIx', 'Serial/USB', 'Sem Função', 'CO/DN/PB/Eth', 'SoftPLC');
def(223, 'Seleção Giro LOC', 0, 12, 2, { cfg: true, g: ['I/O'], op: OP_GIRO });
def(224, 'Seleção Gira/Para LOC', 0, 5, 0, { cfg: true, g: ['I/O'], op: OP_GP });
def(225, 'Seleção JOG LOC', 0, 6, 1, { cfg: true, g: ['I/O'], op: OP_JOG });
def(226, 'Seleção Giro REM', 0, 12, 4, { cfg: true, g: ['I/O'], op: OP_GIRO });
def(227, 'Seleção Gira/Para REM', 0, 5, 1, { cfg: true, g: ['I/O'], op: OP_GP });
def(228, 'Seleção JOG REM', 0, 6, 2, { cfg: true, g: ['I/O'], op: OP_JOG });
def(229, 'Seleção Modo Parada', 0, 2, 0, { cfg: true, g: ['I/O'], op: ops('Por Rampa', 'Por Inércia', 'Parada Rápida') });

// ===================== ENTRADAS ANALÓGICAS ============================
def(230, 'Zona Morta (AIs)', 0, 1, 0, { cfg: true, g: ['I/O'], op: ops('Inativa', 'Ativa') });
const OP_AI_FUNC = { 0: 'Ref. Veloc.', 4: 'PTC', 7: 'Uso SoftPLC' };
const OP_AI_SINAL = ops('0 a 10 V / 20 mA', '4 a 20 mA', '10 V / 20 mA a 0', '20 a 4 mA', '-10 a +10 V');
for (const [base, nome] of [[231, 'AI1'], [236, 'AI2'], [241, 'AI3']]) {
  def(base, `Função do Sinal ${nome}`, 0, 15, 0, { cfg: true, g: ['I/O'], op: OP_AI_FUNC });
  def(base + 1, `Ganho da Entrada ${nome}`, 0, 9999, 1000, { dec: 3, g: ['I/O'] });
  def(base + 2, `Sinal da Entrada ${nome}`, 0, nome === 'AI3' ? 4 : 3, 0, { g: ['I/O'], op: OP_AI_SINAL });
  def(base + 3, `Offset da Entrada ${nome}`, -1000, 1000, 0, { dec: 1, un: '%', g: ['I/O'] });
  def(base + 4, `Filtro da Entrada ${nome}`, 0, 1600, 0, { dec: 2, un: 's', g: ['I/O'] });
}
def(246, 'Entrada em Freq. FI', 0, 1, 0, { g: ['I/O'], op: ops('Inativa', 'Ativa') });
def(247, 'Ganho da Entrada FI', 0, 9999, 1000, { dec: 3, g: ['I/O'] });
def(248, 'Entrada FI Mínima', 10, 20000, 10, { un: 'Hz', g: ['I/O'] });
def(249, 'Offset da Entrada FI', -1000, 1000, 0, { dec: 1, un: '%', g: ['I/O'] });
def(250, 'Entrada FI Máxima', 10, 20000, 10000, { un: 'Hz', g: ['I/O'] });

// ====================== SAÍDAS ANALÓGICAS =============================
const OP_AO = { 0: 'Ref. Veloc.', 2: 'Veloc. Real', 5: 'Corrente Saída', 6: 'Var. Processo', 7: 'Corrente Ativa', 9: 'Setpoint PID',
  11: 'Torque Motor', 12: 'SoftPLC', 15: 'Desabilita F.O.', 16: 'Ixt Motor', 18: 'Conteúdo P0696', 19: 'Conteúdo P0697', 20: 'Conteúdo P0698' };
const OP_AO_SINAL = ops('0 a 10 V', '0 a 20 mA', '4 a 20 mA', '10 a 0 V', '20 a 0 mA', '20 a 4 mA');
def(251, 'Função da Saída AO1', 0, 28, 2, { g: ['I/O'], op: OP_AO });
def(252, 'Ganho da Saída AO1', 0, 9999, 1000, { dec: 3, g: ['I/O'] });
def(253, 'Sinal da Saída AO1', 0, 5, 0, { g: ['I/O'], op: OP_AO_SINAL });
def(254, 'Função da Saída AO2', 0, 28, 5, { g: ['I/O'], op: OP_AO });
def(255, 'Ganho da Saída AO2', 0, 9999, 1000, { dec: 3, g: ['I/O'] });
def(256, 'Sinal da Saída AO2', 0, 5, 0, { g: ['I/O'], op: OP_AO_SINAL });
def(257, 'Função da Saída FO', 0, 28, 15, { g: ['I/O'], op: OP_AO });
def(258, 'Ganho Saída FO', 0, 9999, 1000, { dec: 3, g: ['I/O'] });
def(259, 'Saída FO Mínima', 10, 20000, 10, { un: 'Hz', g: ['I/O'] });
def(260, 'Saída FO Máxima', 10, 20000, 10000, { un: 'Hz', g: ['I/O'] });

// ====================== ENTRADAS DIGITAIS =============================
const OP_DI = {
  0: 'Sem Função', 1: 'Gira/Para', 2: 'Habilita Geral', 3: 'Parada Rápida', 4: 'Avanço', 5: 'Retorno', 6: 'Start', 7: 'Stop',
  8: 'Sentido de Giro Horário', 9: 'LOC/REM', 10: 'JOG', 11: 'Acelera E.P.', 12: 'Desacelera E.P.', 13: 'Multispeed',
  14: '2ª Rampa', 18: 'Sem Alarme Ext.', 19: 'Sem Falha Ext.', 20: 'Reset de Falha', 21: 'SoftPLC', 22: 'Man./Auto PID',
  24: 'Desab. Flying Start', 26: 'Bloqueia Prog.', 27: 'Carrega Usuário 1', 28: 'Carrega Usuário 2', 29: 'PTC',
  32: 'Multispeed 2ª Rampa', 33: 'Ac. E.P. 2ª Rampa', 34: 'De. E.P. 2ª Rampa', 35: 'Avanço 2ª Rampa', 36: 'Retorno 2ª Rampa',
  37: 'Liga / Ac. E.P.', 38: 'De. E.P. / Desl.',
};
[1, 8, 20, 10, 0, 0, 0, 0].forEach((v, i) =>
  def(263 + i, `Função da Entrada DI${i + 1}`, 0, 46, v, { cfg: true, g: ['I/O'], op: OP_DI }));
def(271, 'Sinal das DIs', 0, 8, 0, { cfg: true, g: ['I/O'],
  op: ops('Todas DIx são NPN', '(DI1) PNP', '(DI1..DI2) PNP', '(DI1..DI3) PNP', '(DI1..DI4) PNP', '(DI1..DI5) PNP', '(DI1..DI6) PNP', '(DI1..DI7) PNP', 'Todas DIx são PNP') });

// ======================== SAÍDAS DIGITAIS =============================
const OP_DO = {
  0: 'Sem Função', 1: 'F* > Fx', 2: 'F > Fx', 3: 'F < Fx', 4: 'F = F*', 6: 'Is > Ix', 7: 'Is < Ix', 8: 'Torque > Tx', 9: 'Torque < Tx',
  10: 'Remoto', 11: 'Run', 12: 'Ready', 13: 'Sem Falha', 14: 'Sem F0070', 16: 'Sem F0021/22', 18: 'Sem F0072', 19: '4-20 mA OK',
  20: 'Conteúdo P0695', 21: 'Sent. Horário', 22: 'V. Proc. > VPx', 23: 'V. Proc. < VPx', 24: 'Ride-Through', 25: 'Pré-Carga OK',
  26: 'Com Falha', 28: 'SoftPLC', 35: 'Sem Alarme', 36: 'Sem Falha/Alarme',
};
[13, 2, 0, 0, 0].forEach((v, i) =>
  def(275 + i, `Função da Saída DO${i + 1}`, 0, 44, v, { g: ['I/O'], op: OP_DO }));
def(287, 'Histerese Fx', 0, 5000, 5, { dec: 1, un: 'Hz', g: ['I/O'] });
def(288, 'Velocidade Fx', 0, 5000, 30, { dec: 1, un: 'Hz', g: ['I/O'] });
def(290, 'Corrente Ix', 0, 2000, INOM, { dec: 1, un: 'A', g: ['I/O'] });
def(293, 'Torque Tx', 0, 200, 100, { un: '%', g: ['I/O'] });

// ====================== DADOS DO INVERSOR =============================
def(295, 'Corr. Nom. Inv.', 0, 2000, INOM, { ro: true, dec: 1, un: 'A', g: ['READ'] });
def(296, 'Tensão Nominal Rede', 0, 2, 1, { ro: true, cfg: true, g: ['READ'], op: ops('200 - 240 V', '380 - 480 V', '500 - 600 V') });
def(297, 'Freq. de Chaveamento', 2500, 15000, 5000, { un: 'Hz' });
def(299, 'Tempo Frenag. Partida', 0, 150, 0, { dec: 1, un: 's' });
def(300, 'Tempo Frenagem Parada', 0, 150, 0, { dec: 1, un: 's' });
def(301, 'Frequência de Início', 0, 5000, 30, { dec: 1, un: 'Hz' });
def(302, 'Tensão Frenagem CC', 0, 1000, 200, { dec: 1, un: '%' });
def(303, 'Frequência Evitada 1', 0, 5000, 200, { dec: 1, un: 'Hz' });
def(304, 'Frequência Evitada 2', 0, 5000, 300, { dec: 1, un: 'Hz' });
def(306, 'Faixa Evitada', 0, 250, 0, { dec: 1, un: 'Hz' });

// ========================= COMUNICAÇÃO ================================
def(308, 'Endereço Serial', 1, 247, 1, { g: ['NET'] });
def(310, 'Taxa Comunic. Serial', 0, 2, 1, { g: ['NET'], op: ops('9600 bits/s', '19200 bits/s', '38400 bits/s') });
def(311, 'Config. Bytes Serial', 0, 5, 1, { g: ['NET'], op: ops('8 bits, sem, 1', '8 bits, par, 1', '8 bits, ímp, 1', '8 bits, sem, 2', '8 bits, par, 2', '8 bits, ímp, 2') });
def(312, 'Protocolo Serial', 0, 13, 2, { cfg: true, g: ['NET'], op: { 0: 'HMIR', 2: 'Modbus RTU', 5: 'Mestre RTU', 6: 'HMIR + Modbus RTU', 7: 'Modbus RTU (2)', 12: 'HMI/Mestre RTU', 13: 'Mestre RTU (2)' } });
def(313, 'Ação p/ Erro Comunic.', 0, 5, 1, { g: ['NET'],
  op: ops('Inativo', 'Para por Rampa', 'Desab. Geral', 'Vai para LOC', 'LOC Mantém Hab', 'Causa Falha') });
def(314, 'Watchdog Serial', 0, 9990, 0, { dec: 1, un: 's', g: ['NET'] });
def(316, 'Estado Interf. Serial', 0, 2, 0, { ro: true, g: ['READ', 'NET'], op: ops('Inativo', 'Ativo', 'Erro Watchdog') });
def(320, 'Flying Start/Ride-Through', 0, 3, 0, { cfg: true, op: ops('Inativas', 'Flying Start (FS)', 'FS / RT', 'Ride-Through (RT)') });
def(331, 'Rampa de Tensão FS e RT', 2, 600, 20, { dec: 1, un: 's' });
def(340, 'Tempo Auto-Reset', 0, 255, 0, { un: 's' });
def(343, 'Máscara Falha/Alarme', 0, 0xFFFF, 0x0007, { cfg: true, hex: true });
def(349, 'Nível para Alarme Ixt', 70, 100, 85, { cfg: true, un: '%' });
def(397, 'Configuração do Controle', 0, 0xFFFF, 0x000B, { cfg: true, hex: true });

// ========================= DADOS DO MOTOR =============================
def(399, 'Rendimento Nom. Motor', 500, 999, 750, { cfg: true, dec: 1, un: '%', g: ['MOTOR', 'STARTUP'] });
def(400, 'Tensão Nom. Motor', 200, 600, 380, { cfg: true, un: 'V', g: ['MOTOR', 'STARTUP'] });
def(401, 'Corrente Nom. Motor', 0, 2000, INOM, { cfg: true, dec: 1, un: 'A', g: ['MOTOR', 'STARTUP'] });
def(402, 'Velocidade Nom. Motor', 0, 30000, 1710, { cfg: true, un: 'rpm', g: ['MOTOR', 'STARTUP'] });
def(403, 'Frequência Nom. Motor', 0, 500, 60, { cfg: true, un: 'Hz', g: ['MOTOR', 'STARTUP'] });
const POT_HP = ['0,16 HP (0,12 kW)', '0,25 HP (0,19 kW)', '0,33 HP (0,25 kW)', '0,50 HP (0,37 kW)', '0,75 HP (0,55 kW)',
  '1,00 HP (0,75 kW)', '1,50 HP (1,10 kW)', '2,00 HP (1,50 kW)', '3,00 HP (2,20 kW)', '4,00 HP (3,00 kW)', '5,00 HP (3,70 kW)',
  '5,50 HP (4,00 kW)', '6,00 HP (4,50 kW)', '7,50 HP (5,50 kW)', '10,00 HP (7,50 kW)', '12,50 HP (9,00 kW)', '15,00 HP (11,00 kW)',
  '20,00 HP (15,00 kW)', '25,00 HP (18,50 kW)', '30,00 HP (22,00 kW)'];
def(404, 'Potência Nom. Motor', 0, 19, 7, { cfg: true, g: ['MOTOR', 'STARTUP'], op: ops(...POT_HP) });
def(407, 'Fator Pot. Nom. Motor', 50, 99, 80, { cfg: true, dec: 2, g: ['MOTOR', 'STARTUP'] });
def(408, 'Autoajuste', 0, 1, 0, { cfg: true, g: ['STARTUP'], op: ops('Não', 'Sim') });
def(409, 'Resistência Estator', 1, 9999, 350, { cfg: true, dec: 2, un: 'Ω', g: ['MOTOR', 'STARTUP'] });

// ============================ PID =====================================
def(520, 'Ganho Proporc. PID', 0, 9999, 1000, { dec: 3 });
def(521, 'Ganho Integral PID', 0, 9999, 430, { dec: 3 });
def(522, 'Ganho Diferencial PID', 0, 9999, 0, { dec: 3 });
def(525, 'Setpoint PID pela HMI', 0, 1000, 0, { dec: 1, un: '%' });
def(526, 'Filtro Setpoint PID', 0, 9999, 50, { un: 'ms' });
def(527, 'Tipo de Ação PID', 0, 1, 0, { op: ops('Direto', 'Reverso') });
def(528, 'Escala Indicação VP', 10, 30000, 1000, { g: ['HMI'] });
def(529, 'Forma Indicação VP', 0, 3, 1, { g: ['HMI'], op: ops('wxyz', 'wxy.z', 'wx.yz', 'w.xyz') });
def(533, 'Valor VPx', 0, 1000, 900, { dec: 1, un: '%', g: ['I/O'] });
def(535, 'Faixa p/ Acordar', 0, 1000, 0, { dec: 1, un: '%', g: ['I/O'] });
def(536, 'Ajuste Autom. P0525', 0, 1, 0, { cfg: true, op: ops('Inativo', 'Ativo') });

// ================== ESTADOS E COMANDOS DE COMUNICAÇÃO =================
def(680, 'Estado Lógico', 0, 0xFFFF, 0, { ro: true, hex: true, g: ['READ', 'NET'] });
def(681, 'Velocidade 13 bits', -32768, 32767, 0, { ro: true, g: ['READ', 'NET'] });
def(682, 'Controle Serial/USB', 0, 0xFFFF, 0, { ro: true, hex: true, g: ['NET'] });
def(683, 'Ref. Vel. Serial/USB', -32768, 32767, 0, { ro: true, g: ['READ', 'NET'] });
def(684, 'Controle CO/DN/PB/Eth', 0, 0xFFFF, 0, { net: true, hex: true, g: ['READ', 'NET'] });
def(685, 'Ref.Vel. CO/DN/PB/Eth', -32768, 32767, 0, { net: true, g: ['READ', 'NET'] });
def(690, 'Estado Lógico 2', 0, 0xFFFF, 0, { ro: true, hex: true, g: ['READ', 'NET'] });
def(695, 'Valor para DOx', 0, 0x1F, 0, { net: true, hex: true, g: ['READ', 'NET'] });
def(696, 'Valor 1 para AOx', -32768, 32767, 0, { net: true, g: ['READ', 'NET'] });
def(697, 'Valor 2 para AOx', -32768, 32767, 0, { net: true, g: ['READ', 'NET'] });
def(698, 'Valor 3 para AOx', -32768, 32767, 0, { net: true, g: ['READ', 'NET'] });

// CANopen / DeviceNet / Profibus (existentes no firmware; não simulados)
def(700, 'Protocolo CAN', 1, 2, 2, { g: ['NET'], op: { 1: 'CANopen', 2: 'DeviceNet' } });
def(701, 'Endereço CAN', 0, 127, 63, { g: ['NET'] });
def(702, 'Taxa Comunicação CAN', 0, 8, 0, { g: ['NET'] });
def(703, 'Reset de Bus Off', 0, 1, 0, { g: ['NET'], op: ops('Manual', 'Automático') });
def(705, 'Estado Controlador CAN', 0, 6, 6, { ro: true, g: ['READ', 'NET'],
  op: ops('Inativo', 'Auto-baud', 'CAN Ativo', 'Warning', 'Error Passive', 'Bus Off', 'Não Alimentado') });

// ================== INTERFACE ETHERNET (Manual Ethernet cap. 5) =======
def(799, 'Eth:Habilita protocolos', 0, 1, 0, { cfg: true, hex: true, g: ['NET'] });
def(800, 'Eth:Ident do Módulo', 0, 3, 2, { ro: true, g: ['READ', 'NET'],
  op: ops('Não Identifica', 'Modbus TCP', 'EtherNet/IP', 'PROFINET IO') });
def(801, 'Eth:Estado Comunicac', 0, 8, 0, { ro: true, g: ['READ', 'NET'],
  op: ops('Setup', 'Init', 'Wait Comm', 'Idle', 'Data Active', 'Error', 'Reservado', 'Exception', 'Erro de Acesso') });
def(803, 'Eth:Taxa Comunicação', 0, 4, 0, { cfg: true, g: ['NET'],
  op: ops('Auto', '10Mbit, half', '10Mbit, full', '100Mbit, half', '100Mbit, full') });
def(806, 'Eth:Timeout ModbusTCP', 0, 655, 0, { cfg: true, dec: 1, un: 's', g: ['NET'] });
def(810, 'Eth:Config EndereçoIP', 0, 2, 1, { cfg: true, g: ['NET'], op: ops('Parâmetros', 'DHCP', 'DCP') });
[192, 168, 0, 14].forEach((v, i) => def(811 + i, `Eth:Endereço IP ${i + 1}`, 0, 255, v, { cfg: true, g: ['NET'] }));
def(815, 'Eth:CIDR Sub-rede', 1, 31, 24, { cfg: true, g: ['NET'] });
[0, 0, 0, 0].forEach((v, i) => def(816 + i, `Eth:Gateway ${i + 1}`, 0, 255, v, { cfg: true, g: ['NET'] }));
for (let i = 0; i < 12; i++) def(820 + i, `Eth:Leitura #${i + 3}`, 0, 9999, 0, { cfg: true, g: ['NET'] });
for (let i = 0; i < 12; i++) def(835 + i, `Eth:Escrita #${i + 3}`, 0, 9999, 0, { cfg: true, g: ['NET'] });
def(849, 'Eth:Atualiza Config.', 0, 1, 0, { cfg: true, g: ['NET'], op: ops('Oper. Normal', 'AtualizaConfig') });

// ============================ SoftPLC =================================
def(1000, 'Estado SoftPLC', 0, 4, 0, { ro: true, g: ['READ', 'SPLC'],
  op: ops('Sem Aplicativo', 'Instal. Aplic.', 'Aplic. Incompat.', 'Aplic. Parado', 'Aplic. Rodando') });
def(1001, 'Comando para SoftPLC', 0, 2, 0, { g: ['SPLC'], op: ops('Para Aplic.', 'Executa Aplic.', 'Exclui Aplic.') });
def(1002, 'Tempo Ciclo de Scan', 0, 65535, 0, { ro: true, un: 'ms', g: ['READ', 'SPLC'] });
for (let i = 0; i < 50; i++) def(1010 + i, `Parâmetro SoftPLC ${i + 1}`, -32768, 32767, 0, { g: ['SPLC'] });

// ---------------------------------------------------------------------
const MAP = new Map(LIST.map((p) => [p.n, p]));

/** Formata o valor bruto para exibição (ex.: 100 com dec=1 -> "10.0") */
function formatar(p, bruto) {
  if (p.hex) return bruto.toString(16).toUpperCase().padStart(4, '0') + 'h';
  if (!p.dec) return String(bruto);
  return (bruto / 10 ** p.dec).toFixed(p.dec);
}

module.exports = { LIST, MAP, formatar, POT_HP, UNIDADES };
