(* =====================================================================================
   GVL_SIMULADOR — Estação TQ-01 · CODESYS como servidor Modbus TCP (Modbus TCP Slave Device)
   Gerada da tabela "Variáveis e endereços" do simulador: as mesmas 22 variáveis, com o mesmo nome,
   tipo, endereço e significado. SEM AT: ligue cada uma ao seu canal pela coluna "Variable" da aba de mapeamento
   (botão "...", Application.GVL_SIMULADOR.<nome>). Não use AT junto com o mapeamento.
   O comentário de cada variável é o texto da coluna "Significado" da tabela.

   Canal analógico como no hardware: LT01_Bruto é a contagem do A/D (0..32767 = 4..20 mA) e Ref_Bruto é a
   contagem do D/A (0..32767 = 0..10 V); o escalonamento é feito no seu programa.
   IHM: velocidade em % inteiro (75 = 75 %); setpoint e nível em centímetros (200 = 2,00 m).

   Configure o Modbus TCP Slave Device assim (aba de configuração):
       porta 502 · Unit ID 1 · Holding registers 4 · Input registers 3 · Coils 9 · Discrete inputs 6
   Com isso o CODESYS coloca, na aba "Modbus TCP Slave Device I/O Mapping":
       Holding Registers em %IW0 · Coils em %IB8 (%IX8.0…) · Input Registers em %QW0 · Discrete Inputs em %QB6 (%QX6.0…)
   Se algum endereço inicial for diferente no seu projeto, ajuste os AT abaixo (ou mude as quantidades acima).
   ===================================================================================== *)
VAR_GLOBAL
    (* ================= Simulador → CLP (o simulador escreve, o CLP lê) ================= *)
    S1_Liga                   : BOOL;   (* Botoeira S1 liga (NA): 1 enquanto pressionada *)
    S2_Desliga_NF             : BOOL;   (* Botoeira S2 desliga (NF): 1 em repouso, 0 pressionada *)
    S3_Reset                  : BOOL;   (* Botoeira S3 reset (NA) *)
    S4_Auto                   : BOOL;   (* Seletor S4: 1 = automático, 0 = manual *)
    S0_Emerg_NF               : BOOL;   (* Emergência S0 (NF): 1 destravado, 0 acionado *)
    Inv_Rodando               : BOOL;   (* Relé DO2 do CFW500 (F > Fx): inversor acima de 3 Hz *)
    Inv_OK                    : BOOL;   (* Relé DO1 do CFW500 (sem falha): 0 = falha ou sem alimentação *)
    LSHH                      : BOOL;   (* Chave de nível muito alto LSHH-01 (2,8 m) *)
    LSLL                      : BOOL;   (* Chave de nível muito baixo LSLL-01 (0,3 m) *)
    LT01_Bruto                : INT;    (* Nível LT-01, contagem do A/D: 0–32767 = 4–20 mA = 0–3,5 m (negativo abaixo de 4 mA) *)
    HB_Sim                    : UINT;   (* Heartbeat do simulador: +1 por segundo *)
    IHM_Velocidade            : INT;    (* IHM: velocidade da bomba pedida pelo operador, em % (0–100) *)
    IHM_Setpoint              : INT;    (* IHM: setpoint de nível para o automático, em cm (0–300; 200 = 2,00 m) *)

    (* ================= CLP → simulador (o CLP escreve, o simulador lê) ================= *)
    H1                        : BOOL;   (* Sinaleiro verde — em operação *)
    H2                        : BOOL;   (* Sinaleiro amarelo — alarme *)
    H3                        : BOOL;   (* Sinaleiro vermelho — falha *)
    H4                        : BOOL;   (* Sirene *)
    Inv_Gira                  : BOOL;   (* DI1 do CFW500: gira/para (em série com o 2º NF do S0) *)
    Inv_Reset                 : BOOL;   (* DI3 do CFW500: reset de falha (borda de subida) *)
    Ref_Bruto                 : INT;    (* Referência de velocidade, contagem do D/A: 0–32767 = 0–10 V = 0–60 Hz *)
    HB_CLP                    : UINT;   (* Heartbeat do CLP: +1 a cada 0,5 s *)
    IHM_Nivel                 : INT;    (* Nível que o CLP manda a IHM mostrar, em cm (152 = 1,52 m) *)
    (* ================= Variáveis internas do CLP (não vão para a rede) ================= *)
    IHM_Nivel_Real            : REAL;   (* Nível do tanque em metros (IHM_Nivel / 100) *)
    IHM_Nivel_SP_Real         : REAL;   (* Nível que o operador envia através da IHM, neste caso já convertido *)
    IHM_Nivel_SP_Liga         : REAL;   (* Liga a bomba abaixo deste nível (SP − histerese) *)
    IHM_Nivel_SP_Desl         : REAL;   (* Desliga a bomba acima deste nível (SP + histerese) *)
END_VAR
