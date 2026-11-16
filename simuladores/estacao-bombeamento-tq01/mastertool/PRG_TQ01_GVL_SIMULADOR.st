(* =====================================================================================
   PRG_TQ01 — Estação TQ-01, com a GVL_SIMULADOR. Equivale ao programa em Ladder da aula:
     · cálculos do canal analógico e da IHM (ST)
     · automático liga-desliga com HISTERESE de ± 10 cm, sem TON:
         liga  (SET)   quando IHM_Nivel_Real <= IHM_Nivel_SP_Liga  (SP − 0,10 m)
         desliga (RESET) quando IHM_Nivel_Real >= IHM_Nivel_SP_Desl (SP + 0,10 m)
         entre os dois, Inv_Gira fica como está
     · degrau de segurança: sai do automático, emergência ou LSHH -> RESET do Inv_Gira
   A velocidade da bomba é sempre a pedida na IHM (IHM_Velocidade).
   ===================================================================================== *)
PROGRAM PRG_TQ01
VAR
    tonHB : TON;    (* heartbeat do CLP *)
END_VAR

(* ---------- cálculos (canal analógico e IHM) ---------- *)
GVL_SIMULADOR.Ref_Bruto         := REAL_TO_INT(GVL_SIMULADOR.IHM_Velocidade / 100.0 * 32767.0);   (* % -> contagem do D/A *)
GVL_SIMULADOR.IHM_Nivel         := REAL_TO_INT((GVL_SIMULADOR.LT01_Bruto) / 32767.0 * 350);       (* contagem do A/D -> cm *)
GVL_SIMULADOR.IHM_Nivel_Real    := TO_REAL(GVL_SIMULADOR.IHM_Nivel) / 100.0;                      (* cm -> m *)
GVL_SIMULADOR.IHM_Nivel_SP_Real := LIMIT(0.5, INT_TO_REAL(GVL_SIMULADOR.IHM_Setpoint) / 100.0, 2.6); (* cm -> m, SP entre 0,5 e 2,6 m *)
GVL_SIMULADOR.IHM_Nivel_SP_Liga := GVL_SIMULADOR.IHM_Nivel_SP_Real - 0.10;                        (* histerese: liga 10 cm abaixo *)
GVL_SIMULADOR.IHM_Nivel_SP_Desl := GVL_SIMULADOR.IHM_Nivel_SP_Real + 0.10;                        (* histerese: desliga 10 cm acima *)

(* ---------- degrau 1: automático — liga (SET) ---------- *)
IF GVL_SIMULADOR.S4_Auto AND GVL_SIMULADOR.S0_Emerg_NF AND NOT GVL_SIMULADOR.LSHH
   AND GVL_SIMULADOR.IHM_Nivel_Real <= GVL_SIMULADOR.IHM_Nivel_SP_Liga THEN
    GVL_SIMULADOR.Inv_Gira := TRUE;
END_IF

(* ---------- degrau 2: automático — desliga (RESET) ---------- *)
IF GVL_SIMULADOR.S4_Auto AND GVL_SIMULADOR.S0_Emerg_NF AND NOT GVL_SIMULADOR.LSHH
   AND GVL_SIMULADOR.IHM_Nivel_Real >= GVL_SIMULADOR.IHM_Nivel_SP_Desl THEN
    GVL_SIMULADOR.Inv_Gira := FALSE;
END_IF

(* ---------- degrau 3: segurança — sai do automático, emergência ou LSHH (RESET) ---------- *)
IF NOT GVL_SIMULADOR.S4_Auto OR NOT GVL_SIMULADOR.S0_Emerg_NF OR GVL_SIMULADOR.LSHH THEN
    GVL_SIMULADOR.Inv_Gira := FALSE;
END_IF

(* ---------- sinalização e reset do inversor ---------- *)
GVL_SIMULADOR.H1 := GVL_SIMULADOR.Inv_Rodando;
GVL_SIMULADOR.H2 := GVL_SIMULADOR.LSHH OR GVL_SIMULADOR.LSLL;
GVL_SIMULADOR.H3 := NOT GVL_SIMULADOR.Inv_OK;
GVL_SIMULADOR.Inv_Reset := GVL_SIMULADOR.S3_Reset;

(* ---------- heartbeat do CLP: +1 a cada 500 ms ---------- *)
tonHB(IN := NOT tonHB.Q, PT := T#500MS);
IF tonHB.Q THEN
    GVL_SIMULADOR.HB_CLP := GVL_SIMULADOR.HB_CLP + 1;
END_IF
