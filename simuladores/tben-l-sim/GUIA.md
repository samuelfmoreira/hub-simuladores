# TBEN-L-SIM: CODESYS + EtherNet/IP + IO-Link

Tutorial completo

O TBEN-L-SIM é um remoto IO-Link de 8 portas (X0 a X7) que comanda uma célula 3D de paletização com elevador. Como o TBEN-L real da Turck, ele é **multiprotocolo**. Neste guia ele fala **EtherNet/IP** com o CODESYS, direto no Windows, pela rede virtual do HUB. O CODESYS é o **scanner**, e o TBEN-L-SIM é o **adapter**.

O programa pronto do CLP (`PRG_Paletizador`) faz a célula inteira funcionar: recebe caixas, empurra cada camada para o pallet no elevador, desce camada a camada e descarrega o pallet cheio.

## Arquitetura

```
  CODESYS (CLP)  192.168.100.10                  TBEN-L-SIM  192.168.100.23
  EtherNet/IP Scanner                            Adapter EtherNet/IP + mestre IO-Link
  ┌──────────────────────┐  O→T 12 bytes (saídas das portas)   ┌───────────────────────┐   IO-Link   ┌───────────────┐
  │ PRG_Paletizador      │ ─────────────────────────────────▶ │ X0…X7                 │ ──────────▶ │ esteiras,     │
  │ GVL_TBEN             │ ◀───────────────────────────────── │ dados + PQI por porta │ ◀────────── │ lasers, …     │
  └──────────────────────┘  T→O 34 bytes (entradas + PQI)     └───────────────────────┘             └───────────────┘
```

O EtherNet/IP vai do CLP ao TBEN. O **IO-Link** vai do TBEN até cada device (esteira, laser, válvulas…): é ponto a ponto, num cabo de 3 fios, e por isso é simulado dentro do TBEN.

## Mapa de dados

### As portas e os devices

| Porta | Device | Entradas (bytes) | Saídas (bytes) |
| --- | --- | --- | --- |
| X0 | C1 esteira de entrada | 2 | 2 |
| X1 | B1 laser de altura da caixa | 4 | — |
| X2 | Y1 válvulas do empurrador | 1 | 1 |
| X3 | K1 hub de entradas digitais | 2 | — |
| X4 | M1 inversor do elevador | 4 | 4 |
| X5 | B2 laser de posição do elevador | 4 | — |
| X6 | C2 esteira de saída de pallets | 2 | 2 |
| X7 | H1 torre sinaleira | — | 1 |

### Entradas: 34 bytes (T→O)

Cada porta começa num endereço par, para as WORDs ficarem alinhadas. Depois dos dados de cada porta vem o **PQI** dela (qualidade da porta). Os bytes "reservado" só alinham e ficam sem variável.

| Byte | Canal no CODESYS | Tipo | Conteúdo |
| --- | --- | --- | --- |
| 0 | X0_In_Status | BYTE | .0 rodando · .1 falha |
| 1 | X0_In_Speed | BYTE | velocidade atual (%) |
| 2 | X0_PQI | BYTE | qualidade da porta X0 |
| 4 | X1_In_Dist | WORD | distância medida (mm) |
| 6 | X1_In_Flags | BYTE | .0 medição válida · .1 SP1 |
| 7 | X1_In_Quality | BYTE | qualidade do sinal |
| 8 | X1_PQI | BYTE | |
| 10 | X2_In_Status | BYTE | .0 pressão OK · .1 falha de bobina |
| 11 | X2_PQI | BYTE | |
| 12 | X3_In_B0 | BYTE | .0 recuado · .1 avançado · .2 elevador embaixo · .3 elevador em cima · .4 pallet no elevador · .5 pallet na saída · .6 Partir · .7 Parar (NF) |
| 13 | X3_In_B1 | BYTE | .0 Rearmar · .1 emergência OK (NF) |
| 14 | X3_PQI | BYTE | |
| 16 | X4_In_Status | BYTE | .0 pronto · .1 em movimento · .2 falha · .3 freio liberado |
| 17 | X4_In_Fault | BYTE | código de falha do inversor |
| 18 | X4_In_Speed | WORD | velocidade (mm/s) |
| 20 | X4_PQI | BYTE | |
| 22 | X5_In_Dist | WORD | distância (mm): altura = 2900 − distância |
| 24 | X5_In_Flags | BYTE | |
| 25 | X5_In_Quality | BYTE | |
| 26 | X5_PQI | BYTE | |
| 28 | X6_In_Status | BYTE | .0 rodando · .1 falha |
| 29 | X6_In_Speed | BYTE | velocidade atual (%) |
| 30 | X6_PQI | BYTE | |
| 32 | X7_PQI | BYTE | |

**PQI** (Port Qualifier Information), em todas as portas: **.7 PQ** = dados válidos · **.6 DevCom** = device comunicando · **.5 DevErr** = device com erro. Com tudo certo, o PQI vale **16#C0**.

### Saídas: 12 bytes (O→T)

| Byte | Canal no CODESYS | Tipo | Conteúdo |
| --- | --- | --- | --- |
| 0 | X0_Out_Ctrl | BYTE | .0 liga · .1 reverso · .2 reset |
| 1 | X0_Out_Speed | BYTE | velocidade (%) |
| 2 | X2_Out_Valves | BYTE | .0 Y1 avançar · .1 Y2 recuar |
| 4 | X4_Out_Ctrl | BYTE | .0 habilita · .1 subir · .2 descer · .3 reset |
| 5 | X4_Out_Res | BYTE | reservado |
| 6 | X4_Out_Speed | WORD | velocidade (mm/s, máximo 400) |
| 8 | X6_Out_Ctrl | BYTE | .0 liga · .1 reverso · .2 reset |
| 9 | X6_Out_Speed | BYTE | velocidade (%) |
| 10 | X7_Out_Lamps | BYTE | .0 verde · .1 amarelo · .2 vermelho · .3 sirene |

No EtherNet/IP, as **WORDs já chegam na ordem de bytes do CODESYS**: uma distância de 800 mm aparece como 800. Por isso, na GVL, **xTrocarBytes fica FALSE**.

## Parte 1: No HUB e no simulador

1. No HUB, a aba **Rede virtual** deve mostrar **Rede pronta**. Ela cria 192.168.100.10 para o CODESYS e 192.168.100.23 para o TBEN-L-SIM.
2. Em **Dispositivos**, escolha o **Remoto IO-Link TBEN-L**. No campo de modo, deixe **EtherNet/IP (Windows)** e clique em **Iniciar**.
3. Na tela do simulador, embaixo do título, deve aparecer **"via EtherNet/IP"** e o link **Baixar EDS**. A faixa do módulo mostra **"EtherNet/IP: aguardando o CLP"**.
4. Por enquanto, deixe o simulador em **CLP demo**: ele mesmo comanda a célula. Clique em **Partir** para ver o ciclo completo antes de programar.

## Parte 2: No CODESYS, o projeto

1. **File → New Project → Standard project**, device **CODESYS Control Win V3 x64**.
2. Botão direito em **Device** → **Add Device** → **Ethernet**. Na aba General, interface **SIM-HUB (192.168.100.10)**, e **desmarque** "Adjust operating system settings".
3. Botão direito nessa **Ethernet** → Add Device → **EtherNet/IP Scanner**.

### 2.1 Adicionar o TBEN-L-SIM

1. Baixe o EDS: no HUB, **Dispositivos → Remoto IO-Link TBEN-L → Arquivos para o CLP** → `0493000C01010100_TBEN-L-SIM_EIP.eds` (ou **Baixar EDS**, na tela do simulador).
2. **Tools → Device Repository → Install** → escolha o EDS.
3. Botão direito em **EtherNet_IP_Scanner** → Add Device → **TBEN-L-SIM (simulador)**.
4. Dois cliques no TBEN → **General** → **IP Address = 192.168.100.23**.

### 2.2 Conexão e tamanhos

Aba **Connections** → conexão **Exclusive Owner (34 bytes de entrada, 12 de saída)**:

| Campo | Valor |
| --- | --- |
| O→T size (saída) | **12 bytes** |
| T→O size (entrada) | **34 bytes** |
| RPI | 10 a 30 ms (20 ms é um bom valor) |
| Connection type T→O | Point to Point |

Se o tamanho não bater, o Forward Open é recusado e a conexão não abre.

## Parte 3: GVL, funções e programa

Os arquivos estão no HUB, em **Dispositivos → Remoto IO-Link TBEN-L → Arquivos para o CLP**: `GVL_TBEN.st`, `Tipos_e_Funcoes.st` e `PRG_Paletizador.st`. Abra cada um no Bloco de Notas e copie o conteúdo para o CODESYS.

1. **GVL_TBEN:** botão direito em **Application** → Add Object → **Global Variable List** → nome `GVL_TBEN`. Cole o conteúdo do `GVL_TBEN.st`. Confira que **`xTrocarBytes : BOOL := FALSE;`**.
2. **Tipos e funções:** o `Tipos_e_Funcoes.st` tem vários blocos. Crie **cada um como um objeto separado**, com o mesmo nome:
   - `E_Estado` e `E_Passo`: Add Object → **DUT** → tipo **Enumeration**;
   - `F_U16`, `F_W16` e `F_PortaOk`: Add Object → **POU** → tipo **Function**.
3. **Programa:** Add Object → **POU** → `PRG_Paletizador`, tipo **Program**, linguagem **ST**. Cole o conteúdo do `PRG_Paletizador.st`.
4. **Tarefa:** dois cliques em **MainTask** → **Add Call** → `PRG_Paletizador`. Sugestão: **Cyclic, 20 ms**.

## Parte 4: I/O Mapping

Dois cliques no TBEN → aba **EtherNet/IP I/O Mapping**. Os canais do EDS têm **o mesmo nome das variáveis da GVL**: em cada um, clique em **…** na coluna Variable e escolha a variável de mesmo nome em `GVL_TBEN`.

- **Entradas:** de `X0_In_Status` até `X7_PQI` (24 canais).
- **Saídas:** de `X0_Out_Ctrl` até `X7_Out_Lamps` (9 canais).
- Os canais **`_reservado`** ficam **sem variável**.

Exemplo: o canal `X1_In_Dist` vai para `GVL_TBEN.X1_In_Dist`; o canal `X4_Out_Speed` vai para `GVL_TBEN.X4_Out_Speed`.

## Parte 5: Testar

1. **Build** (F11): 0 erros.
2. **Online → Login** (Alt + F8) → aceite o download → **Start** (F5).
3. Na tela do simulador, clique em **CODESYS** (ao lado de CLP demo e Manual). A faixa do módulo muda para **"EtherNet/IP: CODESYS conectado (conexão de I/O ativa)"**.
4. Clique em **Partir**, na tela do simulador. O programa do CLP passa a comandar a célula:

| O que observar | Resultado esperado |
| --- | --- |
| Torre sinaleira | verde com a célula em automático |
| Esteira de entrada | traz as caixas até o empurrador |
| Laser de altura (X1) | `X1_In_Dist` muda quando a caixa passa |
| Empurrador (X2) | avança e recua a cada camada |
| Elevador (X4 e X5) | desce uma camada por vez; `X5_In_Dist` acompanha a altura |
| Contador | "x de 12" sobe a cada caixa |
| **Emergência**, na tela | tudo para; torre vermelha. Destrave e clique em **Rearmar** |

### Diagnóstico IO-Link

Na tela do simulador, selecione uma porta e injete uma falha (por exemplo, **cabo rompido**). No CODESYS, o **PQI** da porta muda (DevCom cai) e o programa mostra a mensagem de falha. Remova a falha e clique em **Rearmar**.

No EtherNet/IP, a **configuração das portas** (modo, validação, Data Storage) e os **parâmetros ISDU** dos devices são feitos pela tela do simulador, nas abas **Porta** e **ISDU**. No PROFINET, o CLP pode mandá-los pelos registros 0x0200 e 0xB400.

## Problemas comuns

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| "Adapter not configured yet" no CODESYS | CLP fora de RUN, ou a placa SIM-HUB do nó Ethernet mudou | Login e Start; no nó **Ethernet**, escolha de novo a **SIM-HUB** |
| Forward Open recusado | tamanhos diferentes de 34 / 12 bytes | confira a conexão (Parte 2.2) |
| Conectou, mas a célula não se mexe | o simulador não está no modo **CODESYS** | clique em **CODESYS** na tela do simulador |
| Simulador sem "Baixar EDS" e sem rede | iniciado no modo **Demonstração** | no HUB, pare e inicie no modo **EtherNet/IP (Windows)** |
| Distância ou velocidade absurdas (ex.: 800 virando 8195) | `xTrocarBytes` em TRUE | no EtherNet/IP, deixe **FALSE** |
| Uma porta com PQI 16#00 | falha injetada ou device trocado | aba **Porta** da tela do simulador |
| Saídas zeradas de repente | CLP em STOP ou conexão perdida | Start no CODESYS |

## PROFINET (opcional, em máquina virtual Linux)

O mesmo TBEN-L-SIM também fala **PROFINET real**, mas esse modo usa a pilha p-net, que só roda no Linux. Ele exige uma máquina virtual (VirtualBox com Ubuntu), com uma placa host-only dedicada ao PROFINET, e o CODESYS usa essa placa, não a SIM-HUB. O passo a passo está no `README.md` do simulador e em `codesys/LEIA-ME.md`.
