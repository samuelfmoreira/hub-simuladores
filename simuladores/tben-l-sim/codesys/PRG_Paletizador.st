(* =====================================================================
   PRG_Paletizador - mesma sequência do CLP demo do simulador
   (src/core/demo-plc.js). Chame na tarefa principal com ciclo de 4 a 10 ms.
   ===================================================================== *)
PROGRAM PRG_Paletizador
VAR
    eEstado        : E_Estado := E_Estado.PARADO;
    eEstadoAnt     : E_Estado := E_Estado.PARADO;
    ePasso         : E_Passo := E_Passo.INICIO;
    ePassoAnt      : E_Passo := E_Passo.INICIO;
    sMsg           : STRING(80);
    sFalhaSeq      : STRING(80);

    iCaixas        : INT;      (* caixas no pallet atual, 0..12 *)
    iAlturaCamada  : INT;      (* mm, medida na 1ª caixa da camada *)
    iAlvo          : INT;      (* altura alvo do elevador, mm *)
    iAltura        : INT;      (* altura atual do elevador, mm *)
    iDistB1        : INT;
    iResto         : INT;
    iPallets       : DINT;

    (* entradas lidas *)
    xOk0, xOk1, xOk2, xOk3, xOk4, xOk5, xOk6, xOk7 : BOOL;
    xRecuado, xAvancado, xInferior, xSuperior : BOOL;
    xPalletEle, xPalletSaida : BOOL;
    xPartir, xParar, xRearmar, xEmergOk : BOOL;
    xB1Valido, xB1Sp1, xB5Valido : BOOL;

    (* saídas calculadas *)
    xC1, xC2, xAvancar, xRecuar, xSubir, xDescer, xHabilita, xReset : BOOL;
    iVel           : INT;

    tonPartida     : TON;
    tonPasso       : TON;
    tonInvalido    : TON;
    tonPisca       : TON;
    xPisca         : BOOL;
    rtPartir       : R_TRIG;
    ftRearmar      : F_TRIG;
END_VAR

(* ---------- Leitura da imagem de processo ---------- *)
xOk0 := F_PortaOk(GVL_TBEN.X0_PQI);  xOk1 := F_PortaOk(GVL_TBEN.X1_PQI);
xOk2 := F_PortaOk(GVL_TBEN.X2_PQI);  xOk3 := F_PortaOk(GVL_TBEN.X3_PQI);
xOk4 := F_PortaOk(GVL_TBEN.X4_PQI);  xOk5 := F_PortaOk(GVL_TBEN.X5_PQI);
xOk6 := F_PortaOk(GVL_TBEN.X6_PQI);  xOk7 := F_PortaOk(GVL_TBEN.X7_PQI);

xRecuado     := xOk3 AND GVL_TBEN.X3_In_B0.0;
xAvancado    := xOk3 AND GVL_TBEN.X3_In_B0.1;
xInferior    := xOk3 AND GVL_TBEN.X3_In_B0.2;
xSuperior    := xOk3 AND GVL_TBEN.X3_In_B0.3;
xPalletEle   := xOk3 AND GVL_TBEN.X3_In_B0.4;
xPalletSaida := xOk3 AND GVL_TBEN.X3_In_B0.5;
xPartir      := xOk3 AND GVL_TBEN.X3_In_B0.6;
xParar       := NOT (xOk3 AND GVL_TBEN.X3_In_B0.7);   (* NF: 0 = pressionado *)
xRearmar     := xOk3 AND GVL_TBEN.X3_In_B1.0;
xEmergOk     := xOk3 AND GVL_TBEN.X3_In_B1.1;         (* NF: 1 = emergência liberada *)

xB1Valido := xOk1 AND GVL_TBEN.X1_In_Flags.0;
xB1Sp1    := xB1Valido AND GVL_TBEN.X1_In_Flags.1;
iDistB1   := F_U16(GVL_TBEN.X1_In_Dist);
xB5Valido := xOk5 AND GVL_TBEN.X5_In_Flags.0;
iAltura   := 2900 - F_U16(GVL_TBEN.X5_In_Dist);

rtPartir(CLK := xPartir);
ftRearmar(CLK := xRearmar);
tonInvalido(IN := NOT xB1Valido OR NOT xB5Valido, PT := T#1S);
IF xRearmar THEN
    sFalhaSeq := '';
END_IF

(* Atraso de partida: espera a AR PROFINET entregar dados válidos *)
tonPartida(IN := TRUE, PT := T#500MS);

(* ---------- Falhas, na mesma ordem de prioridade do CLP demo ---------- *)
sMsg := '';
IF NOT tonPartida.Q THEN
    ;
ELSIF NOT xOk3 THEN
    sMsg := 'X3 K1: hub de entradas sem comunicacao IO-Link';
ELSIF NOT xEmergOk THEN
    sMsg := 'EMG';
ELSIF NOT xOk0 THEN
    sMsg := 'X0 C1: controlador da esteira sem comunicacao';
ELSIF GVL_TBEN.X0_In_Status.1 THEN
    sMsg := 'X0 C1: falha no motor da esteira de entrada';
ELSIF NOT xOk2 THEN
    sMsg := 'X2 Y1: terminal de valvulas sem comunicacao';
ELSIF NOT GVL_TBEN.X2_In_Status.0 THEN
    sMsg := 'X2 Y1: sem pressao de ar';
ELSIF NOT xOk4 THEN
    sMsg := 'X4 M1: inversor sem comunicacao';
ELSIF GVL_TBEN.X4_In_Status.2 THEN
    sMsg := CONCAT('X4 M1: falha no inversor, codigo ', BYTE_TO_STRING(GVL_TBEN.X4_In_Fault));
ELSIF NOT xOk6 THEN
    sMsg := 'X6 C2: controlador da esteira sem comunicacao';
ELSIF GVL_TBEN.X6_In_Status.1 THEN
    sMsg := 'X6 C2: falha no motor da esteira de saida';
ELSIF NOT xOk1 OR NOT xOk5 THEN
    sMsg := 'X1/X5: sensor laser sem comunicacao';
ELSIF tonInvalido.Q THEN
    sMsg := 'X1/X5: sensor laser sem medicao valida ha mais de 1 s';
ELSIF NOT xOk7 THEN
    sMsg := 'X7 H1: torre sinaleira sem comunicacao';
ELSIF sFalhaSeq <> '' THEN
    sMsg := sFalhaSeq;
END_IF

(* ---------- Estados ---------- *)
IF sMsg = 'EMG' THEN
    eEstado := E_Estado.EMERGENCIA;
ELSIF sMsg <> '' THEN
    eEstado := E_Estado.FALHA;
ELSIF (eEstado = E_Estado.FALHA OR eEstado = E_Estado.EMERGENCIA) AND ftRearmar.Q THEN
    eEstado := E_Estado.PARADO;
END_IF
IF eEstado = E_Estado.PARADO AND rtPartir.Q AND sMsg = '' AND tonPartida.Q THEN
    eEstado := E_Estado.AUTO;
END_IF
IF eEstado = E_Estado.AUTO AND xParar THEN
    eEstado := E_Estado.PARADO;
END_IF
eEstadoAnt := eEstado;

(* ---------- Sequência ---------- *)
xC1 := FALSE; xC2 := FALSE; xAvancar := FALSE; xRecuar := FALSE;
xSubir := FALSE; xDescer := FALSE; iVel := 0;

IF ePasso <> ePassoAnt THEN
    tonPasso(IN := FALSE);
    ePassoAnt := ePasso;
END_IF
tonPasso(IN := eEstado = E_Estado.AUTO, PT := T#3S);

IF eEstado = E_Estado.AUTO THEN
    CASE ePasso OF
    E_Passo.INICIO:
        xRecuar := TRUE;
        IF xRecuado THEN
            IF NOT xPalletEle THEN
                ePasso := E_Passo.DESCER_VAZIO;
            ELSIF iCaixas = 0 THEN
                ePasso := E_Passo.SUBIR;
            ELSE
                ePasso := E_Passo.ALIMENTAR;
            END_IF
        END_IF

    E_Passo.DESCER_VAZIO:
        IF xInferior THEN
            ePasso := E_Passo.AGUARDA_PALLET;
        ELSE
            xDescer := TRUE; iVel := 250;
        END_IF

    E_Passo.AGUARDA_PALLET:
        IF xPalletEle THEN
            iCaixas := 0;
            ePasso := E_Passo.SUBIR;
        END_IF

    E_Passo.SUBIR:
        IF xSuperior THEN
            ePasso := E_Passo.ALIMENTAR;
        ELSE
            xSubir := TRUE;
            IF iAltura > 1180 THEN iVel := 60; ELSE iVel := 250; END_IF
        END_IF

    E_Passo.ALIMENTAR:
        IF xB1Sp1 THEN
            IF iCaixas MOD 4 = 0 THEN
                iAlturaCamada := 800 - iDistB1;   (* laser a 800 mm da esteira *)
            END_IF
            ePasso := E_Passo.EMPURRAR;
        ELSE
            xC1 := TRUE;
        END_IF

    E_Passo.EMPURRAR:
        xAvancar := TRUE;
        IF xAvancado THEN
            ePasso := E_Passo.RECUAR;
        ELSIF tonPasso.Q THEN
            sFalhaSeq := 'X2/X3: empurrador nao chegou ao avancado em 3 s';
        END_IF

    E_Passo.RECUAR:
        xRecuar := TRUE;
        IF xRecuado THEN
            iCaixas := iCaixas + 1;
            IF iCaixas >= 12 THEN
                ePasso := E_Passo.DESCER_SAIDA;
            ELSIF iCaixas MOD 4 = 0 THEN
                iAlvo := iAltura - iAlturaCamada;
                ePasso := E_Passo.DESCER_CAMADA;
            ELSE
                ePasso := E_Passo.ALIMENTAR;
            END_IF
        ELSIF tonPasso.Q THEN
            sFalhaSeq := 'X2/X3: empurrador nao chegou ao recuado em 3 s';
        END_IF

    E_Passo.DESCER_CAMADA:
        iResto := iAltura - iAlvo;
        IF iResto <= 0 THEN
            ePasso := E_Passo.ALIMENTAR;
        ELSE
            xDescer := TRUE;
            IF iResto > 40 THEN iVel := 200; ELSE iVel := 30; END_IF
        END_IF

    E_Passo.DESCER_SAIDA:
        IF xInferior THEN
            ePasso := E_Passo.DESCARGA;
        ELSE
            xDescer := TRUE; iVel := 250;
        END_IF

    E_Passo.DESCARGA:
        IF xPalletSaida THEN
            iCaixas := 0;
            iPallets := iPallets + 1;
            ePasso := E_Passo.AGUARDA_PALLET;
        ELSE
            xC2 := TRUE;
        END_IF
    END_CASE
END_IF

(* ---------- Escrita das saídas ---------- *)
xReset    := xRearmar;
xHabilita := tonPartida.Q AND (eEstado = E_Estado.AUTO OR eEstado = E_Estado.PARADO);

GVL_TBEN.X0_Out_Ctrl  := 0;
GVL_TBEN.X0_Out_Ctrl.0 := xC1;
GVL_TBEN.X0_Out_Ctrl.2 := xReset;
GVL_TBEN.X0_Out_Speed := 70;

GVL_TBEN.X2_Out_Valves := 0;
GVL_TBEN.X2_Out_Valves.0 := xAvancar;
GVL_TBEN.X2_Out_Valves.1 := xRecuar;

GVL_TBEN.X4_Out_Ctrl  := 0;
GVL_TBEN.X4_Out_Ctrl.0 := xHabilita;
GVL_TBEN.X4_Out_Ctrl.1 := xSubir;
GVL_TBEN.X4_Out_Ctrl.2 := xDescer;
GVL_TBEN.X4_Out_Ctrl.3 := xReset;
GVL_TBEN.X4_Out_Res   := 0;
GVL_TBEN.X4_Out_Speed := F_W16(iVel);

GVL_TBEN.X6_Out_Ctrl  := 0;
GVL_TBEN.X6_Out_Ctrl.0 := xC2;
GVL_TBEN.X6_Out_Ctrl.2 := xReset;
GVL_TBEN.X6_Out_Speed := 80;

tonPisca(IN := NOT tonPisca.Q, PT := T#500MS);
IF tonPisca.Q THEN xPisca := NOT xPisca; END_IF
GVL_TBEN.X7_Out_Lamps := 0;
CASE eEstado OF
E_Estado.AUTO:       GVL_TBEN.X7_Out_Lamps.0 := TRUE;
E_Estado.PARADO:     GVL_TBEN.X7_Out_Lamps.1 := TRUE;
E_Estado.FALHA:      GVL_TBEN.X7_Out_Lamps.2 := xPisca;
E_Estado.EMERGENCIA: GVL_TBEN.X7_Out_Lamps.2 := TRUE;
                     GVL_TBEN.X7_Out_Lamps.3 := xPisca;
END_CASE
