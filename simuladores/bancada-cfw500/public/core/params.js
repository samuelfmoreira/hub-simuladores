/* Bancada CFW500 - lista ÚNICA de parâmetros (fonte: Manual de Programação CFW500 V3.9X, doc. 10006739493/09,
 * capítulo 0 "Referência rápida dos parâmetros"). Esta lista gera a HMI, a aba Parâmetros e as tabelas do guia.
 * Modelo simulado: CFW500A04P3B2 (200-240 V, 4,3 A, mecânica A) com módulo plug-in CFW500-IOS.
 * Colunas: n;nome;mín;máx;fábrica;casas;unidade;props;grupos
 *   props:  r = somente leitura (ro) · c = cfg (só altera com o motor parado) · g = guardado, sem efeito na bancada
 *   grupos: R READ · B BASIC · M MOTOR · I I/O · N NET · H HMI · S SPLC · U STARTUP
 * Valores "conforme modelo do inversor" foram fixados para o 4,3 A / 220 V (marcados no guia). */
(function (g) {
  'use strict';
  const SIM = g.SIM = g.SIM || {};
  const INOM = 4.3;

  const TXT = `
0;Acesso aos Parâmetros;0;9999;0;0;;;
1;Referência Velocidade;0;65535;0;0;;r;R
2;Velocidade de Saída (Motor);0;65535;0;0;;r;R
3;Corrente do Motor;0;400;0;1;A;r;R
4;Tensão Link DC (Ud);0;2000;0;0;V;r;R
5;Frequência de Saída (Motor);0;500;0;1;Hz;r;R
6;Estado do Inversor;0;10;0;0;;r;R
7;Tensão de Saída;0;2000;0;0;V;r;R
9;Torque no Motor;-1000;1000;0;1;%;r;R
10;Potência de Saída;0;6553.5;0;2;kW;r;R
11;Fator de Potência;-1;1;0;2;;r;R
12;Estado DI8 a DI1;0;255;0;0;;r;RI
13;Estado DO5 a DO1;0;31;0;0;;r;RI
14;Valor de AO1;0;100;0;1;%;r;RI
15;Valor de AO2;0;100;0;1;%;rg;RI
16;Valor de FO em %;0;100;0;1;%;rg;RI
17;Valor de FO em Hz;0;20000;0;0;Hz;rg;RI
18;Valor de AI1;-100;100;0;1;%;r;RI
19;Valor de AI2;-100;100;0;1;%;rg;RI
20;Valor de AI3;-100;100;0;1;%;rg;RI
21;Valor de FI em %;-100;100;0;1;%;rg;RI
22;Valor de FI em Hz;0;20000;0;0;Hz;rg;RI
23;Versão de SW Princ.;0;655.35;3.9;2;;r;R
24;Versão de SW Sec.;0;655.35;1.03;2;;r;R
27;Config. Mod. Plug-in;0;17;1;0;;r;R
28;Módulo de Funções de Segurança;0;1;0;0;;r;R
29;Config. HW Potência;0;60;3;0;;r;R
30;Temp. Módulo Potência;-20;150;25;0;°C;r;R
34;Temper. Ar Interno;-20;150;25;0;°C;r;R
36;Velocidade do Ventilador Int.;0;15000;0;0;rpm;r;R
37;Sobrecarga Motor Ixt;0;100;0;0;%;r;R
38;Velocidade do Encoder;0;65535;0;0;rpm;rg;R
39;Contador Pulsos Enc.;0;40000;0;0;;rg;R
40;Variável Processo PID;0;3000;0;1;;rg;R
41;Valor do Setpoint PID;0;3000;0;1;;rg;R
42;Tempo Energizado;0;65535;0;0;h;r;R
43;Tempo Ativado;0;6553.5;0;1;h;r;R
44;Energia de Saída kWh;0;65535;0;0;kWh;r;R
47;Estado CONFIG;0;999;0;0;;r;R
48;Alarme Atual;0;999;0;0;;r;R
49;Falha Atual;0;999;0;0;;r;R
50;Última Falha;0;999;0;0;;r;R
51;Corrente Últ. Falha;0;400;0;1;A;r;R
52;Link DC Últ. Falha;0;2000;0;0;V;r;R
53;Frequência Últ. Falha;0;500;0;1;Hz;r;R
54;Temp. Últ. Falha;-20;150;0;0;°C;r;R
55;Estado Lóg. Últ. Falha;0;65535;0;0;h;r;R
60;Segunda Falha;0;999;0;0;;r;R
61;Corrente 2ª Falha;0;400;0;1;A;r;R
62;Link DC 2ª Falha;0;2000;0;0;V;r;R
63;Frequência 2ª Falha;0;500;0;1;Hz;r;R
64;Temp. 2ª Falha;-20;150;0;0;°C;r;R
65;Estado Lóg. 2ª Falha;0;65535;0;0;h;r;R
70;Terceira Falha;0;999;0;0;;r;R
71;Corrente 3ª Falha;0;400;0;1;A;r;R
72;Link DC 3ª Falha;0;2000;0;0;V;r;R
73;Frequência 3ª Falha;0;500;0;1;Hz;r;R
74;Temp. 3ª Falha;-20;150;0;0;°C;r;R
75;Estado Lóg. 3ª Falha;0;65535;0;0;h;r;R
80;Última Falha em "Fire Mode";0;999;0;0;;rg;R
81;Segunda Falha em "Fire Mode";0;999;0;0;;rg;R
82;Terceira Falha em "Fire Mode";0;999;0;0;;rg;R
100;Tempo Aceleração;0.1;999;10;1;s;;B
101;Tempo Desaceleração;0.1;999;10;1;s;;B
102;Tempo Acel. 2ª Rampa;0.1;999;10;1;s;;
103;Tempo Desac. 2ª Rampa;0.1;999;10;1;s;;
104;Rampa S;0;1;0;0;;c;
105;Seleção 1ª/2ª Rampa;0;6;2;0;;;I
106;Tempo da 3ª Rampa;0.1;999;5;1;s;;
120;Backup da Ref. Veloc.;0;2;1;0;;;
121;Referência via HMI;0;500;3;1;Hz;;
122;Referência JOG;-500;500;5;1;Hz;;
124;Ref. 1 Multispeed;-500;500;3;1;Hz;;
125;Ref. 2 Multispeed;-500;500;10;1;Hz;;
126;Ref. 3 Multispeed;-500;500;20;1;Hz;;
127;Ref. 4 Multispeed;-500;500;30;1;Hz;;
128;Ref. 5 Multispeed;-500;500;40;1;Hz;;
129;Ref. 6 Multispeed;-500;500;50;1;Hz;;
130;Ref. 7 Multispeed;-500;500;60;1;Hz;;
131;Ref. 8 Multispeed;-500;500;66;1;Hz;;
132;Nível Máx. Sobreveloc;0;100;10;0;%;cg;B
133;Velocidade Mínima;0;500;3;1;Hz;;B
134;Velocidade Máxima;0;500;66;1;Hz;;B
135;Corrente Máxima Saída;0;400;6.5;1;A;;BM
136;Boost de Torque Manual;0;30;3;1;%;;BM
137;Boost de Torque Autom.;0;30;0;1;%;;M
138;Compensação Escorreg.;-10;10;0;1;%;;M
139;Filtro Corrente Saída;0;9999;50;0;ms;;
140;Filtro Comp. Escorreg.;0;9999;500;0;ms;;
142;Tensão Saída Máxima;0;100;100;1;%;c;
143;Tensão Saída Intermed.;0;100;66.7;1;%;c;
144;Tensão Saída Mínima;0;100;33.3;1;%;c;
145;Freq. Início Enf. Campo;0;500;60;1;Hz;c;
146;Freq. Saída Intermed.;0;500;40;1;Hz;c;
147;Freq. Saída Baixa;0;500;20;1;Hz;c;
148;Ação do V/f;0;1;0;0;;cg;
150;Tipo Regul. Link DC V/f;0;3;0;0;;c;M
151;Nível Regul. Ud V/f;339;1200;400;0;V;;
152;Ganho Prop. Regul. Ud V/f;0;9.99;1.5;2;;g;
153;Nível Frenagem Reost.;339;1200;375;0;V;g;
156;Corr. Sobrecarga 100 %;0;400;4.7;1;A;;
157;Corr. Sobrecarga 50 %;0;400;4.3;1;A;;
158;Corr. Sobrecarga 20 %;0;400;3.4;1;A;;
161;Ganho Prop. Veloc.;0;63.9;7;1;;g;
162;Ganho Integral Veloc.;0;9.999;0.005;3;;g;
165;Filtro de Velocidade;0.012;1;0.012;3;s;g;
166;Ganho Difer. Veloc.;0;7.99;0;2;;g;
167;Ganho Prop. Corrente;0;1.99;0.5;2;;g;
168;Ganho Integ. Corrente;0;1.999;0.01;3;;g;
169;Máx.Corrente Torque +;0;350;125;1;%;g;B
170;Máx.Corrente Torque -;0;350;125;1;%;g;B
175;Ganho Propor. Fluxo;0;31.9;2;1;;g;
176;Ganho Integral Fluxo;0;9.999;0.02;3;;g;
177;Conf. Saturação do Estabilizador de Corrente;0;10;5;1;%;cg;B
178;Fluxo Nominal;0;150;100;1;%;;
179;Sobre-Modulação;100;110;100;1;%;g;
181;Modo de Magnetização;0;1;0;0;;cg;
182;Veloc. p/ Atuação I/f;0;180;30;0;rpm;g;M
183;Corrente no Modo I/f;15;300;120;1;%;g;M
184;Modo Regulação Ud;0;2;1;0;;cg;M
185;Nível Regulação Ud;339;1000;400;0;V;g;
186;Ganho Proporcional Ud;0;63.9;18;1;;g;
187;Ganho Integral Ud;0;9.999;0.002;3;;g;
188;Ganho Prop. V. Saída;0;7.999;0.2;3;;g;
189;Ganho Integ. V. Saída;0;7.999;0.001;3;;g;
190;Tensão Saída Máxima;0;600;220;0;V;g;
193;Dia da Semana;0;6;0;0;;g;H
194;Dia;1;31;1;0;;g;H
195;Mês;1;12;1;0;;g;H
196;Ano;0;99;20;0;;g;H
197;Hora;0;23;0;0;;g;H
198;Minutos;0;59;0;0;;g;H
199;Segundos;0;59;0;0;;g;H
200;Senha;0;9999;0;0;;;H
201;Idioma;0;2;0;0;;g;H
202;Tipo de Controle;0;10;0;0;;c;U
203;Sel. Função Especial;0;3;0;0;;cg;
204;Carrega/Salva Parâm.;0;15;0;0;;c;
205;Parâmetro Display Princ.;0;1500;2;0;;;H
206;Parâmetro Display Auxiliar;0;1500;1;0;;;H
207;Parâmetro para Barra;0;1500;3;0;;;H
208;Escala da Referência;1;65535;600;0;;;H
209;Unidade Eng. Ref.;0;58;13;0;;;H
210;Forma Indicação Ref.;0;3;1;0;;;H
213;Fator Escala da Barra;1;65535;43;0;;;H
215;Seleção HMI Remota;0;1;0;0;;cg;H
216;Iluminação HMI;0;1;1;0;;;H
217;Frequência para Dormir;0;500;0;1;Hz;c;
218;Tempo para Dormir;0;999;0;0;s;;
220;Seleção LOC/REM;0;11;2;0;;c;I
221;Sel. Referência LOC;0;17;0;0;;c;I
222;Sel. Referência REM;0;17;1;0;;c;I
223;Seleção Giro LOC;0;12;2;0;;c;I
224;Seleção Gira/Para LOC;0;5;0;0;;c;I
225;Seleção JOG LOC;0;6;1;0;;c;I
226;Seleção Giro REM;0;12;4;0;;c;I
227;Seleção Gira/Para REM;0;5;1;0;;c;I
228;Seleção JOG REM;0;6;2;0;;c;I
229;Seleção Modo Parada;0;2;0;0;;c;I
230;Zona Morta (AIs);0;1;0;0;;c;I
231;Função do Sinal AI1;0;18;0;0;;c;I
232;Ganho da Entrada AI1;0;9.999;1;3;;;I
233;Sinal da Entrada AI1;0;3;0;0;;;I
234;Offset da Entrada AI1;-100;100;0;1;%;;I
235;Filtro da Entrada AI1;0;16;0;2;s;;I
236;Função do Sinal AI2;0;18;0;0;;cg;I
237;Ganho da Entrada AI2;0;9.999;1;3;;g;I
238;Sinal da Entrada AI2;0;3;0;0;;g;I
239;Offset da Entrada AI2;-100;100;0;1;%;g;I
240;Filtro da Entrada AI2;0;16;0;2;s;g;I
241;Função do Sinal AI3;0;18;0;0;;cg;I
242;Ganho da Entrada AI3;0;9.999;1;3;;g;I
243;Sinal da Entrada AI3;0;4;0;0;;g;I
244;Offset da Entrada AI3;-100;100;0;1;%;g;I
245;Filtro da Entrada AI3;0;16;0;2;s;g;I
246;Entrada em Freq. FI;0;2;0;0;;g;I
247;Ganho da Entrada FI;0;9.999;1;3;;g;I
248;Entrada FI Mínima;10;20000;10;0;Hz;g;I
249;Offset da Entrada FI;-100;100;0;1;%;g;I
250;Entrada FI Máxima;10;20000;10000;0;Hz;g;I
251;Função da Saída AO1;0;29;2;0;;;I
252;Ganho da Saída AO1;0;9.999;1;3;;;I
253;Sinal da Saída AO1;0;5;0;0;;;I
254;Função da Saída AO2;0;29;5;0;;g;I
255;Ganho da Saída AO2;0;9.999;1;3;;g;I
256;Sinal da Saída AO2;0;5;0;0;;g;I
257;Função da Saída FO;0;29;15;0;;g;I
258;Ganho Saída FO;0;9.999;1;3;;g;I
259;Saída FO Mínima;10;20000;10;0;Hz;g;I
260;Saída FO Máxima;10;20000;10000;0;Hz;g;I
263;Função da Entrada DI1;0;53;1;0;;c;I
264;Função da Entrada DI2;0;53;8;0;;c;I
265;Função da Entrada DI3;0;53;20;0;;c;I
266;Função da Entrada DI4;0;53;10;0;;c;I
267;Função da Entrada DI5;0;53;0;0;;cg;I
268;Função da Entrada DI6;0;53;0;0;;cg;I
269;Função da Entrada DI7;0;53;0;0;;cg;I
270;Função da Entrada DI8;0;53;0;0;;cg;I
271;Sinal das DIs;0;8;0;0;;c;I
275;Função da Saída DO1;0;52;13;0;;;I
276;Função da Saída DO2;0;52;2;0;;;I
277;Função da Saída DO3;0;52;0;0;;g;I
278;Função da Saída DO4;0;52;0;0;;g;I
279;Função da Saída DO5;0;52;0;0;;g;I
287;Histerese Fx;0;10;0.5;1;Hz;;I
288;Velocidade Fx;0;500;3;1;Hz;;I
290;Corrente Ix;0;400;4.3;1;A;;I
293;Torque Tx;0;200;100;0;%;;I
295;Corr. Nom. Inv.;0;400;4.3;1;A;r;R
296;Tensão Nominal Rede;0;7;0;0;;c;
297;Freq. de Chaveamento;2000;15000;5000;0;Hz;c;
298;Aplicação;0;1;0;0;;cg;
299;Tempo Frenag. Partida;0;15;0;1;s;;
300;Tempo Frenagem Parada;0;15;0;1;s;;
301;Frequência de Início;0;500;3;1;Hz;;
302;Tensão Frenagem CC;0;100;20;1;%;;
303;Frequência Evitada 1;0;500;20;1;Hz;;
304;Frequência Evitada 2;0;500;30;1;Hz;;
306;Faixa Evitada;0;25;0;1;Hz;;
308;Endereço Serial;1;247;1;0;;g;N
310;Taxa Comunic. Serial;0;2;1;0;;g;N
311;Config. Bytes Serial;0;5;1;0;;g;N
312;Protocolo Serial (1) (2);0;15;2;0;;cg;N
313;Ação p/ Erro Comunic.;0;5;1;0;;g;N
314;Watchdog Serial;0;999;0;1;s;g;N
316;Estado Interf. Serial;0;2;0;0;;rg;N
317;Start-Up Orientado;0;1;0;0;;c;U
318;Upload de Plug-in;0;1;0;0;;cg;
319;Função Copy HMI Alfa;0;2;0;0;;cg;H
320;Flying Start/Ride-Through;0;3;0;0;;c;
321;Ud para Falta de Rede;178;770;252;0;V;g;
322;Ud para Ride-Through;178;770;243;0;V;g;
323;Ud para Retorno Rede;178;770;267;0;V;g;
325;Ganho Prop. RT;0;63.9;22.8;1;;g;
326;Ganho Integr. RT;0;9.999;0.128;3;;g;
327;Rampa Corr. I/f F.S.;0;1;0.07;3;;g;
328;Filtro Flying Start;0;1;0.085;3;;g;
329;Rampa Freq. I/f F.S.;2;50;6;1;;g;
331;Rampa de Tensão FS e RT;0.2;60;2;1;s;;
339;Compensação da Tensão de Saída em V/f;0;1;0;0;;cg;
340;Tempo Auto-Reset;0;255;0;0;s;;
343;Máscara Falha/Alarme;0;65535;143;0;h;c;
345;Parada Prioritária HMI;0;1;0;0;;;
349;Nível para Alarme Ixt;70;100;85;0;%;c;
352;Config. do Ventilador Dissipador;0;6;4;0;;c;
357;Tempo Falta Fase Rede;0;60;0;0;s;g;
360;Histerese de Velocidade;0;100;10;1;%;g;
361;Tempo com Velocidade Diferente da Referência;0;999;0;1;s;g;
372;Nível para Frenagem CC Sensorless;0;90;40;1;%;g;
397;Configuração do Controle;0;65535;3695;0;h;cg;
398;Fator Serviço Motor;1;1.5;1;2;;c;MU
399;Rendimento Nom. Motor;50;99.9;75;1;%;c;MU
400;Tensão Nom. Motor;200;600;220;0;V;c;MU
401;Corrente Nom. Motor;0;400;4.3;1;A;c;MU
402;Rotação Nom. Motor;0;30000;1710;0;rpm;c;MU
403;Frequência Nom. Motor;0;500;60;0;Hz;c;MU
404;Potência Nom. Motor;0;27;5;0;;c;MU
405;Número Pulsos Encoder;100;9999;1024;0;;cg;MU
406;Ventilação do Motor;0;1;0;0;;c;MU
407;Fator Pot. Nom. Motor;0.5;0.99;0.8;2;;c;MU
408;Autoajuste;0;4;0;0;;c;U
409;Resistência Estator;0.01;99.99;3.5;2;Ω;c;MU
410;Corrente Magnetização;0;100;0;1;A;;MU
411;Indutância Dispersão;0;99.99;0;2;mH;c;MU
412;Constante Tr;0;9.999;0;3;s;;MU
413;Constante Tm;0;99.99;0;2;s;;MU
431;Número de Pólos;2;48;6;0;;cg;U
435;Constante Eletromotriz Ke;0;6000;0;0;;cg;U
445;Ganho de Ajuste do MTPA;0;4;0.5;2;;g;M
446;Ganho Proporcional do MTPA;0;5;0.5;2;;g;M
447;Ganho Integral do MTPA;0;0.5;0.012;3;;g;M
448;Estabilizador da Corrente;0;30;0.75;2;;g;M
449;Corrente I/f;0;200;100;1;%;cg;M
450;Tempo da Pré-partida;0;15;2;1;s;cg;M
451;Velocidade Rampa de Partida;0;100;8;1;%;g;M
452;Filtro de Corrente DQ;1;10000;1;0;ms;g;M
453;Tempo Rampa de Partida;0;999;3;1;s;g;M
454;Tensão Mínima do MTPA;0;100;70;1;%;g;M
455;Corrente Frenagem CC;0;200;20;1;%;cg;M
456;Ganho Proporcional I/f;0;1.99;0.5;2;;g;M
457;Ganho Integral I/f;0;1.999;0.01;3;;g;M
458;Velocidade de Atuação do Modo I/f;0;100;30;1;%;g;M
470;Nível Corrente F0073;100;250;200;1;%;cg;M
471;Constante Tempo F0073;0;1000;0;0;ms;cg;M
510;Unidade de Engenharia 1 SoftPLC;0;58;10;0;;g;HS
511;Ponto Decimal para Unidade de Engenharia 1 SoftPLC;0;3;1;0;;g;HS
512;Unidade de Engenharia 2 SoftPLC;0;58;10;0;;g;HS
513;Ponto Decimal para Unidade de Engenharia 2 SoftPLC;0;3;1;0;;g;HS
514;Unidade de Engenharia 3 SoftPLC;0;58;13;0;;g;HS
515;Ponto Decimal para Unidade de Engenharia 3 SoftPLC;0;3;1;0;;g;HS
516;Unidade de Engenharia 4 SoftPLC;0;58;13;0;;g;HS
517;Ponto Decimal para Unidade de Engenharia 4 SoftPLC;0;3;1;0;;g;HS
520;Ganho Proporc. PID;0;9.999;1;3;;g;
521;Ganho Integral PID;0;9.999;0.43;3;;g;
522;Ganho Diferencial PID;0;9.999;0;3;;g;
525;Setpoint PID pela HMI;0;100;0;1;%;g;
526;Filtro Setpoint PID;0;9999;50;0;ms;g;
527;Tipo de Ação PID;0;1;0;0;;g;
528;Escala Indicação VP;10;30000;1000;0;;g;H
529;Forma Indicação VP;0;3;1;0;;g;H
533;Valor VPx;0;100;90;1;%;g;I
535;Faixa p/ Acordar;0;100;0;1;%;g;I
536;Ajuste Autom. P0525;0;1;0;0;;cg;
580;Configuração "Fire Mode";0;4;0;0;;cg;
581;Setpoint do PID em "Fire Mode";-100;100;100;1;%;g;
582;Configuração Auto-Reset;0;1;0;0;;cg;
588;Máximo Torque EOC;0;85;0;0;%;g;MN
589;Tensão Mínima EOC;8;40;40;0;%;g;MN
590;Velocidade Mínima EOC;360;18000;600;0;rpm;g;MN
591;Histerese EOC;0;30;10;0;%;g;MN
613;Revisão do Software;-32768;32767;1;0;;r;R
639;Nível de Subtensão;50;100;100;1;%;c;
680;Estado Lógico;0;65535;0;0;h;r;RN
681;Velocidade 13 bits;-32768;32767;0;0;;r;RN
682;Controle Serial/USB;0;65535;0;0;h;rg;N
683;Ref. Vel. Serial/USB;-32768;32767;0;0;;rg;N
684;Controle CO/DN/PB/Eth;0;65535;0;0;h;rg;N
685;Ref. Vel. CO/DN/PB/Eth;-32768;32767;0;0;;rg;N
690;Estado Lógico 2;0;65535;0;0;h;r;RN
695;Valor para DOx;0;31;0;0;;rg;N
696;Valor 1 para AOx;-32768;32767;0;0;;rg;N
697;Valor 2 para AOx;-32768;32767;0;0;;rg;N
698;Valor 3 para AOx;-32768;32767;0;0;;rg;N
700;Protocolo CAN;1;3;2;0;;g;N
701;Endereço CAN;0;127;63;0;;g;N
702;Taxa Comunicação CAN;0;8;0;0;;g;N
703;Reset de Bus Off;0;1;0;0;;g;N
705;Estado Controlador CAN;0;6;0;0;;rg;N
706;Telegramas CAN RX;0;65535;0;0;;rg;N
707;Telegramas CAN TX;0;65535;0;0;;rg;N
708;Contador de Bus Off;0;65535;0;0;;rg;N
709;Mensagens CAN Perdidas;0;65535;0;0;;rg;N
710;Instâncias I/O DeviceNet;0;6;0;0;;g;N
719;Estado Rede DeviceNet;0;5;0;0;;rg;N
720;Estado Mestre DNet;0;1;0;0;;rg;N
721;Estado Com. CANopen;0;5;0;0;;rg;N
722;Estado Nó CANopen;0;4;0;0;;rg;N
740;Estado Com. Profibus;0;6;0;0;;rg;N
741;Perfil Dados Profibus;0;1;1;0;;g;N
760;Inst. Hi Equip. BACnet;0;419;0;0;;g;N
761;Inst. Lo Equip. BACnet;0;9999;0;0;;g;N
762;Número Máx. de Mestre;0;127;127;0;;g;N
763;Núm. Máx. Frames MS/TP;1;65535;1;0;;g;N
764;Transmissão Msg I-AM;0;1;0;0;;g;N
765;Qtde Token Recebidos;0;65535;0;0;;rg;N
766;Número de Registradores para Enviar;0;36;0;0;;rg;N
767;Status dos Grupos;0;15;0;0;;rg;N
796;Endereço Superior Permitido;0;63;63;0;;g;N
797;Número de Tokens Recebidos;0;65535;0;0;;g;N
798;Próximo Endereço Detectado;0;63;0;0;;g;N
800;Eth: Identificação do Módulo;0;3;0;0;;rg;RN
801;Eth: Estado da Comunicação;0;8;0;0;;rg;RN
803;Eth: Taxa de Comunicação;0;4;0;0;;g;N
805;Eth: Perfil de Dados;0;3;0;0;;g;N
806;Eth: Timeout Modbus TCP;0;65.5;0;1;s;cg;N
810;Eth: Config Endereço IP;0;2;1;0;;cg;N
811;Eth: Endereço IP 1;0;255;192;0;;cg;N
812;Eth: Endereço IP 2;0;255;168;0;;cg;N
813;Eth: Endereço IP 3;0;255;0;0;;cg;N
814;Eth: Endereço IP 4;0;255;14;0;;cg;N
815;Eth: CIDR Sub-rede;1;31;24;0;;cg;N
816;Eth: Gateway 1;0;255;0;0;;cg;N
817;Eth: Gateway 2;0;255;0;0;;cg;N
818;Eth: Gateway 3;0;255;0;0;;cg;N
819;Eth: Gateway 4;0;255;0;0;;cg;N
849;Eth: Atualiza Configuração;0;1;0;0;;g;N
856;Eth: End. IP Atual 1;0;255;0;0;;rg;RN
857;Eth: End. IP Atual 2;0;255;0;0;;rg;RN
858;Eth: End. IP Atual 3;0;255;0;0;;rg;RN
859;Eth: End. IP Atual 4;0;255;0;0;;rg;RN
860;MBTCP: Estado da Comunicação;0;3;0;0;;rg;RN
863;MBTCP: Conexões Ativas;0;4;0;0;;rg;RN
865;MBTCP: Porta TCP;0;9999;502;0;;cg;N
869;EIP: Estado do Mestre;0;1;0;0;;rg;RN
870;EIP: Estado da Comunicação;0;4;0;0;;rg;RN
871;EIP: Perfil de Dados;0;10;8;0;;cg;N
886;EIP: Topologia DLR;0;1;0;0;;rg;RN
887;EIP: Estado DLR;0;2;0;0;;rg;RN
889;Eth: Estado da Interface;0;3;0;0;h;rg;RN
890;Eth: Controle da Interface;0;63;9;0;h;g;N
918;Endereço Profibus;1;126;1;0;;g;N
922;Sel. Teleg. Profibus;2;8;2;0;;g;N
963;Taxa Comunic. Profibus;0;11;0;0;;rg;N
967;Palavra de Controle 1;0;65535;0;0;h;rg;N
968;Palavra de Status 1;0;65535;0;0;h;rg;N
990;Nome Local Bluetooth;0;9999;1234;0;;g;N
991;Senha PIN Bluetooth;0;9999;1234;0;;g;N
1000;Estado SoftPLC;0;4;0;0;;rg;S
1001;Comando para SoftPLC;0;5;0;0;;cg;S
1002;Tempo Ciclo de Scan;0;65535;0;0;ms;rg;S
1003;Seleção do Aplicativo SoftPLC;0;1;0;0;;cg;S
1004;Ação para Aplicativo SoftPLC não Rodando;0;2;0;0;;g;S
1008;Erro de Lag;-9999;9999;0;0;;rg;S
1009;Ganho de Posição;0;6553.5;10;1;;g;S`;

  // blocos repetitivos do manual (mapeamento de palavras de rede e parâmetros SoftPLC): guardados, sem efeito na bancada
  let extra = '';
  for (let i = 0; i < 4; i++) extra += `\n${711 + i};Leitura #${3 + i} DeviceNet;0;1199;0;0;;g;N\n${715 + i};Escrita #${3 + i} DeviceNet;0;1199;0;0;;g;N`;
  for (let i = 0; i < 6; i++) extra += `\n${742 + i};Leitura #${3 + i} Profibus;0;1199;0;0;;g;N\n${750 + i};Escrita #${3 + i} Profibus;0;1199;0;0;;g;N`;
  for (let gp = 0; gp < 4; gp++) {
    const b = 768 + gp * 4;
    extra += `\n${b};Grupo ${gp + 1}: Endereço da Fonte;0;63;0;0;;g;N\n${b + 1};Grupo ${gp + 1}: Registrador da Fonte;0;65535;0;0;;g;N` +
      `\n${b + 2};Grupo ${gp + 1}: Registrador do Destino;0;65535;0;0;;g;N\n${b + 3};Grupo ${gp + 1}: Quantidade de Registradores;0;6;1;0;;g;N`;
  }
  for (let i = 0; i < 12; i++) extra += `\n${820 + i};Eth: Leitura #${3 + i};0;9999;0;0;;g;N\n${835 + i};Eth: Escrita #${3 + i};0;9999;0;0;;g;N`;
  for (let i = 0; i < 50; i++) extra += `\n${1010 + i};Parâmetro SoftPLC ${i + 1};-32768;32767;0;0;;g;S`;

  const GRUPO = { R: 'READ', B: 'BASIC', M: 'MOTOR', I: 'I/O', N: 'NET', H: 'HMI', S: 'SPLC', U: 'STARTUP' };
  const LISTA = (TXT + extra).trim().split('\n').map((l) => {
    const c = l.split(';');
    return { n: +c[0], nome: c[1], min: +c[2], max: +c[3], def: +c[4], dec: +c[5], un: c[6] || '', ro: c[7].includes('r'), cfg: c[7].includes('c'),
      guardado: c[7].includes('g'), hex: c[6] === 'h', grupos: (c[8] || '').split('').map((x) => GRUPO[x]) };
  }).sort((a, b) => a.n - b.n);
  LISTA.forEach((p) => { if (p.hex) p.un = ''; });
  const MAPA = {}; LISTA.forEach((p) => { MAPA[p.n] = p; });

  // ---------------------------------------------------------------- opções (texto de cada valor), do mesmo capítulo 0
  const FN_REF = { 0: 'Teclas HMI', 1: 'AI1', 2: 'AI2', 3: 'AI3', 4: 'FI', 5: 'AI1 + AI2 > 0', 6: 'AI1 + AI2', 7: 'E.P.', 8: 'Multispeed', 9: 'Serial/USB',
    10: 'Sem Função', 11: 'CO/DN/PB/Eth', 12: 'SoftPLC', 13: 'Sem Função', 14: 'AI1 > 0', 15: 'AI2 > 0', 16: 'AI3 > 0', 17: 'FI > 0' };
  const FN_GIRO = { 0: 'Horário', 1: 'Anti-horário', 2: 'Tecla HMI (H)', 3: 'Tecla HMI (AH)', 4: 'DIx', 5: 'Serial/USB (H)', 6: 'Serial/USB (AH)', 7: 'Sem Função',
    8: 'Sem Função', 9: 'CO/DN/PB/Eth (H)', 10: 'CO/DN/PB/Eth (AH)', 11: 'Sem Função', 12: 'SoftPLC' };
  const FN_GP = { 0: 'Tecla HMI', 1: 'DIx', 2: 'Serial/USB', 3: 'Sem Função', 4: 'CO/DN/PB/Eth', 5: 'SoftPLC' };
  const FN_JOG = { 0: 'Inativo', 1: 'Teclas HMI', 2: 'DIx', 3: 'Serial/USB', 4: 'Sem Função', 5: 'CO/DN/PB/Eth', 6: 'SoftPLC' };
  const FN_AI = { 0: 'Ref. Veloc.', 1: 'Sem Função', 2: 'Máxima Corrente de Torque', 3: 'Fluxo Nominal V/f', 4: 'PTC', 5: 'Sem Função', 6: 'Sem Função', 7: 'Uso SoftPLC',
    8: 'Função 1 Aplicação', 9: 'Função 2 Aplicação', 10: 'Função 3 Aplicação', 11: 'Função 4 Aplicação', 12: 'Função 5 Aplicação', 13: 'Função 6 Aplicação',
    14: 'Função 7 Aplicação', 15: 'Função 8 Aplicação', 16: 'Fback 1 do PIDInt', 17: 'Fback 2 do PIDInt', 18: 'Fback do PIDExt' };
  const SIN_AI = { 0: '0 a 10 V / 20 mA', 1: '4 a 20 mA', 2: '10 V / 20 mA a 0', 3: '20 a 4 mA' };
  const FN_AO = { 0: 'Ref. Veloc.', 1: 'Sem Função', 2: 'Veloc. Real', 3: 'Ref. Cor. Torque', 4: 'Corr. Torque', 5: 'Corrente Saída', 6: 'Var. Processo', 7: 'Corrente Ativa',
    8: 'Potência de Saída', 9: 'Setpoint PID', 10: 'Corrente de Torque > 0', 11: 'Torque Motor', 12: 'SoftPLC', 13: 'Sem Função', 14: 'Sem Função', 15: 'Sem Função',
    16: 'Ixt Motor', 17: 'Sem Função', 18: 'Conteúdo P0696', 19: 'Conteúdo P0697', 20: 'Conteúdo P0698', 21: 'Função 1 Aplicação', 22: 'Função 2 Aplicação',
    23: 'Função 3 Aplicação', 24: 'Função 4 Aplicação', 25: 'Função 5 Aplicação', 26: 'Função 6 Aplicação', 27: 'Função 7 Aplicação', 28: 'Função 8 Aplicação', 29: 'Saída do PIDExt' };
  const SIN_AO = { 0: '0 a 10 V', 1: '0 a 20 mA', 2: '4 a 20 mA', 3: '10 a 0 V', 4: '20 a 0 mA', 5: '20 a 4 mA' };
  const FN_DI = { 0: 'Sem Função', 1: 'Gira/Para', 2: 'Habilita Geral', 3: 'Parada Rápida', 4: 'Avanço', 5: 'Retorno', 6: 'Start', 7: 'Stop', 8: 'Sentido de Giro Horário',
    9: 'LOC/REM', 10: 'JOG', 11: 'Acelera E.P.', 12: 'Desacelera E.P.', 13: 'Multispeed', 14: '2ª Rampa', 15: 'Sem Função', 16: 'Sem Função', 17: 'Sem Função',
    18: 'Sem Alarme Ext.', 19: 'Sem Falha Ext.', 20: 'Reset', 21: 'SoftPLC', 22: 'Man./Auto PID', 23: 'Sem Função', 24: 'Desab. Flying Start', 25: 'Regul. Link DC',
    26: 'Bloqueia Prog.', 27: 'Carrega Usuário 1', 28: 'Carrega Usuário 2', 29: 'PTC', 30: 'Sem Função', 31: 'Sem Função', 32: 'Multispeed 2ª Rampa',
    33: 'Ac. E.P. 2ª Rampa', 34: 'De. E.P. 2ª Rampa', 35: 'Avanço 2ª Rampa', 36: 'Retorno 2ª Rampa', 37: 'Liga / Ac. E.P.', 38: 'De. E.P. / Desl.',
    39: 'Função 1 Aplicação', 40: 'Função 2 Aplicação', 41: 'Função 3 Aplicação', 42: 'Função 4 Aplicação', 43: 'Função 5 Aplicação', 44: 'Função 6 Aplicação',
    45: 'Função 7 Aplicação', 46: 'Função 8 Aplicação', 47: 'Auto/Man. PIDInt', 48: 'Auto/Man. PIDExt', 49: 'Sem Função', 50: 'Fire Mode', 51: 'Gira/Para On-Lock',
    52: 'Avanço On-Lock', 53: 'Retorno On-Lock' };
  const FN_DO = { 0: 'Sem Função', 1: 'F* > Fx', 2: 'F > Fx', 3: 'F < Fx', 4: 'F = F*', 5: 'Sem Função', 6: 'Is > Ix', 7: 'Is < Ix', 8: 'Torque > Tx', 9: 'Torque < Tx',
    10: 'Remoto', 11: 'Run', 12: 'Ready', 13: 'Sem Falha', 14: 'Sem F0070', 15: 'Sem Função', 16: 'Sem F0021/22', 17: 'Sem Função', 18: 'Sem F0072', 19: '4-20 mA OK',
    20: 'Conteúdo P0695', 21: 'Sent. Horário', 22: 'V. Proc. > VPx', 23: 'V. Proc. < VPx', 24: 'Ride-Through', 25: 'Pré-Carga OK', 26: 'Com Falha', 27: 'Sem Função',
    28: 'SoftPLC', 35: 'Sem Alarme', 36: 'Sem Falha/Alarme', 37: 'Função 1 Aplicação', 38: 'Função 2 Aplicação', 39: 'Função 3 Aplicação', 40: 'Função 4 Aplicação',
    41: 'Função 5 Aplicação', 42: 'Função 6 Aplicação', 43: 'Função 7 Aplicação', 44: 'Função 8 Aplicação', 45: 'F/A Bomba Seca', 46: 'F/A Correia Partida',
    47: 'F/A Man. do Filtro', 48: 'MP Modo Dormir', 51: 'Fire Mode', 52: 'Sentido anti-horário' };
  const UNID = { 0: 'Nenhuma', 1: 'V', 2: 'A', 3: 'rpm', 4: 's', 5: 'ms', 6: 'N', 7: 'm', 8: 'Nm', 9: 'mA', 10: '%', 11: '°C', 12: 'CV', 13: 'Hz', 14: 'HP', 15: 'h',
    16: 'W', 17: 'kW', 18: 'kWh', 19: 'H', 20: 'P0510', 21: 'P0512', 22: 'P0514', 23: 'P0516', 24: 'min', 25: '°F', 26: 'bar', 27: 'mbar', 28: 'psi', 29: 'Pa',
    30: 'kPa', 31: 'MPa', 32: 'mwc', 33: 'mca', 34: 'gal', 35: 'l', 36: 'in', 37: 'ft', 38: 'm3', 39: 'ft3', 40: 'gal/s', 41: 'gal/min', 42: 'gal/h', 43: 'l/s',
    44: 'l/min', 45: 'l/h', 46: 'm/s', 47: 'm/min', 48: 'm/h', 49: 'ft/s', 50: 'ft/min', 51: 'ft/h', 52: 'm3/s', 53: 'm3/min', 54: 'm3/h', 55: 'ft3/s',
    56: 'ft3/min', 57: 'ft3/h', 58: 'K' };
  const PONTO = { 0: 'wxyz', 1: 'wxy.z', 2: 'wx.yz', 3: 'w.xyz' };
  const POT_HP = ['0,16', '0,25', '0,33', '0,50', '0,75', '1,00', '1,50', '2,00', '3,00', '4,00', '5,00', '5,50', '6,00', '7,50', '10,00', '12,50', '15,00', '20,00',
    '25,00', '30,00', '40,00', '50,00', '60,00', '75,00', '100,00', '125,00', '150,00', '175,00'];
  const POT_KW = ['0,12', '0,19', '0,25', '0,37', '0,55', '0,75', '1,10', '1,50', '2,20', '3,00', '3,70', '4,00', '4,50', '5,50', '7,50', '9,00', '11,00', '15,00',
    '18,50', '22,00', '30,00', '37,00', '45,00', '55,00', '75,00', '93,75', '112,50', '131,25'];
  const OPC = {
    6: { 0: 'Ready (Pronto)', 1: 'Run (Execução)', 2: 'Subtensão', 3: 'Falha', 4: 'Autoajuste', 5: 'Configuração', 6: 'Frenagem CC', 7: 'STO', 8: 'Fire Mode', 9: 'Reservado', 10: 'Modo dormir' },
    27: { 0: 'Sem Plug-in', 1: 'CFW500-IOS', 2: 'CFW500-IOD', 3: 'CFW500-IOAD', 4: 'CFW500-IOR', 5: 'CFW500-CUSB', 6: 'CFW500-CCAN', 7: 'CFW500-CRS232', 8: 'CFW500-CPDP',
      9: 'CFW500-CRS485', 10: 'CFW500-ENC', 11: 'CFW500-CETH-IP / CEMB-TCP / CEPN-IO', 12: 'CFW500-ENC2', 13: 'CFW500-IOSP', 14: 'CFW500-ENC1', 15: 'CFW500-CRS485P',
      16: 'CFW500-CETH2', 17: 'CFW500-IORP' },
    28: { 0: 'Conector Jumper STO', 1: 'CFW500-SFY2' },
    29: { 0: 'Não Identificado', 1: '200-240 V / 1,6 A', 2: '200-240 V / 2,6 A', 3: '200-240 V / 4,3 A', 4: '200-240 V / 7,0 A', 5: '200-240 V / 9,6 A', 9: '380-480 V / 4,3 A' },
    104: { 0: 'Inativa', 1: 'Ativa' },
    105: { 0: '1ª Rampa', 1: '2ª Rampa', 2: 'DIx', 3: 'Serial/USB', 4: 'Reservado', 5: 'CO/DN/PB/Eth', 6: 'SoftPLC' },
    120: { 0: 'Inativo', 1: 'Ativo', 2: 'Backup por P0121' },
    148: { 0: 'V/f padrão', 1: 'Soft-Starter (tensão)' },
    150: { 0: 'Hold_Ud e Desac_LC', 1: 'Acel_Ud e Desac_LC', 2: 'Hold_Ud e Hold_LC', 3: 'Acel_Ud e Hold_LC' },
    181: { 0: 'Habilita Geral', 1: 'Gira/Para' }, 184: { 0: 'Com Perdas', 1: 'Sem Perdas', 2: 'Hab./Desab. DIx' },
    193: { 0: 'Domingo', 1: 'Segunda-feira', 2: 'Terça-feira', 3: 'Quarta-feira', 4: 'Quinta-feira', 5: 'Sexta-feira', 6: 'Sábado' },
    200: { 0: 'Inativa', 1: 'Ativa' }, 201: { 0: 'Português', 1: 'Inglês', 2: 'Espanhol' },
    202: { 0: 'V/f', 1: 'Sem Função', 2: 'Sem Função', 3: 'Sensorless', 4: 'Controle Vetorial com Sensor', 5: 'VVW', 6: 'Sem Função', 7: 'Sem Função', 8: 'VVW PM', 9: 'Reservado', 10: 'VVW HSRM' },
    203: { 0: 'Nenhuma', 1: 'PID via AI1', 2: 'PID via AI3', 3: 'PID via FI' },
    204: { 0: 'Sem Função', 1: 'Sem Função', 2: 'Sem Função', 3: 'Reset P0043', 4: 'Reset P0044', 5: 'Carrega WEG 60 Hz', 6: 'Carrega WEG 50 Hz', 7: 'Carr. Usuário 1',
      8: 'Carr. Usuário 2', 9: 'Salva Usuário 1', 10: 'Salva Usuário 2', 11: 'Carrega Padrão SoftPLC', 12: 'Reservado', 13: 'Reservado', 14: 'Reservado', 15: 'Reservado' },
    209: UNID, 210: PONTO, 215: { 0: 'Segmentada', 1: 'Alfanumérica' }, 216: { 0: 'Desliga', 1: 'Liga' },
    220: { 0: 'Sempre Local', 1: 'Sempre Remoto', 2: 'Tecla HMI (LOC)', 3: 'Tecla HMI (REM)', 4: 'Entrada Digital (DIx)', 5: 'Serial/USB (LOC)', 6: 'Serial/USB (REM)',
      7: 'Sem Função', 8: 'Sem Função', 9: 'CO/DN/PB/Eth (LOC)', 10: 'CO/DN/PB/Eth (REM)', 11: 'SoftPLC' },
    221: FN_REF, 222: FN_REF, 223: FN_GIRO, 226: FN_GIRO, 224: FN_GP, 227: FN_GP, 225: FN_JOG, 228: FN_JOG,
    229: { 0: 'Por Rampa', 1: 'Por Inércia', 2: 'Parada Rápida' }, 230: { 0: 'Inativa', 1: 'Ativa' },
    231: FN_AI, 236: FN_AI, 241: FN_AI, 233: SIN_AI, 238: SIN_AI, 243: Object.assign({ 4: '-10 a +10 V' }, SIN_AI),
    246: { 0: 'Inativa', 1: 'Ativa', 2: 'DI2 Conta Pulso' },
    251: FN_AO, 254: FN_AO, 257: FN_AO, 253: SIN_AO, 256: SIN_AO,
    263: FN_DI, 264: FN_DI, 265: FN_DI, 266: FN_DI, 267: FN_DI, 268: FN_DI, 269: FN_DI, 270: FN_DI,
    271: { 0: '(DI1...DI8) NPN', 1: '(DI1) PNP', 2: '(DI1..DI2) PNP', 3: '(DI1..DI3) PNP', 4: '(DI1..DI4) PNP', 5: '(DI1..DI5) PNP', 6: '(DI1..DI6) PNP', 7: '(DI1..DI7) PNP', 8: '(DI1..DI8) PNP' },
    275: FN_DO, 276: FN_DO, 277: FN_DO, 278: FN_DO, 279: FN_DO,
    296: { 0: '200 - 240 V', 1: '380 V', 2: '400 - 415 V', 3: '440 - 460 V', 4: '480 V', 5: '500 - 525 V', 6: '550 - 575 V', 7: '600 V' },
    298: { 0: 'Uso Normal (ND)', 1: 'Uso Pesado (HD)' },
    310: { 0: '9600 bits/s', 1: '19200 bits/s', 2: '38400 bits/s' },
    311: { 0: '8 bits, sem, 1', 1: '8 bits, par, 1', 2: '8 bits, ímp, 1', 3: '8 bits, sem, 2', 4: '8 bits, par, 2', 5: '8 bits, ímp, 2' },
    312: { 0: 'HMIR (1)', 1: 'SymbiNet (1)', 2: 'Modbus RTU (1)', 3: 'BACnet (1)', 4: 'Reservado', 5: 'Mestre RTU (1)', 6: 'HMIR (1) + Modbus RTU (2)', 7: 'Modbus RTU (2)',
      8: 'HMI (1) + BACnet (2)', 9: 'BACnet (2)', 12: 'HMI (1) / RTU Mestre (2)', 13: 'RTU Master (2)', 14: 'HMI (1) / SymbiNet (2)', 15: 'SymbiNet (2)' },
    313: { 0: 'Inativo', 1: 'Para por Rampa', 2: 'Desab. Geral', 3: 'Vai para LOC', 4: 'LOC Mantém Hab.', 5: 'Causa Falha' },
    317: { 0: 'Não', 1: 'Sim' }, 320: { 0: 'Inativas', 1: 'Flying Start (FS)', 2: 'FS / RT', 3: 'Ride-Through (RT)' },
    345: { 0: 'Inativo', 1: 'Ativo' },
    352: { 0: 'Sempre desligado', 1: 'Sempre ligado', 2: 'Controle 60 °C', 3: 'Controle 70 °C', 4: 'Controle 60 °C RUN', 5: 'Controle 70 °C RUN', 6: 'Controle RUN+60 s' },
    404: Object.fromEntries(POT_HP.map((h, i) => [i, `${h} HP (${POT_KW[i]} kW)`])),
    406: { 0: 'Autoventilado', 1: 'Independente' },
    408: { 0: 'Não', 1: 'Sem Girar', 2: 'Girar para Im', 3: 'Girar para Tm', 4: 'Estimar Tm' },
    510: UNID, 512: UNID, 514: UNID, 516: UNID, 511: PONTO, 513: PONTO, 515: PONTO, 517: PONTO, 527: { 0: 'Direto', 1: 'Reverso' },
    580: { 0: 'Inativo', 1: 'Ativo', 2: 'Ativo / P0134', 3: 'Ativo / P0581', 4: 'Ativo / Desab. Geral' },
    700: { 1: 'CANopen', 2: 'DeviceNet', 3: 'Reservado' }, 810: { 0: 'Parâmetros', 1: 'DHCP', 2: 'DCP' },
    1000: { 0: 'Sem Aplicativo', 1: 'Instal. Aplic.', 2: 'Aplic. Incomp.', 3: 'Aplic. Parado', 4: 'Aplic. Rodando' },
  };
  LISTA.forEach((p) => { if (OPC[p.n]) p.opc = OPC[p.n]; });

  // ---------------------------------------------------------------- falhas e alarmes (capítulo 0 do manual), só os que a bancada pode gerar
  const FALHAS = {
    21: ['Subtensão no Link DC', 'Tensão de alimentação baixa ou falta de fase na entrada (Ud < 200 Vcc em 200-240 Vca).'],
    22: ['Sobretensão no Link DC', 'Inércia de carga muito alta ou rampa de desaceleração muito rápida (Ud > 410 Vcc em 200-240 Vca).'],
    33: ['Falha no Autoajuste', 'Erro nas conexões do motor: verifique a caixa de ligações e os bornes U, V e W.'],
    48: ['Sobrecarga nos IGBTs', 'Corrente alta na saída do inversor.'],
    51: ['Sobretemperatura nos IGBTs', 'Temperatura ambiente alta e corrente de saída elevada, ventilador bloqueado.'],
    70: ['Sobrecorrente/Curto-circuito', 'Curto-circuito entre duas fases do motor, rampa de aceleração muito curta ou partida com o motor girando sem Flying Start.'],
    72: ['Sobrecarga no Motor', 'Ajuste de P0156, P0157 e P0158 baixo para o motor ou carga no eixo muito alta (60 s em 1,5 x P0401).'],
    74: ['Falta à Terra', 'Curto para o terra em uma ou mais fases de saída.'],
    76: ['Erro de Conexão no Motor', 'Motor com falta de fase, desconectado ou com correntes desequilibradas.'],
    79: ['Falha Sinais Encoder', 'Controle vetorial com sensor (P0202 = 4) sem módulo de encoder.'],
    91: ['Falha Externa', 'Fiação da DIx programada para "Sem Falha Ext." aberta ou com mau contato.'],
  };
  const ALARMES = {
    46: ['Carga Alta no Motor', 'Ajuste de P0156, P0157 e P0158 baixo para o motor ou carga no eixo alta.'],
    47: ['Carga Alta nos IGBTs', 'Corrente alta na saída do inversor.'],
    50: ['Temperatura Elevada no Módulo de Potência', 'Temperatura ambiente alta e corrente de saída elevada.'],
    90: ['Alarme Externo', 'Fiação da DIx programada para "Sem Alarme Ext." aberta ou com mau contato.'],
    163: ['Falha Sinal AIx 4..20 mA', 'Sinal de corrente na entrada analógica interrompido ou abaixo de 2 mA.'],
  };
  const CONFIG = {
    1: 'Duas ou mais DIx programadas para Avanço (4)', 2: 'Duas ou mais DIx programadas para Retorno (5)', 3: 'Duas ou mais DIx programadas para Start (6)',
    4: 'Duas ou mais DIx programadas para Stop (7)', 5: 'Duas ou mais DIx para Sentido de Giro (8), ou Sentido de Giro junto com Avanço/Retorno',
    6: 'Duas ou mais DIx programadas para LOC/REM (9)', 7: 'Duas ou mais DIx programadas para Acelera E.P. (11)', 8: 'Duas ou mais DIx programadas para Desacelera E.P. (12)',
    9: 'Duas ou mais DIx programadas para 2ª Rampa (14)', 12: 'Duas ou mais DIx programadas para Bloqueia Programação (26)',
    13: 'Duas ou mais DIx programadas para Carrega Usuário 1 (27)', 14: 'Duas ou mais DIx programadas para Carrega Usuário 2 (28)',
    15: 'DIx programada para Avanço (4) sem DIx para Retorno (5), ou o inverso', 16: 'DIx programada para Start (6) sem DIx para Stop (7), ou o inverso',
    17: 'Referência programada para Multispeed (8) sem DIx para Multispeed (13), ou o inverso',
    18: 'Referência programada para E.P. (7) sem DIx para Acelera E.P. (11), ou o inverso',
    19: 'Gira/Para programado para DIx (1) sem DIx para Gira/Para, Habilita Geral, Parada Rápida, Avanço ou Start',
    20: 'DI2 (P0264) programada para PTC (29)', 21: 'P0203 em PID via AI1 e referência programada para AI1',
    25: 'Referência programada para AI2 ou AI3 e o módulo plug-in não tem AI2 e AI3', 27: 'Má configuração da curva V/f (P0142 a P0147)',
    28: 'Autoajuste em andamento (P0408)', 30: 'Start-Up Orientado está ativo', 31: 'Controle vetorial ativo com P0409 a P0413 em zero',
    32: 'Duas ou mais DIx para o mesmo bit de Multispeed: MS2 (DI1, DI2), MS1 (DI3) ou MS0 (DI4)',
    33: 'Rampa S (P0104) com referência por entrada analógica', 37: 'Controle VVW PM e VVW HSRM não disponível na mecânica A IP20',
    40: 'Duas ou mais DIx programadas para JOG (10)',
  };

  /** Texto de um valor como a HMI/planilha mostram (com casas e unidade). */
  function fmt(n, v, comUn) {
    const p = MAPA[n]; if (!p) return String(v);
    if (p.hex) return (v & 0xffff).toString(16).toUpperCase().padStart(4, '0') + 'h';
    const s = Number(v).toFixed(p.dec).replace('.', ',');
    return comUn && p.un ? `${s} ${p.un}` : s;
  }
  const nomeP = (n) => 'P' + String(n).padStart(4, '0');

  SIM.params = { LISTA, MAPA, OPC, FALHAS, ALARMES, CONFIG, GRUPO, INOM, fmt, nomeP, MENUS: ['PARAM', 'READ', 'MODIF', 'BASIC', 'MOTOR', 'I/O', 'NET', 'HMI', 'SPLC', 'STARTUP'] };
  if (typeof module !== 'undefined') module.exports = SIM;
})(typeof globalThis !== 'undefined' ? globalThis : this);
