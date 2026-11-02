# SCA06: CODESYS + EtherNet/IP

Tutorial completo

O CODESYS é o **mestre** (scanner) e o SCA06 com o módulo ECO5 é o **escravo** (adapter) EtherNet/IP. Ao final, o CLP habilita o servomotor, manda a velocidade em rpm, para pela função STOP, reseta falhas e lê de volta velocidade, corrente e estados, inclusive emergência (STO) e fins de curso. No extra, o mesmo motor passa a ser controlado por torque.

## Arquitetura

```
  CODESYS (CLP)  192.168.100.10                     SCA06 + ECO5  192.168.100.22
  EtherNet/IP Scanner                                EtherNet/IP Adapter
  ┌──────────────────────┐   O→T  assembly 150 (4 palavras de saída)   ┌──────────────────────┐
  │ Control Word, Ref.   │ ──────────────────────────────────────────▶ │ habilita, STOP,      │
  │ velocidade, torque,  │                                              │ reset, referências   │
  │ modo de controle     │ ◀────────────────────────────────────────── │ estado, velocidade,  │
  └──────────────────────┘   T→O  assembly 100 (4 palavras de entrada)  │ corrente, modo       │
                                                                        └──────────────────────┘
```

As duas pontas estão no mesmo PC, ligadas pela placa de rede virtual **SIM-HUB** criada pelo HUB.

## Mapa de dados

São **4 palavras** (INT, 16 bits) em cada sentido. No CODESYS elas chegam inteiras, com o nome de cada uma.

**Entradas** (do SCA06 para o CLP, assembly 100):

| Palavra | Canal no CODESYS | Conteúdo | Escala |
| --- | --- | --- | --- |
| 1ª | IN1 Palavra de estado | bits de estado (tabela abaixo) | — |
| 2ª | IN2 Velocidade do motor | velocidade com sinal | 32767 = 18750 rpm |
| 3ª | IN3 Corrente de torque | corrente Iq com sinal | A × 10 (47 = 4,7 A) |
| 4ª | IN4 Modo de controle atual | modo em uso | 0 torque · 1 velocidade · 3 posição |

**Saídas** (do CLP para o SCA06, assembly 150). Só valem com **P0202 = 6**:

| Palavra | Canal no CODESYS | Conteúdo | Escala |
| --- | --- | --- | --- |
| 1ª | OUT1 Palavra de controle | bits de comando (tabela abaixo) | — |
| 2ª | OUT2 Referencia de velocidade | velocidade desejada | 32767 = 18750 rpm |
| 3ª | OUT3 Referencia de torque | corrente desejada (modo torque) | A × 10 |
| 4ª | OUT4 Modo de controle | **1 = velocidade**, 0 = torque | — |

**Bits da palavra de controle (OUT1):**

| Bit | Função |
| --- | --- |
| 2 | **STOP**: 1 = para pela rampa P0105 e segura o motor parado |
| 3 | **Habilita**: 1 = habilita o drive; 0 = desabilita (motor solto) |
| 7 | **Reset de falhas**: na passagem de 0 para 1 |

**Bits da palavra de estado (IN1):**

| Bit | Significa |
| --- | --- |
| 2 | drive habilitado |
| 3 | drive em falha |
| 4 | potência energizada |
| 5 | função STOP ativa |
| 6 | STO ativo (emergência) |
| 7 | alarme ativo |
| 14 | fim de curso horário atuado |
| 15 | fim de curso anti-horário atuado |

**Atenção ao modo de controle (OUT4):** se essa palavra ficar em **0**, o drive entra em **modo torque** e ignora a referência de velocidade. É o erro mais comum: o motor habilita, mas não gira. Para controlar por velocidade, escreva **1**.

## Parte 1: No HUB e no simulador

### 1.1 Rede e IP

- No HUB, a aba **Rede virtual** deve mostrar **Rede pronta**. Ela cria 192.168.100.10 para o CODESYS e 192.168.100.22 para o SCA06.
- Em **Dispositivos**, escolha o **Servomotor WEG SCA06** e clique em **Iniciar** antes de iniciar o CODESYS Control Win.
- No topo do simulador, o chip **P0801** mostra **Wait Comm**: o adapter está pronto, esperando um mestre.

### 1.2 Bancada pronta para girar

Na aba **Bancada** do simulador, confira que:

- **Disjuntor de potência** está ligado (bolinha verde);
- **Emergência (STO)** está solta;
- **Botoeira STOP (DI1)** está solta;
- **ECO5** está encaixado e o **cabo Ethernet XA171** está conectado.

### 1.3 Configurar o drive para obedecer à rede

O simulador sai **de fábrica**, como um drive novo: com **P0202 = 2**, ou seja, a velocidade vem da HMI do próprio drive. Para o CLP comandar pela EtherNet/IP, **3 parâmetros** precisam mudar. Você escolhe o caminho; o resultado é o mesmo.

| Parâmetro | Valor | O que faz |
| --- | --- | --- |
| **P0000** | **5** | senha: libera a alteração dos outros parâmetros |
| **P0202** | **6** | modo de operação = **rede** (Profibus DP/Ethernet). Sem isso, o drive ignora as palavras de saída do CLP |
| **P0662** | **3** | se a comunicação cair: **desabilita o drive** (veja o teste do cabo, na Parte 6) |

**O drive precisa estar desabilitado**: o P0202 não muda com ele habilitado (aparece o alarme A00124).

**Sobre o P0662:** de fábrica ele vale **0** (só mostra alarme). Nesse caso, se a comunicação cair, o motor **continua girando** com a última referência. Numa máquina real isso é perigoso, por isso a recomendação de usar 3 (desabilita) ou 2 (função STOP).

#### Caminho A: automático, um clique

1. No simulador, abra a aba **Parâmetros**.
2. No topo, clique em **Preparar para EtherNet/IP**.
3. Confirme com **OK**.
4. Aparece em verde: **"Pronto: P0000 = 5 · P0202 = 6 · P0662 = 3"**, e o chip **P0202** do topo passa a mostrar **6**.

Se aparecer em vermelho "desabilite o drive antes", o drive está habilitado: desabilite e clique de novo.

#### Caminho B: pela HMI do drive, como na vida real

A HMI fica no desenho do drive: à esquerda da tela, em monitores largos, ou na aba **SCA06**, em telas menores. Ela tem um display de 6 dígitos e quatro teclas:

| Tecla | No teclado do PC | Para que serve |
| --- | --- | --- |
| **P** | Enter | entra no parâmetro e grava |
| **▲** | seta para cima | próximo parâmetro / aumenta o valor |
| **▼** | seta para baixo | parâmetro anterior / diminui o valor |
| **◄** | seta para a esquerda | na alteração, escolhe o dígito que vai mudar |

**Como ler o display:**

- **P00202**, com "P" na frente, é o **número** de um parâmetro: você está escolhendo qual parâmetro abrir;
- um número **sem o "P"** é o **valor** do parâmetro;
- se um dígito **pisca**, você está **alterando** aquele dígito.

**As setas:** na escolha do parâmetro, **▲** vai para o próximo e **▼** volta. A lista só tem os parâmetros que existem, então do P00000 ao P00202 são 37 toques. Segure **▲** para andar rápido (começa a repetir depois de meio segundo e acelera depois de 2 segundos).

**Passo 1: liberar a senha (P0000 = 5)**

1. O display mostra **P00000**. Se mostrar outra coisa, segure **▼** até voltar ao P00000.
2. Aperte **P**: aparece **00000**, com o último dígito piscando.
3. Aperte **▲ 5 vezes**: **00005**.
4. Aperte **P**: grava e volta para **P00000**. A senha está liberada.

**Passo 2: modo rede (P0202 = 6)**

5. Segure **▲** até **P00202** (37 toques a partir do P00000).
6. Aperte **P**: aparece o valor atual, **00002**, sem piscar. O P0202 é um parâmetro especial: o primeiro **P** só mostra o valor.
7. Aperte **P** de novo: agora o último dígito pisca.
8. Aperte **▲ 4 vezes**: **00006**.
9. Aperte **P**: grava. O chip **P0202** do topo da tela passa a mostrar **6**.

**Passo 3: segurança na queda de comunicação (P0662 = 3)**

10. Aperte **▲** até **P00662** (13 toques depois do P00202).
11. Aperte **P**: o último dígito pisca.
12. Aperte **▲ 3 vezes**: **00003**.
13. Aperte **P**: grava.

**Passo 4: conferir**

14. Abra a aba **Parâmetros** e escolha o filtro **Diferentes do padrão**: aparecem o P0202 = 6 e o P0662 = 3.

**Se errar um valor:** na alteração, ▲ ▼ mudam o dígito que pisca, e **◄** passa para o dígito ao lado (unidades → dezenas → centenas…). Ajuste e aperte **P**.

#### Caminho C: pela aba Parâmetros, parâmetro por parâmetro

É o equivalente a configurar pelo software do fabricante no PC (pela USB).

1. Abra a aba **Parâmetros** do simulador.
2. No campo **Buscar**, digite `0` e clique na linha **P0000**. Digite **5** no campo que abre e clique em **Gravar**.
3. Busque `202`, clique em **P0202**, digite **6** e clique em **Gravar**.
4. Busque `662`, clique em **P0662**, digite **3** e clique em **Gravar**.
5. Para conferir, escolha o filtro **Diferentes do padrão**.

Se aparecer "Desabilite o drive antes (A00124)", o drive está habilitado.

#### Voltar ao padrão de fábrica (para treinar de novo)

- Botão **Restaurar padrão de fábrica**, no topo da aba **Parâmetros**; ou
- pela HMI, como no drive real: libere a senha (**P0000 = 5**), vá até o **P00204** (1 toque depois do P00202), aperte **P** duas vezes, **▲ 5 vezes** e **P**. O display pisca e o drive volta ao padrão: P0202 = 2.

## Parte 2: No CODESYS, o projeto

- **File → New Project → Standard project**, device **CODESYS Control Win V3 x64**.
- Botão direito em **Device** → **Add Device** → **Ethernet**. Na aba General, interface **SIM-HUB (192.168.100.10)** e **desmarque** "Adjust operating system settings".
- Botão direito nessa **Ethernet** → Add Device → **EtherNet/IP Scanner**.
- Em **Application**, crie a lista **GVL_SCA** (Parte 3) e os programas **PLC_PRG** (Ladder, Parte 4) e **Velocidade_SCA** (ST, Parte 5).

Os dois programas precisam estar na **MainTask**: senão compilam, mas nunca rodam. Dois cliques em **MainTask** → **Add Call** → escolha cada programa. Sugestão: **Cyclic, 20 ms**.

### 2.1 Adicionar o SCA06

- Baixe o EDS no HUB: **Dispositivos** → **Servomotor WEG SCA06** → **Arquivos para o CLP** → `0355002B00060200_SCA06_SIM_4x4.eds`.
- **Tools → Device Repository → Install** → escolha o EDS baixado.
- Botão direito em **EtherNet_IP_Scanner** → Add Device → **SCA06 ECO5 (simulador)**.
- Dois cliques no SCA06 → General → **IP Address = 192.168.100.22**.

Esse EDS foi gerado pelo simulador e descreve 4 palavras de entrada e 4 de saída. Ele não é o EDS oficial da WEG.

### 2.2 Conexão e tamanhos

Aba **Connections** → conexão **Exclusive Owner**:

| Campo | Valor | Por quê |
| --- | --- | --- |
| O→T size (saída) | **8 bytes** | 4 palavras: controle, ref. velocidade, ref. torque, modo |
| T→O size (entrada) | **8 bytes** | 4 palavras: estado, velocidade, corrente, modo |
| RPI | 10 a 30 ms | 20 ms é um bom valor |
| Connection type T→O | Point to Point | evita problema com tudo no mesmo PC |

Se o tamanho não bater com o drive, o Forward Open é recusado e o P0801 fica em **Wait Comm**.

Lembrete: **O→T** = do CLP (**O**riginator) para o drive (**T**arget) = **saída**. **T→O** = **entrada**.

## Parte 3: A GVL_SCA e o I/O Mapping

### 3.1 GVL_SCA: as palavras do drive

Botão direito em **Application** → Add Object → **Global Variable List** → `GVL_SCA`:

```
VAR_GLOBAL
    // entradas (SCA06 -> CLP)
    SW         : INT;   // IN1 palavra de estado
    VEL        : INT;   // IN2 velocidade (32767 = 18750 rpm)
    IQ         : INT;   // IN3 corrente de torque (A x 10)
    MODO_ATUAL : INT;   // IN4 modo de controle atual
    // saídas (CLP -> SCA06)
    CW         : INT;   // OUT1 palavra de controle
    REF_VEL    : INT;   // OUT2 referência de velocidade
    REF_TORQUE : INT;   // OUT3 referência de torque (A x 10)
    MODO       : INT;   // OUT4 modo de controle (1 = velocidade)

    // comandos e leituras em unidades de engenharia (use no online ou numa visualização)
    xHabilita      : BOOL;
    xStop          : BOOL;
    xReset         : BOOL;
    rVelocidadeRpm : REAL := 300.0;   // velocidade desejada (negativo = anti-horário)
    rVelAtualRpm   : REAL;            // velocidade medida
    rCorrenteA     : REAL;            // corrente medida
    xHabilitado, xFalha, xEmStop, xSTO, xAlarme : BOOL;
END_VAR
```

As palavras são **INT** (com sinal) porque a velocidade e a corrente podem ser negativas. O CODESYS deixa ler e escrever bits de um INT do mesmo jeito que de uma WORD: `GVL_SCA.CW.3`.

### 3.2 I/O Mapping

Dois cliques no SCA06 → aba **EtherNet/IP I/O Mapping** → ligue cada canal com o botão **…** da coluna Variable:

| Canal | Variável |
| --- | --- |
| IN1 Palavra de estado | GVL_SCA.SW |
| IN2 Velocidade do motor | GVL_SCA.VEL |
| IN3 Corrente de torque | GVL_SCA.IQ |
| IN4 Modo de controle atual | GVL_SCA.MODO_ATUAL |
| OUT1 Palavra de controle | GVL_SCA.CW |
| OUT2 Referencia de velocidade | GVL_SCA.REF_VEL |
| OUT3 Referencia de torque | GVL_SCA.REF_TORQUE |
| OUT4 Modo de controle | GVL_SCA.MODO |

## Parte 4: Programa Ladder (PLC_PRG), comandos e estados

O Ladder faz a parte digital: os comandos viram bits da palavra de controle, e os bits da palavra de estado viram sinais fáceis de ler.

| Linha | Contato | Bobina | Função |
| --- | --- | --- | --- |
| 1 | GVL_SCA.xHabilita (NA) | GVL_SCA.CW.3 | habilita o drive |
| 2 | GVL_SCA.xStop (NA) | GVL_SCA.CW.2 | função STOP |
| 3 | GVL_SCA.xReset (NA) | GVL_SCA.CW.7 | reset de falhas (na borda) |
| 4 | GVL_SCA.SW.2 (NA) | GVL_SCA.xHabilitado | drive habilitado |
| 5 | GVL_SCA.SW.3 (NA) | GVL_SCA.xFalha | drive em falha |
| 6 | GVL_SCA.SW.5 (NA) | GVL_SCA.xEmStop | função STOP ativa |
| 7 | GVL_SCA.SW.6 (NA) | GVL_SCA.xSTO | emergência (STO) acionada |
| 8 | GVL_SCA.SW.7 (NA) | GVL_SCA.xAlarme | alarme ativo |

O reset só age na **passagem de 0 para 1** do bit 7. Para resetar de novo, desligue `xReset` e ligue outra vez.

## Parte 5: Programa ST (Velocidade_SCA), rpm para a rede e de volta

O ST faz a parte numérica: escolhe o modo velocidade, converte rpm para a escala do drive e faz o caminho de volta.

```
PROGRAM Velocidade_SCA

// 1) modo de controle: 1 = velocidade (0 seria torque e a referência de velocidade seria ignorada)
GVL_SCA.MODO := 1;

// 2) velocidade desejada: rpm -> escala da rede (32767 = 18750 rpm), com sinal
GVL_SCA.REF_VEL := REAL_TO_INT(LIMIT(-3000.0, GVL_SCA.rVelocidadeRpm, 3000.0) * 32767.0 / 18750.0);

// 3) velocidade medida: escala da rede -> rpm
GVL_SCA.rVelAtualRpm := INT_TO_REAL(GVL_SCA.VEL) * 18750.0 / 32767.0;

// 4) corrente medida: A x 10 -> A
GVL_SCA.rCorrenteA := INT_TO_REAL(GVL_SCA.IQ) / 10.0;
```

| Trecho | O que faz |
| --- | --- |
| `* 32767.0 / 18750.0` | regra de três: 32767 vale 18750 rpm. 300 rpm viram **524** |
| `LIMIT(-3000.0, …, 3000.0)` | não deixa pedir mais que o motor aguenta |
| valor negativo | anti-horário: −300 rpm viram −524, que na rede é **16#FDF4** (complemento de dois) |
| `/ 10.0` | a corrente chega em décimos de ampère: 47 = 4,7 A |

Os cálculos são feitos em REAL de propósito: em INT, 3000 × 32767 estoura o limite de 32767.

## Parte 6: Testar e diagnosticar

### 6.1 Antes de começar

O SCA06 aceita **um único mestre**. Se você testou pela aba **Mestre** do simulador (o CLP virtual), clique em **Desconectar** lá antes de ligar o CODESYS; senão o CODESYS é recusado.

### 6.2 Roteiro de teste

- **Build** (F11): 0 erros.
- **Online → Login** (Alt+F8) → aceite o download → **Start** (F5).
- No simulador, o chip **P0801** fica verde: **Data Active**.
- No CODESYS online, altere os valores com **Ctrl+F7** (escrever valor) e acompanhe na bancada:

| Ação no CODESYS | Resultado esperado |
| --- | --- |
| `xHabilita := TRUE` | P0006 = **Servo ready: habilitado**; sinaleiro verde; `xHabilitado` = TRUE |
| `rVelocidadeRpm := 300` | REF_VEL = **524**; o disco gira a 300 rpm; `rVelAtualRpm` ≈ 300 |
| `rVelocidadeRpm := -300` | o disco inverte; REF_VEL = −524; `rVelAtualRpm` ≈ −300 |
| `xStop := TRUE` | o motor para pela rampa P0105 e fica segurando; `xEmStop` = TRUE |
| `xStop := FALSE` | o motor volta à velocidade pedida |
| Peso de desbalanceamento na bancada | `rCorrenteA` oscila a cada volta: o motor faz força para subir o peso |
| **Emergência (STO)** na bancada | o motor fica sem torque; display "Sto"; `xSTO` = TRUE |
| Solte a emergência, `xHabilita` FALSE e TRUE | o drive volta a habilitar |
| Desconecte o **cabo XA171** na bancada | A00147 (erro de comunicação); com P0662 = 3 o drive desabilita |
| Reconecte o cabo, `xHabilita` FALSE → TRUE | P0801 volta a Data Active e o drive habilita de novo (se aparecer falha, `xReset` FALSE → TRUE antes) |

Repita o teste do cabo com **P0662 = 0**: o alarme aparece, mas o motor **continua girando**. Compare e discuta qual é mais seguro.

### 6.3 Problemas comuns

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| P0801 em Wait Comm | Forward Open recusado ou IP errado | confira IP 192.168.100.22 e os tamanhos 8 / 8 bytes |
| CODESYS recusado mesmo com tudo certo | o CLP virtual da aba Mestre está conectado | **Desconectar** na aba Mestre |
| Habilita, mas o motor não gira | OUT4 = 0 (modo torque) | `GVL_SCA.MODO := 1` (Parte 5) |
| Nada que o CLP manda tem efeito | P0202 diferente de 6 | P0000 = 5 e P0202 = 6 com o drive desabilitado |
| Não consigo alterar parâmetros | senha não liberada | P0000 = 5 (Parte 1.3) |
| P0202 não muda | drive habilitado | `xHabilita := FALSE` antes |
| Velocidade com número absurdo | variável declarada como WORD | use **INT**: a velocidade tem sinal |
| Motor gira no sentido errado | sinal da referência | positivo = horário, negativo = anti-horário |
| Não habilita | STO, STOP, disjuntor desligado ou falha | confira a bancada (Parte 1.2) e `xFalha` |
| Tudo certo, mas nada muda | programa fora da MainTask | Add Call na MainTask (Parte 2) |
| Interface SIM-HUB não aparece no CODESYS | rede virtual não criada | aba **Rede virtual** do HUB → criar a rede |

## Extra 1: Controle por torque

No modo torque, o CLP não pede velocidade: pede **força** (corrente). É ótimo para sentir o efeito do peso de desbalanceamento.

- No ST, troque a linha 1 por `GVL_SCA.MODO := 0;` e acrescente:

```
// referência de torque: ampères -> A x 10
GVL_SCA.REF_TORQUE := REAL_TO_INT(LIMIT(-5.0, rTorqueA, 5.0) * 10.0);
```

- Declare `rTorqueA : REAL := 0.0;` na GVL_SCA e ligue o motor (`xHabilita := TRUE`).
- Com o **peso** montado, aumente `rTorqueA` aos poucos (0,2 A de cada vez) até o disco **parar de cair** e ficar equilibrado: essa é a corrente que segura o peso naquela posição.
- Com um pouco mais de corrente, o disco começa a girar e **acelera sem parar**: no modo torque ninguém controla a velocidade. Pare com `xStop := TRUE`.

Os fins de curso não atuam no modo torque. Cuidado com o disco solto: use valores pequenos.

## Extra 2: As missões da bancada

A aba **Missões** do simulador traz 12 desafios em sequência, do básico ao avançado: abrir a sessão, P0202 = 6, Data Active, habilitar, 300 rpm, inversão em complemento de dois, função STOP, mapear a corrente numa palavra extra, equilibrar o peso em modo torque, diagnosticar F00047 com o cabo rompido, fim de curso e posicionamento em 135,0°. Cada missão confere sozinha quando é cumprida. Faça-as pelo CLP virtual da aba **Mestre** ou, as que couberem, pelo seu projeto no CODESYS.
