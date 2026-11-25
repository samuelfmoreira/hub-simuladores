/* Bancada CFW500 - trilha de exercícios. check(b, m) recebe a bancada e a memória da missão (passos intermediários). */
(function (g) {
  'use strict';
  const SIM = g.SIM = g.SIM || {};
  const perto = (a, b, tol) => Math.abs(a - b) <= tol;
  const mesmoNo = (b, x, y) => !!b._N && b._N(x) === b._N(y);
  const rem = (b) => !b.inv.loc && b.inv.vivo;

  SIM.MISSOES = [
    { id: 'energizar', titulo: 'Energizar o inversor', montagem: 'forca',
      texto: 'Leve a rede até o inversor passando pelo disjuntor Q1 e aterre o inversor. Depois feche Q1 e ligue a chave geral da bancada.',
      passos: ['X1 L1, L2, L3 → Q1 bornes 1, 3, 5', 'Q1 bornes 2, 4, 6 → inversor R/L1, S/L2, T/L3', 'X1 PE → PE do inversor', 'Feche Q1 e ligue a chave geral: o display acende'],
      check: (b) => { const q = b.comp('Q1'); return b.inv.vivo && b.inv.boot <= 0 && b.inv.ent.fases >= 2 && !!q && q.st.fechado && ['2', '4', '6'].some((t) => ['R', 'S', 'T'].some((r) => mesmoNo(b, 'Q1.' + t, 'A1.' + r))) && mesmoNo(b, 'X1.PE', 'A1.PEi'); } },
    { id: 'motor', titulo: 'Ligar o motor e informar a placa', montagem: 'forca', params: [[401, 3.0], [402, 1725], [403, 60], [404, 5], [399, 82.6], [407, 0.80]],
      texto: 'Ligue U, V, W e PE do inversor ao motor. Leia a placa do motor (clique nele com o botão direito) e grave os dados no grupo MOTOR.',
      passos: ['U → U1, V → V1, W → W1 e PE → PE', 'P0401 = 3,0 A (placa: 2,98 A)', 'P0402 = 1725 rpm · P0403 = 60 Hz', 'P0404 = 5 (1 HP / 0,75 kW)', 'P0399 = 82,6 % · P0407 = 0,80'],
      check: (b) => { const P = b.inv.P; return b.inv.ent.motor.fases === 3 && mesmoNo(b, 'A1.PEo', 'M1.PE') && P[401] === 3 && P[402] === 1725 && P[403] === 60 && P[404] === 5 && P[399] === 82.6 && P[407] === 0.8; } },
    { id: 'hmi', titulo: 'Comando local pela HMI', montagem: 'forca',
      texto: 'Em modo LOCAL (fábrica), gire o motor pela tecla I, leve a referência a 30,0 Hz com as setas, inverta o sentido pela tecla de giro e pare com a tecla O.',
      passos: ['Tecla I: o motor parte na velocidade mínima (P0133)', 'Setas ▲▼ na tela de monitoração: 30,0 Hz', 'Tecla de sentido de giro: desacelera, inverte e volta a 30 Hz', 'Tecla O: para por rampa'],
      check: (b, m) => { const i = b.inv; if (i.loc && i.pwm && perto(i.fS, 30, 0.3) && b.motor.rpm > 800) m.a = 1; if (m.a && i.loc && i.pwm && perto(i.fS, -30, 0.3) && b.motor.rpm < -800) m.b = 1; return !!m.b && !i.pwm; } },
    { id: 'rampas', titulo: 'Rampas e limites de velocidade', montagem: 'forca', params: [[100, 3], [101, 5], [133, 5], [134, 60]],
      texto: 'Ajuste aceleração de 3 s, desaceleração de 5 s, mínima de 5 Hz e máxima de 60 Hz. Depois acelere até a máxima e confira no display.',
      passos: ['P0100 = 3,0 s · P0101 = 5,0 s', 'P0133 = 5,0 Hz · P0134 = 60,0 Hz', 'Gire e suba a referência até travar em 60,0 Hz'],
      check: (b) => { const P = b.inv.P; return P[100] === 3 && P[101] === 5 && P[133] === 5 && P[134] === 60 && b.inv.pwm && perto(Math.abs(b.inv.fS), 60, 0.2); } },
    { id: 'di', titulo: 'Partida por entrada digital (2 fios)', montagem: 'dois_fios', params: [[222, 0]],
      texto: 'Use a chave K1 para ligar e desligar pela DI1. De fábrica as DIs são NPN: ativam quando ligadas ao GND. Passe para REMOTO pela tecla LOC/REM e deixe a referência do remoto na HMI.',
      passos: ['GND (borne 16) → K1 13 · K1 14 → DI1 (borne 1)', 'P0222 = 0 (referência REM pelas teclas da HMI)', 'Tecla LOC/REM: aparece REM no display', 'K1 ligada: gira · K1 desligada: para por rampa'],
      check: (b, m) => { const i = b.inv; if (rem(b) && i.P[227] === 1 && i.pwm && i.di[0] && Math.abs(i.fS) > 2.5) m.a = 1; return !!m.a && rem(b) && !i.pwm && !i.di[0]; } },
    { id: 'sentido', titulo: 'Sentido de giro pela DI2', montagem: 'dois_fios', params: [[222, 0]],
      texto: 'Com o motor girando em REMOTO, use a chave K2 na DI2 (função de fábrica: sentido de giro) para inverter a rotação.',
      passos: ['GND → K2 13 · K2 14 → DI2 (borne 3)', 'K1 ligada: gira no sentido horário', 'K2 ligada: desacelera, inverte e acelera no anti-horário'],
      check: (b, m) => { const i = b.inv; if (rem(b) && i.pwm && i.fS > 2.5 && !i.di[1]) m.a = 1; return !!m.a && rem(b) && i.pwm && i.fS < -2.5 && i.di[1] && b.motor.rpm < -10; } },
    { id: 'pot', titulo: 'Referência pelo potenciômetro (AI1)', montagem: 'pot', params: [[222, 1]],
      texto: 'Ligue o potenciômetro: +10 V no extremo 3, cursor na AI1 e extremo 1 no GND. Com P0222 = 1 (fábrica) a velocidade no REMOTO acompanha o botão.',
      passos: ['+10 V (borne 8) → RP1 3', 'AI1 (borne 6) → RP1 2 (cursor)', 'GND (borne 4) → RP1 1', 'P0222 = 1 · REM · K1 ligada', 'Gire o potenciômetro do mínimo ao máximo e veja P0018 e a frequência'],
      check: (b, m) => { const i = b.inv; if (rem(b) && i.P[222] === 1 && i.pwm) { if (i.P[18] < 10 && Math.abs(i.fS) < 12) m.a = 1; if (i.P[18] > 90 && Math.abs(i.fS) > 55) m.b = 1; } return !!m.a && !!m.b; } },
    { id: 'multimetro', titulo: 'Medir a AI1 com o multímetro', montagem: 'pot',
      texto: 'Ponha o multímetro em V⎓, a ponta vermelha na AI1 (borne 6) e a preta no GND (borne 4). Ajuste o potenciômetro até ler 5,00 V e compare com P0018 (50 %).',
      passos: ['Seletor do multímetro em V⎓', 'Ponta vermelha no borne 6 (AI1) · ponta preta no borne 4 (GND)', 'Gire o potenciômetro até 5,00 V (± 0,10 V)'],
      check: (b) => { const mm = b.porTipo('multi'); return !!mm && mm.st.modo === 2 && !!mm.st.pv && !!mm.st.pc && mesmoNo(b, mm.st.pv, 'A1.c6') && mesmoNo(b, mm.st.pc, 'A1.c4') && perto(parseFloat(b.leitura.txt), 5, 0.1) && b.inv.vivo; } },
    { id: 'tres_fios', titulo: 'Partida a 3 fios (Start / Stop)', montagem: 'tres_fios', params: [[263, 6], [264, 7], [222, 0], [226, 0]],
      texto: 'Botão verde S1 (contato NA) dá a partida com um pulso e o vermelho S2 (contato NF) para. Programe DI1 = Start e DI2 = Stop. Se aparecer CONF, falta programar uma das duas.',
      passos: ['GND → S1 13 · S1 14 → DI1', 'GND → S2 21 · S2 22 → DI2 (contato NF: fio partido = motor parado)', 'P0263 = 6 (Start) · P0264 = 7 (Stop)', 'P0226 = 0 (sentido horário fixo no REM) · P0222 = 0', 'REM · pulso em S1: gira e continua · pulso em S2: para'],
      check: (b, m) => { const i = b.inv; if (rem(b) && i.P[263] === 6 && i.P[264] === 7 && i.pwm && i.run3 && !i.di[0]) m.a = 1; return !!m.a && !i.run3 && !i.pwm && i.di[1]; } },
    { id: 'multispeed', titulo: 'Multispeed: 4 velocidades por chaves', montagem: 'multispeed', params: [[222, 8], [264, 0], [265, 13], [266, 13], [226, 0], [124, 10], [125, 20], [126, 40], [127, 60], [134, 66]],
      texto: 'K1 liga o motor (DI1) e as chaves K3 (DI3) e K4 (DI4) escolhem a velocidade: 10, 20, 40 e 60 Hz. DI4 é o bit menos significativo.',
      passos: ['K1 → DI1 · K3 → DI3 · K4 → DI4 (todas com o comum no GND)', 'P0222 = 8 (Multispeed) · P0265 = 13 · P0266 = 13 · P0264 = 0 · P0226 = 0', 'P0124 = 10 · P0125 = 20 · P0126 = 40 · P0127 = 60 Hz', 'REM · K1 ligada · passe pelas 4 combinações de K3 e K4'],
      check: (b, m) => { const i = b.inv, P = i.P; if (rem(b) && P[222] === 8 && i.pwm && i.ms < 4 && perto(Math.abs(i.fS), Math.abs(P[124 + i.ms]), 0.3)) m['v' + i.ms] = 1;
        return P[124] === 10 && P[125] === 20 && P[126] === 40 && P[127] === 60 && !!(m.v0 && m.v1 && m.v2 && m.v3); } },
    { id: 'sinal', titulo: 'Sinalização pelas saídas digitais', montagem: 'sinalizacao', params: [[275, 11], [276, 2], [288, 30]],
      texto: 'O relé DO1 acende o sinaleiro verde H1 enquanto o motor gira (Run) e o transistor DO2 acende o amarelo H3 acima de 30 Hz (F > Fx).',
      passos: ['+24 V (9) → DO1-RL-C (11) · DO1-RL-NA (13) → H1 X1 · H1 X2 → GND (16)', '+24 V (9) → H3 X1 · H3 X2 → DO2-TR (10): o transistor fecha para o GND', 'P0275 = 11 (Run) · P0276 = 2 (F > Fx) · P0288 = 30,0 Hz', 'Gire abaixo e acima de 30 Hz e depois pare'],
      check: (b, m) => { const i = b.inv, h1 = b.comp('H1'), h3 = b.comp('H3'); if (!h1 || !h3) return false;
        if (i.pwm && h1.st.aceso && !h3.st.aceso && Math.abs(i.fS) < 29) m.a = 1; if (i.pwm && h1.st.aceso && h3.st.aceso && Math.abs(i.fS) > 31) m.b = 1;
        return !!m.a && !!m.b && !i.pwm && !h1.st.aceso && i.P[275] === 11 && i.P[276] === 2; } },
    { id: 'falha_ext', titulo: 'Emergência como falha externa', montagem: 'falha_ext', params: [[266, 19]],
      texto: 'Ligue o contato NF do botão de emergência S0 entre o GND e a DI4 e programe a DI4 como "Sem Falha Ext.". Apertando S0 o inversor mostra F0091; solte S0 e rearme com a tecla O.',
      passos: ['GND → S0 11 · S0 12 → DI4 (borne 7)', 'P0266 = 19 (Sem Falha Ext.)', 'Com o motor girando, aperte S0: F0091 e o motor para por inércia', 'Gire para soltar S0 e aperte a tecla O para o reset'],
      check: (b, m) => { const i = b.inv; if (i.P[266] === 19 && i.falhaCod === 91) m.a = 1; return !!m.a && !i.falhaCod && i.di[3] && i.vivo; } },
    { id: 'corrente', titulo: 'Entrada analógica em 4-20 mA', montagem: 'gerador', params: [[233, 1], [222, 1]],
      texto: 'Troque o potenciômetro pelo gerador de sinal em mA. Mude a chave S1.1 do plug-in para corrente (aba Bancada) e P0233 = 1. Com 12 mA a AI1 mostra 50 %. Solte um fio do laço e veja o alarme A0163.',
      passos: ['G1 + → AI1 (6) · G1 − → GND (4) · gerador em mA', 'Chave S1.1 do plug-in em mA (aba Bancada) · P0233 = 1 (4 a 20 mA)', 'Ajuste 12,0 mA: P0018 = 50,0 %', 'Remova um fio do laço: A0163 (sinal abaixo de 2 mA)'],
      check: (b, m) => { const i = b.inv, c = b.comp('A1'); if (!c || !c.st.s1 || i.P[233] !== 1) return false; if (perto(i.P[18], 50, 2)) m.a = 1; if (m.a && i.alarme === 163) m.b = 1; return !!m.b; } },
    { id: 'link_dc', titulo: 'Inércia alta e a regulação do link DC', montagem: 'forca', params: [[101, 1]],
      texto: 'Acople o volante de inércia (aba Bancada) e ajuste a desaceleração para 1 s. Pare o motor a partir de 60 Hz: a tensão do link DC (P0004) sobe e o inversor estica a rampa sozinho para não cair em F0022.',
      passos: ['Aba Bancada: acople o volante de inércia', 'P0101 = 1,0 s', 'Gire até 60 Hz e pare: acompanhe P0004 e o aviso "regulação do link DC"'],
      check: (b, m) => { const i = b.inv; if (b.motor.volante && i.P[101] <= 1 && i.limit === 'link DC') m.a = 1; return !!m.a && !i.pwm && !i.falhaCod; } },
  ];
  if (typeof module !== 'undefined') module.exports = SIM;
})(typeof globalThis !== 'undefined' ? globalThis : this);
