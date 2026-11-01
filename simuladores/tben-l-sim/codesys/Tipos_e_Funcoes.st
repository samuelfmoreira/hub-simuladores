(* Crie cada bloco abaixo como um objeto separado no CODESYS (DUT ou POU). *)

TYPE E_Estado :
(
    PARADO := 0,
    AUTO,
    FALHA,
    EMERGENCIA
);
END_TYPE

TYPE E_Passo :
(
    INICIO := 0,
    DESCER_VAZIO,
    AGUARDA_PALLET,
    SUBIR,
    ALIMENTAR,
    EMPURRAR,
    RECUAR,
    DESCER_CAMADA,
    DESCER_SAIDA,
    DESCARGA
);
END_TYPE

(* Lê um valor de 16 bits da imagem PROFINET *)
FUNCTION F_U16 : INT
VAR_INPUT
    w : WORD;
END_VAR
IF GVL_TBEN.xTrocarBytes THEN
    F_U16 := WORD_TO_INT(ROL(w, 8));
ELSE
    F_U16 := WORD_TO_INT(w);
END_IF
END_FUNCTION

(* Escreve um valor de 16 bits na imagem PROFINET *)
FUNCTION F_W16 : WORD
VAR_INPUT
    i : INT;
END_VAR
IF GVL_TBEN.xTrocarBytes THEN
    F_W16 := ROL(INT_TO_WORD(i), 8);
ELSE
    F_W16 := INT_TO_WORD(i);
END_IF
END_FUNCTION

(* Porta com comunicação IO-Link e dados válidos: PQ = 1 e DevCom = 1 *)
FUNCTION F_PortaOk : BOOL
VAR_INPUT
    pqi : BYTE;
END_VAR
F_PortaOk := (pqi AND 16#C0) = 16#C0;
END_FUNCTION
