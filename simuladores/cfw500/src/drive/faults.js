/**
 * Falhas (Fxxxx) e Alarmes (Axxxx) simulados — textos resumidos da
 * "Referência Rápida dos Parâmetros, Alarmes e Falhas" do manual de
 * programação e do capítulo 10 do manual Ethernet.
 *
 *  FALHA  -> bloqueia os IGBTs, motor para por inércia, exige reset.
 *  ALARME -> apenas aviso; some sozinho quando a causa desaparece.
 */
'use strict';

const FALHAS = {
  21: { nome: 'Subtensão no Barramento CC', causa: 'Ud abaixo de 360 Vcc (rede 380-480 V). Tensão de rede baixa ou falta de fase.' },
  22: { nome: 'Sobretensão no Barramento CC', causa: 'Ud acima de 810 Vcc. Rampa de desaceleração muito curta ou inércia alta.' },
  31: { nome: 'Falha de Comunicação com Módulo Plug-in', causa: 'Módulo plug-in mal conectado ou danificado.' },
  48: { nome: 'Sobrecarga nos IGBTs', causa: 'Corrente de saída muito alta (> 1,5 x P0295) por tempo prolongado.' },
  51: { nome: 'Sobretemperatura nos IGBTs', causa: 'Temperatura do módulo de potência elevada.' },
  70: { nome: 'Sobrecorrente/Curto-circuito', causa: 'Curto entre fases, rampa muito curta ou partida com motor girando sem Flying Start.' },
  72: { nome: 'Sobrecarga no Motor', causa: 'Ixt do motor chegou a 100 %. Carga no eixo muito alta (esteira travada/sobrecarregada).' },
  74: { nome: 'Falta à Terra', causa: 'Curto para o terra em uma das fases de saída.' },
  76: { nome: 'Erro de Conexão no Motor', causa: 'Motor com falta de fase ou desconectado (habilitada por P0343 bit 4).' },
  91: { nome: 'Falha Externa', causa: 'DIx programada para "Sem Falha Ext." (19) está inativa.' },
  248: { nome: 'Erro de Acesso à Interface Ethernet', causa: 'Falha na troca de dados entre o inversor e o acessório Ethernet.' },
  249: { nome: 'Ethernet Offline', causa: 'Timeout na conexão de I/O EtherNet/IP ou mestre em IDLE (P0313 = 5).' },
};

const ALARMES = {
  46: { nome: 'Carga Alta no Motor', causa: 'P0037 (Ixt) acima do nível P0349.' },
  47: { nome: 'Carga Alta nos IGBTs', causa: 'Sobrecarga dos IGBTs acima do nível P0349.' },
  50: { nome: 'Temperatura Elevada no Módulo de Potência', causa: 'NTC do módulo de potência com temperatura alta.' },
  90: { nome: 'Alarme Externo', causa: 'DIx programada para "Sem Alarme Ext." (18) está inativa.' },
  148: { nome: 'Erro de Acesso à Interface Ethernet', causa: 'Falha na troca de dados entre o inversor e o acessório Ethernet.' },
  149: { nome: 'Ethernet Offline', causa: 'Timeout na conexão de I/O EtherNet/IP, mestre em IDLE ou timeout Modbus TCP (P0806).' },
  163: { nome: 'Falha Sinal AIx 4..20 mA', causa: 'Sinal de corrente da AIx abaixo de 2 mA.' },
};

module.exports = { FALHAS, ALARMES };
