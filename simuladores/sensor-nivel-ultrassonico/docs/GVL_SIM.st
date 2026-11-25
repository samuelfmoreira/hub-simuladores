(* GVL_SIM — uma variável por sinal, sem vetores. Os nomes são os mesmos da aba CLP do simulador.
   O PRG_Modbus_IO copia o %IW do "Modbus TCP Slave Device" para cá.
   As variáveis do bloco "retorno" só são lidas pelo simulador se a opção "Sinaleiros no painel (retorno do CLP)" estiver
   ligada na sessão. Se você vai usar os alarmes só dentro do CLP, o mapa inteiro é uma variável: LT01_Bruto. *)
VAR_GLOBAL
    (* ===== o simulador escreve, o CLP lê ===== *)
    (* entrada analógica                     Modbus holding  CODESYS *)
    LT01_Bruto  : INT;                    (* holding 0      %IW0     0..32767 = 4..20 mA = 0..100 %; negativo abaixo de 4 mA *)

    (* ===== retorno opcional: o CLP escreve, o simulador lê ===== *)
    (* sinaleiros do painel                  Modbus discrete CODESYS *)
    LALL_01     : BOOL;                   (* discrete 0     %QX0.0   alarme de nível muito baixo (H1)                        *)
    LAL_01      : BOOL;                   (* discrete 1     %QX0.1   alarme de nível baixo (H2)                              *)
    LAH_01      : BOOL;                   (* discrete 2     %QX0.2   alarme de nível alto (H3)                               *)
    LAHH_01     : BOOL;                   (* discrete 3     %QX0.3   alarme de nível muito alto (H4)                         *)
    Falha_LT01  : BOOL;                   (* discrete 4     %QX0.4   falha do transmissor ou do laço 4-20 mA (H5)            *)
    (* valor para a IHM                      Modbus input    CODESYS *)
    Nivel_Pct   : REAL;                   (* input 0        %QW0     nível em %, calculado no CLP (Modbus: x 100)            *)
END_VAR
