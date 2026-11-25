(* PRG_Nivel — solução de referência: escala do LT-01, alarmes de nível com histerese e falha do transmissor.
   Usa só as variáveis nomeadas da GVL_SIM. Chame depois do PRG_Modbus_IO, na MainTask (cíclica, 20 ms).
   É o mesmo programa que o "CLP de demonstração" do simulador executa. *)
PROGRAM PRG_Nivel
VAR
    rPct   : REAL;            (* nível em %, 0..100 *)
    xFalha : BOOL;            (* transmissor em falha ou cabo rompido *)
END_VAR
VAR CONSTANT
    LIM_LL      : REAL := 10.0;     (* % *)
    LIM_L       : REAL := 20.0;
    LIM_H       : REAL := 80.0;
    LIM_HH      : REAL := 90.0;
    HISTERESE   : REAL := 2.0;
    BRUTO_FALHA : INT  := -410;     (* contagem de 3,8 mA: abaixo disso o transmissor está em falha ou o cabo rompeu *)
END_VAR

(* 1. escala: contagem do A/D (0..32767 = 4..20 mA) para % (0..100) *)
rPct := INT_TO_REAL(GVL_SIM.LT01_Bruto) / 32767.0 * 100.0;

(* 2. falha do transmissor: corrente abaixo de 3,8 mA (modo de falha "< 3,6 mA" ou cabo rompido) *)
xFalha := GVL_SIM.LT01_Bruto < BRUTO_FALHA;

(* 3. alarmes com histerese. Em falha, nenhum alarme de nível vale: o valor não é confiável *)
IF xFalha THEN
    GVL_SIM.LALL_01 := FALSE;
    GVL_SIM.LAL_01  := FALSE;
    GVL_SIM.LAH_01  := FALSE;
    GVL_SIM.LAHH_01 := FALSE;
ELSE
    IF rPct >= LIM_HH THEN GVL_SIM.LAHH_01 := TRUE; ELSIF rPct < LIM_HH - HISTERESE THEN GVL_SIM.LAHH_01 := FALSE; END_IF
    IF rPct >= LIM_H  THEN GVL_SIM.LAH_01  := TRUE; ELSIF rPct < LIM_H  - HISTERESE THEN GVL_SIM.LAH_01  := FALSE; END_IF
    IF rPct <= LIM_L  THEN GVL_SIM.LAL_01  := TRUE; ELSIF rPct > LIM_L  + HISTERESE THEN GVL_SIM.LAL_01  := FALSE; END_IF
    IF rPct <= LIM_LL THEN GVL_SIM.LALL_01 := TRUE; ELSIF rPct > LIM_LL + HISTERESE THEN GVL_SIM.LALL_01 := FALSE; END_IF
END_IF

(* 4. saídas: use onde quiser no seu CLP. O painel do simulador só as mostra com o retorno do CLP ligado *)
GVL_SIM.Falha_LT01 := xFalha;
IF xFalha THEN
    GVL_SIM.Nivel_Pct := 0.0;
ELSE
    GVL_SIM.Nivel_Pct := LIMIT(0.0, rPct, 100.0);
END_IF
