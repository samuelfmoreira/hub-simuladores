(* PRG_Modbus_IO — copia cada endereço do "Modbus TCP Slave Device" para a variável de mesmo nome da GVL_SIM, e de volta.
   Uma linha por sinal, na ordem da tabela da aba CLP. Chame no início da MainTask, antes do seu programa.
   Se o CODESYS mapear o dispositivo a partir de outro endereço (por exemplo %IW100), some esse início a todos os
   %IW/%QW (e o equivalente nos %QX). Confira os endereços na aba "Modbus TCP Slave Device I/O Mapping". *)
PROGRAM PRG_Modbus_IO

(* ===== entrada: holding register que o simulador escreve ===== *)
GVL_SIM.LT01_Bruto := WORD_TO_INT(%IW0);                       (* holding 0 *)

(* ===== retorno opcional: só é preciso com "Sinaleiros no painel (retorno do CLP)" ligado no simulador ===== *)
%QX0.0 := GVL_SIM.LALL_01;            (* discrete 0 *)
%QX0.1 := GVL_SIM.LAL_01;             (* discrete 1 *)
%QX0.2 := GVL_SIM.LAH_01;             (* discrete 2 *)
%QX0.3 := GVL_SIM.LAHH_01;            (* discrete 3 *)
%QX0.4 := GVL_SIM.Falha_LT01;         (* discrete 4 *)
%QW0 := INT_TO_WORD(REAL_TO_INT(GVL_SIM.Nivel_Pct * 100.0));   (* input 0, % x 100 *)
