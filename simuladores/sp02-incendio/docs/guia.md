## Antes de começar

O simulador faz o papel do campo da SP02 (painel, chaves, botões, pressostatos, soft-starters, motores e rede de água). O CLP faz o papel dele mesmo: roda o programa do sistema de incêndio. Os dois conversam por Modbus TCP, com o **simulador como cliente** e o **CLP como servidor**.

| Quem | Faz o quê | Pela rede |
| --- | --- | --- |
| Simulador | Envia o estado das chaves, botões e pressostatos | Escreve **coils** no CLP |
| CLP | Lê essas coils como entradas I0.0 … I1.7 e roda o programa | — |
| CLP | Liga as saídas Q0.0 … Q1.2 (contatoras e sinaleiros) | Expõe como **discrete inputs** |
| Simulador | Lê as discrete inputs e liga contatoras, soft-starters, motores e lâmpadas | Lê com FC02 |

**O que você precisa**

- PC com Windows 10 ou 11, 64 bits.
- Arquivo `SimuladorSistemaIncendio.exe`.
- Um CLP com servidor Modbus TCP. Na bancada: **Altus XP325** (Passo 4C). Também servem o CODESYS Control Win no próprio PC (Passo 4A) ou um S7-1200 (Passo 4B).
- PC e CLP na mesma rede e na mesma faixa de IP (ex.: PC 192.168.0.10 e CLP 192.168.0.1). Se o CLP for o CODESYS no mesmo PC, não precisa de rede.
- O programa da SP02 no CLP, usando as variáveis da tabela do Passo 3.

**Dois guias**

Este guia ensina a usar o simulador e a comunicar com o CLP. O guia **[Programar o CLP](guia-programacao.html)** ensina a lógica da SP02 no XP325, rede por rede, e o ajuste dos pressostatos e da SSW-05. Os dois abrem pelos botões no topo do simulador.

**Como seguir o guia**

Faça os passos na ordem. Os passos 4A, 4B e 4C são alternativos: faça só o do seu CLP (na bancada, o 4C). Se ainda não tem CLP pronto, pule para o Passo 6 e use o CLP virtual de teste que vem dentro do simulador.

## Passo 1 — Abrir o simulador pela primeira vez

O `.exe` não instala nada: ele já leva tudo dentro. Basta copiar e abrir.

1. Copie `SimuladorSistemaIncendio.exe` para uma pasta fixa, por exemplo `C:\Simuladores\`. Evite rodar direto do e-mail ou do WhatsApp, porque o atalho criado vai apontar para onde o arquivo estiver.
2. Dê **dois cliques** no arquivo.
3. Se aparecer a tela azul **"O Windows protegeu o computador"**:
    1. Clique em **Mais informações** (texto pequeno, logo abaixo da mensagem).
    2. Clique em **Executar assim mesmo**.
    3. Isso só acontece na primeira vez, porque o arquivo não tem assinatura digital.
4. Abre uma **janela preta**. Ela mostra o endereço do simulador e os IPs do PC. **Não feche essa janela** enquanto usar o simulador: fechar a janela desliga o simulador.
5. Se aparecer o aviso do **Firewall do Windows**:
    1. Marque **Redes privadas**.
    2. Clique em **Permitir acesso**.
    3. Isso só é necessário se outros PCs forem abrir o simulador pelo navegador. Para usar só neste PC, pode clicar em Cancelar.
6. O navegador abre sozinho em `http://localhost:3000`. Se não abrir, abra o Chrome ou o Edge e digite esse endereço.
7. Na área de trabalho aparece o atalho **Simulador Sistema de Incêndio**. Das próximas vezes, abra por ele.

**Para fechar:** feche a janela preta. Tudo o que você configurou (IP, parâmetros das soft-starters, pressostatos, sessões) fica salvo automaticamente em `%LOCALAPPDATA%\SimuladorSP02`.

**Para atualizar para uma versão nova:** substitua o `.exe` antigo pelo novo, com o mesmo nome. As configurações continuam.

## Passo 2 — Conhecer cada área da tela

A tela mostra o processo em largura total. A comunicação fica num painel à esquerda que começa **oculto**: clique no botão **Conectar ao CLP** no topo para abrir e em **Ocultar painel ✕** para fechar. O botão do topo mostra o estado da conexão o tempo todo: bolinha verde = conectado (com o IP), amarela = conectando, vermelha = erro, cinza = desconectado. O simulador lembra se você deixou o painel aberto ou fechado.

| Área | Onde fica | Para que serve |
| --- | --- | --- |
| Abas de sessão | Topo, à direita | Cada aba é uma bancada (um CLP). Bolinha verde = conectada. **+ Nova sessão** cria outra. |
| Diagrama elétrico | Topo, à direita | Abre o diagrama elétrico interativo da sessão, ao vivo, em nova guia (Passo 13). |
| Guia passo a passo | Topo, à direita | Abre este guia em uma nova guia do navegador. |
| Conexão com o CLP | Painel da esquerda (botão **Conectar ao CLP** no topo) | IP, porta, endereços, botões Conectar/Desconectar e o selo de status. Embaixo, o botão do CLP virtual de teste. |
| Fila de requisições | Painel da esquerda, meio | Quantas mensagens estão esperando em cada prioridade, velocidade (req/s), tempo de resposta e erros. |
| Diagnóstico | Painel da esquerda, embaixo | Mensagens de conexão, erros e, se marcado, cada frame enviado e recebido. |
| Casa de bombas | Direita, topo | Processo em 3D (ou P&ID), manômetro, gráfico dos últimos 2 minutos, vazamento e hidrante. |
| Painel de operação | Abaixo da casa de bombas | A porta do painel: sinaleiros, chaves seletoras e botoeiras. |
| Soft-starters SSW-05 Plus | Abaixo do painel | As duas softs (SS_01 e SS_02) desenhadas como o equipamento: tampa, trimpots, dip-switch, LEDs e RESET. |
| Pressostatos | Abaixo das softs | PJ e PB, com ajuste de faixa e diferencial. |
| Quadro elétrico | Abaixo dos pressostatos | Disjuntores DG, D1, D4, D2, D3, DB1, DB2, DBJ e o estado das contatoras. |
| Endereçamento Modbus | No fim da página | Endereço Modbus de cada ponto (editável no modo Tabela), notação 0x/1x, borne do XP325, variável `GVL_SIM`, estado ao vivo e botões para copiar ou baixar a tabela. |

**Cores que se repetem**

- Selo verde **Conectado**: comunicação funcionando.
- Selo amarelo **Conectando** ou **Sem conexão — nova tentativa em 3 s**: o simulador está tentando sozinho.
- Selo vermelho **Falha na conexão**: precisa da sua ação (veja Solução de problemas).
- No mapa de I/O, **1** em verde = ligado; **0** em cinza = desligado.

Os campos de conexão ficam acinzentados enquanto está conectado. Para alterar IP, porta ou endereços, clique antes em **Desconectar**.

## Passo 3 — Entender o mapa de I/O e os endereços Modbus

O diagrama da SP02 foi feito para um S7-1200 (I0.0, Q0.0…). Na bancada o CLP é o Altus XP325, cujos bornes têm nomes diretos: I0.0 vira **I00**, I1.0 vira **I10**, Q0.0 vira **Q00** e assim por diante. As tabelas mostram os dois.

São 16 coils (saídas do simulador = entradas do CLP) e 11 discrete inputs (saídas do CLP = entradas do simulador). O endereço Modbus é sempre **base + posição**. Com as bases padrão (0 e 0), I0.0 é a coil 0 e Q0.0 é a discrete input 0.

**Coils — o simulador escreve, o CLP lê como entrada**

| Coil (base 0) | Entrada XP325 (SP02) | Tag | Vale 1 quando… |
| --- | --- | --- | --- |
| 0 | I00 (I0.0) | B_SEL | chave de seleção em Bomba 01 |
| 1 | I01 (I0.1) | B_SEL | chave de seleção em Bomba 02 |
| 2 | I02 (I0.2) | B1_MA | Bomba 01 em Manual |
| 3 | I03 (I0.3) | B1_MA | Bomba 01 em Automático |
| 4 | I04 (I0.4) | B2_MA | Bomba 02 em Manual |
| 5 | I05 (I0.5) | B2_MA | Bomba 02 em Automático |
| 6 | I06 (I0.6) | BJ_MA | Jockey em Manual |
| 7 | I07 (I0.7) | BJ_MA | Jockey em Automático |
| 8 | I10 (I1.0) | B1_L | botão Liga da Bomba 01 pressionado (NA) |
| 9 | I11 (I1.1) | B1_D | botão Desliga da Bomba 01 **solto** (NF) |
| 10 | I12 (I1.2) | B2_L | botão Liga da Bomba 02 pressionado (NA) |
| 11 | I13 (I1.3) | B2_D | botão Desliga da Bomba 02 **solto** (NF) |
| 12 | I14 (I1.4) | BJ_L | botão Liga da Jockey pressionado (NA) |
| 13 | I15 (I1.5) | BJ_D | botão Desliga da Jockey **solto** (NF) |
| 14 | I16 (I1.6) | PJ | pressão baixa no pressostato da jockey (contato fechado) |
| 15 | I17 (I1.7) | PB | pressão baixa no pressostato das principais (contato fechado) |

**Discrete inputs — o CLP liga, o simulador lê**

| DI (base 0) | Saída XP325 (SP02) | Tag | O que acontece no simulador |
| --- | --- | --- | --- |
| 0 | Q00 (Q0.0) | K-B1 | contatora fecha a DI1 da SS_01 (parte a Bomba 01) |
| 1 | Q01 (Q0.1) | K-B2 | contatora fecha a DI1 da SS_02 (parte a Bomba 02) |
| 2 | Q02 (Q0.2) | K-BJ | parte a jockey em partida direta |
| 3 | Q03 (Q0.3) | RAX1 | acende LB1_S (Bomba 01 selecionada) |
| 4 | Q04 (Q0.4) | RAX2 | acende LB2_S (Bomba 02 selecionada) |
| 5 | Q05 (Q0.5) | RAX3 | acende LB1_L (Bomba 01 ligada) |
| 6 | Q06 (Q0.6) | RAX4 | acende LB2_L (Bomba 02 ligada) |
| 7 | Q07 (Q0.7) | RAX5 | acende LBJ_L (Jockey ligada) |
| 8 | Q10 (Q1.0) | RAX6 | acende LB1_D (Bomba 01 desligada) |
| 9 | Q11 (Q1.1) | RAX7 | acende LB2_D (Bomba 02 desligada) |
| 10 | Q12 (Q1.2) | RAX8 | acende LBJ_D (Jockey desligada) |

**Três cuidados que confundem alunos**

1. **Botões Desliga são NF.** Solto = 1, pressionado = 0. No programa, a parada é pela **queda** do sinal.
2. **Pressostato "fechado" = pressão baixa.** PJ = 1 pede a jockey; PB = 1 pede a principal.
3. **Sem 24 Vcc no campo** (disjuntor D1 ou D4 aberto no quadro elétrico), o simulador envia **todas as coils em 0**, como no painel real. Isso inclui os NF, que passam a parecer "pressionados".

**3.1 — Como escolher os endereços no simulador**

Tudo fica na seção **Endereçamento Modbus**, no fim da página do simulador. Há dois modos:

| Modo | Como funciona | Quando usar |
| --- | --- | --- |
| **Contíguo** (padrão) | Coils = **1ª coil** + posição (I00 = 1ª coil, I01 = 1ª coil + 1 …). Discrete inputs = **1ª entrada** + posição. Os dois campos ficam na seção **Conexão com o CLP** | Quando o CLP tem as 16 coils e as 11 entradas em sequência (Passos 4A, 4B e 4C) |
| **Tabela** | Você digita o endereço Modbus de cada ponto, um por um | Quando o programa do CLP já existe com endereços espalhados, ou para treinar endereçamento |

Passo a passo:

1. Clique em **Desconectar** (os endereços só mudam desconectado).
2. Em **Modo**, escolha **Contíguo** ou **Tabela**.
3. No modo Tabela, digite o endereço na coluna **Endereço** de cada linha (0 a 65535, sem repetir).
4. Clique em **Aplicar endereços**. Se houver erro (endereço repetido ou fora da faixa), aparece um aviso e nada muda.
5. Conecte de novo. O **Diagnóstico** mostra as faixas usadas, por exemplo *coils 0–15; discrete inputs 0–10*.

O simulador agrupa sozinho os pontos de endereços seguidos numa só mensagem (FC15 para escrever, FC02 para ler). Endereços espalhados geram mais mensagens, mas a fila continua protegendo o CLP.

**3.2 — A tabela para copiar para o CLP**

A tabela mostra, para cada ponto: **Endereço** (o número que vai no protocolo, começando em 0), **Notação 0x / 1x** (o mesmo endereço no estilo 1-based que muitos manuais e IHMs usam: coil 0 = 00001, discrete input 0 = 10001), borne do XP325 com o endereço da SP02, tag, a **variável do XP325** (`GVL_SIM.xSimIn[n]` / `GVL_SIM.xSimOut[n]`), descrição e estado ao vivo.

| Botão | O que gera |
| --- | --- |
| **Copiar tabela** | A tabela inteira na área de transferência. Cole no Excel, no Word ou num e-mail |
| **Baixar CSV** | O mesmo conteúdo em arquivo `.csv` (abre no Excel) |
| **Baixar mapeamento MasterTool** | Uma linha por ponto: variável, tipo (Coil / Input Status), endereço e tamanho, prontos para preencher o MODBUS Symbol Server do XP325 (Passo 4C.3) |

Atenção ao 0-based e 1-based: o simulador sempre usa o endereço do protocolo (começa em 0). Se o seu CLP ou software numerar a partir de 1, some 1 ao preencher (é para isso que serve a coluna de notação 0x/1x).

## Passo 4A — Configurar o CLP como servidor Modbus no CODESYS

No CODESYS, o servidor Modbus tem uma área própria para coils e outra para discrete inputs. As coils chegam ao programa como **entradas** e as discrete inputs saem do programa como **saídas**, exatamente o que o simulador espera. Faça este passo se o seu CLP for CODESYS (CODESYS Control Win no PC ou um CLP baseado em CODESYS). Os nomes dos menus seguem a ajuda oficial; em versões antigas o dispositivo se chama "Slave" em vez de "Server".

**4A.1 — Adicionar a rede Ethernet**

1. Abra o projeto da SP02 no CODESYS.
2. Na árvore de dispositivos, clique com o botão direito no **Device** (o CLP) → **Adicionar dispositivo…**
3. Em **Fieldbuses → Ethernet Adapter**, escolha **Ethernet** e clique em **Adicionar dispositivo**.
4. Dê dois cliques em **Ethernet**. Na aba **Geral**, escolha a placa de rede. No CODESYS Control Win, escolha a placa do PC que está na rede do simulador.

**4A.2 — Adicionar o servidor Modbus TCP**

1. Botão direito em **Ethernet** → **Adicionar dispositivo…**
2. Em **Fieldbuses → Modbus → ModbusTCP Server**, escolha **ModbusTCP Server Device** e adicione.
3. Dê dois cliques nele e abra a aba **Geral**. Configure:

| Campo | Valor | Por quê |
| --- | --- | --- |
| Server port | 502 | Mesma porta configurada no simulador |
| Bind to Adapter | **desmarcado** | Assim o servidor aceita conexões de qualquer IP do PC, inclusive 127.0.0.1 |
| Watchdog | marcado, 1000 ms | Se a comunicação cair, as entradas vindas do simulador são zeradas |
| Discrete Bit Areas | **marcado** | Cria áreas próprias para coils e discrete inputs |
| Coils | 16 | I0.0 a I1.7 |
| Discrete inputs | 16 | Q0.0 a Q1.2 (11 usadas; 16 fecha 2 bytes) |
| Endereço inicial (se a sua versão mostrar) | 0 | Igual à 1ª coil e à 1ª entrada do simulador |

Se **Discrete Bit Areas** ficar desmarcado, as coils passam a ocupar os bits dos holding registers e as discrete inputs os bits dos input registers. Funciona, mas confunde; mantenha marcado.

**4A.3 — Ligar as variáveis do programa (I/O Mapping)**

1. Ainda no ModbusTCP Server Device, abra a aba **ModbusTCP Server I/O Mapping** (ou **I/O Mapping**).
2. Expanda **Coils**. Cada bit é uma entrada (%IX). Na coluna **Variável**, digite o nome da variável do programa na ordem do Passo 3: bit 0 = seleção Bomba 01 (I0.0), bit 1 = seleção Bomba 02 (I0.1), e assim até o bit 15 = PB (I1.7).
3. Expanda **Discrete inputs**. Cada bit é uma saída (%QX). Ligue bit 0 = K-B1 (Q0.0), bit 1 = K-B2 (Q0.1) … bit 10 = RAX8 (Q1.2).
4. Em **Sempre atualizar variáveis**, escolha **Habilitado 2 (sempre na tarefa de ciclo de barramento)** ou a opção equivalente da sua versão. Sem isso, saídas não usadas no programa podem não ser enviadas.
5. Compile (**F11**). Não pode haver erro.

**4A.4 — Carregar e rodar**

1. Se usar o CODESYS Control Win, inicie-o pelo ícone da bandeja do Windows (**Start PLC**).
2. No CODESYS, **Online → Login** (Alt+F8) e confirme o download.
3. **Online → Start** (F5).
4. Na árvore, o Ethernet e o ModbusTCP Server Device devem ficar com o ícone verde.
5. Se o Windows perguntar sobre o firewall para o CODESYS, permita em **Redes privadas**.

IP que você vai digitar no simulador:

- CODESYS Control Win **no mesmo PC** do simulador: `127.0.0.1`.
- CLP CODESYS **físico**: o IP configurado na aba Geral do Ethernet.

Referência: [ajuda do CODESYS — ModbusTCP Server Device, aba Geral](https://content.helpme-codesys.com/en/CODESYS%20Modbus/_mod_edt_slave_device_tcp.html).

## Passo 4B — Configurar o CLP Siemens S7-1200 (TIA Portal, MB_SERVER)

No S7-1200 o MB_SERVER, por padrão, liga as coils às **saídas reais** (%Q) e as discrete inputs às **entradas reais** (%I). Isso é o contrário do que o simulador precisa. A solução é mapear as duas áreas para blocos de dados (DB) pelo **Data_Area_Array** do MB_SERVER, que existe a partir da CPU S7-1200 com firmware **V4.2**. Confira o firmware em **Configuração de dispositivos → CPU → Propriedades → Geral**.

**4B.1 — Rede**

1. Em **Configuração de dispositivos**, clique na porta PROFINET da CPU → **Propriedades → Endereços Ethernet**.
2. Anote o IP do CLP (ex.: 192.168.0.1, máscara 255.255.255.0).
3. Configure a placa de rede do PC com IP fixo na mesma faixa (ex.: 192.168.0.10, máscara 255.255.255.0). No Windows: **Configurações → Rede e Internet → Ethernet → Editar atribuição de IP → Manual**.

**4B.2 — Criar os DBs de troca**

Crie três DBs globais. Nos três: botão direito → **Propriedades → Atributos** → **desmarque "Acesso otimizado ao bloco"**. Sem isso o Data_Area não funciona.

| DB | Nome sugerido | Conteúdo | Para quê |
| --- | --- | --- | --- |
| DB10 | MB_Coils | `Bit` : Array[0..15] of Bool | Coils escritas pelo simulador (I0.0 … I1.7) |
| DB11 | MB_DI | `Bit` : Array[0..15] of Bool | Discrete inputs lidas pelo simulador (Q0.0 … Q1.2) |
| DB12 | MB_HR | `Reg` : Array[0..9] of Word | Holding registers. Não são usados, mas o MB_SERVER exige este parâmetro |

**4B.3 — Chamar o MB_SERVER**

1. Em **Instruções → Comunicação → Outros → MODBUS TCP**, arraste o **MB_SERVER** para o OB1. Aceite o DB de instância (ex.: `MB_SERVER_DB`).
2. Crie uma variável do tipo **TCON_IP_v4** (por exemplo em um DB `MB_Conexao`) com estes valores iniciais:

| Campo | Valor |
| --- | --- |
| InterfaceId | identificador de HW da interface PROFINET (normalmente 64; veja em Propriedades → Identificador de hardware) |
| ID | 1 |
| ConnectionType | 11 (TCP) |
| ActiveEstablished | FALSE |
| RemoteAddress | 0.0.0.0 (aceita qualquer cliente) |
| RemotePort | 0 |
| LocalPort | 502 |

3. Ligue os parâmetros do MB_SERVER: **DISCONNECT** = FALSE, **MB_HOLD_REG** = `"MB_HR".Reg`, **CONNECT** = a variável TCON_IP_v4.

**4B.4 — Configurar o Data_Area_Array**

1. Abra o DB de instância `MB_SERVER_DB` e expanda a variável estática **Data_Area_Array**.
2. Preencha a coluna **Valor de partida** (start value) dos dois primeiros elementos. Os elementos usados precisam ser consecutivos, sem buraco.

| Elemento | data_type | db | start | length | Efeito |
| --- | --- | --- | --- | --- | --- |
| Data_Area_Array[1] | 1 (coils: FC 1, 5 e 15) | 10 | 0 | 16 | Coils 0 a 15 vão para o DB10 |
| Data_Area_Array[2] | 2 (entradas: FC 2) | 11 | 0 | 16 | Discrete inputs 0 a 15 vêm do DB11 |
| Data_Area_Array[3] a [8] | 0 | — | — | — | Não usados |

Com isso, o simulador nunca escreve nas saídas físicas %Q. O campo **start** deve ser igual à **1ª coil** e à **1ª entrada** configuradas no simulador (0 e 0).

**4B.5 — Ligar o programa aos DBs**

No início do OB1, use os bits do DB10 no lugar das entradas físicas. No fim do OB1, copie as saídas para o DB11.

| Entrada no programa | Vem de | Saída do programa | Vai para |
| --- | --- | --- | --- |
| I0.0 seleção B01 | `"MB_Coils".Bit[0]` | Q0.0 K-B1 | `"MB_DI".Bit[0]` |
| I0.1 seleção B02 | `"MB_Coils".Bit[1]` | Q0.1 K-B2 | `"MB_DI".Bit[1]` |
| … | … | … | … |
| I1.7 PB | `"MB_Coils".Bit[15]` | Q1.2 RAX8 | `"MB_DI".Bit[10]` |

Forma mais simples: no início do OB1, copie cada bit do DB10 para um marcador com nome (ex.: `"MB_Coils".Bit[0]` → `%M10.0 B_SEL_B1`) e use esses marcadores no programa. Para a bancada física depois, basta trocar essa cópia por %I0.0 → %M10.0.

**4B.6 — Carregar e conferir**

1. Compile (**Compilar → Hardware e software**).
2. Carregue na CPU e coloque em **RUN**.
3. Monitore o MB_SERVER: com o simulador conectado, **NDR** e **DR** pulsam e **ERROR** fica em FALSE.
4. **STATUS = 16#8383** indica que o simulador pediu um endereço fora das áreas definidas: confira start/length do Data_Area_Array e as bases no simulador.

Firmware abaixo de V4.2 não tem Data_Area_Array. Nesse caso, use o CODESYS (Passo 4A) ou atualize o firmware da CPU.

Referência: [Siemens — acesso a áreas de dados em DB a partir da V4.0](https://docs.tia.siemens.cloud/r/es-es/v20/modbus-rtu-s7-1200-s7-1500/modbus_slave-s7-1200-s7-1500/acceso-a-areas-de-datos-en-db-en-lugar-del-acceso-directo-a-direcciones-modbus-a-partir-de-la-version-v4.0-s7-1200-s7-1500) (página do Modbus_Slave; o MB_SERVER usa a mesma estrutura MB_DataArea).

## Passo 4C — Configurar o Altus XP325 (MasterTool IEC XE)

O XP325 (Nexto Xpress) tem servidor Modbus TCP na porta NET 1 e é programado no MasterTool IEC XE. Como as entradas integradas (I00 a I17) são escritas pelo hardware a cada ciclo, o Modbus não consegue escrever nelas. Por isso o simulador escreve numa lista de variáveis própria, e o programa escolhe se lê os bornes reais ou o simulador.

O passo a passo completo do programa (Ladder rede por rede), dos pressostatos e da SSW-05 está no guia **[Programar o CLP](guia-programacao.html)**. Aqui fica só a comunicação.

**4C.1 — Rede**

1. No MasterTool IEC XE, abra o projeto da SP02 (modelo XP325).
2. Na árvore de dispositivos, dê dois cliques em **NET 1** e confira o endereço IP e a máscara do XP325 (ex.: 192.168.0.1 / 255.255.255.0).
3. Coloque a placa de rede do PC na mesma faixa (ex.: 192.168.0.10), como no Passo 4B.1.

**4C.2 — Criar a lista de variáveis de troca**

1. Botão direito em **Application** → **Acrescentar objeto** → **Lista de variáveis globais (GVL)**. Nome: `GVL_SIM`.
2. Digite:

```
VAR_GLOBAL
    xSimIn         : ARRAY[0..15] OF BOOL;  // escrito pelo simulador (coils): I00..I17
    xSimOut        : ARRAY[0..15] OF BOOL;  // lido pelo simulador (input status): Q00..Q12
    xUsarSimulador : BOOL := TRUE;          // TRUE = simulador; FALSE = bornes reais
END_VAR
```

**4C.3 — Adicionar o servidor Modbus**

1. Botão direito em **NET 1** → **Acrescentar dispositivo…**
2. Escolha **MODBUS Symbol Server** (servidor MODBUS por símbolo) e clique em **Acrescentar dispositivo**.
3. Dê dois cliques no servidor criado. Nos parâmetros gerais, confira a **porta TCP 502**.
4. Na aba de mapeamentos, crie duas linhas:

| Variável | Tipo de dado | Endereço inicial | Tamanho |
| --- | --- | --- | --- |
| `GVL_SIM.xSimIn` | Coil | primeiro endereço | 16 |
| `GVL_SIM.xSimOut` | Input Status | primeiro endereço | 16 |

O endereço inicial deve casar com **1ª coil** e **1ª entrada** do simulador. O Modbus no fio começa em 0; algumas telas do MasterTool numeram a partir de 1. Para conferir, no Passo 5 gire a seleção para B01: o valor tem de aparecer em `xSimIn[0]`. Se aparecer em `xSimIn[1]`, ou se o diagnóstico mostrar *Exceção 2*, ajuste 1 unidade na **1ª coil** (e na **1ª entrada**) do simulador.

**4C.4 — Ligar o programa**

No início do programa principal, escolha a origem das entradas. No fim, copie as saídas para o simulador. Exemplo em texto estruturado (use os nomes de variável do seu programa):

```
// ---- Entradas: simulador ou bornes reais
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

// ... lógica da SP02 ligando Q00 a Q12 ...

// ---- Saídas: o simulador lê o mesmo que vai para os bornes
GVL_SIM.xSimOut[0] := Q00;  GVL_SIM.xSimOut[1] := Q01;  GVL_SIM.xSimOut[2]  := Q02;
GVL_SIM.xSimOut[3] := Q03;  GVL_SIM.xSimOut[4] := Q04;  GVL_SIM.xSimOut[5]  := Q05;
GVL_SIM.xSimOut[6] := Q06;  GVL_SIM.xSimOut[7] := Q07;  GVL_SIM.xSimOut[8]  := Q10;
GVL_SIM.xSimOut[9] := Q11;  GVL_SIM.xSimOut[10] := Q12;
```

Os LEDs das saídas do XP325 acendem junto com o simulador. Se a bancada física estiver energizada e ligada às saídas, as cargas reais também acionam.

**4C.5 — Carregar e rodar**

1. Ligue o cabo de rede entre o PC e o XP325.
2. Em **Comunicação → Easy Connection** (ou **Configurações de comunicação**), procure o gateway e selecione o IP do XP325 (fica em negrito).
3. **Login** (Alt+F8), confirme o download e coloque em **Run** (F5).
4. No simulador (Passo 5): IP do XP325, porta 502, Unit ID 1, 1ª coil e 1ª entrada iguais ao endereço inicial do mapeamento.

Referências: [Altus — características técnicas do XP3xx](https://www.altus.com.br/wp-content/uploads/2024/10/XP3xx_PT_CT116100.pdf) e [Altus — comunicação Modbus TCP com Nexto Xpress (Symbol Server)](https://suporte.altus.com.br/hc/en-us/articles/8285804575117-Nexto-Xpress-Communication-with-Nexto-Xpress-using-Modbus-TCP-IP-protocol).

## Passo 5 — Conectar o simulador ao CLP e conferir a comunicação

Com o CLP em RUN e o servidor Modbus ativo, preencha a seção **Conexão com o CLP** e clique em Conectar. A conexão está boa quando o selo fica verde e a linha **Última leitura do CLP** mostra poucos milissegundos.

**5.1 — Preencher os campos**

| Campo | O que colocar | Padrão |
| --- | --- | --- |
| Endereço IP | IP do CLP. CODESYS no mesmo PC: `127.0.0.1` | 127.0.0.1 |
| Porta | Porta do servidor Modbus do CLP | 502 |
| Unit ID | Normalmente 1. Se o CLP recusar, teste 255 ou 0 | 1 |
| 1ª coil (I0.0) | Endereço Modbus da primeira coil no CLP | 0 |
| 1ª entrada (Q0.0) | Endereço Modbus da primeira discrete input no CLP | 0 |
| Leitura a cada (ms) | De quanto em quanto tempo lê as saídas do CLP | 100 |
| Timeout (ms) | Quanto espera a resposta antes de desistir | 1000 |
| Intervalo entre frames (ms) | Pausa mínima entre uma mensagem e outra | 10 |
| Sincronismo (ms) | De quanto em quanto tempo reenvia todas as coils | 1000 |
| Escrita das coils | FC15 (bloco único) é o normal. Use FC05 só se o CLP der "exceção 1" | FC15 |
| Reconectar sozinho | Marcado: se cair, tenta de novo a cada 3 s | marcado |

**5.2 — Testar a rede antes (opcional, recomendado com CLP físico)**

1. Tecla **Windows**, digite `cmd` e tecle Enter.
2. Digite `ping 192.168.0.1` (troque pelo IP do CLP) e tecle Enter.
3. Deve aparecer **Resposta de 192.168.0.1**. Se aparecer "Esgotado o tempo limite", o problema é cabo, IP ou máscara, não o simulador.

**5.3 — Conectar**

1. Clique em **Conectar**.
2. O selo passa de amarelo **Conectando…** para verde **Conectado a IP:porta**.
3. No **Diagnóstico** aparece: *Conectado. Coils … a partir de 0, discrete inputs … a partir de 0.*

**5.4 — Conferir se os dados estão indo e voltando**

1. Em **Fila de requisições**, veja **req/s**: perto de 11 com os valores padrão (10 leituras + 1 sincronismo por segundo).
2. **Enviadas / respondidas** devem crescer juntas.
3. **Timeouts** e **Exceções Modbus** devem ficar em 0.
4. Gire a chave **Seleção de bombas** para **B01** no painel de operação. Na tabela de **Endereçamento Modbus**, a linha I00 vira **1**. No CLP online, a variável correspondente também vira TRUE.
5. Force uma saída no CLP (ex.: Q0.3 / RAX1). O sinaleiro **Bomba 01 selecionada** acende e a DI 3 vira **1** no mapa.

Se o passo 4 funciona e o 5 não (ou o contrário), a comunicação está boa e o problema é o mapeamento de uma das áreas no CLP. Volte ao Passo 4A ou 4B.

**5.5 — Ver os frames (para aula de protocolo)**

Marque **Mostrar frames TX/RX** embaixo do Diagnóstico. Cada mensagem aparece em hexadecimal com a prioridade e a função, por exemplo `TX 00 1f 00 00 00 06 01 02 00 00 00 0b [P1 leitura · FC02 ler entradas]`. Desmarque depois: com frames ligados, o log enche rápido.

**Para desconectar:** clique em **Desconectar**. Por segurança, o simulador zera todas as saídas do CLP do lado dele (contatoras abrem e motores param).

## Passo 6 — Testar sem CLP usando o CLP virtual

O simulador traz um CLP de teste embutido, com uma lógica de referência simplificada da SP02. Use para conhecer o simulador, demonstrar em aula ou descobrir se um problema está no simulador ou no CLP.

1. Se estiver conectado, clique em **Desconectar**.
2. No campo **Porta**, deixe `502`. Se a 502 já estiver ocupada no PC (CODESYS Control Win, outro simulador), use `5020`.
3. Clique em **Ligar CLP virtual de teste**, logo abaixo dos botões de conexão.
4. Aparece a mensagem *CLP virtual ligado em 127.0.0.1:502* e o IP é preenchido sozinho com `127.0.0.1`.
5. Clique em **Conectar**. O selo fica verde.
6. Para desligar: **Desconectar** e depois **Desligar CLP virtual**.

**O que a lógica de referência faz**

| Situação | Resposta do CLP virtual |
| --- | --- |
| Chave de seleção em B01 ou B02 | Acende LB1_S ou LB2_S |
| Bomba em Manual + botão Liga | Liga e mantém (selo) |
| Bomba principal em Automático, selecionada, PB fechado | Liga e mantém até o botão Desliga |
| Jockey em Automático | Liga com PJ fechado, desliga com PJ aberto ou com uma principal ligada |
| Botão Desliga (NF) ou chave em 0 | Desliga a bomba correspondente |
| Sinaleiros L e D | Seguem o estado de cada bomba |

Ela serve só para fechar o laço do teste. Não é o gabarito da SP02 e não trata todos os casos (por exemplo, ausência de 24 Vcc).

## Passo 7 — Ajustar a soft-starter SSW-05 Plus (trimpots e dip-switch)

A SSW-05 Plus não tem IHM: tudo se ajusta atrás da **tampa frontal articulada**, nos **4 trimpots** e no **dip-switch de 6 chaves**, como no equipamento. O desenho do simulador segue a Figura 5.1 do manual WEG 0899.5119. Para a SP02, em cada soft: **ACCEL TIME = 5 s** e **DECEL TIME = 10 s**.

**7.1 — A frente da SSW-05 Plus**

| Item | Função | Faixa / posições | Padrão de fábrica (ponto vermelho) |
| --- | --- | --- | --- |
| Trimpot **ACCEL TIME** | Tempo da rampa de aceleração | 1–20 s | meio da escala (≈ 12 s) |
| Trimpot **MOTOR CURRENT** | Corrente do motor em % da corrente nominal da chave; base de todas as proteções | 30–100 % | 100 % |
| Trimpot **PEDESTAL VOLTAGE** | Tensão inicial da rampa | 30–80 % | 30 % |
| Trimpot **DECEL TIME** | Tempo da rampa de desaceleração (só para bombas, contra golpe de aríete) | OFF–20 s | OFF |
| Chave 1 **OVERCURRENT** | Proteção de sobrecorrente | OFF / ON | ON |
| Chave 2 **PHASE LOSS** | Proteção de falta de fase | OFF / ON | ON |
| Chave 3 **PHASE SEQ** | Proteção de sequência de fase | OFF / ON | ON |
| Chave 4 **STALL** | Proteção de rotor bloqueado | OFF / ON | ON |
| Chave 5 **OVERLOAD** | Sobrecarga do motor, classe 10 | OFF / ON | ON |
| Chave 6 **MAN / AUTO** | Reset manual ou automático das falhas | MAN / AUTO | MAN |
| Botão **RESET** | Reseta a falha (também pela DI2 ou desligando A1-A2) | — | — |
| LEDs **MOTOR PROTECTION** | Acende o LED da proteção que atuou | OVERCURRENT, PHASE LOSS, PHASE SEQ, STALL, OVERLOAD | — |
| LEDs **STARTER STATUS** | **READY**: aceso pronta ou em tensão plena, pisca nas rampas. **RUN**: aceso só em tensão plena. **FAULT**: falhas internas (pisca em código) | — | — |
| Bornes **A1-A2** | Alimentação da eletrônica, 90–250 Vca (vem do D2/D3) | — | — |
| Relés **13 – 14/23 – 24** | 13–14/23: operação (fecha com o comando, abre no fim da rampa de parada). 14/23–24: tensão plena (by-pass) | 1 A 250 Vca | — |
| **DI1** / **DI2** | DI1 habilita/desabilita o motor; DI2 reseta por pulso. Ambas na tensão de A1 (90–250 Vca) | — | — |

As setas impressas na frente ligam cada chave 1–5 ao LED da proteção correspondente.

**7.2 — Como operar no simulador**

- **Tampa**: a soft começa com a tampa aberta, com os ajustes à mostra. Para fechar, clique na aba à esquerda; para abrir de novo, clique na tampa. Fechada, os trimpots não giram (como no real).
- **Trimpot**: arraste para cima (aumenta) ou para baixo (diminui), use a rodinha do mouse ou as setas do teclado. A seta preta no knob mostra a posição na escala.
- **Ajuste fino**: botões − e + no painel ao lado da soft, com o valor exato em negrito.
- **Dip-switch**: clique em cada chave. ON é com a alavanca à direita.
- **RESET**: clique no botão redondo abaixo do dip-switch.

**7.3 — Receita da SP02 na SS_01 (repita na SS_02)**

1. Abra a tampa.
2. **ACCEL TIME = 5 s**: ajuste até o ajuste fino mostrar `5,0 s`. Abaixo de ~2 s a bomba não chega à rotação a tempo e a soft desarma por **STALL**.
3. **DECEL TIME = 10 s**. Em `OFF` a bomba para por inércia.
4. **PEDESTAL VOLTAGE**: 30–40 %. Se o motor demorar a começar a girar, aumente um pouco.
5. **MOTOR CURRENT** = corrente de placa ÷ corrente da chave × 100. O painel lateral mostra **Motor ligado (corrente de placa)**: 14,4 A numa chave de 16 A = **90 %**. Exemplo do manual: motor de 25 A numa chave de 30 A = 83 %.
6. **Dip-switch**: chaves 1 a 5 em **ON**; chave 6 em **MAN** (numa bomba de incêndio o reset deve ser consciente).
7. Feche a tampa e dê partida (Passo 10). **READY** pisca durante os 5 s de rampa; ao chegar em tensão plena **RUN** acende e o relé 14/23–24 fecha.

**7.4 — Falhas e reset**

| LED aceso | Código | Quando atua | O que fazer |
| --- | --- | --- | --- |
| **PHASE LOSS** | E03 | Comando de partida sem tensão na entrada (DB1/DB2 aberto) ou falta de fase em operação | Corrija a alimentação e aperte **RESET** |
| **OVERLOAD** | E05 | Corrente real acima da ajustada no MOTOR CURRENT por tempo demais (classe 10) | Corrija o trimpot; espere esfriar e dê **RESET** |
| **STALL** | E63 | No fim da rampa a corrente ainda está ≥ 2 × a ajustada: rampa curta demais ou eixo travado | Aumente o ACCEL TIME ou destrave a bomba; **RESET** |
| **OVERCURRENT** | E66 | Em tensão plena, corrente > 3 × a ajustada por mais de 1 s (eixo travou com o motor rodando) | Verifique a bomba; **RESET** |
| **PHASE SEQ** | E67 | Sequência de fases da rede invertida na entrada | Inverta duas fases da **entrada**; **RESET**. Não tem reset automático |

Com a chave 6 em **AUTO**, as falhas (exceto PHASE SEQ) se resetam sozinhas após 15 minutos; a sobrecarga, quando o motor esfria. Desligar a chave de uma proteção faz a soft ignorar aquela falha: com PHASE SEQ em OFF e a sequência invertida, a bomba **gira ao contrário** e quase não pressuriza.

**7.5 — Modelo e defeitos para treino**

- **Modelo**: corrente nominal da chave, de SSW050003 (3 A) a SSW050085 (85 A). O MOTOR CURRENT é uma porcentagem desse valor.
- **Defeitos para treino** (embaixo do painel lateral): *sequência de fases invertida na entrada* e *eixo do motor travado*. Servem para provocar PHASE SEQ, STALL e OVERCURRENT.

## Passo 8 — Ajustar os pressostatos PJ e PB

Os pressostatos já vêm ajustados para a SP02. Este passo serve para conferir, explicar aos alunos ou criar um defeito de ajuste. O modelo simulado é o KP 5 (alta pressão, rearme automático): escala **Faixa** de 8 a 32 bar e escala **DIF** de 1,8 a 6 bar.

**8.1 — Como o KP funciona**

- **Faixa** = pressão em que o contato **abre** (pressão alta).
- **DIF** (diferencial) = quanto a pressão precisa cair abaixo da faixa para o contato **fechar** de novo.
- Fecha em: **Faixa − DIF**. Entre os dois valores, o contato fica como estava (histerese).
- As escalas são em **bar**. A SP02 fala em **kgf/cm²**: 1 kgf/cm² = 0,981 bar. O simulador mostra as duas unidades.

**8.2 — Valores da SP02**

| Pressostato | Pedido da SP02 | Faixa | DIF | Fecha em | Abre em |
| --- | --- | --- | --- | --- | --- |
| PJ (jockey) | liga < 6, desliga ≥ 10 kgf/cm² | 9,8 bar | 3,9 bar | 5,9 bar (6,0 kgf/cm²) | 9,8 bar (10,0 kgf/cm²) |
| PB (principais) | liga ≤ 4, desliga ≥ 10 kgf/cm² | 9,8 bar | 5,9 bar | 3,9 bar (4,0 kgf/cm²) | 9,8 bar (10,0 kgf/cm²) |

**8.3 — Ajustar, passo a passo (exemplo no PJ)**

1. Role até **Pressostatos**. À esquerda fica o desenho do KP; à direita, os controles.
2. Em **Faixa (abre)**, clique **+** ou **−** até `9,8 bar · 10,0 kgf/cm²`. Cada clique muda 0,1 bar; segure para repetir. Também dá para girar a rodinha do mouse sobre o eixo **Range** do desenho.
3. Em **Diferencial**, clique **+** ou **−** até `3,9 bar`. O ponteiro vermelho da escala DIF acompanha.
4. Leia a caixa branca: *Contato fecha em ≤ 5,9 bar (6,0 kgf/cm²) e abre em ≥ 9,8 bar (10,0 kgf/cm²)*.
5. Em **Contato ligado ao CLP**, deixe **fecha em baixa pressão**. Esse é o contato pedido na SP02.
6. Repita no PB com Faixa 9,8 e DIF 5,9.

**8.4 — Conferir o contato**

- A linha embaixo dos controles mostra, por exemplo, *Contato fechado → I1.6 = 1*.
- No desenho do KP, o LED verde acende com o contato fechado.
- No desenho da casa de bombas, os quadradinhos PJ e PB também acendem.
- No gráfico de tendência, as linhas tracejadas azuis são o PJ (fecha e abre) e a vermelha é o fechamento do PB.

**8.5 — Alavanca de teste**

Segure **Segurar alavanca de teste** (ou clique e segure a alavanca "teste" no desenho). Enquanto estiver segurando, o contato inverte, como a função de desarme manual do KP real. Serve para testar a lógica do CLP sem mexer na pressão.

**8.6 — Ligação invertida (defeito proposital)**

Mudando **Contato ligado ao CLP** para **fecha em alta pressão**, o pressostato passa a mandar 1 com a rede cheia. A jockey liga com pressão alta e para com pressão baixa. É um bom defeito para os alunos diagnosticarem.

## Passo 9 — Painel de operação, quadro elétrico e processo

O painel de operação é a porta do quadro; o quadro elétrico é o interior; a casa de bombas é o campo. Tudo funciona por clique.

**9.1 — Painel de operação**

| Elemento | Como usar | O que vai para o CLP |
| --- | --- | --- |
| Chave **Seleção de bombas** | Clique em **B01**, **0** ou **B02**, ou clique no próprio knob: metade esquerda gira para a esquerda, metade direita para a direita | I0.0 (B01) ou I0.1 (B02); em 0, os dois ficam 0 |
| Chave **Manual / automático** (uma por bomba) | Clique em **Auto**, **0** ou **Man**, ou clique no lado do knob para onde quer girar | Auto → I0.3 / I0.5 / I0.7; Man → I0.2 / I0.4 / I0.6 |
| Botão verde **Liga local** (NA) | Clique e segure; ao soltar, desliga | 1 enquanto pressionado |
| Botão vermelho **Desliga local** (NF) | Clique e segure; ao soltar, volta | 1 solto, 0 pressionado |
| Sinaleiros | Só mostram | Acendem conforme as saídas Q0.3 a Q1.2 |

Cor dos sinaleiros, conforme a SP02: **verde** para selecionada e desligada; **vermelho** para em operação.

Um clique rápido no botão vira um pulso de pelo menos 300 ms, para o CLP não perder. Os botões também funcionam pelo teclado: Tab até o botão e segure Espaço.

**9.2 — Quadro elétrico**

Clique no disjuntor para ligar ou desligar. Alavanca vermelha em cima e faixa verde = ligado.

| Disjuntor | Alimenta | Se desligar |
| --- | --- | --- |
| DG | Tudo | Para tudo: sem 24 Vcc, softs apagadas, motores param |
| D1 | Fonte 24 Vcc | Sem 24 Vcc no campo: todas as coils vão a 0 e as saídas do CLP não acionam nada |
| D4 | Saída 24 Vcc (LL+) | Mesmo efeito do D1 |
| D2 | Controle da SS_01 (A1-A2) | SS_01 apaga e um erro ativo é resetado |
| D3 | Controle da SS_02 | Display da SS_02 apaga |
| DB1 | Potência da Bomba 01 | Com comando de partida, a SS_01 acusa falta de fase (LED **PHASE LOSS**) |
| DB2 | Potência da Bomba 02 | Com comando de partida, a SS_02 acusa falta de fase (LED **PHASE LOSS**) |
| DBJ | Motor da jockey | A contatora fecha, mas o motor não gira |

Ao lado, os indicadores mostram o 24 Vcc no campo e se K-B1, K-B2 e K-BJ estão fechadas. A caixa **Motor da jockey ligado ao painel** representa a ligação que, na SP02, ainda precisa ser feita. Desmarcada, a jockey nunca gira.

**9.3 — Casa de bombas**

- **Vista 3D** (padrão): reservatório, as três bombas com motores WEG, válvulas, barrilete, manômetro, pressostatos, painel e hidrante. Arraste para girar, use a rodinha para zoom e os botões **Visão geral**, **Bombas**, **Hidrante** e **Painel** para ir direto a cada ponto. Os eixos giram com a rotação real, as setas brancas mostram o sentido do fluxo, os sinaleiros do painel acendem e o hidrante jorra. **Clique no hidrante** para abrir ou fechar. O botão **Painel** leva até o painel de operação em 3D, igual ao 2D: os sinaleiros acendem, as chaves giram com um clique no lado do knob e as botoeiras funcionam enquanto você segura. Tudo o que muda num painel muda no outro. **Rótulos** liga e desliga as etiquetas.
- **P&ID**: o desenho 2D. Use se o PC não tiver aceleração 3D (o simulador troca sozinho).
- **Manômetro**: escala externa em bar, interna em vermelho em kgf/cm². A faixa azul é a zona da jockey (PJ); a vermelha, abaixo do PB.
- **Gráfico**: últimos 2 minutos. Linha preta = pressão. Barrinhas embaixo: azul = jockey, vermelha = Bomba 01, laranja = Bomba 02.
- **Vazamento da rede**: perda pequena e contínua. Em 0,05 (padrão), a pressão cai de 10 para 6 bar em cerca de meio minuto, e a jockey dá conta.
- **Abertura do hidrante**: grande consumo. Em 100 %, só a jockey não segura e a pressão cai abaixo do PB.
- **Abrir hidrante (incêndio)** e **Fechar hidrante**: atalhos para 100 % e 0 %.
- **Pressurizar rede (9,8 bar)** e **Despressurizar**: colocam a pressão direto em um valor, para começar um teste rápido.

As bombas giram e mostram a rotação em %. As principais partem e param seguindo a rampa da soft; a jockey parte direto.

## Passo 10 — Roteiro de teste completo da SP02

Com o simulador conectado ao CLP, as duas softs ajustadas (aceleração 5 s e desaceleração 10 s nos trimpots) e todos os disjuntores ligados, siga a ordem abaixo. Se cada linha der o resultado esperado, o programa atende ao Corpo de Bombeiros conforme descrito na SP02.

**10.1 — Preparação**

1. Clique em **Pressurizar rede (9,8 bar)**.
2. Vazamento em **0,05** e hidrante em **0 %**.
3. Todas as chaves em **0**.

**10.2 — Testes**

| # | Ação | Resultado esperado |
| --- | --- | --- |
| 1 | Chaves em 0 | LB1_D, LB2_D e LBJ_D acesos (verdes); nenhuma bomba gira |
| 2 | Seleção em **B01** | LB1_S acende; LB2_S apagado |
| 3 | Bomba 01 em **Man**, clique **Liga local** | K-B1 fecha; SS_01 sobe a tensão em 5 s; LB1_L acende e LB1_D apaga |
| 4 | Clique **Desliga local** da Bomba 01 | K-B1 abre; SS_01 desce em 10 s até parar; LB1_D acende |
| 5 | Repita 3 e 4 na Bomba 02 | Mesmo comportamento pela SS_02 |
| 6 | Jockey em **Man**, Liga e depois Desliga | Jockey parte direto (sem rampa) e para; LBJ_L / LBJ_D alternam |
| 7 | Jockey em **Auto**, Bomba 01 em **Auto**, Bomba 02 em **Auto**, seleção em **B01** | Nada parte enquanto a pressão estiver acima de 6 kgf/cm² |
| 8 | Aguarde o vazamento levar a pressão abaixo de 6 kgf/cm² (5,9 bar) | PJ fecha (I1.6 = 1); jockey parte |
| 9 | Aguarde a pressão chegar a 10 kgf/cm² (9,8 bar) | PJ abre; jockey para |
| 10 | Clique **Abrir hidrante (incêndio)** | Pressão cai; jockey liga, mas não segura |
| 11 | Pressão chega a 4 kgf/cm² (3,9 bar) | PB fecha (I1.7 = 1); **Bomba 01 parte em rampa de 5 s**; **jockey desliga** |
| 12 | Clique **Fechar hidrante** | Pressão sobe acima de 10 kgf/cm²; **Bomba 01 continua ligada** |
| 13 | Clique **Desliga local** da Bomba 01 | Só agora a Bomba 01 para, em rampa de 10 s |
| 14 | Seleção em **B02** e repita 10 a 13 | Quem parte é a Bomba 02 |

**10.3 — Onde olhar se algo não bater**

- **Endereçamento Modbus**: confirma se o simulador está mandando a entrada certa e recebendo a saída certa.
- **Display e painel lateral da soft**: confirma se a DI1 fechou e se a rampa está correndo.
- **Gráfico de tendência**: mostra em que pressão cada bomba ligou e desligou.

## Passo 11 — Simulação de falhas: SSW-05, pressostatos e jockey

Este passo é o roteiro para provocar e diagnosticar falhas. Cada falha tem: **como provocar**, **o que observar** e **como corrigir**. Prepare a falha antes da aula, sem o aluno ver, e peça o diagnóstico.

**11.1 — Antes de começar**

1. Simulador conectado ao CLP (ou ao CLP virtual, Passo 6) e todos os disjuntores ligados.
2. SSW-05 com o ajuste de referência da SP02 (11.2) e pressostatos no padrão (PJ 9,8 / 3,9; PB 9,8 / 5,9; contato "fecha em baixa pressão").
3. Saiba onde olhar:

| Onde | O que mostra |
| --- | --- |
| LEDs da SSW-05 | Qual proteção atuou (PHASE LOSS, PHASE SEQ, STALL, OVERLOAD, OVERCURRENT) |
| Painel ao lado da soft | **Falha** com código e nome, corrente real, imagem térmica, rotação |
| Gráfico de pressão | Quando cada bomba ligou e o que a pressão fez |
| Vista 3D | Bomba girando, girando ao contrário ou parada |
| Diagrama, botão "Siga o sinal" | O primeiro elo que falhou na cadeia de cada componente |
| Diagnóstico (painel de conexão) | Mensagens do processo, como disjuntor desarmado |

**11.2 — Ajuste de referência da SSW-05**

| Ajuste | Valor | Como chegar |
| --- | --- | --- |
| MOTOR CURRENT | **90 %** | Corrente de placa ÷ corrente da chave: 14,4 A ÷ 16 A. Na bancada real, use a placa do seu motor |
| ACCEL TIME | **5 s** | Exigência da SP02 |
| DECEL TIME | **10 s** | Exigência da SP02 |
| PEDESTAL VOLTAGE | **30–40 %** | Partida sem tranco |
| Chaves 1 a 5 | **ON** | Todas as proteções ligadas |
| Chave 6 | **MAN** | Reset manual |

Para dar partida nos testes, use a Bomba 01 em **Man** e o botão **Liga local**. Para parar, **Desliga local**.

**11.3 — Falhas na SSW-05**

**Falta de fase (PHASE LOSS · E03)**

1. Com a bomba parada, desligue o **DB1** no quadro elétrico.
2. Dê partida na Bomba 01.
3. Observe: K-B1 fecha e a DI1 da soft acende, mas o LED **PHASE LOSS** acende e o motor não gira. Variação: desligue o DB1 com a bomba rodando; ela desarma na hora.
4. Corrija: ligue o DB1 e aperte **RESET** na soft.

**Sequência de fases invertida (PHASE SEQ · E67)**

1. Na soft, abra **Defeitos para treino** e marque *Sequência de fases da rede invertida*.
2. Dê partida.
3. Observe: LED **PHASE SEQ**; a soft não parte. Esta falha não tem reset automático, mesmo com a chave 6 em AUTO.
4. Corrija: desmarque o defeito (na bancada real, inverta duas fases na **entrada** R/S/T) e aperte **RESET**.

**Sequência invertida sem a proteção**

1. Mesmo defeito do item anterior, mas com a **chave 3 (PHASE SEQ) em OFF**.
2. Dê partida.
3. Observe: a soft não acusa nada, mas na vista 3D a bomba gira ao contrário e, no gráfico, a pressão quase não sobe. É o perigo de desligar uma proteção.
4. Corrija: chave 3 em ON e desmarque o defeito.

**Sobrecarga do motor (OVERLOAD · E05)**

1. Dê partida com o ajuste de referência e espere o LED **RUN** acender (tensão plena).
2. Com a bomba rodando, gire **MOTOR CURRENT** para **30 %** (4,8 A, bem abaixo dos ~13,7 A reais).
3. Observe: a **imagem térmica** sobe no painel lateral e, em cerca de 1 minuto, acende o LED **OVERLOAD** e a bomba para.
4. Corrija: volte para 90 % e espere a imagem térmica cair abaixo de 100 % (cerca de 2 minutos). Só então o **RESET** funciona; antes disso o motor ainda está "quente".

Atenção: se você colocar 30 % **antes** da partida, a soft desarma por **STALL** no fim da rampa, porque a corrente da partida passa de 2 vezes a ajustada. Também é uma falha válida para treinar ("corrente mal ajustada impede a partida").

**Rotor bloqueado (STALL · E63)**

1. Em **Defeitos para treino**, marque *Eixo do motor travado*.
2. Dê partida.
3. Observe: a rampa sobe, o motor não gira (3D parado, corrente alta) e, no fim da rampa, acende o LED **STALL**.
4. Corrija: desmarque o defeito e aperte **RESET**.

Outra forma: **ACCEL TIME** em 1 s com o eixo livre. O motor não chega à rotação a tempo e a soft desarma em STALL. Corrija voltando a rampa para 5 s.

**Sobrecorrente (OVERCURRENT · E66)**

1. Dê partida e espere o LED **RUN** acender.
2. Com a bomba rodando, marque *Eixo do motor travado*.
3. Observe: a corrente dispara e, em cerca de 1 segundo, acende o LED **OVERCURRENT**.
4. Corrija: desmarque o defeito e aperte **RESET**.

**Ajustes errados (sem LED de falha)**

| Ajuste errado | O que acontece | Correção |
| --- | --- | --- |
| DECEL TIME em OFF | A bomba para na hora, por inércia (golpe de aríete na tubulação real) | 10 s |
| ACCEL TIME em 20 s | Partida lenta demais para um sistema de incêndio | 5 s |
| PEDESTAL VOLTAGE em 80 % | Corrente alta logo no começo da partida (tranco) | 30–40 % |
| D2 desligado | Soft apagada (A1 sem tensão); a bomba não parte, nenhum LED acende | Ligue o D2 |

**11.4 — Falhas nos pressostatos**

Baixar a pressão **não é falha**: é o funcionamento normal (o contato fecha em pressão baixa e pede a bomba). As falhas abaixo são de **ajuste**, de **ligação** e de **contato**.

| Falha | Como provocar | O que observar | Como corrigir |
| --- | --- | --- | --- |
| PJ liga e desliga sem parar | PJ com **Diferencial 1,8 bar** | A jockey liga em ~8 bar e desliga em 9,8 bar, várias vezes por minuto (veja a faixa da jockey no gráfico) | Diferencial 3,9 bar |
| Principal parte antes da jockey | PB com **Diferencial 1,8 bar** (fecha em ~8 bar) | Com vazamento, a principal parte antes da jockey ter chance | Diferencial 5,9 bar |
| Bomba que não desliga | **Faixa** do PJ bem acima de 10 bar | O contato só abre numa pressão que a jockey pode não alcançar: ela fica ligada direto | Faixa 9,8 bar |
| Contato errado no PJ | PJ em **fecha em alta pressão** | A jockey liga com a rede cheia e desliga quando a pressão cai | **Fecha em baixa pressão** |
| Contato errado no PB | PB em **fecha em alta pressão** | A principal parte com a rede pressurizada | **Fecha em baixa pressão** |
| Contato forçado | Segure a **alavanca de teste** do PJ (ou do PB) | Com a rede cheia, a bomba parte enquanto a alavanca estiver segurada | Solte a alavanca |
| Sem sinal dos pressostatos | Desligue o **D4** | Nenhuma entrada chega ao CLP; nada parte em automático | Ligue o D4 |

Para todos: a caixa branca do pressostato mostra em que pressão o contato abre e fecha. Compare com a especificação (PJ: fecha em 6 e abre em 10 kgf/cm²; PB: fecha em 4).

**11.5 — Falhas na jockey (diagrama, folha 1)**

| Falha | Como provocar | O que observar | Como corrigir |
| --- | --- | --- | --- |
| Motor não ligado | Solte os 3 cabos do motor | K-BJ fecha e LBJ_L acende, mas a jockey não gira e a pressão cai | Ligue os cabos (exercício da folha 1) |
| Falta de fase | Ligue só 2 cabos | O motor não parte e, em cerca de 4 s, o **DBJ** desarma | Ligue as 3 fases e rearme o DBJ |
| Giro invertido | Botão **Trocar 2 fases** | Gira ao contrário (3D), a pressão quase não sobe e a principal acaba partindo | **Ligar corretamente** |

**11.6 — Comunicação e alimentação**

| Falha | Como provocar | O que observar | Como corrigir |
| --- | --- | --- | --- |
| Sem 24 Vcc no campo | Desligue o **D4** | Entradas do CLP em 0; os botões NF parecem apertados; nada aciona | Ligue o D4 |
| Endereço errado | **1ª coil** = 100 | Diagnóstico: **Exceção Modbus 2** (endereço ilegal) | 1ª coil = 0 |
| CLP desligado | CLP em STOP ou cabo de rede fora | 3 timeouts, conexão encerrada, nova tentativa a cada 3 s; as contatoras abrem | CLP em RUN |

**11.7 — Roteiro de aula sugerido**

1. **Aquecimento:** falta de fase com o DB1 (sintoma claro, correção simples).
2. **Proteção x ajuste:** sobrecarga reduzindo o MOTOR CURRENT com a bomba rodando. Pergunta: por que o RESET não funciona logo?
3. **Proteção desligada:** sequência invertida com a chave 3 em OFF. Pergunta: o que o 3D e o gráfico mostram que a soft não mostrou?
4. **Mecânica:** eixo travado na partida (STALL) e com a bomba rodando (OVERCURRENT). Pergunta: por que os LEDs são diferentes?
5. **Pressostatos:** PJ com diferencial 1,8 bar. Pergunta: qual o risco para o motor de tantas partidas por hora?
6. **Desafio final:** combine duas falhas (por exemplo, PB com contato errado e ACCEL TIME em 1 s) e peça o diagnóstico completo.

Na SSW-05 não há reset de fábrica: o ajuste é a posição física dos trimpots e chaves DIP. Ao terminar a aula, volte ao ajuste de referência (11.2).

## Passo 12 — Várias bancadas e acesso por outros PCs

Um único simulador aberto atende várias bancadas ao mesmo tempo. Cada sessão tem seu próprio CLP, fila, processo, soft-starters, pressostatos e endereçamento, sem interferir nas outras.

**Cada PC ganha a sua sessão automaticamente.** Quando outro computador abre o endereço do simulador, o servidor cria (na primeira vez) uma sessão só dele, com o nome **PC 192.168.x.x**, e abre direto nela. Nas próximas vezes, o mesmo PC volta para a mesma sessão, com tudo o que configurou. O PC onde o simulador está rodando usa a primeira sessão. A aba do próprio computador aparece marcada com **este PC**.

As outras abas continuam visíveis: o professor pode clicar na sessão de qualquer aluno para acompanhar. Mexer na aba de outro PC mexe no processo daquele aluno.

**12.1 — Criar uma sessão por bancada**

1. No topo, clique em **+ Nova sessão**.
2. Digite o nome (ex.: `Bancada 02`) e clique OK. A aba nova abre.
3. Configure IP e porta do CLP dessa bancada e clique em **Conectar**.
4. Para renomear uma aba: dois cliques no nome.
5. Para excluir: clique no **×** da aba e confirme. A conexão dela é encerrada. Sempre fica pelo menos uma sessão.

A bolinha da aba mostra o estado: verde = conectada, laranja = tentando reconectar, cinza = desconectada.

**12.2 — Abrir de outro PC (aluno na própria bancada)**

1. No PC onde o `.exe` está aberto, veja na janela preta a linha **Em outros PCs: http://192.168.x.x:3000**.
2. Na primeira vez, o Windows deve ter mostrado o aviso do firewall. Se você cancelou, veja Solução de problemas.
3. No PC do aluno, abra o Chrome ou o Edge e digite esse endereço.
4. A sessão dele abre sozinha (aba **este PC**). Configure o IP do CLP da bancada e conecte.
5. Se dois alunos dividirem o mesmo PC, crie outra sessão com **+ Nova sessão** e salve o endereço com `#s…` nos favoritos.

Vários navegadores podem abrir a mesma sessão: todos veem e mexem no mesmo processo (útil para o professor acompanhar). O guia também abre no PC do aluno pelo botão **Guia passo a passo**.

**12.3 — Onde o CLP de cada bancada é acessado**

Quem conversa com os CLPs é o PC onde o `.exe` está aberto, não o PC do aluno. Esse PC precisa alcançar o IP de todos os CLPs (mesma rede ou rotas configuradas).

## Passo 13 — Diagrama elétrico interativo

O botão **Diagrama elétrico**, no topo do simulador, abre em nova guia o diagrama da SP02 adaptado ao XP325, ligado ao vivo na mesma sessão. Tudo o que muda no simulador muda no diagrama, e o contrário também.

**13.1 — As folhas**

| Folha | Mostra |
| --- | --- |
| 1 · Potência | DG, disjuntores das bombas, soft-starters com estado ao vivo, K-BJ, motores, fonte 24 Vcc, D1, D4, D2 e D3 |
| 2 · Entradas XP325 | L+, chaves, botoeiras e pressostatos até os bornes I00 a I17; comuns C0 e C1 no 0 V (ligação sink) |
| 3 · Saídas XP325 | Q+ e Q−, saídas Q00 a Q12 até as bobinas K-B1, K-B2, K-BJ e RAX1 a RAX8 |
| 4 · Sinalização e softs | Contatos dos RAX acendendo os sinaleiros; contato 13-14 da K-B1/K-B2 levando a fase do A1 até a DI1 de cada soft |
| 5 · Lista de I/O | Bornes do XP325, endereço SP02, endereço Modbus e estado de cada ponto |

**13.2 — Cores dos fios**

Vermelho = fase energizada, laranja = +24 Vcc, azul = 0 V ou neutro, âmbar = sinal em 1, cinza = sem tensão, verde tracejado = terra. Passe o mouse num fio para ver o nome do potencial; todos os trechos do mesmo potencial se destacam.

**13.3 — Operar pelo diagrama**

- Disjuntores e chaves seletoras: um clique.
- Botoeiras e pressostatos: clique e segure (no pressostato, é a alavanca de teste).
- Links azuis sublinhados (ex.: *→ DI1 SS_01*) levam à folha onde o mesmo componente continua.

**13.4 — Siga o sinal**

Clique em qualquer componente. O painel da direita mostra o que ele faz, os endereços (borne do XP325, SP02 e Modbus) e a cadeia completa do sinal, com ✓ ou ✗ em cada elo. Exemplo para a K-B1: simulador conectado → programa liga Q00 → 24 Vcc no Q+ → bobina energizada → contato 13-14 leva a fase do A1 até a DI1 → soft alimentada → potência presente → sem erro → rampa → bomba girando. O aviso amarelo mostra o primeiro elo que falhou: é ali que o aluno deve procurar o defeito.

**13.5 — Exercício: ligar o motor da jockey**

A SP02 diz que o motor da jockey ainda não foi ligado ao painel. Na folha 1:

1. Clique no borne **2/T1** da K-BJ e depois no borne **U1** do motor. Aparece o cabo.
2. Faça o mesmo com **4/T2 → V1** e **6/T3 → W1**.
3. Para soltar um cabo, clique no borne do motor já ligado.
4. Clique no motor **MJ** para ver as fases ligadas, o sentido de giro e a cadeia do sinal.

O que acontece com cada ligação:

| Ligação | Resultado |
| --- | --- |
| 3 fases na sequência certa | A jockey gira e pressuriza normalmente |
| 3 fases com 2 trocadas | Gira ao contrário (↺): a pressão quase não sobe e a principal acaba partindo |
| Só 2 fases | Falta de fase: o motor não parte e o DBJ desarma em cerca de 4 s |
| Nenhuma | A K-BJ fecha, mas nada gira |

Os botões **Ligar corretamente**, **Trocar 2 fases** e **Soltar todos os cabos**, no painel do motor, preparam o exercício rápido. A caixa **Motor da jockey ligado ao painel**, no quadro elétrico do simulador, faz o mesmo que ligar ou soltar os três cabos.

## Solução de problemas

Comece pela caixa **Diagnóstico**: a última mensagem quase sempre diz o que aconteceu.

| Mensagem ou sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| `ECONNREFUSED` | O IP respondeu, mas não há servidor Modbus na porta | CLP em RUN? Servidor Modbus no programa? Porta certa? No CODESYS, "Bind to Adapter" desmarcado se usar 127.0.0.1 |
| `Sem resposta de IP:502 em 3000 ms` ou `ETIMEDOUT` | O PC não alcança o CLP | Faça o `ping` do Passo 5.2. Confira cabo, IP e máscara do PC |
| `EHOSTUNREACH` / `ENETUNREACH` | IP em outra faixa de rede | Coloque o PC na mesma faixa do CLP |
| `3 timeouts seguidos — CLP não está respondendo` | Conectou, mas o CLP não responde às mensagens | Unit ID (teste 1, 255, 0); CLP em STOP; aumente o Timeout |
| `Exceção Modbus 1 (função ilegal)` | O CLP não aceita FC15 | **Escrita das coils** = FC05 |
| `Exceção Modbus 2 (endereço de dado ilegal)` | Endereço fora da área do CLP | Ajuste **1ª coil** / **1ª entrada**, ou aumente a área no CLP (16 coils, 16 discrete inputs) |
| S7-1200 com STATUS 16#8383 | Pedido fora do Data_Area_Array | Confira start e length no Passo 4B.4 |
| Simulador manda, CLP não vê (ou o contrário) | Só uma das áreas mapeada | Confira na tabela de Endereçamento Modbus qual lado muda; refaça o mapeamento dessa área |
| `Verificação FC01: CLP diferente do simulador` | O programa do CLP escreve nas mesmas variáveis das coils | Não escreva no programa as variáveis ligadas às coils |
| A soft não parte com K-B1 fechada | D2/DB1/DG desligados ou erro ativo (LED piscando) | Veja os LEDs e o painel lateral da soft; Passo 7 |
| Outro PC não abre o simulador | Firewall bloqueou a porta 3000 | Painel de Controle → Firewall do Windows → Permitir um aplicativo → marque o SimuladorSistemaIncendio em Privada. Ou peça à TI |
| "A porta 3000 já está em uso" | O simulador já está aberto | O navegador abre no que já está rodando; feche a janela preta duplicada |
| A porta 502 do CLP virtual já está em uso | CODESYS Control Win ou outro simulador na 502 | Use a porta 5020 no CLP virtual |
| Antivírus apagou ou bloqueou o `.exe` | Falso positivo comum em executáveis feitos com Node.js | Libere o arquivo no antivírus ou peça à TI |
| A tela parou de atualizar | A janela preta foi fechada | Abra o simulador de novo; tudo o que foi salvo volta |

**Onde ficam os dados salvos:** `%LOCALAPPDATA%\SimuladorSP02\sessions.json`. Para recomeçar do zero, feche o simulador e apague essa pasta (cole o caminho na barra de endereço do Explorer).
