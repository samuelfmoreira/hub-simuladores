(* =====================================================================
   GVL_TBEN - imagem de processo do TBEN-L-SIM (slot = porta + 1, subslot 1)
   Mapeie cada variável na aba de mapeamento de I/O do módulo
   correspondente (coluna Variável).
   Valores de 16 bits chegam em big-endian; veja xTrocarBytes abaixo.
   ===================================================================== *)
VAR_GLOBAL
    (* Se a distância do laser aparecer absurda (ex.: 800 mm virando 8195),
       a sua versão não converte a ordem dos bytes: mude para TRUE. *)
    xTrocarBytes   : BOOL := FALSE;

    (* X0 C1 - esteira de entrada (controlador MDR) *)
    X0_In_Status   : BYTE;  (* .0 rodando  .1 falha *)
    X0_In_Speed    : BYTE;  (* velocidade atual % *)
    X0_PQI         : BYTE;  (* .7 PQ  .6 DevCom  .5 DevErr *)
    X0_Out_Ctrl    : BYTE;  (* .0 liga  .1 reverso  .2 reset *)
    X0_Out_Speed   : BYTE;  (* % *)

    (* X1 B1 - laser de altura da caixa (montado a 800 mm da esteira) *)
    X1_In_Dist     : WORD;  (* mm *)
    X1_In_Flags    : BYTE;  (* .0 medição válida  .1 SP1 *)
    X1_In_Quality  : BYTE;
    X1_PQI         : BYTE;

    (* X2 Y1 - terminal de válvulas do empurrador *)
    X2_In_Status   : BYTE;  (* .0 pressão OK  .1 falha de bobina *)
    X2_PQI         : BYTE;
    X2_Out_Valves  : BYTE;  (* .0 Y1 avançar  .1 Y2 recuar *)

    (* X3 K1 - hub de entradas *)
    X3_In_B0       : BYTE;  (* .0 recuado .1 avançado .2 elev. inferior .3 elev. superior
                               .4 pallet no elevador .5 pallet na saída .6 partir .7 parar (NF) *)
    X3_In_B1       : BYTE;  (* .0 rearmar  .1 emergência OK (NF) *)
    X3_PQI         : BYTE;

    (* X4 M1 - inversor do elevador *)
    X4_In_Status   : BYTE;  (* .0 pronto .1 em movimento .2 falha .3 freio liberado *)
    X4_In_Fault    : BYTE;  (* código de falha *)
    X4_In_Speed    : WORD;  (* mm/s *)
    X4_PQI         : BYTE;
    X4_Out_Ctrl    : BYTE;  (* .0 habilita .1 subir .2 descer .3 reset *)
    X4_Out_Res     : BYTE;  (* reservado *)
    X4_Out_Speed   : WORD;  (* mm/s, máx. 400 *)

    (* X5 B2 - laser de posição do elevador (altura = 2900 - distância) *)
    X5_In_Dist     : WORD;
    X5_In_Flags    : BYTE;
    X5_In_Quality  : BYTE;
    X5_PQI         : BYTE;

    (* X6 C2 - esteira de saída de pallets *)
    X6_In_Status   : BYTE;
    X6_In_Speed    : BYTE;
    X6_PQI         : BYTE;
    X6_Out_Ctrl    : BYTE;
    X6_Out_Speed   : BYTE;

    (* X7 H1 - torre sinaleira *)
    X7_PQI         : BYTE;
    X7_Out_Lamps   : BYTE;  (* .0 verde .1 amarelo .2 vermelho .3 sirene *)
END_VAR
