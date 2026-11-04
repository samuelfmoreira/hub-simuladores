/* =============================================================================
 *  SCA06-CORE  —  Modelo do servoconversor WEG SCA06 + acessório ECO5 (EtherNet/IP)
 * =============================================================================
 *  Este arquivo é COMPARTILHADO:
 *    • no Node.js (backend) ele roda o "firmware" simulado do drive;
 *    • no navegador (modo demonstração, sem backend) ele roda o mesmo modelo.
 *
 *  FONTES usadas (cada parâmetro abaixo indica a sua):
 *    [ETH]  Manual da Comunicação Ethernet SCA06 – doc. 10003986896/00 (09/2016)
 *    [PROG] Manual de Programação SCA06 – doc. 10000662686/07, firmware V2.1X (11/2018)
 *    [SIM]  Escolha do simulador (valor didático). Confira no equipamento real!
 *
 *  Filosofia didática: o aluno deve conferir cada número com o manual.
 *  Tudo que NÃO veio dos manuais está marcado como [SIM].
 * ===========================================================================*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SCA06Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  //  Constantes de escala  [ETH 6.1.2 / 6.2.2]  7FFFh (32767) = 18750 rpm
  // ---------------------------------------------------------------------------
  const SPEED_FULL_RPM = 18750;
  const SPEED_FULL_COUNTS = 32767;
  const PULSES_PER_REV = 16384;            // [PROG P00050] 360° = 16384 pulsos
  const TWO_PI = Math.PI * 2;
  const RPM_TO_RADS = TWO_PI / 60;

  const rpmToCounts = (rpm) => clampInt(Math.round(rpm * SPEED_FULL_COUNTS / SPEED_FULL_RPM), -32768, 32767);
  const countsToRpm = (c) => c * SPEED_FULL_RPM / SPEED_FULL_COUNTS;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function clampInt(v, lo, hi) { return Math.trunc(clamp(v, lo, hi)); }
  function toInt16(v) { v = Math.trunc(v) & 0xFFFF; return v > 0x7FFF ? v - 0x10000 : v; }
  function wrapDeg(d) { d %= 360; return d < 0 ? d + 360 : d; }
  function wrap180(d) { d = wrapDeg(d); return d > 180 ? d - 360 : d; }

  // ---------------------------------------------------------------------------
  //  TABELA DE PARÂMETROS
  //  raw = valor inteiro como trafega na rede ("sem indicação das casas decimais")
  //  dec = casas decimais exibidas na HMI    unit = unidade
  //  ro  = somente leitura   pp = "pressione P para validar"
  //  dd  = só pode ser alterado com o drive desabilitado (gera A00124)
  // ---------------------------------------------------------------------------
  const DEFS = [];
  function P(n, name, min, max, def, o = {}) {
    DEFS.push(Object.assign({ n, name, min, max, def, dec: 0, unit: '', ro: false, pp: false, dd: false, src: 'PROG', opts: null, note: '' }, o));
  }
  const RO = { ro: true };

  // ---- Grupo LEITURA  [PROG cap. 9] ----
  P(0, 'Acesso aos Parâmetros (senha)', 0, 9999, 0, { note: 'Senha padrão = 5 (com P00200 = 1).' });
  P(2, 'Velocidade do Motor', -9999, 9999, 0, { ...RO, unit: 'rpm' });
  P(3, 'Corrente do Motor (Iq)', -9999, 9999, 0, { ...RO, dec: 1, unit: 'A' });
  P(4, 'Tensão do Link DC', 0, 999, 0, { ...RO, unit: 'V' });
  P(6, 'Estado do Servoconversor', 0, 6, 0, { ...RO, opts: { 0: 'Desabilitado sem erro, Link DC OK', 1: 'Servo ready: habilitado', 2: 'Falha', 3: 'Potência desligada/energizando', 4: 'Autoajuste', 5: 'Stop ativo', 6: 'STO ativo' } });
  P(8, 'Estado DI1 a DI3', 0, 111, 0, { ...RO, note: 'Dígito 1 = DI1, dígito 2 = DI2, dígito 3 = DI3.' });
  P(21, 'Temperatura do Ar Interno', 0, 1000, 0, { ...RO, unit: '°C' });
  P(22, 'Temperatura do Dissipador', 0, 1000, 0, { ...RO, unit: '°C' });
  P(23, 'Versão de Firmware', 0, 65535, 210, { ...RO, dec: 2 });
  P(30, 'Alarme Atual', 0, 2000, 0, RO);
  P(31, 'Último Alarme', 0, 2000, 0, RO);
  P(35, 'Falha Atual', 0, 2000, 0, RO);
  P(36, 'Última Falha', 0, 2000, 0, RO);
  P(40, 'Segunda Falha', 0, 2000, 0, RO);
  P(44, 'Terceira Falha', 0, 2000, 0, RO);
  P(48, 'Erro de Lag Atual', 0, 65535, 0, { ...RO, unit: 'pulsos' });
  P(50, 'Posição do Eixo do Sensor', 0, 16383, 0, { ...RO, unit: 'pulsos', note: '16384 pulsos = 360°.' });
  P(52, 'Posição Angular: Fração de Volta (ref. usuário)', -16383, 16383, 0, { ...RO, unit: 'pulsos' });
  P(53, 'Posição Angular: Número de Voltas (ref. usuário)', -32768, 32767, 0, RO);
  P(92, 'Identificação do Slot 2', 0, 65535, 257, { ...RO, note: 'ECO5 (EtherNet/IP) = 00257, somente no slot 2.' });
  P(95, 'Identificação dos Cartões Opcionais', 0, 1000, 10, { ...RO, note: '0010 = SSC (cartão de segurança STO).' });
  P(97, 'Corrente Nominal do Servoconversor', 0, 9999, 80, { ...RO, dec: 1, unit: 'A', src: 'SIM', note: 'Bancada: modelo 8 A / 220 V [SIM].' });
  P(98, 'Tensão Nominal do Servoconversor', 2, 3, 2, { ...RO, opts: { 2: '220 V', 3: '380 V' } });

  // ---- CONFIGURAÇÕES GERAIS  [PROG cap. 10] ----
  P(99, 'Habilitação', 0, 2, 0, { opts: { 0: 'Não habilitado', 1: 'Habilita', 2: 'Habilita sem salvar parâmetro' } });
  P(100, 'Rampa de Aceleração (modo velocidade)', 0, 32767, 0, { unit: 'ms/krpm', note: 'Usada com P00202 = 2.' });
  P(101, 'Rampa de Desaceleração (modo velocidade)', 0, 32767, 0, { unit: 'ms/krpm', note: 'Usada com P00202 = 2.' });
  P(105, 'Rampa da Função STOP', 1, 32767, 200, { unit: 'ms/krpm', note: 'ATENÇÃO: o exemplo do manual Ethernet (5,0 s → 50) diverge do Manual de Programação (ms/krpm). O simulador segue o Manual de Programação.' });
  P(111, 'Sentido de Giro', 0, 1, 0, { opts: { 0: 'Positiva = horário', 1: 'Positiva = anti-horário' }, note: 'Olhar o eixo do servomotor de frente.' });
  P(119, 'Referência de Corrente', -32768, 32767, 0, { dec: 1, unit: 'A', note: 'Usada em modo torque (P00202 = 1).' });
  P(121, 'Referência de Velocidade', -9999, 9999, 0, { unit: 'rpm', note: 'Usada em modo velocidade (P00202 = 2).' });
  P(133, 'Limite Negativo de Velocidade', -9999, 0, -9999, { unit: 'rpm' });
  P(134, 'Limite Positivo de Velocidade', 0, 9999, 9999, { unit: 'rpm' });
  P(136, 'Relação Idinâmico/Inominal', 0, 400, 300, { unit: '%' });
  P(159, 'Ganho Proporcional do Regulador de Posição (Kp)', 0, 32767, 50, { pp: true });
  P(161, 'Ganho Proporcional do Regulador de Velocidade (Kp)', 0, 32767, 250, { dec: 1 });
  P(162, 'Ganho Integral do Regulador de Velocidade (Ki)', 0, 32767, 150, { dec: 2 });
  P(200, 'Senha', 0, 2, 1, { opts: { 0: 'Senha inativa', 1: 'Senha ativa', 2: 'Alterar senha' } });
  P(202, 'Modo de Operação', 1, 6, 2, { pp: true, dd: true, opts: { 1: 'Modo Torque', 2: 'Modo Velocidade', 3: 'Função Posicionador', 4: 'Ladder', 5: 'CANopen/DeviceNet/EtherCAT', 6: 'Profibus DP/Ethernet' } });
  P(204, 'Carrega Parâmetros', 0, 13, 0, { pp: true, dd: true, note: 'Simulado: 5 = carrega padrão de fábrica.' });
  P(219, 'Reset de Falhas', 0, 1, 0, { note: 'Borda de subida 0 → 1 reseta.' });
  P(300, 'Função da Entrada Digital DI1', 0, 20, 0, { pp: true, dd: true });
  P(301, 'Função da Entrada Digital DI2', 0, 20, 0, { pp: true, dd: true });
  P(302, 'Função da Entrada Digital DI3', 0, 20, 0, { pp: true, dd: true });

  // ---- MOTOR  [PROG cap. 11] ----
  P(385, 'Modelo do Servomotor', 0, 99, 24, { pp: true, dd: true, note: '0 = nenhum modelo: P00392…P00421 mantêm os valores programados. A tabela de modelos não é simulada.' });
  P(401, 'Corrente Nominal do Motor', 0, 9999, 85, { dec: 1, unit: 'Arms' });
  P(402, 'Velocidade Nominal do Motor', 0, 9999, 3000, { unit: 'rpm' });
  P(417, 'Constante de Torque (kt)', 0, 32767, 718, { dec: 3, unit: 'N·m/A' });
  P(418, 'Inércia do Eixo do Servomotor (J)', 0, 32767, 497, { dec: 3, unit: 'g·m²' });
  P(421, 'Inércia da Carga Acoplada (J)', 0, 32767, 0, { dec: 2, unit: 'g·m²', note: 'Bancada real: disco ≈ 4,14 g·m² + peso ≈ 3,00 g·m² [SIM].' });

  // ---- FUNÇÕES ESPECIAIS  [PROG cap. 12] ----
  P(531, 'Função STOP: Nível ou Borda', 0, 1, 1, { opts: { 0: 'Borda (somente Ladder)', 1: 'Nível' }, note: 'Padrão não confirmado no manual consultado [SIM].' });

  // ---- COMUNICAÇÃO  [PROG cap. 13] ----
  P(662, 'Ação para Erro de Comunicação', 0, 3, 0, { src: 'ETH', opts: { 0: 'Mostra alarme', 1: 'Gera falha', 2: 'Executa função STOP', 3: 'Desabilita drive' } });
  P(664, 'Guarda Parâmetros em Memória Não Volátil', 0, 1, 1, { opts: { 0: 'Não guarda', 1: 'Guarda' } });

  // ---- ETHERNET  [ETH cap. 5] ----
  const E = { src: 'ETH' };
  P(800, 'Identificação do Módulo Ethernet', 0, 3, 2, { ...E, ro: true, opts: { 0: 'Não identificado', 1: 'Modbus TCP', 2: 'EtherNet/IP', 3: 'PROFINET IO' } });
  P(801, 'Estado da Comunicação Ethernet', 0, 8, 0, { ...E, ro: true, opts: { 0: 'Setup', 1: 'Init', 2: 'Wait Comm', 3: 'Idle', 4: 'Data Active', 5: 'Error', 6: 'Reservado', 7: 'Exception', 8: 'Access Error' } });
  P(803, 'Taxa de Comunicação Ethernet', 0, 4, 0, { ...E, opts: { 0: 'Auto', 1: '10 Mbit/s half', 2: '10 Mbit/s full', 3: '100 Mbit/s half', 4: '100 Mbit/s full' } });
  P(806, 'Watchdog Modbus TCP', 0, 655, 0, { ...E, dec: 1, unit: 's', note: '0,0 desabilita. Vale para as conexões Modbus TCP.' });
  P(810, 'Configuração do Endereço IP', 0, 1, 1, { ...E, opts: { 0: 'Parâmetros', 1: 'DHCP' } });
  P(811, 'Endereço IP 1', 0, 255, 192, E); P(812, 'Endereço IP 2', 0, 255, 168, E);
  P(813, 'Endereço IP 3', 0, 255, 0, E); P(814, 'Endereço IP 4', 0, 255, 10, E);
  P(815, 'CIDR Sub-rede', 1, 31, 24, E);
  P(816, 'Gateway 1', 0, 255, 0, E); P(817, 'Gateway 2', 0, 255, 0, E);
  P(818, 'Gateway 3', 0, 255, 0, E); P(819, 'Gateway 4', 0, 255, 0, E);
  for (let i = 0; i < 12; i++) P(820 + i, `Palavra de Leitura Ethernet #${5 + i}`, 0, 9999, 0, { ...E, note: 'Número do parâmetro enviado ao mestre. 0 encerra a lista.' });
  for (let i = 0; i < 12; i++) P(835 + i, `Palavra de Escrita Ethernet #${5 + i}`, 0, 9999, 0, { ...E, note: 'Número do parâmetro escrito pelo mestre. 0 encerra a lista.' });
  P(849, 'Atualiza Configuração Ethernet', 0, 1, 0, { ...E, opts: { 0: 'Operação normal', 1: 'Atualiza configuração' } });

  // ---- LADDER / USUÁRIO  [PROG cap. 18 e 19] ----
  P(1000, 'Estado da PLC', 0, 5, 0, { ...RO, opts: { 0: 'Sem programa', 1: 'Salvando programa', 2: 'Cópia para cartão', 3: 'Programa inválido', 4: 'Programa parado', 5: 'Programa em execução' } });
  P(1001, 'Tempo de Scan', 0, 65535, 50, { ...RO, dec: 1, unit: 'ms' });
  P(1020, 'Comando da PLC', 0, 1, 1, { pp: true, opts: { 0: 'Para programa', 1: 'Executa programa' } });
  P(1024, 'Supervisão PLC', 0, 2, 0, { pp: true, opts: { 0: 'Inativa', 1: 'Gera alarme A00708', 2: 'Gera falha F00709' }, note: 'Ação quando o aplicativo ladder não está rodando. O simulador não tem aplicativo ladder gravado.' });

  // ---- FUNÇÃO POSICIONADOR (P00202 = 3)  [PROG V2.1X cap. 20 / Adendo V1.7X cap. 19] ----
  // Com P00202 = 3 o aplicativo ladder não roda, e os parâmetros do usuário passam a ser da Função Posicionador.
  // No simulador o disparo é pelo P01079 (escrito pela rede). Disparo por entrada digital não é simulado.
  const FP = (n, name, min, max, def, o = {}) => P(n, name, min, max, def, Object.assign({ src: 'PROG', fp: true }, o));
  FP(1070, 'Seleciona Slot (entradas da Função Posicionador)', 0, 3, 0, { opts: { 0: 'DIs padrão do drive', 1: 'Slot 1', 2: 'Slot 2', 3: 'Slot 3' }, note: 'Disparo por entrada digital não simulado: use o P01079 pela rede.' });
  FP(1071, 'Reseta Ciclo', 0, 1, 0, { note: 'Na transição 0 → 1, todos os ciclos voltam para o primeiro movimento.' });
  FP(1072, 'Mapeia Parâmetros da Função Move do SCA05', 0, 1, 0, { note: 'Não simulado.' });
  FP(1074, 'Mestre do Movimento Tipo Seguimento', 0, 4, 0, { opts: { 0: 'Sem função', 1: 'Entradas rápidas', 2: 'Rede CANopen', 3: 'Entrada de encoder 1', 4: 'Entrada de encoder 2' }, note: 'Seguidor não simulado.' });
  FP(1075, 'Tipo da Busca de Zero Máquina', 0, 1, 0, { note: 'Busca de zero não simulada.' });
  FP(1076, 'Tipo de Borda da Busca de Zero Máquina', 0, 1, 0, { note: 'Busca de zero não simulada.' });
  FP(1077, 'Acionamento dos Ciclos por Borda ou Nível', 0, 1, 0, { opts: { 0: 'Borda de subida', 1: 'Nível' } });
  FP(1078, 'Filtro do Acionamento dos Ciclos', 0, 32767, 0, { unit: 'ms' });
  FP(1079, 'Acionamento do Ciclo por Parâmetro', 0, 1, 0, { note: 'Em 1, aciona o ciclo programado em P01080.' });
  FP(1080, 'Ciclo Acionado pelo Parâmetro P01079', -10, 10, 0, { note: 'Positivo: um movimento do ciclo por acionamento. Negativo: ciclo completo.' });
  for (let k = 1; k <= 10; k++) FP(1080 + k, `Ciclo Acionado pela Entrada Digital ${String(k).padStart(2, '0')}`, -10, 10, 0, { note: 'Disparo por entrada digital não simulado.' });
  FP(1091, 'Ref. de Posição (fração de volta) p/ Saída Digital', 0, 16383, 0, { note: 'Não simulado.' });
  FP(1092, 'Ref. de Posição (número de voltas) p/ Saída Digital', 0, 32767, 0, { note: 'Não simulado.' });
  const ORD = ['Primeiro', 'Segundo', 'Terceiro', 'Quarto', 'Quinto'];
  for (let c = 1; c <= 10; c++) for (let j = 0; j < 5; j++) FP(1100 + (c - 1) * 5 + j + 1, `${ORD[j]} Movimento do Ciclo ${String(c).padStart(2, '0')}`, 0, 10, 0, { note: 'Número do movimento (1 a 10). 0 = fim do ciclo.' });
  const FP_TIPOS = { 0: 'Sem movimento', 1: 'Controle de Iq (torque)', 2: 'Controle de velocidade', 3: 'Posicionamento relativo', 4: 'Posicionamento relativo', 5: 'Posicionamento absoluto', 6: 'Posicionamento absoluto', 7: 'Jog', 8: 'Seguidor de posição', 9: 'Seguidor de velocidade', 10: 'Busca de zero (sentido +)', 11: 'Busca de zero (sentido −)' };
  for (let m = 1; m <= 10; m++) {
    const mm = String(m).padStart(2, '0');
    FP(1150 + m, `Tipo do Movimento ${mm}`, 0, 11, 0, { opts: FP_TIPOS });
    FP(1160 + m, `Timer do Movimento ${mm}`, 0, 32767, 0, { unit: 'ms', note: 'Espera entre o acionamento e o início do movimento.' });
    FP(1170 + m, `Ref. de Posição (fração de volta) do Movimento ${mm}`, 0, 32767, 0, { unit: 'pulsos', note: '16384 = 1 volta (4096 = 90°, 8192 = 180°).' });
    FP(1180 + m, `Ref. de Posição (número de voltas) do Movimento ${mm}`, -32768, 32767, 0);
    FP(1190 + m, `Ref. de Velocidade/Iq do Movimento ${mm}`, -32768, 32767, 0, { note: 'rpm (velocidade, jog e posicionamentos) ou décimos de A (Iq). Negativo inverte o sentido.' });
    FP(1200 + m, `Aceleração do Movimento ${mm}`, 0, 32767, 0, { unit: 'rpm/s', note: 'No tipo Iq: rampa em A/s.' });
    FP(1210 + m, `Desaceleração do Movimento ${mm}`, 0, 32767, 0, { unit: 'rpm/s' });
    FP(1220 + m, `Jerk do Movimento ${mm}`, 0, 32767, 0, { unit: 'rpm/s²', note: 'Aceito; o simulador usa perfil trapezoidal (sem curva S).' });
  }
  { const def = new Set(DEFS.map(d => d.n)); for (let n = 1050; n <= 1249; n++) if (!def.has(n)) P(n, `Parâmetro do Usuário ${n}`, -32768, 32767, 0, { src: 'PROG' }); }

  const DEF_MAP = new Map(DEFS.map(d => [d.n, d]));
  const PARAM_LIST = DEFS.map(d => d.n).sort((a, b) => a - b);

  // Funções das entradas digitais  [PROG Tabela 10.20]
  const DI_FUNCS = {
    0: 'Sem função', 1: 'Habilitação', 2: 'STOP (nível alto)', 3: 'STOP (nível baixo)', 4: 'Contador rápido', 5: 'Zera contador',
    6: 'Limpa falha', 7: 'Sentido de giro', 8: 'Armazena posição ↑', 9: 'Armazena posição ↓', 10: 'Armazena contador ↑', 11: 'Armazena contador ↓',
    12: 'Fim de curso horário (alto)', 13: 'Fim de curso horário (baixo)', 14: 'Fim de curso anti-horário (alto)', 15: 'Fim de curso anti-horário (baixo)',
    16: 'Reservado', 17: 'Reservado', 18: 'Armazena posição e contador ↑', 19: 'Armazena posição e contador ↓', 20: 'Falha externa'
  };

  // Configuração "de bancada": o que o técnico já programou no drive antes da aula.
  // DI1 = botoeira STOP, DI2/DI3 = fins de curso.  P00202 continua no padrão (2) de propósito:
  // a primeira missão do aluno é programar P00202 = 6.
  const BENCH_PRESET = { 300: 2, 301: 12, 302: 14, 385: 0 };

  // Alarmes e falhas usados [PROG Tabela 5.1]
  const CODES = {
    2: 'Subtensão no Link DC com drive habilitado', 6: 'Falha externa',
    47: 'Ethernet offline (comunicação com o mestre)', 708: 'Aplicativo do PLC não está rodando', 709: 'Aplicativo do PLC não está rodando', 48: 'Erro de acesso à interface Ethernet',
    122: 'Escrita em parâmetro somente leitura', 124: 'Parâmetro exige motor desabilitado',
    125: 'Parâmetro inexistente', 126: 'Valor fora dos limites',
    147: 'Ethernet offline (comunicação com o mestre)', 148: 'Erro de acesso à interface Ethernet'
  };

  // ---------------------------------------------------------------------------
  //  Dados físicos da bancada  [SIM]
  // ---------------------------------------------------------------------------
  const BENCH_PHYS = {
    discDiameter: 0.250, discThickness: 0.004, discDensity: 2700,      // alumínio Ø250 × 4 mm
    weightMass: 0.300, weightRadius: 0.100,                              // peso de desbalanceamento 300 g a 100 mm
    coulomb: 0.020, viscous: 0.0020,                                     // atrito N·m e N·m/(rad/s)
    camAngle: 170, hardStop: 178,                                        // cames de fim de curso e batentes [graus]
  };
  BENCH_PHYS.discMass = BENCH_PHYS.discDensity * Math.PI * (BENCH_PHYS.discDiameter / 2) ** 2 * BENCH_PHYS.discThickness;
  BENCH_PHYS.discJ = 0.5 * BENCH_PHYS.discMass * (BENCH_PHYS.discDiameter / 2) ** 2;     // kg·m²
  BENCH_PHYS.weightJ = BENCH_PHYS.weightMass * BENCH_PHYS.weightRadius ** 2;

  // =============================================================================
  //  CLASSE PRINCIPAL
  // =============================================================================
  class SCA06Drive {
    constructor(opts = {}) {
      this.now = 0;                         // tempo simulado (s)
      this.logs = [];
      this.onLog = opts.onLog || null;
      this.onPersist = opts.onPersist || null;   // chamado quando a "EEPROM" deve ser gravada
      this.p = new Map();
      this.dirty = new Set();
      this.loadFactory();
      for (const [n, v] of Object.entries(BENCH_PRESET)) this.p.set(+n, v);
      if (opts.saved) for (const [n, v] of Object.entries(opts.saved)) {
        const d = DEF_MAP.get(+n); if (d && !d.ro) this.p.set(+n, clampInt(v, d.min, d.max));
      }
      this.p.set(849, 0); this.p.set(219, 0); this.p.set(204, 0);

      this.bench = { power: true, sto: false, cablePlugged: true, accessorySeated: true, cams: false, weight: true, stopButton: false };
      this.mech = { theta: 0, omega: 0, iq: 0 };
      this.vdc = 311; this.tAir = 32; this.tSink = 34;
      this.enabled = false; this.stoLatch = false; this.commDisableLatch = false; this.commStopLatch = false;
      this.fault = 0; this.alarmTransient = { code: 0, until: 0 };
      this.nRefRamped = 0; this.vInt = 0; this.nFilt = 0;
      this.fcState = { h: false, a: false }; this.stopActive = false; this.ctlMode = 'speed'; this.imax = 0; this.speedCountsInst = 0;
      this.homeOffset = 0;                 // rad, referência do usuário
      this.prev = { ctrl: 0, p219: 0, di: [0, 0, 0], enableReq: false, ioRun: false, mode: 0 };
      this.out = [0, 0, 0, 0];             // palavras de saída 1..4 recebidas do mestre
      this.outExtra = [];
      this.volatil = new Set();   // parâmetros escritos pelo I/O cíclico: ficam só na memória (como no drive real)
      this.fp = { ptr: new Array(11).fill(0), queue: [], cur: null, hold: null, nCmd: 0, iqCmd: 0, count: 0, prevTrig: 0, trigSince: -1, fired: false, prevReset: 0, lastCycle: 0 };
      this.comm = {
        phase: 'setup', phaseT: 0, applied: null,
        ioConnected: false, ioRun: false, ioTimedOut: false, lastRx: -1, lastTx: -1,
        commErr: false, accessErr: false,
        mbFirstRx: false, mbLastRx: 0, rxCount: 0, txCount: 0, owner: ''
      };
      this.hmi = { mode: 'busca', idx: PARAM_LIST.indexOf(0), edit: 0, cursor: 0, overlay: null, ackFault: 0, ackAlarm: 0, busyUntil: 0, busyChar: '' };
      this.netReinit('boot');
      this.log('SCA06 energizado (controle 24 V). Firmware V2.10 simulado.');
    }

    // ------------------------------------------------------------- parâmetros
    loadFactory() { for (const d of DEFS) this.p.set(d.n, d.def); for (const d of DEFS) this.dirty.add(d.n); }
    def(n) { return DEF_MAP.get(n); }
    get(n) { return this.p.has(n) ? this.p.get(n) : undefined; }
    val(n) { const d = DEF_MAP.get(n); return this.p.get(n) / Math.pow(10, d.dec); }
    setRO(n, v) { v = Math.round(v); const d = DEF_MAP.get(n); v = clampInt(v, d.min, d.max); if (this.p.get(n) !== v) { this.p.set(n, v); this.dirty.add(n); } }

    /**
     * Escrita de parâmetro vinda de uma fonte externa.
     * source: 'hmi' | 'net' (EtherNet/IP explícito ou I/O) | 'modbus' | 'ui'
     * Retorna { ok:true } ou { ok:false, code:'NOEXIST'|'RO'|'RANGE'|'ENABLED', alarm }
     */
    write(n, raw, source = 'net') {
      const d = DEF_MAP.get(n);
      if (!d) { this.flashAlarm(125); return { ok: false, code: 'NOEXIST', alarm: 125 }; }
      if (d.ro) { this.flashAlarm(122); return { ok: false, code: 'RO', alarm: 122 }; }
      raw = Math.trunc(raw);
      if (raw < d.min || raw > d.max) { this.flashAlarm(126); return { ok: false, code: 'RANGE', alarm: 126 }; }
      if (d.dd && this.enabled && raw !== this.p.get(n)) { this.flashAlarm(124); return { ok: false, code: 'ENABLED', alarm: 124 }; }
      const old = this.p.get(n);
      this.p.set(n, raw); this.dirty.add(n);
      if (old !== raw) this.onWrite(n, raw, old, source);
      if (source === 'io') this.volatil.add(n); else this.volatil.delete(n);
      const persist = source !== 'io' && !(source === 'modbus' && this.p.get(664) === 0) && !(n === 99 && raw === 2);
      if (persist && this.onPersist && old !== raw) this.onPersist(this.savedParams());
      return { ok: true };
    }
    // não salva: parâmetros escritos pelo I/O cíclico (voláteis) e parâmetros de comando, que voltam sozinhos para 0
    savedParams() { const COMANDO = [204, 219, 849]; const o = {}; for (const d of DEFS) if (!d.ro && !this.volatil.has(d.n) && !COMANDO.includes(d.n) && this.p.get(d.n) !== d.def) o[d.n] = this.p.get(d.n); return o; }

    onWrite(n, raw, old, source) {
      if (n === 849 && raw === 1) { this.log('P00849 = 1 → reinicializando a interface Ethernet.'); this.pendingReinit = this.now + 0.05; }
      if (n === 204 && raw === 5) {
        this.log('P00204 = 5 → carregando padrão de fábrica.');
        this.loadFactory(); this.hmi.busyUntil = this.now + 1.5; this.hmi.busyChar = 'P';
        if (this.onPersist) this.onPersist({});
      }
      if (n === 202) this.log(`P00202 alterado para ${raw} (${DEF_MAP.get(202).opts[raw]}).`);
      if (n === 1100 || n === 1101) {/* tratado pelo ladder */ }
    }

    flashAlarm(code) { this.alarmTransient = { code, until: this.now + 2.0 }; }
    log(msg, level = 'info') {
      const e = { t: this.now, msg, level };
      this.logs.push(e); if (this.logs.length > 300) this.logs.shift();
      if (this.onLog) this.onLog(e);
    }

    // ------------------------------------------------------------- rede (ECO5)
    /** Reinicializa a interface Ethernet (energização, P00849, reset). */
    netReinit(reason) {
      const c = this.comm;
      c.phase = 'setup'; c.phaseT = this.now; c.ioConnected = false; c.ioRun = false; c.ioTimedOut = false;
      c.accessErr = false; c.mbFirstRx = false;
      this.out = [0, 0, 0, 0]; this.outExtra = [];
      this.netGen = (this.netGen || 0) + 1;     // o adapter usa para derrubar conexões
      this.netResetReason = reason;
    }
    /** Endereçamento aplicado (snapshot no momento do Init — alterações só valem após P00849/energização). */
    snapshotNetConfig() {
      const g = (n) => this.p.get(n);
      this.comm.applied = {
        dhcp: g(810) === 1,
        ip: [g(811), g(812), g(813), g(814)].join('.'),
        cidr: g(815),
        gw: [g(816), g(817), g(818), g(819)].join('.'),
        rate: g(803),
        rdWords: this.wordList(820), wrWords: this.wordList(835)
      };
    }
    wordList(base) { const out = []; for (let i = 0; i < 12; i++) { const v = this.p.get(base + i); if (!v) break; out.push(v); } return out; }
    /** Quantidade de palavras de I/O (4 fixas + programadas) — aplicada no Init. */
    ioSizes() { const a = this.comm.applied || {}; return { inWords: 4 + (a.rdWords ? a.rdWords.length : 0), outWords: 4 + (a.wrWords ? a.wrWords.length : 0) }; }
    netReady() { return this.comm.phase === 'ready' && this.bench.accessorySeated && !this.comm.accessErr; }
    linkUp() { return this.bench.cablePlugged && this.bench.accessorySeated && this.comm.phase !== 'setup'; }

    netIoOpen(owner) {
      const c = this.comm; c.ioConnected = true; c.ioTimedOut = false; c.owner = owner || '';
      this.log(`Conexão de I/O EtherNet/IP aberta (${owner}).`);
    }
    netIoData(words, run) {
      const c = this.comm; c.lastRx = this.now; c.rxCount++;
      if (run) {
        if (!c.ioRun && c.commErr) this.log('Comunicação restabelecida (mestre em RUN).');
        c.ioRun = true; c.commErr = false;
        this.out = [words[0] | 0, words[1] | 0, words[2] | 0, words[3] | 0];
        this.applyWriteWords(words.slice(4));
      } else {
        if (c.ioRun) { this.log('Mestre foi para IDLE (header run/idle = 0).', 'warn'); this.commError('idle'); }
        c.ioRun = false;
      }
    }
    netIoClose(reason) {
      const c = this.comm;
      if (!c.ioConnected) return;
      c.ioConnected = false;
      if (reason === 'timeout') { c.ioTimedOut = true; this.log('Timeout da conexão de I/O (RPI × multiplicador).', 'warn'); this.commError('timeout'); }
      else { this.log(`Conexão de I/O encerrada (${reason}).`); this.out = [0, 0, 0, 0]; }
      c.ioRun = false;
    }
    netTx() { this.comm.lastTx = this.now; this.comm.txCount++; }
    netModbusRx() { this.comm.mbFirstRx = true; this.comm.mbLastRx = this.now; this.comm.lastRx = this.now; }

    /** Palavras #5…#16 escritas pelo mestre → parâmetros apontados em P00835…P00846 */
    applyWriteWords(extra) {
      const list = (this.comm.applied && this.comm.applied.wrWords) || [];
      this.outExtra = extra.slice(0, list.length);
      list.forEach((pn, i) => {
        if (i >= extra.length) return;
        const v = extra[i];
        const d = DEF_MAP.get(pn);
        if (!d || d.ro) return;                      // ignorado (o mestre não recebe erro no I/O cíclico)
        if (this.p.get(pn) !== v) this.write(pn, clampInt(v, d.min, d.max), 'io');   // I/O cíclico: não grava na memória permanente
      });
    }

    commError(kind, faultCode = 47) {
      const c = this.comm; if (faultCode === 47) c.commErr = true;
      const action = this.p.get(662), viaNet = this.p.get(202) === 6;
      if (!viaNet) return;                                    // só alarme
      if (action === 1) this.raiseFault(faultCode);
      else if (action === 2) { this.commStopLatch = true; this.log('P00662 = 2 → executando função STOP.', 'warn'); }
      else if (action === 3) { this.commDisableLatch = true; this.log('P00662 = 3 → drive desabilitado.', 'warn'); }
      else this.log('P00662 = 0 → apenas alarme: o motor MANTÉM a última referência!', 'warn');
    }

    /** Palavras de entrada (escravo → mestre)  [ETH 6.1] */
    inputWords() {
      const w = [this.statusWord(), toInt16(this.speedCountsInst), toInt16(Math.round(this.iqUser() * 10)), this.modeActual()];
      const list = (this.comm.applied && this.comm.applied.rdWords) || [];
      for (const pn of list) w.push(toInt16(this.p.has(pn) ? this.p.get(pn) : 0));
      return w;
    }

    // ------------------------------------------------------------- estados
    sign() { return this.p.get(111) === 1 ? -1 : 1; }
    iqUser() { return this.mech.iq * 1; }
    powerOK() { return this.vdc >= 250; }
    stoActive() { return this.bench.sto; }
    rpmUser() { return this.sign() * this.mech.omega / RPM_TO_RADS; }
    posUserRad() { return this.sign() * (this.mech.theta - this.homeOffset); }

    diStates() {
      const b = this.bench, deg = this.discAngle();
      const camH = b.cams && deg >= BENCH_PHYS.camAngle && deg <= 180;
      const camA = b.cams && deg <= -BENCH_PHYS.camAngle && deg >= -180;
      return [b.stopButton ? 1 : 0, camH ? 1 : 0, camA ? 1 : 0];
    }
    /** Ângulo físico do disco (-180…180, horário positivo, visto de frente) */
    discAngle() { return wrap180(this.mech.theta * 180 / Math.PI); }

    diFunctions() {
      const s = this.diStates(); const f = [this.p.get(300), this.p.get(301), this.p.get(302)];
      const r = { enable: null, stop: false, fcH: false, fcA: false, reset: false, invert: false, extFault: false };
      for (let i = 0; i < 3; i++) {
        const st = s[i], fn = f[i];
        if (fn === 1) r.enable = !!st;
        if (fn === 2 && st) r.stop = true;
        if (fn === 3 && !st) r.stop = true;
        if (fn === 6 && st && !this.prev.di[i]) r.reset = true;
        if (fn === 7 && st) r.invert = true;
        if (fn === 12 && st) r.fcH = true; if (fn === 13 && !st) r.fcH = true;
        if (fn === 14 && st) r.fcA = true; if (fn === 15 && !st) r.fcA = true;
        if (fn === 20 && !st) r.extFault = true;
      }
      this.prev.di = s;
      return r;
    }

    currentAlarm() {
      if (this.comm.accessErr && this.fault !== 48) return 148;
      if (this.comm.commErr && this.fault !== 47) return 147;
      if (this.alarmTransient.code && this.now < this.alarmTransient.until) return this.alarmTransient.code;
      if (this.p.get(1024) === 1 && this.p.get(202) === 4) return 708;    // supervisão PLC: aplicativo não está rodando
      return 0;
    }

    raiseFault(code) {
      if (this.fault) return;
      this.fault = code; this.enabled = false;
      this.setRO(44, this.p.get(40)); this.setRO(40, this.p.get(36)); this.setRO(36, code);
      this.log(`FALHA F${String(code).padStart(5, '0')}: ${CODES[code] || ''}`, 'error');
    }
    resetFaults(src) {
      if (this.fault) this.log(`Reset de falhas (${src}).`);
      this.fault = 0; this.commStopLatch = false;
    }

    statusWord() {
      let w = 0;
      if (this.enabled) w |= 1 << 2;
      if (this.fault) w |= 1 << 3;
      if (this.powerOK()) w |= 1 << 4;
      if (this.stopActive) w |= 1 << 5;
      if (this.stoActive()) w |= 1 << 6;
      if (this.currentAlarm()) w |= 1 << 7;
      if (this.fcState.h) w |= 1 << 14;
      if (this.fcState.a) w |= 1 << 15;
      return w;
    }
    modeActual() {
      const m = this.p.get(202);
      if (m === 1) return 0; if (m === 2) return 1; if (m === 4) return 3;
      if (m === 3) { const C = this.fp.cur; return C && C.type === 1 ? 0 : C && (C.type === 2 || C.type === 7) ? 1 : 3; }
      if (m === 6) return (this.out[3] & 0xF) === 0 ? 0 : 1;
      return 1;
    }

    // ------------------------------------------------------------- ciclo principal
    /** Avança a simulação dt segundos (sub-passos de 0,5 ms). */
    step(dt) {
      const h = 0.0005; let n = Math.max(1, Math.round(dt / h));
      for (let i = 0; i < n; i++) { this.substep(h); if ((i & 15) === 0) this.updateNetPhase(); }
      this.updateNetPhase();
      this.updateReadParams(n * h);
    }

    updateNetPhase() {
      const c = this.comm;
      if (this.pendingReinit && this.now >= this.pendingReinit) { this.pendingReinit = 0; this.netReinit('P0849'); }
      if (!this.bench.accessorySeated) {
        if (!c.accessErr) {
          c.accessErr = true; c.ioConnected = false; c.ioRun = false; this.netGen++;
          this.log('Acessório ECO5 sem comunicação com o cartão de controle.', 'error');
          this.commError('access', 48);
        }
        return;
      }
      if (c.phase === 'setup' && this.now - c.phaseT > 0.4) { c.phase = 'init'; c.phaseT = this.now; this.snapshotNetConfig(); }
      else if (c.phase === 'init' && this.now - c.phaseT > 0.9) { c.phase = 'ready'; c.phaseT = this.now; this.setRO(849, 0); this.p.set(849, 0); this.log('Interface Ethernet pronta (aguardando mestre).'); }
      // watchdog Modbus TCP  [ETH P0806]
      const wd = this.p.get(806) / 10;
      if (wd > 0 && c.mbFirstRx && this.now - c.mbLastRx > wd && !c.mbWdFired) { c.mbWdFired = true; this.log('Watchdog Modbus TCP (P00806) estourou.', 'warn'); this.commError('modbus'); }
      if (c.mbFirstRx && this.now - c.mbLastRx <= wd) { c.mbWdFired = false; }
    }

    p801() {
      const c = this.comm;
      if (c.accessErr || !this.bench.accessorySeated) return 8;
      if (c.phase === 'setup') return 0;
      if (c.phase === 'init') return 1;
      if (c.ioConnected && c.ioRun) return 4;
      if (c.ioConnected) return 3;
      if (c.ioTimedOut) return 5;
      return 2;
    }
    /** LED NS — EtherNet/IP  [ETH Tabela 8.1] */
    nsLed() {
      const c = this.comm;
      if (c.accessErr || !this.bench.accessorySeated) return 'red';
      if (c.phase !== 'ready') return 'off';
      if (c.ioConnected) return 'green';
      if (c.ioTimedOut) return 'red-blink';
      return 'green-blink';
    }

    substep(h) {
      this.now += h;
      const m = this.mech, b = this.bench, mode = this.p.get(202);
      // ---- Link DC
      const vTarget = b.power ? 311 : 0;
      this.vdc += (vTarget - this.vdc) * Math.min(1, h / (b.power ? 0.15 : 0.8));
      // ---- Entradas digitais
      const di = this.diFunctions();
      this.fcState = { h: di.fcH, a: di.fcA };
      if (di.extFault) this.raiseFault(6);
      // ---- Reset de falhas: P00219, DI "limpa falha", palavra de controle bit7, ladder bit3
      const p219 = this.p.get(219);
      if (p219 === 1 && this.prev.p219 === 0) this.resetFaults('P00219');
      this.prev.p219 = p219;
      if (di.reset) this.resetFaults('DI');
      const ctrl = mode === 6 ? (this.out[0] & 0xFFFF) : 0;
      if (mode === 6 && (ctrl & 0x80) && !(this.prev.ctrl & 0x80)) this.resetFaults('palavra de controle bit 7');
      this.prev.ctrl = ctrl;
      if (mode !== this.prev.mode) {
        if (mode === 4) this.log('P00202 = 4 (Ladder): nenhum aplicativo ladder gravado neste drive. No SCA06 real, o programa é feito no WLP/WPS. O eixo não será controlado.', 'warn');
        if (mode === 3) this.log('P00202 = 3: Função Posicionador. Habilitação pelo P00099; movimentos acionados pelo P01079 (ciclo em P01080).');
        this.prev.mode = mode;
      }
      if (this.p.get(1024) === 2 && mode === 4 && !this.fault) this.raiseFault(709);

      // ---- Requisição de habilitação por fonte  [PROG P00202 / ETH 6.2.1]
      let req = false;
      if (mode === 1 || mode === 2 || mode === 3) req = di.enable !== null ? di.enable : this.p.get(99) !== 0;
      else if (mode === 4) req = false;                                    // sem aplicativo ladder gravado
      else if (mode === 6) req = !!(ctrl & 0x08);
      const edge = req && !this.prev.enableReq;
      if (!req) { this.stoLatch = false; this.commDisableLatch = false; if (this.enabled) this.log('Drive desabilitado.'); this.enabled = false; }
      this.prev.enableReq = req;
      if (!req && this.commStopLatch) { this.commStopLatch = false; }     // sai do STOP por desabilitação
      // F00002 — subtensão com drive habilitado
      if (this.enabled && this.vdc < 200) this.raiseFault(2);
      if (this.stoActive() && this.enabled) { this.enabled = false; this.stoLatch = true; this.log('STO acionado: torque removido. Rehabilite após liberar.', 'warn'); }
      const canEnable = !this.fault && this.powerOK() && !this.stoActive() && !this.commDisableLatch && !(this.stoLatch && !edge);
      if (req && !this.enabled && canEnable) { this.enabled = true; this.stoLatch = false; this.vInt = 0; this.nRefRamped = this.rpmUser(); this.log('Drive habilitado.'); }

      // ---- STOP  [PROG 12.3]
      const stopReq = di.stop || (mode === 6 && !!(ctrl & 0x04)) || this.commStopLatch;
      this.stopActive = this.enabled && stopReq;

      // ---- Referências
      const sgn = this.sign() * (di.invert ? -1 : 1);
      let ctlMode = 'speed', nRef = 0, iqRef = 0, ramp = null;
      if (mode === 1) { ctlMode = 'torque'; iqRef = this.p.get(119) / 10; }
      else if (mode === 2) { nRef = this.p.get(121); ramp = [this.p.get(100), this.p.get(101)]; }
      else if (mode === 6) {
        if ((this.out[3] & 0xF) === 0) { ctlMode = 'torque'; iqRef = toInt16(this.out[2]) / 10; }
        else nRef = countsToRpm(toInt16(this.out[1]));
      } else if (mode === 3) { ctlMode = 'fp'; }

      if (this.stopActive) {
        ctlMode = 'speed';
        const rate = 1000 / Math.max(1, this.p.get(105)) * 1000;        // rpm/s  (ms/krpm)
        this.nRefRamped = approach(this.nRefRamped, 0, rate * h);
        nRef = this.nRefRamped; ramp = 'done';
        // STOP cancela os movimentos da Função Posicionador  [PROG 12.3]
        if (mode === 3) this.fpCancel('função STOP');
      }

      // ---- Função Posicionador (P00202 = 3)
      if (ctlMode === 'fp') { const r = this.fpStep(h); ctlMode = r.ctl; nRef = r.nRef; iqRef = r.iqRef; }

      // ---- Fim de curso (não disponível em modo torque)  [PROG 12.4]
      if (ctlMode !== 'torque') {
        if (this.fcState.h && nRef > 0) nRef = 0;
        if (this.fcState.a && nRef < 0) nRef = 0;
        nRef = clamp(nRef, this.p.get(133), this.p.get(134));
        nRef = clamp(nRef, -this.p.get(402) * 1.2, this.p.get(402) * 1.2);
      }

      // ---- Rampas (somente modo velocidade P00202 = 2)
      if (ramp !== 'done') {
        if (Array.isArray(ramp) && ctlMode === 'speed') {
          const up = Math.abs(nRef) > Math.abs(this.nRefRamped) && Math.sign(nRef) !== -Math.sign(this.nRefRamped);
          const t = up ? ramp[0] : ramp[1];
          this.nRefRamped = t > 0 ? approach(this.nRefRamped, nRef, 1e6 / t * h) : nRef;
        } else this.nRefRamped = nRef;
      }
      this.ctlMode = ctlMode;

      // ---- Regulador de velocidade PI  [PROG P00161/P00162]  → corrente Iq
      const imax = Math.min(this.val(401) * this.p.get(136) / 100, this.val(97) * 2);
      const kt = Math.max(0.001, this.val(417));
      let iqCmd = 0;
      const nAct = this.rpmUser();
      if (this.enabled) {
        if (ctlMode === 'torque') {
          iqCmd = iqRef;
          // limitação de velocidade em modo torque [SIM]: evita disparo do disco
          const nLim = this.p.get(402) * 1.1;
          if (Math.abs(nAct) > nLim && Math.sign(iqCmd) === Math.sign(nAct)) iqCmd = 0;
        } else {
          const kp = this.val(161) * 0.026, ki = this.val(162) * 4.3;   // A/(rad/s) e A/rad [SIM]
          const e = (this.nRefRamped - nAct) * RPM_TO_RADS;
          let u = kp * e + this.vInt;
          if (Math.abs(u) < imax || Math.sign(e) !== Math.sign(this.vInt)) this.vInt += ki * e * h;
          u = kp * e + this.vInt;
          iqCmd = u;
        }
        iqCmd = clamp(iqCmd, -imax, imax);
      } else { this.vInt = 0; }
      this.imax = imax;

      // ---- Malha de corrente (1ª ordem, τ = 1 ms)
      m.iq += (iqCmd - m.iq) * Math.min(1, h / 0.001);
      if (!this.enabled) m.iq = 0;

      // ---- Mecânica do disco
      const Jm = this.val(418) / 1000;                          // g·m² → kg·m²
      const J = Jm + BENCH_PHYS.discJ + (b.weight ? BENCH_PHYS.weightJ : 0);
      const Te = kt * m.iq * this.sign();                       // torque físico (horário +)
      const Tg = b.weight ? -BENCH_PHYS.weightMass * 9.81 * BENCH_PHYS.weightRadius * Math.sin(m.theta) : 0;
      const Tv = -BENCH_PHYS.viscous * m.omega;
      let Tdrive = Te + Tg + Tv;
      if (Math.abs(m.omega) < 0.02 && Math.abs(Tdrive) <= BENCH_PHYS.coulomb) { m.omega = 0; }
      else {
        const Tc = -BENCH_PHYS.coulomb * Math.sign(m.omega !== 0 ? m.omega : Tdrive);
        m.omega += (Tdrive + Tc) / J * h;
      }
      m.theta += m.omega * h;
      // batentes mecânicos quando as cames estão montadas
      if (b.cams) {
        const lim = BENCH_PHYS.hardStop * Math.PI / 180, d = this.discAngle() * Math.PI / 180;
        if (d > lim && m.omega > 0) { m.theta -= (d - lim); m.omega = 0; }
        if (d < -lim && m.omega < 0) { m.theta += (-lim - d); m.omega = 0; }
      }
      // térmico [SIM]
      this.tSink += ((34 + 1.6 * m.iq * m.iq) - this.tSink) * h / 40;
      this.tAir += ((32 + 0.6 * m.iq * m.iq) - this.tAir) * h / 60;
    }

    // ===================== Função Posicionador  [PROG V2.1X cap. 20] =====================
    fpMoves(cyc) {
      const list = [];
      for (let j = 0; j < 5; j++) { const m = this.p.get(1100 + (cyc - 1) * 5 + j + 1); if (!m) break; list.push(m); }
      return list;
    }
    fpCancel(motivo) {
      const F = this.fp;
      if (F.cur || F.queue.length) this.log(`Função Posicionador: movimento cancelado (${motivo}).`, 'warn');
      F.cur = null; F.queue = []; F.nCmd = this.rpmUser(); F.iqCmd = 0; F.hold = this.posUserRad() * 180 / Math.PI;
    }
    fpTrigger() {
      const F = this.fp, c = this.p.get(1080);
      if (!c) { this.log('P01079 acionado, mas P01080 = 0: nenhum ciclo programado.', 'warn'); return; }
      const cyc = Math.abs(c), moves = this.fpMoves(cyc);
      if (!moves.length) { this.log(`Ciclo ${cyc} vazio: programe o primeiro movimento em P0${1100 + (cyc - 1) * 5 + 1}.`, 'warn'); return; }
      F.lastCycle = cyc;
      if (c < 0) F.queue = moves.slice();
      else { const i = F.ptr[cyc] % moves.length; F.queue = [moves[i]]; F.ptr[cyc] = (i + 1) % moves.length; }
      this.log(`Função Posicionador: ciclo ${cyc}${c < 0 ? ' completo' : ''} acionado → movimento ${F.queue.join(', ')}.`);
      this.fpNext();
    }
    fpNext() {
      const F = this.fp, m = F.queue.shift();
      if (!m) return false;
      F.cur = { m, type: this.p.get(1150 + m), tStart: this.now + this.p.get(1160 + m) / 1000, started: false, done: false };
      return true;
    }
    fpStart(C) {
      const F = this.fp, m = C.m, posDeg = this.posUserRad() * 180 / Math.PI;
      const frac = this.p.get(1170 + m), turns = this.p.get(1180 + m), vel = this.p.get(1190 + m);
      C.acc = this.p.get(1200 + m) || 30000; C.dec = this.p.get(1210 + m) || 30000; C.started = true;
      const T = C.type;
      if (T === 3 || T === 4 || T === 5 || T === 6) {
        let x = turns + frac / PULSES_PER_REV; if (vel < 0) x = -x;
        C.target = (T <= 4 ? posDeg : 0) + x * 360; C.vmax = Math.max(1, Math.abs(vel));
        this.log(`Movimento ${m}: ${T <= 4 ? 'posicionamento relativo' : 'posicionamento absoluto'} para ${(C.target).toFixed(1)}° a ${C.vmax} rpm.`);
      } else if (T === 2 || T === 7) { C.n = vel; this.log(`Movimento ${m}: ${T === 2 ? 'velocidade' : 'jog'} ${vel} rpm.`); }
      else if (T === 1) { C.iq = vel / 10; C.ramp = this.p.get(1200 + m) || 1000; this.log(`Movimento ${m}: controle de Iq ${C.iq.toFixed(1)} A.`); }
      else { this.log(`Movimento ${m}: tipo ${T} (${T >= 10 ? 'busca de zero' : T >= 8 ? 'seguidor' : 'sem movimento'}) não simulado; ignorado.`, 'warn'); C.done = true; }
    }
    fpPosition(h, targetDeg, vmax, acc, dec) {
      const F = this.fp, posDeg = this.posUserRad() * 180 / Math.PI, errDeg = targetDeg - posDeg;
      const vProfile = Math.sqrt(2 * dec * 6 * Math.abs(errDeg)) / 6;          // rpm (1 rpm = 6 °/s)
      const kp = this.p.get(159) * 0.4;                                        // 1/s [SIM]
      const n = Math.sign(errDeg) * Math.min(vmax, vProfile, Math.abs(errDeg) * kp / 6);
      F.nCmd = approach(F.nCmd, n, (Math.abs(n) > Math.abs(F.nCmd) ? acc : dec) * h);
      return { errDeg, n: F.nCmd };
    }
    fpStep(h) {
      const F = this.fp, posDeg = this.posUserRad() * 180 / Math.PI;
      // reseta ciclo (borda de subida do P01071)
      const rst = this.p.get(1071);
      if (rst && !F.prevReset) { F.ptr.fill(0); this.log('P01071: ciclos reinicializados no primeiro movimento.'); }
      F.prevReset = rst;
      if (!this.enabled) { F.cur = null; F.queue = []; F.nCmd = 0; F.iqCmd = 0; F.hold = posDeg; F.prevTrig = this.p.get(1079); F.fired = true; return { ctl: 'speed', nRef: 0, iqRef: 0 }; }
      if (F.hold === null) F.hold = posDeg;
      // acionamento pelo P01079: filtro P01078, borda ou nível P01077
      const trig = this.p.get(1079);
      if (trig && !F.prevTrig) { F.trigSince = this.now; F.fired = false; }
      F.prevTrig = trig;
      const armed = trig && this.now - F.trigSince >= this.p.get(1078) / 1000;
      const livre = !F.cur || (F.cur.done && !F.queue.length);
      if (armed && ((this.p.get(1077) === 0 && !F.fired) || (this.p.get(1077) === 1 && livre))) { F.fired = true; this.fpTrigger(); }
      const C = F.cur;
      if (!C) { const r = this.fpPosition(h, F.hold, 300, 30000, 30000); return { ctl: 'speed', nRef: r.n, iqRef: 0 }; }
      if (!C.started) {
        if (this.now < C.tStart) { const r = this.fpPosition(h, F.hold, 300, 30000, 30000); return { ctl: 'speed', nRef: r.n, iqRef: 0 }; }
        this.fpStart(C);
      }
      const T = C.type;
      const terminou = () => { C.done = true; F.count++; if (F.queue.length) this.fpNext(); };
      if (T >= 3 && T <= 6) {
        const r = this.fpPosition(h, C.target, C.vmax, C.acc, C.dec);
        if (!C.done && Math.abs(r.errDeg) < 0.05 && Math.abs(this.rpmUser()) < 3) { this.log(`Movimento ${C.m}: em posição (${posDeg.toFixed(1)}°).`); F.hold = C.target; terminou(); }
        return { ctl: 'speed', nRef: r.n, iqRef: 0 };
      }
      if (T === 2 || T === 7) {
        const alvo = T === 7 && !trig ? 0 : C.n;
        F.nCmd = approach(F.nCmd, alvo, (Math.abs(alvo) > Math.abs(F.nCmd) ? C.acc : C.dec) * h);
        if (T === 2 && !C.done && F.nCmd === alvo) terminou();
        if (T === 7 && !trig && F.nCmd === 0) { F.hold = posDeg; F.cur = null; F.count++; this.log(`Movimento ${C.m}: jog encerrado.`); }
        if (T === 2 && F.nCmd === 0 && C.done) F.hold = posDeg;
        return { ctl: 'speed', nRef: F.nCmd, iqRef: 0 };
      }
      if (T === 1) {
        F.iqCmd = approach(F.iqCmd, C.iq, C.ramp * h);
        if (!C.done && F.iqCmd === C.iq) terminou();
        F.hold = posDeg;
        return { ctl: 'torque', nRef: 0, iqRef: F.iqCmd };
      }
      if (C.done && !F.queue.length) F.cur = null;
      const r = this.fpPosition(h, F.hold, 300, 30000, 30000);
      return { ctl: 'speed', nRef: r.n, iqRef: 0 };
    }
    fpView() {
      const F = this.fp, C = F.cur, posDeg = this.posUserRad() * 180 / Math.PI;
      const alvo = C && C.started && C.target !== undefined ? C.target : F.hold;
      const movendo = !!(C && C.started && !C.done && (C.type >= 2 && C.type <= 7));
      return { cur: C ? C.m : 0, type: C ? C.type : 0, moving: movendo, waiting: !!(C && !C.started), done: !C || C.done,
        inPos: !movendo && alvo !== null && Math.abs(alvo - posDeg) < 0.2, targetDeg: alvo, count: F.count, cycle: F.lastCycle, ptr: F.ptr.slice() };
    }

    updateReadParams(dt = 0.005) {
      const nAct = this.rpmUser();
      this.nFilt += (nAct - this.nFilt) * (1 - Math.exp(-dt / 0.02));
      this.speedCountsInst = rpmToCounts(nAct + (this.enabled ? (Math.random() - 0.5) * 1.2 : 0));
      this.setRO(2, Math.round(this.nFilt));
      this.setRO(3, Math.round(this.iqUser() * 10));
      this.setRO(4, Math.round(this.vdc));
      const st = this.fault ? 2 : this.stoActive() ? 6 : !this.powerOK() ? 3 : this.enabled && this.stopActive ? 5 : this.enabled ? 1 : 0;
      this.setRO(6, st);
      const di = this.diStates(); this.setRO(8, di[0] + di[1] * 10 + di[2] * 100);
      this.setRO(21, Math.round(this.tAir)); this.setRO(22, Math.round(this.tSink));
      const al = this.currentAlarm();
      if (al && al !== this.p.get(30)) this.setRO(31, al);
      this.setRO(30, al); this.setRO(35, this.fault);
      const phys = ((this.mech.theta / TWO_PI) % 1 + 1) % 1;
      this.setRO(50, Math.floor(phys * PULSES_PER_REV) % PULSES_PER_REV);
      const user = this.posUserRad() / TWO_PI;          // voltas (com sinal)
      const turns = Math.trunc(user);
      this.setRO(53, turns); this.setRO(52, Math.round((user - turns) * PULSES_PER_REV));
      this.setRO(800, this.bench.accessorySeated ? 2 : 0);
      this.setRO(801, this.p801());
      this.setRO(92, this.bench.accessorySeated ? 257 : 0);
      // ladder: não há aplicativo gravado (P01000 = 0, sem programa)
      this.setRO(1000, 0);
      // erro de lag: só na Função Posicionador
      const fv = this.p.get(202) === 3 ? this.fpView() : null;
      this.setRO(48, fv && fv.targetDeg !== null ? Math.min(65535, Math.abs(Math.round((fv.targetDeg - this.posUserRad() * 180 / Math.PI) / 360 * PULSES_PER_REV))) : 0);
    }

    // ------------------------------------------------------------- bancada
    benchSet(key, value) {
      if (!(key in this.bench)) return;
      const old = this.bench[key]; this.bench[key] = value;
      if (old === value) return;
      const names = { power: 'Disjuntor de potência', sto: 'Botão de emergência (STO)', cablePlugged: 'Cabo Ethernet XA171', accessorySeated: 'Acessório ECO5', cams: 'Cames de fim de curso', weight: 'Peso de desbalanceamento', stopButton: 'Botoeira STOP (DI1)' };
      this.log(`${names[key]}: ${value ? 'ON / conectado' : 'OFF / removido'}`);
      if (key === 'accessorySeated' && value) { /* precisa reinicializar (P00849 ou reset) */ this.log('Reencaixado. Reinicialize a interface (P00849 = 1 ou reset).'); }
    }
    /** Tecla RESET da HMI: reinicializa o software (como desligar/religar o controle). */
    controlReset() {
      this.log('RESET do controle (tecla Reset da HMI).');
      this.enabled = false; this.fault = 0; this.commStopLatch = false; this.commDisableLatch = false; this.stoLatch = false;
      this.p.set(99, this.p.get(99) === 2 ? 0 : this.p.get(99));
      this.comm.commErr = false; this.comm.accessErr = false;
      this.hmi = { mode: 'busca', idx: PARAM_LIST.indexOf(0), edit: 0, cursor: 0, overlay: null, ackFault: 0, ackAlarm: 0, busyUntil: this.now + 1.2, busyChar: '8' };
      this.netReinit('reset');
    }

    // ------------------------------------------------------------- HMI (6 dígitos, 4 teclas)
    hmiKey(key) {
      const H = this.hmi;
      if (key === 'reset') return this.controlReset();
      if (this.now < H.busyUntil) return;
      // Mensagem de alarme/falha: qualquer tecla apaga  [PROG P00030]
      if (H.overlay) { if (H.overlay === 'F') H.ackFault = this.fault; else H.ackAlarm = this.currentAlarm(); H.overlay = null; return; }
      const n = PARAM_LIST[H.idx], d = DEF_MAP.get(n);
      const locked = this.p.get(200) === 1 && this.p.get(0) !== 5 && n !== 0;
      if (H.mode === 'busca') {
        if (key === 'up') H.idx = Math.min(PARAM_LIST.length - 1, H.idx + 1);
        if (key === 'down') H.idx = Math.max(0, H.idx - 1);
        if (key === 'prog') {
          if (d.ro || locked || d.pp) H.mode = 'exibicao';
          else { H.mode = 'alteracao'; H.edit = this.p.get(n); H.cursor = 0; }
        }
        return;
      }
      if (H.mode === 'exibicao') {
        if (key === 'shift') H.mode = 'busca';
        if (key === 'prog') {
          if (d.ro || locked) H.mode = 'busca';
          else { H.mode = 'alteracao'; H.edit = this.p.get(n); H.cursor = 0; }
        }
        return;
      }
      if (H.mode === 'alteracao') {
        if (key === 'shift') { H.cursor = (H.cursor + 1) % 5; return; }
        if (key === 'up' || key === 'down') {
          const stepv = Math.pow(10, H.cursor) * (key === 'up' ? 1 : -1);
          H.edit = clamp(H.edit + stepv, -99999, 99999);
          if (!d.pp && H.edit >= d.min && H.edit <= d.max) this.write(n, H.edit, 'hmi');   // online
          return;
        }
        if (key === 'prog') {
          const r = this.write(n, H.edit, 'hmi');
          if (!r.ok) this.log(`HMI: escrita em P${pad5(n)} recusada (A${pad5(r.alarm)}).`, 'warn');
          H.mode = 'busca';
        }
      }
    }

    /** Conteúdo do display: 6 posições da ESQUERDA (dígito 6) para a DIREITA (dígito 1) */
    hmiDisplay() {
      const H = this.hmi, blinkOn = Math.floor(this.now * 3) % 2 === 0;
      const cells = (s, dps = []) => s.split('').map((ch, i) => ({ ch, dp: dps.includes(i), blink: false }));
      if (this.now < H.busyUntil) {
        const c = cells('      '); c[5] = { ch: H.busyChar, dp: false, blink: true }; if (H.busyChar === '8') return cells('888888', [0, 1, 2, 3, 4, 5]);
        return c;
      }
      if (H.flash && this.now < H.flash.until) {           // gravação do assistente: número do parâmetro, depois o valor
        const fn = H.flash.n, fd = DEF_MAP.get(fn);
        if (H.flash.until - this.now > 0.8) return cells('P' + pad5(fn));
        const fv = this.p.get(fn), fa = String(Math.abs(fv)).padStart(5, '0').slice(-5);
        const fc = cells((fv < 0 ? '-' : ' ') + fa); if (fd.dec > 0) fc[5 - fd.dec].dp = true; return fc;
      }
      if (this.stoActive()) return cells('   Sto');
      // nova falha/alarme → mensagem (some com qualquer tecla)
      if (this.fault && this.fault !== H.ackFault) H.overlay = 'F';
      else if (!H.overlay) { const a = this.currentAlarm(); if (a && a !== H.ackAlarm) H.overlay = 'A'; if (!a) H.ackAlarm = 0; }
      if (!this.fault) H.ackFault = 0;
      if (H.overlay === 'F') { if (!this.fault) H.overlay = null; else return cells('F' + pad5(this.fault)); }
      if (H.overlay === 'A') { const a = this.currentAlarm(); if (!a) H.overlay = null; else return cells('A' + pad5(a)); }
      const n = PARAM_LIST[H.idx], d = DEF_MAP.get(n);
      if (H.mode === 'busca') return cells('P' + pad5(n));
      const raw = H.mode === 'alteracao' ? H.edit : this.p.get(n);
      const neg = raw < 0, abs = String(Math.abs(raw)).padStart(5, '0').slice(-5);
      const c = cells((neg ? '-' : ' ') + abs);
      if (d.dec > 0) c[5 - d.dec].dp = true;
      if (H.mode === 'alteracao') c[5 - H.cursor].blink = true;
      return c;
    }
    hmiLeds() { return { usb: false, power: this.powerOK(), fault: !!this.fault }; }
    hmiParam() { return PARAM_LIST[this.hmi.idx]; }
    /** O assistente de comunicação gravou um parâmetro: o display mostra o número e o valor por um instante. */
    hmiFlash(n) { if (DEF_MAP.has(n)) this.hmi.flash = { n, until: this.now + 1.6 }; }

    // ------------------------------------------------------------- snapshot p/ interface
    view() {
      const c = this.comm;
      const act = (this.now - c.lastRx < 0.12) || (this.now - c.lastTx < 0.12);
      return {
        t: this.now,
        angle: this.discAngle(), angleSign: this.sign(), thetaRad: this.mech.theta, rpm: this.rpmUser(), iq: this.iqUser(), vdc: this.vdc,
        enabled: this.enabled, fault: this.fault, alarm: this.currentAlarm(), stop: !!this.stopActive, sto: this.stoActive(),
        status: this.statusWord(), p006: this.p.get(6), p801: this.p.get(801), ns: this.nsLed(),
        link1: this.linkUp() ? (act && this.netReady() ? 'blink' : 'on') : 'off', link2: 'off',
        ctlMode: this.ctlMode, mode: this.p.get(202), imax: this.imax,
        inWords: this.inputWords(), outWords: this.out.concat(this.outExtra),
        sizes: this.ioSizes(), applied: c.applied, owner: c.owner, ioConnected: c.ioConnected, ioRun: c.ioRun, commErr: c.commErr,
        bench: Object.assign({}, this.bench), fc: this.fcState || { h: false, a: false }, di: this.diStates(),
        hmi: { cells: this.hmiDisplay(), leds: this.hmiLeds(), mode: this.hmi.mode, param: this.hmiParam() },
        fp: this.fpView(),
        userPosDeg: wrapDeg(this.posUserRad() * 180 / Math.PI)
      };
    }
    takeDirty() { const out = {}; for (const n of this.dirty) out[n] = this.p.get(n); this.dirty.clear(); return out; }
    allParams() { const o = {}; for (const n of PARAM_LIST) o[n] = this.p.get(n); return o; }
  }

  function approach(v, target, maxStep) { if (v < target) return Math.min(target, v + maxStep); if (v > target) return Math.max(target, v - maxStep); return v; }
  function pad5(n) { return String(Math.abs(n)).padStart(5, '0'); }

  return {
    SCA06Drive, DEFS, DEF_MAP, PARAM_LIST, DI_FUNCS, CODES, BENCH_PHYS, BENCH_PRESET,
    SPEED_FULL_RPM, SPEED_FULL_COUNTS, PULSES_PER_REV, rpmToCounts, countsToRpm, toInt16, wrapDeg, wrap180, pad5
  };
});
