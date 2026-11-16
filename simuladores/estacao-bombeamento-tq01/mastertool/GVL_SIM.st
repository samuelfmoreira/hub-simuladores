(* =====================================================================================
   GVL_SIM — Estação TQ-01 · CODESYS como servidor Modbus TCP (Modbus TCP Slave Device)
   Gerada da tabela "Variáveis e endereços" do simulador: as mesmas 22 variáveis, com o mesmo nome,
   tipo, endereço e significado. Cada uma está presa ao seu endereço com AT: não há programa de cópia.
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
    S1_Liga        AT %IX8.0  : BOOL;   (* Botoeira S1 liga (NA): 1 enquanto pressionada *)
    S2_Desliga_NF  AT %IX8.1  : BOOL;   (* Botoeira S2 desliga (NF): 1 em repouso, 0 pressionada *)
    S3_Reset       AT %IX8.2  : BOOL;   (* Botoeira S3 reset (NA) *)
    S4_Auto        AT %IX8.3  : BOOL;   (* Seletor S4: 1 = automático, 0 = manual *)
    S0_Emerg_NF    AT %IX8.4  : BOOL;   (* Emergência S0 (NF): 1 destravado, 0 acionado *)
    Inv_Rodando    AT %IX8.5  : BOOL;   (* Relé DO2 do CFW500 (F > Fx): inversor acima de 3 Hz *)
    Inv_OK         AT %IX8.6  : BOOL;   (* Relé DO1 do CFW500 (sem falha): 0 = falha ou sem alimentação *)
    LSHH           AT %IX8.7  : BOOL;   (* Chave de nível muito alto LSHH-01 (2,8 m) *)
    LSLL           AT %IX9.0  : BOOL;   (* Chave de nível muito baixo LSLL-01 (0,3 m) *)
    LT01_Bruto     AT %IW0    : INT;    (* Nível LT-01, contagem do A/D: 0–32767 = 4–20 mA = 0–3,5 m (negativo abaixo de 4 mA) *)
    HB_Sim         AT %IW1    : UINT;   (* Heartbeat do simulador: +1 por segundo *)
    IHM_Velocidade AT %IW2    : INT;    (* IHM: velocidade da bomba pedida pelo operador, em % (0–100) *)
    IHM_Setpoint   AT %IW3    : INT;    (* IHM: setpoint de nível para o automático, em cm (0–300; 200 = 2,00 m) *)

    (* ================= CLP → simulador (o CLP escreve, o simulador lê) ================= *)
    H1             AT %QX6.0  : BOOL;   (* Sinaleiro verde — em operação *)
    H2             AT %QX6.1  : BOOL;   (* Sinaleiro amarelo — alarme *)
    H3             AT %QX6.2  : BOOL;   (* Sinaleiro vermelho — falha *)
    H4             AT %QX6.3  : BOOL;   (* Sirene *)
    Inv_Gira       AT %QX6.4  : BOOL;   (* DI1 do CFW500: gira/para (em série com o 2º NF do S0) *)
    Inv_Reset      AT %QX6.5  : BOOL;   (* DI3 do CFW500: reset de falha (borda de subida) *)
    Ref_Bruto      AT %QW0    : INT;    (* Referência de velocidade, contagem do D/A: 0–32767 = 0–10 V = 0–60 Hz *)
    HB_CLP         AT %QW1    : UINT;   (* Heartbeat do CLP: +1 a cada 0,5 s *)
    IHM_Nivel      AT %QW2    : INT;    (* Nível que o CLP manda a IHM mostrar, em cm (152 = 1,52 m) *)
END_VAR
