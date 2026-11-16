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

Este guia usa exatamente os nomes do seu projeto: **B_SEL1, B_SEL2, B1_MAN, B1_AUT …** para as entradas e **K_B1, K_B2, K_BJ, RAX1 … RAX8** para as saídas. O selo das bombas principais é feito na própria variável da contatora. A única variável interna é a memória **M_BJ_MAN** (o selo da jockey em manual), explicada na Parte 5.

**3.0 — Forma direta (recomendada): variáveis no `UserPrg` e Modbus direto nelas**

É o jeito mais simples: as variáveis ficam como `VAR` dentro do `UserPrg`, a lógica também, e o **MODBUS Symbol Server** liga cada variável a uma coil ou input status. Não precisa da `GVL_SIM` nem dos programas `SP02_Entradas` e `SP02_Saidas`.

**1) Declare no `UserPrg`** as 27 variáveis do projeto **mais a memória `M_BJ_MAN`** (é a única que costuma faltar):

```
VAR
    B_SEL1, B_SEL2                 : BOOL;  // seleção da bomba 01 / 02
    B1_MAN, B1_AUT, B2_MAN, B2_AUT : BOOL;  // chaves Man/Auto das principais
    BJ_MAN, BJ_AUT                 : BOOL;  // chave Man/Auto da jockey
    B1_L, B1_D, B2_L, B2_D         : BOOL;  // botoeiras das principais (L = NA, D = NF)
    BJ_L, BJ_D                     : BOOL;  // botoeiras da jockey
    PJ, PB                         : BOOL;  // pressostatos (1 = pressão baixa)
    K_B1, K_B2, K_BJ               : BOOL;  // contatoras
    RAX1, RAX2, RAX3, RAX4         : BOOL;  // relés dos sinaleiros
    RAX5, RAX6, RAX7, RAX8         : BOOL;
    M_BJ_MAN                       : BOOL;  // memória: selo da jockey em manual
END_VAR
```

**2) Desenhe as redes da Parte 5 no próprio `UserPrg`** (em Ladder).

**3) Mapeie no MODBUS Symbol Server** (NET 1 → MODBUS Symbol Server → mapeamentos), na ordem abaixo. É a mesma ordem do simulador:

| Variável | Tipo | Endereço no MasterTool |
| --- | --- | --- |
| `UserPrg.B_SEL1` | Coil | 1 |
| `UserPrg.B_SEL2` | Coil | 2 |
| `UserPrg.B1_MAN` | Coil | 3 |
| `UserPrg.B1_AUT` | Coil | 4 |
| `UserPrg.B2_MAN` | Coil | 5 |
| `UserPrg.B2_AUT` | Coil | 6 |
| `UserPrg.BJ_MAN` | Coil | 7 |
| `UserPrg.BJ_AUT` | Coil | 8 |
| `UserPrg.B1_L` | Coil | 9 |
| `UserPrg.B1_D` | Coil | 10 |
| `UserPrg.B2_L` | Coil | 11 |
| `UserPrg.B2_D` | Coil | 12 |
| `UserPrg.BJ_L` | Coil | 13 |
| `UserPrg.BJ_D` | Coil | 14 |
| `UserPrg.PJ` | Coil | 15 |
| `UserPrg.PB` | Coil | 16 |
| `UserPrg.K_B1` | Input Status | 1 |
| `UserPrg.K_B2` | Input Status | 2 |
| `UserPrg.K_BJ` | Input Status | 3 |
| `UserPrg.RAX1` … `UserPrg.RAX8` | Input Status | 4 … 11 |

A `M_BJ_MAN` **não** é mapeada: é interna do programa.

**4) No simulador**, seção **Endereçamento Modbus**: modo **Contíguo**, 1ª coil `0`, 1ª entrada `0` e **Offset: Sem offset (base 0)**. O MasterTool conta a partir de 1: o endereço **1** dele é o endereço **0** do protocolo (por isso ele mostra `100001` para o input status 1). A coluna **No MasterTool** da tabela do simulador mostra exatamente esses números (1 a 16 e 1 a 11).

**5) Teste de uma vez:** gire a seleção para **B01** no simulador e veja no MasterTool online se `UserPrg.B_SEL1` vai a **TRUE**.
- Foi `B_SEL1`: está certo.
- Foi outra variável, ou o diagnóstico do simulador mostra **Exceção Modbus 2**: troque o offset para **Offset +1 (base 1)**, clique em Aplicar endereços e teste de novo.

**Bancada física também:** na forma direta o simulador escreve nas variáveis de entrada, então os bornes I00…I17 não são lidos. Se quiser que as saídas acionem a bancada real, acrescente no fim do `UserPrg`: `Q00 := K_B1; Q01 := K_B2; Q02 := K_BJ; Q03 := RAX1; … Q12 := RAX8;`. Para alternar entre bancada e simulador sem mexer no mapeamento, use a forma com `GVL_SIM` (itens 3.1 a 3.2 e Partes 4 e 6).

**Forma alternativa, com troca entre simulador e bornes reais**

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

**3.2 — As variáveis do programa**

São as 27 variáveis do seu projeto (16 entradas + 11 saídas) mais **uma memória interna**. Declare numa GVL chamada `GVL_SP02`, como abaixo:

```
VAR_GLOBAL
    // ---- Entradas
    B_SEL1 : BOOL;  // I00 - Seleção da bomba 01
    B_SEL2 : BOOL;  // I01 - Seleção da bomba 02
    B1_MAN : BOOL;  // I02 - Bomba 01 em manual
    B1_AUT : BOOL;  // I03 - Bomba 01 em automático
    B2_MAN : BOOL;  // I04 - Bomba 02 em manual
    B2_AUT : BOOL;  // I05 - Bomba 02 em automático
    BJ_MAN : BOOL;  // I06 - Jockey em manual
    BJ_AUT : BOOL;  // I07 - Jockey em automático
    B1_L   : BOOL;  // I10 - Liga bomba 01 (NA)
    B1_D   : BOOL;  // I11 - Desliga bomba 01 (NF: 1 = solto)
    B2_L   : BOOL;  // I12 - Liga bomba 02 (NA)
    B2_D   : BOOL;  // I13 - Desliga bomba 02 (NF)
    BJ_L   : BOOL;  // I14 - Liga jockey (NA)
    BJ_D   : BOOL;  // I15 - Desliga jockey (NF)
    PJ     : BOOL;  // I16 - Pressostato da jockey (1 = pressão baixa)
    PB     : BOOL;  // I17 - Pressostato das principais (1 = pressão baixa)
    // ---- Saídas
    K_B1   : BOOL;  // Q00 - Contatora bomba 01 (DI1 da SS_01)
    K_B2   : BOOL;  // Q01 - Contatora bomba 02 (DI1 da SS_02)
    K_BJ   : BOOL;  // Q02 - Contatora bomba jockey
    RAX1   : BOOL;  // Q03 - LB1_S bomba 01 selecionada
    RAX2   : BOOL;  // Q04 - LB2_S bomba 02 selecionada
    RAX3   : BOOL;  // Q05 - LB1_L bomba 01 ligada
    RAX4   : BOOL;  // Q06 - LB2_L bomba 02 ligada
    RAX5   : BOOL;  // Q07 - LBJ_L jockey ligada
    RAX6   : BOOL;  // Q10 - LB1_D bomba 01 desligada
    RAX7   : BOOL;  // Q11 - LB2_D bomba 02 desligada
    RAX8   : BOOL;  // Q12 - LBJ_D jockey desligada
    // ---- Memória interna (não é entrada nem saída)
    M_BJ_MAN : BOOL;  // selo da jockey em manual
END_VAR
```

**Se no seu projeto elas estão como `VAR` (locais), dentro de um programa só:** tudo bem, os nomes continuam os mesmos. Nesse caso, faça as Partes 4, 5 e 6 **no mesmo programa** (por exemplo, o `UserPrg`): primeiro o trecho das entradas, depois as redes da lógica e por último o das saídas. Variáveis `VAR` não são vistas por outros programas; por isso a GVL é necessária quando se separa em três programas.

## Parte 4 — Programa SP02_Entradas (escolha simulador ou bornes)

1. Botão direito em **Application → Acrescentar objeto → POU**.
2. Nome `SP02_Entradas`, tipo **Programa**, linguagem **Texto estruturado (ST)**. **Acrescentar**.
3. Cole no corpo:

```
IF GVL_SIM.xUsarSimulador THEN
    B_SEL1 := GVL_SIM.xSimIn[0];   B_SEL2 := GVL_SIM.xSimIn[1];
    B1_MAN := GVL_SIM.xSimIn[2];   B1_AUT := GVL_SIM.xSimIn[3];
    B2_MAN := GVL_SIM.xSimIn[4];   B2_AUT := GVL_SIM.xSimIn[5];
    BJ_MAN := GVL_SIM.xSimIn[6];   BJ_AUT := GVL_SIM.xSimIn[7];
    B1_L   := GVL_SIM.xSimIn[8];   B1_D   := GVL_SIM.xSimIn[9];
    B2_L   := GVL_SIM.xSimIn[10];  B2_D   := GVL_SIM.xSimIn[11];
    BJ_L   := GVL_SIM.xSimIn[12];  BJ_D   := GVL_SIM.xSimIn[13];
    PJ     := GVL_SIM.xSimIn[14];  PB     := GVL_SIM.xSimIn[15];
ELSE
    B_SEL1 := I00;  B_SEL2 := I01;  B1_MAN := I02;  B1_AUT := I03;
    B2_MAN := I04;  B2_AUT := I05;  BJ_MAN := I06;  BJ_AUT := I07;
    B1_L   := I10;  B1_D   := I11;  B2_L   := I12;  B2_D   := I13;
    BJ_L   := I14;  BJ_D   := I15;  PJ     := I16;  PB     := I17;
END_IF
```

Com `xUsarSimulador = TRUE` o painel do simulador comanda o CLP. Para a bancada física, mude para `FALSE` (na declaração ou forçando online).

## Parte 5 — Programa SP02_Logica em Ladder, rede por rede

**5.1 — Criar o programa**

1. **Application → Acrescentar objeto → POU**. Nome `SP02_Logica`, tipo **Programa**, linguagem **Diagrama Ladder (LD)**.
2. O editor abre com a **Rede 1** vazia. A **Caixa de ferramentas** (à direita) tem os elementos: **Contato**, **Contato negado**, **Bobina**, **Contato paralelo** e outros.

**5.2 — Como desenhar no editor (vale para todas as redes)**

- **Contato em série**: arraste **Contato** da caixa de ferramentas para cima da linha da rede. Clique em `???` acima dele e digite o nome da variável (ex.: `B1_MAN`). O MasterTool sugere os nomes enquanto você digita.
- **Contato negado** (NF no desenho): igual, usando **Contato negado**.
- **Ramo em paralelo**: clique com o botão direito num contato e escolha **Inserir contato paralelo (abaixo)**. Para um ramo com dois contatos em série, insira o paralelo e depois arraste outro contato para dentro desse ramo.
- **Bobina**: arraste **Bobina** para a ponta direita da rede e digite a variável.
- **Nova rede**: botão direito na área da rede → **Inserir rede (abaixo)**.
- **Comentário da rede**: clique na área de comentário acima da rede e escreva o que ela faz. Ajuda na correção.

Os nomes das ferramentas podem variar um pouco entre versões do MasterTool; os elementos são sempre os mesmos do Ladder IEC 61131-3.

**5.3 — Redes 1 e 2: sinaleiros de seleção**

A chave de seleção em B01 acende LB1_S (relé RAX1). Em B02 acende LB2_S (RAX2).

```ladder
{"t":"Rede 1 — Sinaleiro Bomba 01 selecionada","s":[["NO","B_SEL1","I00 seleção B01"]],"c":["RAX1","LB1_S"]}
```

```ladder
{"t":"Rede 2 — Sinaleiro Bomba 02 selecionada","s":[["NO","B_SEL2","I01 seleção B02"]],"c":["RAX2","LB2_S"]}
```

**5.4 — Rede 3: Bomba 01 (o coração do programa)**

Esta rede liga a contatora `K_B1` por três caminhos. Leia de cima para baixo:

1. **Manual**: chave em Man (`B1_MAN`) **e** botão Liga apertado (`B1_L`).
2. **Automático**: chave em Auto (`B1_AUT`) **e** seleção em B01 (`B_SEL1`) **e** PB fechado (pressão ≤ 4 kgf/cm²).
3. **Selo**: a própria `K_B1` mantém a bomba ligada depois que o botão é solto ou o PB abre.

Em série com os três caminhos ficam as condições de desligar: botão **Desliga** (`B1_D`, NF no campo, por isso contato NA no Ladder) e chave fora do 0 (Man **ou** Auto).

```ladder
{"t":"Rede 3 — Bomba 01: manual, automático e selo","s":[["P",[[["NO","B1_MAN","I02 Man"],["NO","B1_L","I10 Liga"]],[["NO","B1_AUT","I03 Auto"],["NO","B_SEL1","I00 Sel B01"],["NO","PB","I17 PB baixa"]],[["NO","K_B1","selo"]]]],["NO","B1_D","I11 Desliga (NF)"],["P",[[["NO","B1_MAN","I02 Man"]],[["NO","B1_AUT","I03 Auto"]]]]],"c":["K_B1","contatora B01"]}
```

Como desenhar esta rede:

1. Arraste um contato `B1_MAN` e, à direita dele, um contato `B1_L`.
2. Botão direito em `B1_MAN` → **Inserir contato paralelo (abaixo)** → `B1_AUT`. Arraste mais dois contatos para dentro desse ramo: `B_SEL1` e `PB`.
3. Insira mais um paralelo abaixo com `K_B1` (o selo).
4. À direita do bloco paralelo, um contato `B1_D`.
5. À direita, um contato `B1_MAN` com um paralelo abaixo `B1_AUT`.
6. Na ponta, a bobina `K_B1`.

Equivalente em texto estruturado, para conferir o raciocínio:

```
K_B1 := ((B1_MAN AND B1_L) OR (B1_AUT AND B_SEL1 AND PB) OR K_B1)
        AND B1_D AND (B1_MAN OR B1_AUT);
```

**5.5 — Rede 4: Bomba 02**

Igual à Rede 3, trocando 1 por 2 e a seleção por `B_SEL2`.

```ladder
{"t":"Rede 4 — Bomba 02: manual, automático e selo","s":[["P",[[["NO","B2_MAN","I04 Man"],["NO","B2_L","I12 Liga"]],[["NO","B2_AUT","I05 Auto"],["NO","B_SEL2","I01 Sel B02"],["NO","PB","I17 PB baixa"]],[["NO","K_B2","selo"]]]],["NO","B2_D","I13 Desliga (NF)"],["P",[[["NO","B2_MAN","I04 Man"]],[["NO","B2_AUT","I05 Auto"]]]]],"c":["K_B2","contatora B02"]}
```

Dica: no editor, copie a Rede 3 (botão direito → **Copiar**), cole abaixo e troque os nomes.

**5.6 — Redes 5 e 6: jockey (manual e automático)**

A jockey usa uma **memória interna**, `M_BJ_MAN`, só para o manual. Por quê: se o selo do manual fosse feito na própria `K_BJ`, a jockey que estivesse ligada pelo **automático** continuaria ligada sozinha quando alguém girasse a chave para **Man**, sem ninguém apertar Liga. Com a memória separada, o manual só sela quando o botão Liga é apertado.

**Rede 5 — memória do manual:** liga com o botão Liga, mantém pelo selo, desliga com o Desliga ou com a chave fora de Man.

```ladder
{"t":"Rede 5 — Jockey em manual (memória com selo)","s":[["P",[[["NO","BJ_L","I14 Liga"]],[["NO","M_BJ_MAN","selo"]]]],["NO","BJ_D","I15 Desliga (NF)"],["NO","BJ_MAN","I06 Man"]],"c":["M_BJ_MAN","memória manual"]}
```

**Rede 6 — contatora da jockey:** liga pela memória do manual **ou** pelo automático (chave em Auto, PJ fechado e nenhuma principal ligada). Os contatos **negados** de `K_B1` e `K_B2` fazem a jockey desligar sozinha quando a principal parte. O Desliga vale nos dois modos.

```ladder
{"t":"Rede 6 — Contatora da jockey: manual ou automático","s":[["P",[[["NO","M_BJ_MAN","manual"]],[["NO","BJ_AUT","I07 Auto"],["NO","PJ","I16 PJ baixa"],["NC","K_B1","B01 parada"],["NC","K_B2","B02 parada"]]]],["NO","BJ_D","I15 Desliga (NF)"]],"c":["K_BJ","contatora jockey"]}
```

```
M_BJ_MAN := (BJ_L OR M_BJ_MAN) AND BJ_D AND BJ_MAN;
K_BJ     := (M_BJ_MAN OR (BJ_AUT AND PJ AND NOT K_B1 AND NOT K_B2)) AND BJ_D;
```

No automático não há selo: o PJ só abre quando a pressão chega a 10 kgf/cm². A histerese (liga em 6, desliga em 10) está no pressostato, não no CLP.

**5.7 — Redes 7 a 12: sinaleiros de operação e de desligada**

"Em operação" copia a contatora; "desligada" é o contrário dela (contato negado).

```ladder
{"t":"Rede 7 — Bomba 01 em operação","s":[["NO","K_B1","contatora B01"]],"c":["RAX3","LB1_L"]}
```

```ladder
{"t":"Rede 10 — Bomba 01 desligada","s":[["NC","K_B1","contatora B01"]],"c":["RAX6","LB1_D"]}
```

As outras quatro seguem o mesmo modelo:

| Rede | Contato | Bobina | Sinaleiro |
| --- | --- | --- | --- |
| 8 | `K_B2` | `RAX4` | LB2_L (vermelho) |
| 9 | `K_BJ` | `RAX5` | LBJ_L (vermelho) |
| 11 | `K_B2` negado | `RAX7` | LB2_D (verde) |
| 12 | `K_BJ` negado | `RAX8` | LBJ_D (verde) |

**5.8 — Conferir a lógica antes de compilar**

| Situação | `K_B1` | `K_BJ` | Por quê |
| --- | --- | --- | --- |
| Tudo em 0 | 0 | 0 | Sem chave em Man/Auto não há caminho |
| B1 em Man, aperta Liga | 1 | — | Caminho manual + selo |
| B1 em Man, aperta Desliga | 0 | — | `B1_D` vai a 0 e corta a rede |
| Jockey Auto, PJ fecha | — | 1 | Caminho automático da Rede 6 |
| PB fecha, B1 Auto, seleção B01 | 1 | 0 | Rede 3 liga; a Rede 6 corta pelo `K_B1` negado |
| Pressão volta a 10 (PB abre) | 1 | 0 | O selo mantém a principal |
| Aperta Desliga da B1 | 0 | — | Única forma de parar no automático |
| Jockey ligada no Auto, chave vai para Man (sem apertar Liga) | — | 0 | `M_BJ_MAN` só sela quando Liga é apertado |

## Parte 6 — Programa SP02_Saidas (bornes e simulador)

As variáveis `K_B1 … RAX8` precisam ir para os bornes de saída do XP325 **e** para o simulador.

1. **Acrescentar objeto → POU** → `SP02_Saidas`, **Programa**, **ST**.
2. Cole:

```
// Bornes físicos do XP325
Q00 := K_B1;   Q01 := K_B2;   Q02 := K_BJ;
Q03 := RAX1;   Q04 := RAX2;   Q05 := RAX3;   Q06 := RAX4;   Q07 := RAX5;
Q10 := RAX6;   Q11 := RAX7;   Q12 := RAX8;

// Para o simulador ler (input status)
GVL_SIM.xSimOut[0]  := K_B1;   // Q00
GVL_SIM.xSimOut[1]  := K_B2;   // Q01
GVL_SIM.xSimOut[2]  := K_BJ;   // Q02
GVL_SIM.xSimOut[3]  := RAX1;   // Q03 LB1_S
GVL_SIM.xSimOut[4]  := RAX2;   // Q04 LB2_S
GVL_SIM.xSimOut[5]  := RAX3;   // Q05 LB1_L
GVL_SIM.xSimOut[6]  := RAX4;   // Q06 LB2_L
GVL_SIM.xSimOut[7]  := RAX5;   // Q07 LBJ_L
GVL_SIM.xSimOut[8]  := RAX6;   // Q10 LB1_D
GVL_SIM.xSimOut[9]  := RAX7;   // Q11 LB2_D
GVL_SIM.xSimOut[10] := RAX8;   // Q12 LBJ_D
```

## Parte 7 — Chamar os programas, compilar e carregar

**7.1 — Ordem de execução na MainTask**

A ordem importa: primeiro ler as entradas, depois a lógica, por fim copiar as saídas.

Na **forma direta (3.0)** não há nada a fazer aqui: o `UserPrg` já é chamado pela MainTask. Os passos abaixo valem para a forma com três programas.

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

1. No simulador: IP do XP325, porta 502, Unit ID 255 (padrão), **Conectar** (Guia do simulador, Passo 5).
2. No MasterTool, com o CLP online, abra `SP02_Logica`. Os contatos fechados e as bobinas ligadas ficam **azuis**; ao lado de cada variável aparece o valor.
3. Gire a seleção para B01 no simulador: na Rede 1, `B_SEL1` fica azul e `RAX1` liga. No simulador, LB1_S acende.
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
7. Recoloque a tampa, religue o D4 e confira no MasterTool online: sem pressão, `PJ` e `PB` = TRUE.
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
RAX1 := B_SEL1;
RAX2 := B_SEL2;

// Bombas principais: manual, automático e selo (na própria contatora)
K_B1 := ((B1_MAN AND B1_L) OR (B1_AUT AND B_SEL1 AND PB) OR K_B1)
        AND B1_D AND (B1_MAN OR B1_AUT);
K_B2 := ((B2_MAN AND B2_L) OR (B2_AUT AND B_SEL2 AND PB) OR K_B2)
        AND B2_D AND (B2_MAN OR B2_AUT);

// Jockey: memória própria para o manual; automático pelo PJ (desliga se uma principal ligar)
M_BJ_MAN := (BJ_L OR M_BJ_MAN) AND BJ_D AND BJ_MAN;
K_BJ     := (M_BJ_MAN OR (BJ_AUT AND PJ AND NOT K_B1 AND NOT K_B2)) AND BJ_D;

// Sinaleiros de operação e de desligada
RAX3 := K_B1;      RAX6 := NOT K_B1;
RAX4 := K_B2;      RAX7 := NOT K_B2;
RAX5 := K_BJ;      RAX8 := NOT K_BJ;
```

## Erros comuns na lógica

| Sintoma no simulador | Causa provável | Correção |
| --- | --- | --- |
| A bomba só roda enquanto o botão Liga está apertado | Falta o contato de selo | Paralelo com a própria contatora (`K_B1`, `K_B2`) nas Redes 3 e 4; na jockey, com a memória `M_BJ_MAN` (Rede 5) |
| A bomba não liga de jeito nenhum | Botão Desliga programado como contato negado | NF no campo = contato **NA** no Ladder (entrada vale 1 em repouso) |
| A principal desliga sozinha quando a pressão volta | Selo ausente ou o `PB` em série com tudo | O `PB` só pode estar no caminho de **ligar**, não em série com o selo |
| Jockey e principal ligadas juntas no automático | Faltam os contatos negados `K_B1`/`K_B2` na Rede 6 | Acrescente os dois contatos negados no ramo automático |
| Jockey continua ligada ao passar de Auto para Man | Selo do manual feito na própria `K_BJ` | Use a memória `M_BJ_MAN` (Redes 5 e 6) |
| Jockey liga e desliga muito rápido | Diferencial do PJ pequeno | Ajuste o DIF (Parte 9), não o programa |
| Sinaleiro "desligada" e "operação" acesos juntos | Mesma variável sem negar | "Desligada" usa contato negado (Redes 10–12) |
| Lógica certa, mas o simulador não vê as saídas | Faltou a Parte 6 (copiar `K_B1 … RAX8` para `Q00 … Q12` e `xSimOut`) | Confira o `SP02_Saidas` e a ordem na MainTask |
| Nada responde ao simulador | `xUsarSimulador = FALSE` ou Modbus sem mapeamento | Parte 4 e Guia do simulador, Passo 4C |
| A bomba não para em 10 s | Ajuste da soft, não do CLP | Trimpot de desaceleração (Parte 10) |
