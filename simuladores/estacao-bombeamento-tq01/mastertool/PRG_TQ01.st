(* =====================================================================================
   PRG_TQ01 — bomba B-01 com intertravamentos, escalonamento do canal analógico de entrada (LT-01)
   e de saída (referência do inversor), IHM e heartbeat. Usa só os nomes da tabela (GVL_SIM).
   Chame na MainTask.
   Canal analógico como no hardware:
     entrada  LT01_Bruto : 0..32767 = 4..20 mA = 0..3,5 m   (negativo abaixo de 4 mA)
     saída    Ref_Bruto  : 0..32767 = 0..10 V  = 0..60 Hz
   IHM: IHM_Velocidade em % (0–100), IHM_Setpoint e IHM_Nivel em cm (200 = 2,00 m).
   Manual: a bomba roda na velocidade pedida na IHM.
   Automático: liga a 75 % abaixo de (setpoint − 0,5 m) e para acima de (setpoint + 0,5 m).
   ===================================================================================== *)
PROGRAM PRG_TQ01
VAR
    rNivel      : REAL;    (* nível do tanque em metros (escalonado do LT01_Bruto) *)
    rVelIHM     : REAL;    (* velocidade pedida na IHM, % *)
    rSetpoint   : REAL;    (* setpoint de nível da IHM, m *)
    rRefPct     : REAL;    (* referência que vai para o inversor, % *)
    rtLiga      : R_TRIG;
    xLigado     : BOOL;
    xFalha      : BOOL;
    xCondicao   : BOOL;
    xEnche      : BOOL;
    xFioRompido : BOOL;
    tonSimFora  : TON;
    uiHBAnt     : UINT;
    tonHB       : TON;
END_VAR

(* 1. Entrada analógica: escalonamento da contagem do A/D para metros *)
rNivel      := INT_TO_REAL(GVL_SIM.LT01_Bruto) / 32767.0 * 3.5;   (* 0..32767 = 0..3,5 m *)
xFioRompido := GVL_SIM.LT01_Bruto < -410;                          (* abaixo de 3,8 mA *)

(* IHM: velocidade já vem em %; setpoint vem em cm *)
rVelIHM   := LIMIT(0.0, INT_TO_REAL(GVL_SIM.IHM_Velocidade), 100.0);
rSetpoint := LIMIT(0.0, INT_TO_REAL(GVL_SIM.IHM_Setpoint) / 100.0, 3.0);      (* cm -> m *)

(* 2. Watchdog: HB_Sim parado por 3 s = simulador fora *)
tonSimFora(IN := (GVL_SIM.HB_Sim = uiHBAnt), PT := T#3S);
uiHBAnt := GVL_SIM.HB_Sim;

(* 3. Intertravamentos (S2 e S0 são NF: 1 em repouso) *)
xCondicao := GVL_SIM.S2_Desliga_NF AND GVL_SIM.S0_Emerg_NF AND GVL_SIM.Inv_OK
         AND NOT GVL_SIM.LSHH AND NOT xFioRompido AND NOT tonSimFora.Q;

IF GVL_SIM.S3_Reset THEN
    xFalha := FALSE;
END_IF
IF NOT xCondicao THEN
    IF xLigado THEN
        xFalha := TRUE;
    END_IF
    xLigado := FALSE;
END_IF
rtLiga(CLK := GVL_SIM.S1_Liga);
IF rtLiga.Q AND xCondicao AND NOT xFalha THEN
    xLigado := TRUE;
END_IF

(* 4. Manual x automático *)
IF GVL_SIM.S4_Auto THEN
    IF rNivel < rSetpoint - 0.5 THEN
        xEnche := TRUE;
    ELSIF rNivel > rSetpoint + 0.5 THEN
        xEnche := FALSE;
    END_IF
    GVL_SIM.Inv_Gira := xLigado AND xEnche;
    rRefPct := 75.0;
ELSE
    xEnche := FALSE;
    GVL_SIM.Inv_Gira := xLigado;
    rRefPct := rVelIHM;
END_IF
IF NOT GVL_SIM.Inv_Gira THEN
    rRefPct := 0.0;
END_IF

(* 5. Saída analógica: escalonamento de % para a contagem do D/A (0..32767 = 0..10 V) *)
GVL_SIM.Ref_Bruto := REAL_TO_INT(rRefPct / 100.0 * 32767.0);

(* 6. Sinalização, reset do inversor e IHM *)
GVL_SIM.H1 := GVL_SIM.Inv_Rodando;
GVL_SIM.H2 := rNivel > 2.6 OR rNivel < 0.5 OR GVL_SIM.LSHH OR GVL_SIM.LSLL;
GVL_SIM.H3 := xFalha;
GVL_SIM.H4 := xFalha AND NOT GVL_SIM.S3_Reset;
GVL_SIM.Inv_Reset := GVL_SIM.S3_Reset;
GVL_SIM.IHM_Nivel := REAL_TO_INT(rNivel * 100.0);                (* m -> cm *)

(* 7. Heartbeat do CLP: +1 a cada 500 ms *)
tonHB(IN := NOT tonHB.Q, PT := T#500MS);
IF tonHB.Q THEN
    GVL_SIM.HB_CLP := GVL_SIM.HB_CLP + 1;
END_IF
