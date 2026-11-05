## Antes de começar

Este guia leva da folha em branco até o sistema de incêndio funcionando: programa do Altus XP325 em Ladder, ajuste dos pressostatos KP e ajuste da soft-starter SSW-05 Plus. Cada parte tem a versão para a **bancada real** e a versão no **simulador**.

**O que você vai montar**

| Programa | Linguagem | Função |
| --- | --- | --- |
| `SP02_Entradas` | Texto estruturado (ST) | Escolhe se as entradas vêm dos bornes I00–I17 ou do simulador |
| `SP02_Logica` | Ladder (LD) | A lógica da SP02: seleção, bombas principais, jockey e sinalização |
| `SP02_Saidas` | Texto estruturado (ST) | Copia as saídas Q00–Q12 para o simulador ler |

**O que você precisa**

- MasterTool IEC XE instalado (gratuito no site da Altus) e o XP325 ligado ao PC por cabo de rede.
- O simulador aberto e, de preferência, já testado com o **CLP virtual** (Guia do simulador, Passo 6).
- A tabela de I/O da SP02 (Guia do simulador, Passo 3).

Antes de programar, leia a Parte 1 com calma: quem entende a sequência, escreve o Ladder sem esforço.

## Parte 1 — Entender a lógica da SP02

A SP02 pede três comportamentos. Transformar cada frase do enunciado numa condição elétrica é o primeiro passo.

| O enunciado diz | Vira esta condição no programa |
| --- | --- |
| Chave de cada bomba em **Manual**: liga e desliga pelas botoeiras locais | Liga com o botão NA; desliga com o botão NF; precisa de **selo** (o botão é pulsante) |
| Jockey em **Automático**: liga com pressão abaixo de 6 kgf/cm² e desliga com 10 kgf/cm² ou mais | Jockey = **PJ fechado**. A histerese 6–10 já é feita pelo próprio pressostato |
| Pressão continua caindo até 4 kgf/cm²: a **principal selecionada** liga e a jockey desliga | Principal liga com **PB fechado** e a chave de seleção nela; jockey automática só roda se **nenhuma principal** estiver ligada |
| A principal **só desliga manualmente**, pela botoeira desliga | A principal em automático tem **selo**: não depende mais do PB depois de partir. Só o botão NF (ou a chave em 0) desfaz o selo |
| Principais com soft-starter: rampa de 5 s na partida e 10 s na parada | Isso é ajuste da SSW-05 (Parte 10), não do CLP. O CLP só liga a contatora K-B1/K-B2 |
| Jockey em partida direta | O CLP liga a contatora K-BJ |
| Sinaleiros: selecionada, em operação e desligada | Copiam o estado da chave de seleção e das bombas |

**A sequência de um incêndio, na prática**

1. Rede pressurizada (10 kgf/cm²): tudo parado, sinaleiros "desligada" acesos.
2. Pequeno vazamento: pressão cai abaixo de 6 → **PJ fecha** → jockey liga.
3. Pressão volta a 10 → **PJ abre** → jockey desliga. Isso se repete.
4. Hidrante aberto: a jockey não segura, a pressão cai a 4 → **PB fecha** → a principal selecionada parte (rampa de 5 s) e a **jockey desliga**.
5. A principal continua ligada mesmo com a pressão de volta acima de 10.
6. Bombeiro aperta **Desliga** no painel → a principal para (rampa de 10 s).

**Duas decisões que você precisa saber explicar**

- **Botão desliga NF**: no programa ele aparece como contato **NA** (aberto em repouso no desenho Ladder), porque a entrada vale 1 quando o botão está solto. Ao apertar, a entrada vai a 0 e abre o caminho. Fio rompido também desliga: é a ligação segura.
- **Se o bombeiro desligar a principal com o PB ainda fechado** (pressão baixa), ela volta a partir na hora. Em sistema de incêndio isso é desejável: ninguém deve conseguir deixar a rede sem pressão por engano. Para parar de vez, gire a chave para 0.

## Parte 2 — Criar o projeto no MasterTool IEC XE

1. Abra o **MasterTool IEC XE**.
2. **Arquivo → Novo projeto**. Escolha **MasterTool Standard Project**, dê o nome `SP02_Incendio` e escolha a pasta. Clique em **OK**.
3. Na janela do projeto padrão, escolha o modelo **XP325** e avance até concluir. O MasterTool cria a árvore com a CPU, a porta **NET 1**, a **Application**, a **MainTask** e o programa `UserPrg`.
4. Dê dois cliques em **NET 1** e confira o IP do XP325 (Guia do simulador, Passo 4C.1).
5. **Arquivo → Salvar projeto**. Salve com frequência a partir daqui.

As entradas e saídas integradas do XP325 já existem no projeto com os nomes dos bornes: **I00 a I17** e **Q00 a Q17**. Não precisa declarar.

## Parte 3 — Declarar as variáveis

**3.1 — Lista global de troca com o simulador**

1. Botão direito em **Application → Acrescentar objeto → Lista de variáveis globais (GVL)**. Nome: `GVL_SIM`.
2. Apague o conteúdo e cole:

```
VAR_GLOBAL
    xSimIn         : ARRAY[0..15] OF BOOL;  // escrito pelo simulador (coils): I00..I17
    xSimOut        : ARRAY[0..15] OF BOOL;  // lido pelo simulador (input status): Q00..Q12
    xUsarSimulador : BOOL := TRUE;          // TRUE = simulador; FALSE = bornes reais
END_VAR
```

**3.2 — Lista global do processo**

Crie outra GVL chamada `GVL_SP02`. Estas são as variáveis que a lógica usa. Elas não dependem de onde o sinal vem.

```
VAR_GLOBAL
    // Entradas (sempre lidas de SP02_Entradas)
    xSelB1   : BOOL;  // I00 - chave de seleção em Bomba 01
    xSelB2   : BOOL;  // I01 - chave de seleção em Bomba 02
    xB1Man   : BOOL;  // I02 - Bomba 01 em manual
    xB1Aut   : BOOL;  // I03 - Bomba 01 em automático
    xB2Man   : BOOL;  // I04 - Bomba 02 em manual
    xB2Aut   : BOOL;  // I05 - Bomba 02 em automático
    xBJMan   : BOOL;  // I06 - Jockey em manual
    xBJAut   : BOOL;  // I07 - Jockey em automático
    xB1_L    : BOOL;  // I10 - liga Bomba 01 (NA)
    xB1_D    : BOOL;  // I11 - desliga Bomba 01 (NF: 1 = solto)
    xB2_L    : BOOL;  // I12 - liga Bomba 02 (NA)
    xB2_D    : BOOL;  // I13 - desliga Bomba 02 (NF)
    xBJ_L    : BOOL;  // I14 - liga jockey (NA)
    xBJ_D    : BOOL;  // I15 - desliga jockey (NF)
    xPJ      : BOOL;  // I16 - pressostato jockey (1 = pressão baixa)
    xPB      : BOOL;  // I17 - pressostato principais (1 = pressão baixa)
    // Memórias da lógica
    xBomba1     : BOOL;  // Bomba 01 deve estar ligada
    xBomba2     : BOOL;  // Bomba 02 deve estar ligada
    xJockeyMan  : BOOL;  // jockey ligada em manual
    xJockeyAut  : BOOL;  // jockey ligada em automático
END_VAR
```

Os comentários com o número do borne ajudam muito na monitoração online e na correção das provas.

## Parte 4 — Programa SP02_Entradas (escolha simulador ou bornes)

1. Botão direito em **Application → Acrescentar objeto → POU**.
2. Nome `SP02_Entradas`, tipo **Programa**, linguagem **Texto estruturado (ST)**. **Acrescentar**.
3. Cole no corpo:

```
IF GVL_SIM.xUsarSimulador THEN
    xSelB1 := GVL_SIM.xSimIn[0];   xSelB2 := GVL_SIM.xSimIn[1];
    xB1Man := GVL_SIM.xSimIn[2];   xB1Aut := GVL_SIM.xSimIn[3];
    xB2Man := GVL_SIM.xSimIn[4];   xB2Aut := GVL_SIM.xSimIn[5];
    xBJMan := GVL_SIM.xSimIn[6];   xBJAut := GVL_SIM.xSimIn[7];
    xB1_L  := GVL_SIM.xSimIn[8];   xB1_D  := GVL_SIM.xSimIn[9];
    xB2_L  := GVL_SIM.xSimIn[10];  xB2_D  := GVL_SIM.xSimIn[11];
    xBJ_L  := GVL_SIM.xSimIn[12];  xBJ_D  := GVL_SIM.xSimIn[13];
    xPJ    := GVL_SIM.xSimIn[14];  xPB    := GVL_SIM.xSimIn[15];
ELSE
    xSelB1 := I00;  xSelB2 := I01;  xB1Man := I02;  xB1Aut := I03;
    xB2Man := I04;  xB2Aut := I05;  xBJMan := I06;  xBJAut := I07;
    xB1_L  := I10;  xB1_D  := I11;  xB2_L  := I12;  xB2_D  := I13;
    xBJ_L  := I14;  xBJ_D  := I15;  xPJ    := I16;  xPB    := I17;
END_IF
```

Com `xUsarSimulador = TRUE` o painel do simulador comanda o CLP. Para a bancada física, mude para `FALSE` (na declaração ou forçando online).

## Parte 5 — Programa SP02_Logica em Ladder, rede por rede

**5.1 — Criar o programa**

1. **Application → Acrescentar objeto → POU**. Nome `SP02_Logica`, tipo **Programa**, linguagem **Diagrama Ladder (LD)**.
2. O editor abre com a **Rede 1** vazia. A **Caixa de ferramentas** (à direita) tem os elementos: **Contato**, **Contato negado**, **Bobina**, **Contato paralelo** e outros.

**5.2 — Como desenhar no editor (vale para todas as redes)**

- **Contato em série**: arraste **Contato** da caixa de ferramentas para cima da linha da rede. Clique em `???` acima dele e digite o nome da variável (ex.: `xB1Man`). O MasterTool sugere os nomes enquanto você digita.
- **Contato negado** (NF no desenho): igual, usando **Contato negado**.
- **Ramo em paralelo**: clique com o botão direito num contato e escolha **Inserir contato paralelo (abaixo)**. Para um ramo com dois contatos em série, insira o paralelo e depois arraste outro contato para dentro desse ramo.
- **Bobina**: arraste **Bobina** para a ponta direita da rede e digite a variável.
- **Nova rede**: botão direito na área da rede → **Inserir rede (abaixo)**.
- **Comentário da rede**: clique na área de comentário acima da rede e escreva o que ela faz. Ajuda na correção.

Os nomes das ferramentas podem variar um pouco entre versões do MasterTool; os elementos são sempre os mesmos do Ladder IEC 61131-3.

**5.3 — Redes 1 e 2: sinaleiros de seleção**

A chave de seleção em B01 acende LB1_S (relé RAX1, saída Q03). Em B02 acende LB2_S (RAX2, Q04).

```ladder
{"t":"Rede 1 — Sinaleiro Bomba 01 selecionada","s":[["NO","xSelB1","I00 seleção B01"]],"c":["Q03","RAX1 → LB1_S"]}
```

```ladder
{"t":"Rede 2 — Sinaleiro Bomba 02 selecionada","s":[["NO","xSelB2","I01 seleção B02"]],"c":["Q04","RAX2 → LB2_S"]}
```

**5.4 — Rede 3: Bomba 01 (o coração do programa)**

Esta rede junta manual, automático e o selo numa única memória, `xBomba1`. Leia de cima para baixo os três caminhos que ligam a bomba:

1. **Manual**: chave em Man **e** botão Liga apertado.
2. **Automático**: chave em Auto **e** seleção em B01 **e** PB fechado (pressão ≤ 4 kgf/cm²).
3. **Selo**: a própria `xBomba1` mantém a bomba ligada depois que o botão é solto ou o PB abre.

Em série com os três caminhos ficam as condições de desligar: botão **Desliga** (NF, por isso contato NA no Ladder) e chave fora do 0 (Man **ou** Auto).

```ladder
{"t":"Rede 3 — Bomba 01: manual, automático e selo","s":[["P",[[["NO","xB1Man","I02 Man"],["NO","xB1_L","I10 Liga"]],[["NO","xB1Aut","I03 Auto"],["NO","xSelB1","I00 Sel B01"],["NO","xPB","I17 PB baixa"]],[["NO","xBomba1","selo"]]]],["NO","xB1_D","I11 Desliga (NF)"],["P",[[["NO","xB1Man","I02 Man"]],[["NO","xB1Aut","I03 Auto"]]]]],"c":["xBomba1","memória Bomba 01"]}
```

Como desenhar esta rede:

1. Arraste um contato `xB1Man` e, à direita dele, um contato `xB1_L`.
2. Botão direito em `xB1Man` → **Inserir contato paralelo (abaixo)** → `xB1Aut`. Arraste mais dois contatos para dentro desse ramo: `xSelB1` e `xPB`.
3. Insira mais um paralelo abaixo com `xBomba1` (o selo).
4. À direita do bloco paralelo, um contato `xB1_D`.
5. À direita, um contato `xB1Man` com um paralelo abaixo `xB1Aut`.
6. Na ponta, a bobina `xBomba1`.

Equivalente em texto estruturado, para conferir o raciocínio:

```
xBomba1 := ((xB1Man AND xB1_L) OR (xB1Aut AND xSelB1 AND xPB) OR xBomba1)
           AND xB1_D AND (xB1Man OR xB1Aut);
```

**5.5 — Rede 4: Bomba 02**

Igual à Rede 3, trocando 1 por 2 e a seleção por `xSelB2`.

```ladder
{"t":"Rede 4 — Bomba 02: manual, automático e selo","s":[["P",[[["NO","xB2Man","I04 Man"],["NO","xB2_L","I12 Liga"]],[["NO","xB2Aut","I05 Auto"],["NO","xSelB2","I01 Sel B02"],["NO","xPB","I17 PB baixa"]],[["NO","xBomba2","selo"]]]],["NO","xB2_D","I13 Desliga (NF)"],["P",[[["NO","xB2Man","I04 Man"]],[["NO","xB2Aut","I05 Auto"]]]]],"c":["xBomba2","memória Bomba 02"]}
```

Dica: no editor, copie a Rede 3 (botão direito → **Copiar**), cole abaixo e troque os nomes.

**5.6 — Rede 5: jockey em manual**

Liga e desliga pelas botoeiras, com selo, só com a chave em Man.

```ladder
{"t":"Rede 5 — Jockey em manual","s":[["P",[[["NO","xBJ_L","I14 Liga"]],[["NO","xJockeyMan","selo"]]]],["NO","xBJ_D","I15 Desliga (NF)"],["NO","xBJMan","I06 Man"]],"c":["xJockeyMan","jockey manual"]}
```

**5.7 — Rede 6: jockey em automático**

A jockey roda enquanto o PJ estiver fechado e **nenhuma** principal estiver ligada. Os contatos **negados** de `xBomba1` e `xBomba2` fazem a jockey desligar sozinha quando a principal parte. O botão Desliga também vale no automático, como parada de emergência local.

```ladder
{"t":"Rede 6 — Jockey em automático","s":[["NO","xBJAut","I07 Auto"],["NO","xPJ","I16 PJ baixa"],["NC","xBomba1","B01 parada"],["NC","xBomba2","B02 parada"],["NO","xBJ_D","I15 Desliga (NF)"]],"c":["xJockeyAut","jockey automática"]}
```

Não precisa de selo: o PJ só abre quando a pressão chega a 10 kgf/cm². A histerese (liga em 6, desliga em 10) está no pressostato, não no CLP.

**5.8 — Redes 7, 8 e 9: contatoras**

```ladder
{"t":"Rede 7 — Contatora Bomba 01 (DI1 da SS_01)","s":[["NO","xBomba1","memória B01"]],"c":["Q00","K-B1"]}
```

```ladder
{"t":"Rede 8 — Contatora Bomba 02 (DI1 da SS_02)","s":[["NO","xBomba2","memória B02"]],"c":["Q01","K-B2"]}
```

```ladder
{"t":"Rede 9 — Contatora da jockey (partida direta)","s":[["P",[[["NO","xJockeyMan","manual"]],[["NO","xJockeyAut","automático"]]]]],"c":["Q02","K-BJ"]}
```

Por que separar memória e saída? Porque a memória pode ser usada em outras redes (sinaleiros, intertravamento da jockey) e porque, na monitoração, fica claro se o problema está na lógica (memória) ou na saída.

**5.9 — Redes 10 a 15: sinaleiros de operação e de desligada**

"Em operação" copia a bomba; "desligada" é o contrário dela (contato negado).

```ladder
{"t":"Rede 10 — Bomba 01 em operação","s":[["NO","xBomba1","memória B01"]],"c":["Q05","RAX3 → LB1_L"]}
```

```ladder
{"t":"Rede 13 — Bomba 01 desligada","s":[["NC","xBomba1","memória B01"]],"c":["Q10","RAX6 → LB1_D"]}
```

As outras quatro seguem o mesmo modelo:

| Rede | Contato | Bobina | Sinaleiro |
| --- | --- | --- | --- |
| 11 | `xBomba2` | `Q06` | RAX4 → LB2_L (vermelho) |
| 12 | `Q02` | `Q07` | RAX5 → LBJ_L (vermelho) |
| 14 | `xBomba2` negado | `Q11` | RAX7 → LB2_D (verde) |
| 15 | `Q02` negado | `Q12` | RAX8 → LBJ_D (verde) |

Para a jockey usamos a própria saída `Q02`, porque ela pode estar ligada por dois caminhos (manual ou automático).

**5.10 — Conferir a lógica antes de compilar**

| Situação | `xBomba1` | `Q02` (jockey) | Por quê |
| --- | --- | --- | --- |
| Tudo em 0 | 0 | 0 | Sem chave em Man/Auto não há caminho |
| B1 em Man, aperta Liga | 1 | — | Caminho manual + selo |
| B1 em Man, aperta Desliga | 0 | — | `xB1_D` vai a 0 e corta a rede |
| Jockey Auto, PJ fecha | — | 1 | Rede 6 completa |
| PB fecha, B1 Auto, seleção B01 | 1 | 0 | Rede 3 liga; Rede 6 corta pelo contato negado |
| Pressão volta a 10 (PB abre) | 1 | 0 | O selo mantém a principal |
| Aperta Desliga da B1 | 0 | — | Única forma de parar no automático |

## Parte 6 — Programa SP02_Saidas (o simulador lê as saídas)

1. **Acrescentar objeto → POU** → `SP02_Saidas`, **Programa**, **ST**.
2. Cole:

```
GVL_SIM.xSimOut[0]  := Q00;  // K-B1
GVL_SIM.xSimOut[1]  := Q01;  // K-B2
GVL_SIM.xSimOut[2]  := Q02;  // K-BJ
GVL_SIM.xSimOut[3]  := Q03;  // RAX1 LB1_S
GVL_SIM.xSimOut[4]  := Q04;  // RAX2 LB2_S
GVL_SIM.xSimOut[5]  := Q05;  // RAX3 LB1_L
GVL_SIM.xSimOut[6]  := Q06;  // RAX4 LB2_L
GVL_SIM.xSimOut[7]  := Q07;  // RAX5 LBJ_L
GVL_SIM.xSimOut[8]  := Q10;  // RAX6 LB1_D
GVL_SIM.xSimOut[9]  := Q11;  // RAX7 LB2_D
GVL_SIM.xSimOut[10] := Q12;  // RAX8 LBJ_D
```

## Parte 7 — Chamar os programas, compilar e carregar

**7.1 — Ordem de execução na MainTask**

A ordem importa: primeiro ler as entradas, depois a lógica, por fim copiar as saídas.

1. Na árvore, abra **Configuração de tarefas → MainTask**.
2. Clique em **Acrescentar chamada** e escolha `SP02_Entradas`. Repita para `SP02_Logica` e `SP02_Saidas`.
3. Use as setas **Mover para cima/baixo** até ficar: `SP02_Entradas`, `SP02_Logica`, `SP02_Saidas`.
4. Se o `UserPrg` do projeto padrão estiver vazio, pode deixá-lo na lista; não atrapalha.

**7.2 — Servidor Modbus**

Configure o **MODBUS Symbol Server** na NET 1 com `GVL_SIM.xSimIn` (Coil) e `GVL_SIM.xSimOut` (Input Status), como no Guia do simulador, Passo 4C.3.

**7.3 — Compilar**

1. **Compilar → Compilar** (F11).
2. A janela de mensagens deve mostrar **0 erros**. Os erros mais comuns: nome de variável digitado diferente da GVL, ou contato sem variável (`???`).

**7.4 — Carregar e rodar**

1. Ligue o cabo de rede entre o PC e o XP325.
2. **Comunicação → Easy Connection**: selecione o XP325 pelo IP.
3. **Login** (Alt+F8) e confirme o download.
4. **Iniciar** (F5). O XP325 entra em RUN.

## Parte 8 — Conectar o simulador e monitorar

1. No simulador: IP do XP325, porta 502, Unit ID 1, **Conectar** (Guia do simulador, Passo 5).
2. No MasterTool, com o CLP online, abra `SP02_Logica`. Os contatos fechados e as bobinas ligadas ficam **azuis**; ao lado de cada variável aparece o valor.
3. Gire a seleção para B01 no simulador: na Rede 1, `xSelB1` fica azul e `Q03` liga. No simulador, LB1_S acende.
4. Se nada mudar no CLP, o problema está no Modbus ou em `SP02_Entradas`. Abra `GVL_SIM` online e veja se `xSimIn[0]` muda.

Dica de aula: **forçar valores** (botão direito → Preparar valor, depois **Forçar valores**) ajuda a mostrar uma rede funcionando isolada. Desforce tudo antes de testar a sequência completa.

## Parte 9 — Configurar os pressostatos KP

Os dois pressostatos são do tipo KP de alta pressão com rearme automático (KP 5: faixa 8–32 bar, diferencial 1,8–6 bar). A SP02 fala em kgf/cm²: **1 kgf/cm² = 0,981 bar**.

**9.1 — Valores**

| Pressostato | Contato fecha (pede a bomba) | Contato abre | Faixa (escala RANGE) | Diferencial (escala DIF) |
| --- | --- | --- | --- | --- |
| PJ (jockey) | < 6 kgf/cm² (5,9 bar) | ≥ 10 kgf/cm² (9,8 bar) | 9,8 bar | 3,9 bar |
| PB (principais) | ≤ 4 kgf/cm² (3,9 bar) | ≥ 10 kgf/cm² (9,8 bar) | 9,8 bar | 5,9 bar |

Regra do KP de alta: o contato comuta na **faixa** (pressão subindo) e volta em **faixa − diferencial** (pressão descendo).

**9.2 — Na bancada real**

1. Desligue a bomba e alivie a pressão do trecho do pressostato. Desligue o 24 Vcc do comando (D4).
2. Tire a tampa do KP. Aparecem os dois eixos de ajuste e as escalas **RANGE** e **DIF**.
3. Gire o eixo **RANGE** até 9,8 bar. Pela ficha técnica, uma volta ≈ 2,3 bar.
4. Gire o eixo **DIF**: 3,9 bar no PJ, 5,9 bar no PB. Uma volta ≈ 0,3 bar.
5. **Escolha o contato certo**. O KP tem contato reversível (SPDT). Com a rede despressurizada, meça continuidade com o multímetro entre o comum e cada um dos outros dois terminais: use o par que está **fechado** sem pressão.
6. Ligue esse contato entre o L+ e a entrada: **PJ → I16**, **PB → I17**.
7. Recoloque a tampa, religue o D4 e confira no MasterTool online: sem pressão, `xPJ` e `xPB` = TRUE.
8. **Confira com manômetro de precisão**. Pressurize devagar e anote em que pressão cada contato abre (deve ser ≈ 10 kgf/cm²). Alivie devagar e anote onde fecha (≈ 6 no PJ, ≈ 4 no PB). As escalas do KP são aproximadas; o fabricante recomenda sempre conferir com manômetro.

**9.3 — No simulador**

1. Role até **Pressostatos**.
2. PJ: **Faixa** 9,8 e **Diferencial** 3,9. PB: **Faixa** 9,8 e **Diferencial** 5,9 (botões − e +, ou rodinha do mouse sobre os eixos do desenho).
3. **Contato ligado ao CLP**: "fecha em baixa pressão".
4. A caixa branca confirma, por exemplo: *Contato fecha em ≤ 5,9 bar (6,0 kgf/cm²) e abre em ≥ 9,8 bar (10,0 kgf/cm²)*.
5. Teste o programa sem mexer na pressão: segure a **alavanca de teste** do PJ. A jockey (em Auto) deve ligar.

## Parte 10 — Configurar a soft-starter SSW-05 Plus

A SSW-05 Plus não tem IHM: o ajuste é feito atrás da tampa frontal, nos 4 trimpots e no dip-switch de 6 chaves (manual WEG 0899.5119). O CLP não conversa com ela; só liga a contatora, e o contato 13-14 da contatora fecha a DI1.

**10.1 — Valores para a SP02**

| Ajuste | Valor | Motivo |
| --- | --- | --- |
| Trimpot **ACCEL TIME** | **5 s** | Exigência da SP02 |
| Trimpot **DECEL TIME** | **10 s** | Exigência da SP02; o manual indica a rampa de parada justamente para bombas, contra golpe de aríete |
| Trimpot **PEDESTAL VOLTAGE** | 30–40 % | O motor começa a girar assim que recebe o comando, sem tranco |
| Trimpot **MOTOR CURRENT** | corrente de placa ÷ corrente da chave × 100 | Base de todas as proteções. Ex.: motor 14,4 A numa chave de 16 A = 90 %; exemplo do manual: 25 A ÷ 30 A = 83 % |
| Chaves 1 a 5 (OVERCURRENT, PHASE LOSS, PHASE SEQ, STALL, OVERLOAD) | ON | Mantém todas as proteções do motor |
| Chave 6 (MAN / AUTO) | MAN | Numa bomba de incêndio o reset deve ser consciente |

Padrão de fábrica (pontos vermelhos na frente): PEDESTAL 30 %, ACCEL no meio da escala, DECEL OFF, MOTOR CURRENT 100 %, chaves 1–5 ON e chave 6 MAN. Ou seja: **ACCEL e DECEL precisam ser mexidos** para a SP02.

**10.2 — Ligação (confira antes de ajustar)**

| Borne | Ligado a |
| --- | --- |
| R/1L1, S/3L2, T/5L3 | Saída do disjuntor-motor DB1 (ou DB2) |
| U/2T1, V/4T2, W/6T3 | Motor da bomba |
| A1, A2 | Alimentação da eletrônica pelo D2 (ou D3), 90–250 Vca. Ligue a eletrônica antes da potência |
| DI1 | Contato 13-14 da contatora K-B1 (ou K-B2), que leva a mesma fase do A1 até a DI1 |
| DI2 | Reset por pulso de 0,5 s (opcional; não usado na SP02) |
| 13 – 14/23 | Relé de operação (livre; pode ir a uma entrada do CLP como retorno) |
| 14/23 – 24 | Relé de tensão plena / by-pass (livre) |

**10.3 — Na bancada real**

1. **Desligue e bloqueie** DG, DB1 e D2. Os trimpots ficam perto de partes energizadas.
2. Abra a tampa frontal.
3. Com chave de fenda pequena e isolada, gire **ACCEL TIME** até a marca de 5 s.
4. **DECEL TIME** até 10 s.
5. **PEDESTAL VOLTAGE** em torno de 30–40 %.
6. **MOTOR CURRENT**: calcule a porcentagem com a placa do motor (tabela 10.1).
7. Dip-switch com uma caneta: chaves 1 a 5 em **ON**, chave 6 em **MAN**.
8. Feche a tampa. Religue D2: o LED **READY** acende.
9. Religue DB1 e DG. Dê partida em **manual** pelo painel: **READY** pisca durante a rampa; em tensão plena **RUN** acende. Cronometre: ≈ 5 s.
10. Desligue: a bomba deve parar em ≈ 10 s (READY pisca durante a rampa de parada).
11. Com o motor girando, confira o **sentido de rotação** e a **corrente** com alicate amperímetro. Se a soft acusar **PHASE SEQ**, inverta duas fases na **entrada** (R/S/T).
12. Repita na SS_02.

As escalas impressas dos trimpots são aproximadas: o cronômetro é quem confirma o tempo.

**10.4 — No simulador**

1. Role até **Soft-starters WEG SSW-05 Plus** e clique na tampa, se estiver fechada.
2. Em cada soft, use o **ajuste fino** ao lado: ACCEL TIME `5,0 s`, DECEL TIME `10,0 s`, PEDESTAL V. `40 %`, MOTOR CURRENT `90 %` (14,4 A numa chave de 16 A).
3. Dip-switch: chaves 1–5 com a alavanca à direita (ON), chave 6 à esquerda (MAN).
4. Dê partida em manual: **READY** pisca durante 5 s, depois **RUN** acende; no gráfico e na vista 3D a bomba acelera.

## Parte 11 — Testar o sistema completo

Com o programa rodando, o simulador conectado, os pressostatos e as softs ajustados, siga o **roteiro de 14 testes** do Guia do simulador (Passo 10). Ele cobre manual, automático, jockey, incêndio e desligamento manual.

Três testes extras que pegam erros comuns de lógica:

| Teste | Resultado certo | Se der errado, olhe |
| --- | --- | --- |
| Com a Bomba 01 rodando em automático, gire a seleção para B02 | A Bomba 01 continua (está selada); a Bomba 02 não parte enquanto o PB estiver aberto | Rede 3: o selo não pode passar pela seleção |
| Com PB fechado (pressão baixa), aperte Desliga da principal | Ela para e volta a partir assim que você solta o botão | Comportamento esperado (Parte 1); para parar de vez, chave em 0 |
| Desligue o D4 (sem 24 Vcc no campo) | Todas as bombas param e os sinaleiros apagam | Os NF vão a 0 e cortam as redes 3, 4, 5 e 6 |

## Parte 12 — O programa inteiro em texto estruturado

Se preferir ST (ou para conferir o Ladder), o `SP02_Logica` completo fica assim:

```
// Sinaleiros de seleção
Q03 := xSelB1;
Q04 := xSelB2;

// Bombas principais: manual, automático e selo
xBomba1 := ((xB1Man AND xB1_L) OR (xB1Aut AND xSelB1 AND xPB) OR xBomba1)
           AND xB1_D AND (xB1Man OR xB1Aut);
xBomba2 := ((xB2Man AND xB2_L) OR (xB2Aut AND xSelB2 AND xPB) OR xBomba2)
           AND xB2_D AND (xB2Man OR xB2Aut);

// Jockey
xJockeyMan := (xBJ_L OR xJockeyMan) AND xBJ_D AND xBJMan;
xJockeyAut := xBJAut AND xPJ AND NOT xBomba1 AND NOT xBomba2 AND xBJ_D;

// Contatoras
Q00 := xBomba1;                      // K-B1 -> DI1 SS_01
Q01 := xBomba2;                      // K-B2 -> DI1 SS_02
Q02 := xJockeyMan OR xJockeyAut;     // K-BJ

// Sinaleiros de operação e de desligada
Q05 := xBomba1;      Q10 := NOT xBomba1;
Q06 := xBomba2;      Q11 := NOT xBomba2;
Q07 := Q02;          Q12 := NOT Q02;
```

## Erros comuns na lógica

| Sintoma no simulador | Causa provável | Correção |
| --- | --- | --- |
| A bomba só roda enquanto o botão Liga está apertado | Falta o contato de selo | Paralelo com a própria memória (Redes 3, 4 e 5) |
| A bomba não liga de jeito nenhum | Botão Desliga programado como contato negado | NF no campo = contato **NA** no Ladder (entrada vale 1 em repouso) |
| A principal desliga sozinha quando a pressão volta | Selo ausente ou o PB em série com tudo | O PB só pode estar no caminho de **ligar**, não em série com o selo |
| Jockey e principal ligadas juntas no automático | Faltam os contatos negados `xBomba1`/`xBomba2` na Rede 6 | Acrescente os dois contatos negados |
| Jockey liga e desliga muito rápido | Diferencial do PJ pequeno | Ajuste o DIF (Parte 9), não o programa |
| Sinaleiro "desligada" e "operação" acesos juntos | Mesma variável sem negar | "Desligada" usa contato negado (Redes 13–15) |
| Nada responde ao simulador | `xUsarSimulador = FALSE` ou Modbus sem mapeamento | Parte 4 e Guia do simulador, Passo 4C |
| A bomba não para em 10 s | Ajuste da soft, não do CLP | Trimpot de desaceleração (Parte 10) |
