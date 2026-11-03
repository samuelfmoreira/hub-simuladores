# SCA06: CODESYS + EtherNet/IP

Tutorial completo

O CODESYS é o **mestre** (scanner) e o SCA06 com o módulo ECO5 é o **escravo** (adapter) EtherNet/IP. O guia passa pelos **três modos de controle pela rede**:

| Modo | O CLP manda | Parte |
| --- | --- | --- |
| **Velocidade** | rpm (o drive mantém a velocidade, com qualquer carga) | Partes 1 a 6 |
| **Torque** | força, em ampères (o drive não controla a velocidade) | Parte 7 |
| **Posição** | ângulo de destino, ou **um ângulo por pulso** | Parte 8 |

Nas Partes 1 a 6, o CLP habilita o servomotor, manda a velocidade em rpm, para pela função STOP, reseta falhas e lê de volta velocidade, corrente e estados, inclusive emergência (STO) e fins de curso.

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

## Parâmetros por modo de controle

O SCA06 pode ser comandado pela rede em **três modos de controle**. Esta tabela mostra, lado a lado, **o valor de cada parâmetro em cada modo**: é a "receita" de configuração. As partes do guia explicam cada modo passo a passo.

| Parâmetro | O que faz | Velocidade | Torque | Posição |
| --- | --- | --- | --- | --- |
| P0000 | senha (libera a alteração) | 5 | 5 | 5 |
| **P0202** | **modo de operação** | **6** (rede) | **6** (rede) | **4** (Ladder) |
| P1020 | aplicativo Ladder em execução | — | — | 1 (já vem de fábrica) |
| P0810 | IP pelos parâmetros | 0 | 0 | 0 |
| P0811…P0814 | endereço IP | 192.168.100.22 | 192.168.100.22 | 192.168.100.22 |
| P0815 | máscara (CIDR) | 24 | 24 | 24 |
| P0820…P0823 | palavras de entrada 5 a 8 | 0 | 0 | 1110, 1111, 1112, 1113 |
| P0835…P0838 | palavras de saída 5 a 8 | 0 | 0 | 1100, 1101, 1102, 1103 |
| P0662 | ação se a comunicação cair | 3 | 3 | 3 |
| P0849 | aplica a configuração de rede | 1 | 1 | 1 |
| **Conexão no CODESYS** | | **4 palavras** (8 / 8 bytes) | **4 palavras** (8 / 8 bytes) | **8 palavras** (16 / 16 bytes) |
| **Onde está no guia** | | Partes 1 a 6 | Parte 7 | Parte 8 |

Velocidade e torque usam **a mesma configuração do drive**: a diferença está no que o CLP manda nas palavras de saída.

**O que o CLP manda em cada modo:**

| Palavra de saída | Velocidade | Torque | Posição |
| --- | --- | --- | --- |
| OUT1 palavra de controle | bit 3 habilita · bit 2 STOP · bit 7 reset | igual | ignorada |
| OUT2 referência de velocidade | **rpm** (32767 = 18750 rpm) | ignorada | ignorada |
| OUT3 referência de torque | ignorada | **corrente em A × 10** | ignorada |
| **OUT4 modo de controle** | **1** | **0** | ignorada |
| OUT5…OUT8 | — | — | comando, destino, velocidade e tipo de movimento (P1100…P1103) |

As **entradas** IN1 a IN4 (estado, velocidade, corrente e modo atual) são iguais nos três modos. No modo posição, as entradas IN5 a IN8 trazem o status, a posição atual, o erro de posição e o contador de movimentos.

## Lista de parâmetros da comunicação

Todos os parâmetros que entram na comunicação EtherNet/IP do SCA06, num lugar só, para consulta. As Partes seguintes mostram **como** configurar cada um (pelo assistente, pela HMI ou pela aba Parâmetros). "Desabilitado" quer dizer que o parâmetro só muda com o drive desabilitado.

#### Acesso e estado

| Parâmetro | Nome | Fábrica | Para a rede | O que faz |
| --- | --- | --- | --- | --- |
| P0000 | Acesso aos parâmetros (senha) | 0 | **5** | libera a alteração dos outros parâmetros |
| P0200 | Senha | 1 (ativa) | 1 | com 1, a senha P0000 = 5 é exigida |
| P0800 | Identificação do módulo Ethernet | 2 | — | só leitura: 2 = módulo EtherNet/IP (ECO5) encaixado |
| P0801 | Estado da comunicação Ethernet | 0 | — | só leitura: 2 Wait Comm (esperando o CLP) · **4 Data Active** (trocando dados) · 5 Error |

#### Quem manda no drive

| Parâmetro | Nome | Fábrica | Para a rede | O que faz |
| --- | --- | --- | --- | --- |
| P0202 | Modo de operação | 2 (velocidade pela HMI) | **6** (velocidade/torque) ou **4** (posição) | 6 = Profibus DP/Ethernet: o CLP manda pelas palavras de saída · 4 = Ladder: o aplicativo de posicionamento manda. Desabilitado |
| P1020 | Comando da PLC (Ladder) | 1 | 1 | mantém o aplicativo de posicionamento em execução (modo posição) |

#### Endereço IP

| Parâmetro | Nome | Fábrica | Para a rede do HUB | O que faz |
| --- | --- | --- | --- | --- |
| P0803 | Taxa de comunicação | 0 (Auto) | 0 | velocidade da porta Ethernet |
| P0810 | Configuração do endereço IP | 1 (DHCP) | **0** (Parâmetros) | de onde vem o IP |
| P0811…P0814 | Endereço IP | 192.168.0.10 | **192.168.100.22** | um número em cada parâmetro |
| P0815 | Sub-rede (CIDR) | 24 | 24 | 24 = 255.255.255.0 |
| P0816…P0819 | Gateway | 0.0.0.0 | 0.0.0.0 | só se o CLP estiver em outra rede |

#### Palavras de troca

As **4 primeiras palavras** de cada sentido são **fixas** (não têm parâmetro): entradas = estado, velocidade, corrente, modo atual; saídas = controle, referência de velocidade, referência de torque, modo de controle. As extras são escolhidas por parâmetro: cada uma diz **qual parâmetro** vai naquela palavra (0 = sem palavra; a lista para no primeiro 0).

| Parâmetro | Nome | Fábrica | Velocidade/torque | Posição | O que faz |
| --- | --- | --- | --- | --- | --- |
| P0820…P0823 | Palavra de leitura #5 a #8 | 0 | 0 | **1110, 1111, 1112, 1113** | o que o drive manda nas entradas 5 a 8 |
| P0824…P0831 | Palavra de leitura #9 a #16 | 0 | 0 | 0 | entradas 9 a 16 (até 16 palavras) |
| P0835…P0838 | Palavra de escrita #5 a #8 | 0 | 0 | **1100, 1101, 1102, 1103** | onde o CLP escreve as saídas 5 a 8 |
| P0839…P0846 | Palavra de escrita #9 a #16 | 0 | 0 | 0 | saídas 9 a 16 |

Cada palavra extra soma **2 bytes** na conexão do CLP: 4 palavras = 8 bytes; 8 palavras = 16 bytes.

#### Segurança, aplicar e fábrica

| Parâmetro | Nome | Fábrica | Para a rede | O que faz |
| --- | --- | --- | --- | --- |
| P0662 | Ação para erro de comunicação | 0 (mostra alarme) | **3** (desabilita drive) | o que fazer se a rede cair: 0 alarme (o motor continua!) · 1 falha · 2 função STOP · 3 desabilita |
| P0105 | Rampa da função STOP | 200 | 200 | ms/krpm: como o motor para pela função STOP |
| P0849 | Atualiza configuração Ethernet | 0 | **1** | **aplica** o IP e as palavras de troca; volta sozinho para 0 |
| P0204 | Carrega parâmetros | 0 | — | **5** = volta tudo ao padrão de fábrica. Desabilitado |
| P0806 | Watchdog Modbus TCP | 0 | 0 | só para o Modbus TCP (não usado na EtherNet/IP) |

#### Posicionamento pela rede (aplicativo DISCO_POS, P0202 = 4)

| Parâmetro | Nome | Fábrica | O que faz |
| --- | --- | --- | --- |
| P1100 | Comando | 0 | bit 0 habilita · bit 1 inicia (na subida 0 → 1) · bit 2 STOP · bit 3 reset · bit 4 zera a posição |
| P1101 | Posição alvo / incremento | 0 | décimos de grau (450 = 45,0°) |
| P1102 | Velocidade de posicionamento | 100 | rpm (1 a 3000) |
| P1103 | Tipo de movimento | 0 | 0 menor caminho · 1 horário · 2 anti-horário · 3 relativo (pulso) |
| P1104 | Rampa de posicionamento | 500 | ms/krpm |
| P1110 | Status | — | só leitura: bit 0 habilitado · 1 movendo · 2 em posição · 3 falha · 4 fim de curso · 5 STOP |
| P1111 | Posição atual | — | só leitura, décimos de grau (0 a 3599) |
| P1112 | Erro de posição | — | só leitura, décimos de grau |
| P1113 | Posicionamentos concluídos | — | só leitura |

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

O simulador sai **de fábrica**, como um drive novo: com **P0202 = 2**, ou seja, a velocidade vem da HMI do próprio drive. Esta é a configuração para os modos **velocidade** e **torque** (os dois usam a mesma). Para o modo posição, veja a Parte 8.2. Você escolhe o caminho; o resultado é o mesmo.

| Parâmetro | Fábrica | Valor | O que faz |
| --- | --- | --- | --- |
| **P0000** | 0 | **5** | senha: libera a alteração dos outros parâmetros |
| **P0202** | 2 | **6** | modo de operação = **rede** (Profibus DP/Ethernet). Sem isso, o drive ignora as palavras de saída do CLP |
| P0810 | 1 (DHCP) | **0** | o IP vem dos parâmetros abaixo |
| P0811…P0814 | 192.168.0.10 | **192.168.100.22** | o endereço IP do drive |
| P0815 | 24 | 24 | máscara 255.255.255.0 (já vem certo) |
| P0820…P0823 e P0835…P0838 | 0 | **0** | sem palavras extras: conexão de 4 palavras (já vem certo; confira se o drive esteve em modo posição) |
| **P0662** | 0 | **3** | se a comunicação cair: **desabilita o drive** (veja o teste do cabo, na Parte 6) |
| **P0849** | 0 | **1** | **aplica** o IP e as palavras de troca (volta sozinho para 0) |

**Sobre o IP no simulador:** dentro do HUB, mesmo em DHCP, o drive responde no IP que o HUB reservou para ele (192.168.100.22). Configurar o IP fixo é o que se faz num drive real, e por isso está aqui.

**O drive precisa estar desabilitado**: o P0202 não muda com ele habilitado (aparece o alarme A00124).

**Sobre o P0662:** de fábrica ele vale **0** (só mostra alarme). Nesse caso, se a comunicação cair, o motor **continua girando** com a última referência. Numa máquina real isso é perigoso, por isso a recomendação de usar 3 (desabilita) ou 2 (função STOP).

#### Caminho A: pelo assistente de comunicação

O assistente faz o mesmo que você faria na HMI, **na mesma ordem e explicando cada parâmetro**.

1. Clique em **Comunicação com o CLP**, no topo da tela do simulador (o mesmo botão aparece na aba **Parâmetros**).
2. Escolha o que vai comandar: **Velocidade e torque** (conexão de 4 palavras) ou **Posição** (conexão de 8 palavras, Parte 8).
3. O assistente mostra **6 etapas**: Liberar a senha → Endereço IP → Quem manda no drive → O que vai nas palavras de troca → Segurança se a comunicação cair → Aplicar.
4. Em cada etapa você vê **para que ela serve**, uma tabela com cada parâmetro (**o que faz**, valor **atual** e valor **novo**) e **como seria na HMI**.
5. Clique em **Gravar esta etapa**. Os parâmetros são gravados um por um: cada linha fica com **✓ gravado** (ou **✓ já estava assim**), e o **display da HMI do drive mostra o parâmetro** que acabou de ser gravado (primeiro o número, depois o valor). Depois, **Próxima etapa**.
6. No fim, o assistente mostra **o que configurar no CLP**: IP, arquivo EDS, conexão, tamanhos e como habilitar.

**Navegue à vontade:** clique em qualquer etapa na **trilha do topo** do assistente para ir direto a ela (as gravadas aparecem com ✓), use **Pular ›** para seguir sem gravar a etapa (por exemplo, só para ler a explicação) ou as **setas ← →** do teclado. O primeiro item da trilha, **⇄ modo**, volta à escolha entre velocidade/torque e posição.

Quer só testar o CODESYS? **Fazer tudo** grava a etapa atual e as seguintes, uma depois da outra.

Se o drive estiver habilitado, o assistente avisa e não grava: o modo de operação só muda com o drive desabilitado.

O assistente também configura o **IP fixo** do drive (P0810 = 0, P0811…P0815), que de fábrica vem em DHCP. Os caminhos B e C abaixo cobrem só os 3 parâmetros essenciais da tabela; para o IP pela HMI, a técnica é a mesma da Parte 8.2 (valores de vários dígitos com ◄).

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

- Botão **Restaurar padrão de fábrica**, no topo da aba **Parâmetros** (desfaz também tudo o que o assistente gravou); ou
- pela HMI, como no drive real: libere a senha (**P0000 = 5**), vá até o **P00204** (1 toque depois do P00202), aperte **P** duas vezes, **▲ 5 vezes** e **P**. O display pisca e o drive volta ao padrão: P0202 = 2.

## Parte 2: No CODESYS, o projeto

- **File → New Project → Standard project**, device **CODESYS Control Win V3 x64**.
- Botão direito em **Device** → **Add Device** → **Ethernet**. Na aba General, interface **SIM-HUB (192.168.100.10)** e **desmarque** "Adjust operating system settings".
- Botão direito nessa **Ethernet** → Add Device → **EtherNet/IP Scanner**.
- Em **Application**, crie a lista **GVL_SCA** (Parte 3) e os programas **PLC_PRG** (Ladder, Parte 4) e **Velocidade_SCA** (ST, Parte 5).

Os dois programas precisam estar na **MainTask**: senão compilam, mas nunca rodam. Dois cliques em **MainTask** → **Add Call** → escolha cada programa. Sugestão: **Cyclic, 20 ms**.

### 2.1 Adicionar o SCA06

- Baixe o EDS no HUB: **Dispositivos** → **Servomotor WEG SCA06** → **Arquivos para o CLP** → `0355002B00060200_SCA06_SIM.eds`.
- **Tools → Device Repository → Install** → escolha o EDS baixado.
- Botão direito em **EtherNet_IP_Scanner** → Add Device → **SCA06 ECO5 (simulador)**.
- Dois cliques no SCA06 → General → **IP Address = 192.168.100.22**.

Esse EDS foi gerado pelo simulador e traz **duas conexões**: **4 palavras** em cada sentido (velocidade e torque) e **8 palavras** (posição, Parte 8). Ele não é o EDS oficial da WEG.

### 2.2 Conexão e tamanhos

Aba **Connections** → escolha a conexão **Exclusive Owner, 4 palavras (velocidade e torque)**. O mesmo EDS traz também a conexão de 8 palavras, usada só no modo posição (Parte 8).

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

**Rampas:** no modo rede (P0202 = 6), as rampas de aceleração e desaceleração P0100/P0101 **não atuam**: elas valem só no modo velocidade pela HMI (P0202 = 2). A referência que o CLP manda é aplicada na hora. Se a máquina precisar de rampa, faça-a no programa do CLP (por exemplo, subindo `rVelocidadeRpm` aos poucos). Só a função STOP tem rampa própria no drive, a P0105.

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

## Parte 7: Controle por torque

### 7.1 Como funciona

No modo **velocidade**, o CLP diz **quão rápido** girar, e o drive faz a força que for preciso para manter essa velocidade. No modo **torque**, é o contrário: o CLP diz **quanta força** fazer (em corrente), e **a velocidade é consequência da carga**. É o modo usado em enroladores (tensão constante no material), prensas e testes de força.

O que muda no comportamento do drive:

| Item | No modo torque |
| --- | --- |
| Referência | **3ª palavra de saída**, corrente em **A × 10**, com sinal (3 = 0,3 A; −3 = 0,3 A no outro sentido) |
| Limites de velocidade P0133/P0134 | **não atuam**: se a força for maior que a carga, o disco **acelera sem parar** |
| Fins de curso | **não atuam** |
| Corrente máxima | limitada pelo **P0136** (% da corrente nominal) |
| Função STOP (OUT1 bit 2) | **funciona**: o drive troca para velocidade e para o motor pela rampa **P0105**. É o freio de segurança deste modo |

### 7.2 Parâmetros

**Os mesmos do modo velocidade** (seção 1.3): P0000 = 5, **P0202 = 6**, IP fixo, palavras extras em 0, P0662 = 3 e P0849 = 1. A conexão também é a mesma: **4 palavras** (8 / 8 bytes). A diferença está toda no CLP:

| Palavra de saída | Valor no modo torque |
| --- | --- |
| OUT4 modo de controle | **0** (torque) |
| OUT3 referência de torque | corrente desejada, em A × 10 |
| OUT1 palavra de controle | bit 3 habilita · bit 2 STOP · bit 7 reset (igual à velocidade) |
| OUT2 referência de velocidade | ignorada |

### 7.3 Variáveis

Acrescente na **GVL_SCA**:

```
    rTorqueA         : REAL := 0.0;     // corrente desejada (A); positivo = sentido horário
    rVelMaxRpm       : REAL := 300.0;   // proteção: acima disto o CLP aciona o STOP
    xSobrevelocidade : BOOL;
```

### 7.4 Programa ST (Torque_SCA)

Crie o programa e coloque-o na **MainTask** (Add Call). **Tire o `Velocidade_SCA` da MainTask** (botão direito na chamada → Delete): os dois escrevem na 4ª palavra, e o último a rodar ganharia. O `PLC_PRG` (Ladder) continua: ele cuida da habilitação, do STOP e do reset.

```
PROGRAM Torque_SCA

// 1) modo de controle: 0 = torque (1 seria velocidade)
GVL_SCA.MODO := 0;

// 2) referência de torque: ampères -> A x 10, com limite de segurança
GVL_SCA.REF_TORQUE := REAL_TO_INT(LIMIT(-2.0, GVL_SCA.rTorqueA, 2.0) * 10.0);

// 3) leituras
GVL_SCA.rVelAtualRpm := INT_TO_REAL(GVL_SCA.VEL) * 18750.0 / 32767.0;
GVL_SCA.rCorrenteA   := INT_TO_REAL(GVL_SCA.IQ) / 10.0;

// 4) proteção feita pelo CLP: no modo torque o drive não limita a velocidade
GVL_SCA.xSobrevelocidade := ABS(GVL_SCA.rVelAtualRpm) > GVL_SCA.rVelMaxRpm;
IF GVL_SCA.xSobrevelocidade THEN
    GVL_SCA.xStop := TRUE;          // para pela rampa P0105; para voltar, xStop := FALSE
END_IF
```

| Trecho | O que faz |
| --- | --- |
| `MODO := 0` | coloca o drive em torque. Com 1, ele volta a obedecer à velocidade |
| `* 10.0` | o drive recebe a corrente em décimos de ampère: 0,3 A viram 3 |
| `LIMIT(-2.0, …, 2.0)` | não deixa o CLP pedir uma força exagerada por engano |
| proteção de velocidade | como os limites P0133/P0134 não atuam, quem protege é o CLP |

### 7.5 Testar com o peso

Monte o **peso de desbalanceamento** na bancada (aba Bancada do simulador). **Build**, **Login** e **Start**. O chip **P0801** deve estar em **Data Active**. Altere os valores no online (**Ctrl+F7**):

| Ação no CODESYS | Resultado esperado |
| --- | --- |
| `rTorqueA := 0`, `xHabilita := TRUE` | drive habilitado, mas sem força: o peso desce e o disco para com o peso embaixo |
| `rTorqueA := 0.1`, depois 0.2 | o disco gira e para em cerca de **17°** e depois **32°**: a força segura o peso ali |
| `rTorqueA := 0.3` | o peso fica parado perto de **50°**: é a corrente que equilibra a gravidade nesse ângulo |
| `rTorqueA := 0.5` | a força passa o que o peso pede (no máximo uns 0,41 A, com o peso na horizontal): o disco **dispara** e acelera |
| velocidade passa de `rVelMaxRpm` | a proteção do CLP aciona o **STOP**: o disco para pela rampa P0105 |
| `xStop := FALSE`, `rTorqueA := -0.3` | sinal negativo: o peso fica parado do outro lado, perto de **−46°** |
| `rCorrenteA` | acompanha o `rTorqueA`: é a corrente que o drive está fazendo |

A **missão 9** da aba Missões ("Equilibrar o peso só com torque") é exatamente esse exercício: segurar a seta entre 40° e 55°.

**Segurança:** use valores pequenos e mude de 0,1 em 0,1 A. Se o disco disparar, **xStop := TRUE** é o freio.

### 7.6 Problemas comuns

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| O disco não se mexe com corrente | OUT4 = 1 (velocidade, com referência 0: o drive segura o disco parado) | `GVL_SCA.MODO := 0` |
| `MODO` volta sozinho para 1 | o `Velocidade_SCA` continua na MainTask | tire o `Velocidade_SCA` da tarefa (7.4) |
| Nada acontece | drive desabilitado, ou P0202 diferente de 6 | `xHabilita := TRUE`; confira a seção 1.3 |
| Força 10 vezes maior que a esperada | faltou a escala | `REF_TORQUE := … * 10.0` (A × 10) |
| O disco dispara e não para | força maior que a carga e nenhuma proteção | `xStop := TRUE`; use a proteção do 7.4 |
| Fim de curso não segura o disco | no modo torque os fins de curso não atuam | é o comportamento do drive: proteja pelo CLP |

### 7.7 Voltar para velocidade

`GVL_SCA.MODO := 1` (ou coloque de volta o `Velocidade_SCA` na MainTask, no lugar do `Torque_SCA`). A configuração do drive não muda. Prefira trocar de modo com o motor parado.

## Parte 8: Controle por posição (absoluta e por pulso)

No modo posição, o CLP manda **para onde** o disco deve ir, e o drive cuida da aceleração, da velocidade e da parada exata. Dá para comandar de dois jeitos:

- **Posição absoluta:** "vá para 90,0°". O drive escolhe o caminho (o menor, ou um sentido forçado).
- **Por pulso (relativo):** "a cada pulso, ande 45,0°". Cada vez que um BOOL do CLP vai de 0 para 1, o disco anda o ângulo programado, a partir de onde está.

### 8.1 Como funciona no SCA06

O manual Ethernet do SCA06 manda fazer posicionamento pelo **modo Ladder** (P0202 = 4): um aplicativo roda dentro do drive e o CLP conversa com ele por **parâmetros do usuário**. O simulador traz esse aplicativo pronto, o **DISCO_POS**:

| Parâmetro | O que é | Unidade |
| --- | --- | --- |
| **P1100** | comando (bits, tabela abaixo) | — |
| **P1101** | posição de destino, ou o incremento no modo relativo | décimos de grau (450 = 45,0°) |
| **P1102** | velocidade do movimento | rpm |
| **P1103** | tipo de movimento: **0** menor caminho · **1** horário · **2** anti-horário · **3** relativo (pulso) | — |
| P1104 | rampa do movimento (padrão 500) | ms/krpm |
| **P1110** | status (bits, tabela abaixo) | — |
| **P1111** | posição atual, de 0 a 3599 | décimos de grau |
| **P1112** | erro de posição (quanto falta para o destino) | décimos de grau |
| **P1113** | quantos movimentos já foram concluídos | — |

| Bit | P1100 (comando) | P1110 (status) |
| --- | --- | --- |
| 0 | habilita o drive | drive habilitado |
| 1 | **inicia o movimento, na borda 0 → 1** (é o "pulso") | movendo |
| 2 | STOP | **em posição** |
| 3 | reset de falhas | falha |
| 4 | a posição atual passa a ser 0,0° | fim de curso atuado |
| 5 | — | STOP ativo |

No modo posição, **quem habilita é o bit 0 do P1100**. A palavra de controle (OUT1) e a referência de velocidade (OUT2) não são usadas.

Para o CLP enxergar esses parâmetros, eles são **mapeados nas palavras extras** da conexão EtherNet/IP, que passa a ter **8 palavras** em cada sentido:

| Palavra | Mapeada por | Carrega | Canal no CODESYS |
| --- | --- | --- | --- |
| IN5 | P0820 = 1110 | status | IN5 P0820 (posicao: status P1110) |
| IN6 | P0821 = 1111 | posição atual | IN6 P0821 (posicao atual P1111) |
| IN7 | P0822 = 1112 | erro de posição | IN7 P0822 (erro de posicao P1112) |
| IN8 | P0823 = 1113 | movimentos concluídos | IN8 P0823 (posicionamentos P1113) |
| OUT5 | P0835 = 1100 | comando | OUT5 P0835 (posicao: comando P1100) |
| OUT6 | P0836 = 1101 | destino ou incremento | OUT6 P0836 (alvo ou incremento P1101) |
| OUT7 | P0837 = 1102 | velocidade | OUT7 P0837 (velocidade P1102) |
| OUT8 | P0838 = 1103 | tipo de movimento | OUT8 P0838 (tipo de movimento P1103) |

### 8.2 Configurar o drive para posição

O que precisa mudar (o drive **desabilitado**):

| Parâmetro | Valor | O que faz |
| --- | --- | --- |
| **P0000** | **5** | senha |
| **P0202** | **4** | modo Ladder: o aplicativo de posicionamento comanda o motor |
| P1020 | 1 | aplicativo em execução (já vem 1 de fábrica: só confira) |
| **P0820…P0823** | **1110, 1111, 1112, 1113** | o que vai nas palavras de entrada 5 a 8 |
| **P0835…P0838** | **1100, 1101, 1102, 1103** | onde as palavras de saída 5 a 8 escrevem |
| **P0662** | **3** | se a comunicação cair: desabilita o drive |
| **P0849** | **1** | aplica a configuração de rede (volta sozinho para 0) |

#### Caminho A: pelo assistente de comunicação

Clique em **Comunicação com o CLP** (topo da tela) e escolha **Posição (absoluta e por pulso)**. As 6 etapas são as da Parte 1.3, e nesta escolha:

- a etapa **Quem manda no drive** grava **P0202 = 4** e confere o **P1020 = 1**;
- a etapa **O que vai nas palavras de troca** grava o mapeamento das 8 palavras (P0820…P0823 = 1110…1113 e P0835…P0838 = 1100…1103), explicando o que cada palavra carrega;
- o resumo final mostra a conexão **Exclusive Owner, 8 palavras (posicao)**, como habilitar e como dar o pulso.

#### Caminho B: pela HMI do drive

As teclas e o jeito de ler o display são os da Parte 1.3. O que é novo aqui são os valores de **4 dígitos**: na alteração, **◄** passa para o dígito ao lado (unidades → dezenas → centenas → milhar) e **▲** soma 1 naquele dígito. Exemplo: para formar **1110** a partir de 00000, aperte **◄ ▲ ◄ ▲ ◄ ▲** (dezena, centena e milhar valendo 1).

Comece com o display em **P00000** e o drive desabilitado:

1. **Senha:** **P**, **▲ 5 vezes**, **P**.
2. **P0202 = 4:** **▲ 37 vezes** (P00202) → **P** → **P** → **▲ 2 vezes** (00004) → **P**.
3. **P0662 = 3:** **▲ 13 vezes** (P00662) → **P** → **▲ 3 vezes** → **P**.
4. **P0820 = 1110:** **▲ 16 vezes** (P00820) → **P** → **◄ ▲ ◄ ▲ ◄ ▲** → **P**.
5. **P0821 = 1111:** **▲** → **P** → **▲** → **◄ ▲ ◄ ▲ ◄ ▲** → **P**.
6. **P0822 = 1112:** **▲** → **P** → **▲ ▲** → **◄ ▲ ◄ ▲ ◄ ▲** → **P**.
7. **P0823 = 1113:** **▲** → **P** → **▲ ▲ ▲** → **◄ ▲ ◄ ▲ ◄ ▲** → **P**.
8. **P0835 = 1100:** **▲ 9 vezes** (P00835) → **P** → **◄ ◄ ▲ ◄ ▲** → **P**.
9. **P0836 = 1101:** **▲** → **P** → **▲** → **◄ ◄ ▲ ◄ ▲** → **P**.
10. **P0837 = 1102:** **▲** → **P** → **▲ ▲** → **◄ ◄ ▲ ◄ ▲** → **P**.
11. **P0838 = 1103:** **▲** → **P** → **▲ ▲ ▲** → **◄ ◄ ▲ ◄ ▲** → **P**.
12. **P0849 = 1:** **▲ 9 vezes** (P00849) → **P** → **▲** → **P**. A interface de rede reinicia e passa a esperar 8 palavras.
13. **Confira o P1020:** **▲ 3 vezes** (P01020) → **P** mostra o valor: deve ser **1**. **◄** volta sem alterar.

Para conferir tudo, use o filtro **Diferentes do padrão** na aba Parâmetros.

#### Caminho C: pela aba Parâmetros

Busque cada número, clique na linha, digite o valor e clique em **Gravar**, na ordem da tabela. Deixe o **P0849 = 1** por último.

### 8.3 No CODESYS: a conexão de 8 palavras

1. Dois cliques no SCA06 → aba **Connections**. Apague a conexão de 4 palavras e adicione **Exclusive Owner, 8 palavras (posicao)**. Os tamanhos ficam **16 bytes** em cada sentido.
2. Acrescente na **GVL_SCA**:

```
    // modo posição: palavras extras (entradas)
    POS_STATUS : INT;   // IN5  P1110 status
    POS_ATUAL  : INT;   // IN6  P1111 posição atual (décimos de grau)
    POS_ERRO   : INT;   // IN7  P1112 erro de posição
    POS_CONT   : INT;   // IN8  P1113 movimentos concluídos
    // modo posição: palavras extras (saídas)
    POS_CMD    : INT;   // OUT5 P1100 comando
    POS_ALVO   : INT;   // OUT6 P1101 destino ou incremento (décimos de grau)
    POS_VEL    : INT;   // OUT7 P1102 velocidade (rpm)
    POS_TIPO   : INT;   // OUT8 P1103 tipo de movimento

    // comandos e leituras do modo posição (use no online ou numa visualização)
    xPulso         : BOOL;            // cada FALSE -> TRUE inicia um movimento
    xZerarPosicao  : BOOL;            // a posição atual passa a ser 0,0°
    rAnguloGraus   : REAL := 45.0;    // destino (absoluto) ou incremento (relativo)
    rVelPosRpm     : REAL := 60.0;    // velocidade do movimento
    iTipoMovimento : INT := 3;        // 0 menor caminho, 1 horário, 2 anti-horário, 3 relativo (pulso)
    rPosAtualGraus : REAL;
    xEmPosicao, xMovendo : BOOL;
```

3. No **I/O Mapping**, ligue os 8 canais novos (IN5…IN8 e OUT5…OUT8) às variáveis POS_ acima, na mesma ordem.

### 8.4 Programa ST (Posicao_SCA)

Crie o programa e coloque-o na **MainTask** (Add Call). No modo posição, os programas PLC_PRG e Velocidade_SCA podem continuar na tarefa: o drive ignora o que eles mandam.

```
PROGRAM Posicao_SCA

// 1) comando P1100: um bit para cada função
GVL_SCA.POS_CMD.0 := GVL_SCA.xHabilita;       // habilita o drive
GVL_SCA.POS_CMD.1 := GVL_SCA.xPulso;          // inicia o movimento na borda FALSE -> TRUE
GVL_SCA.POS_CMD.2 := GVL_SCA.xStop;           // STOP
GVL_SCA.POS_CMD.3 := GVL_SCA.xReset;          // reset de falhas
GVL_SCA.POS_CMD.4 := GVL_SCA.xZerarPosicao;   // a posição atual vira 0,0°

// 2) destino ou incremento, velocidade e tipo
GVL_SCA.POS_ALVO := REAL_TO_INT(GVL_SCA.rAnguloGraus * 10.0);   // graus -> décimos de grau
GVL_SCA.POS_VEL  := REAL_TO_INT(LIMIT(1.0, GVL_SCA.rVelPosRpm, 3000.0));
GVL_SCA.POS_TIPO := GVL_SCA.iTipoMovimento;

// 3) leituras
GVL_SCA.rPosAtualGraus := INT_TO_REAL(GVL_SCA.POS_ATUAL) / 10.0;
GVL_SCA.xMovendo   := GVL_SCA.POS_STATUS.1;
GVL_SCA.xEmPosicao := GVL_SCA.POS_STATUS.2;
```

| Trecho | O que faz |
| --- | --- |
| `POS_CMD.1 := xPulso` | o drive reage à **subida** do bit: para dar outro pulso, o xPulso precisa voltar a FALSE antes |
| `* 10.0` | o drive trabalha em décimos de grau: 45,0° viram 450 |
| `LIMIT(1.0, …, 3000.0)` | a velocidade do movimento vai de 1 a 3000 rpm |
| `POS_STATUS.2` | "em posição": o movimento terminou e o disco está no destino |

**Pulso automático (opcional):** para o disco andar sozinho de tempos em tempos, troque a linha do `POS_CMD.1` por dois temporizadores: um marca o tempo (a cada 2 segundos) e o outro gera o pulso, com 200 ms de duração:

```
VAR
    tCiclo : TON;   // marca o intervalo entre os pulsos
    tPulso : TP;    // gera um pulso de duração fixa
END_VAR

tCiclo(IN := GVL_SCA.xHabilita AND NOT tCiclo.Q, PT := T#2S);
tPulso(IN := tCiclo.Q, PT := T#200MS);
GVL_SCA.POS_CMD.1 := tPulso.Q;   // 200 ms em TRUE a cada 2 s = um pulso
```

O pulso tem 200 ms, e não um ciclo só, de propósito: a comunicação manda os dados a cada RPI (20 ms, por exemplo), e um bit que fica TRUE por menos tempo que isso pode não chegar ao drive.

### 8.5 Testar

**Build**, **Login** e **Start**. O chip **P0801** deve ficar em **Data Active**. Altere os valores no online (**Ctrl+F7**):

| Ação no CODESYS | Resultado esperado |
| --- | --- |
| `xHabilita := TRUE` | o drive habilita e segura o disco parado; `POS_STATUS` com os bits 0 e 2 |
| `xZerarPosicao` TRUE e FALSE | a posição atual passa a ser 0,0° |
| `iTipoMovimento := 3`, `rAnguloGraus := 45` | modo pulso, de 45° em 45° |
| `xPulso` TRUE e FALSE | o disco anda 45°; `rPosAtualGraus` = 45,0 |
| `xPulso` TRUE e FALSE mais 3 vezes | 90° → 135° → **180°**: meia volta; `POS_CONT` conta os movimentos |
| `iTipoMovimento := 0`, `rAnguloGraus := 90`, pulso | vai para **90,0°** pelo menor caminho |
| `rAnguloGraus := 270`, pulso | vai para **270,0°** |
| `iTipoMovimento := 2`, `rAnguloGraus := 0`, pulso | volta a 0,0° **girando 270° no anti-horário**, e não 90° no horário |
| `xStop := TRUE` no meio de um movimento | o disco para pela rampa; `xStop := FALSE` e um novo pulso retomam |

### 8.6 Testar sem o CODESYS: o painel Posição da aba Mestre

Antes de programar o CLP, dá para sentir o modo posição pelo **CLP virtual** do simulador:

1. Configure o drive para posição (assistente **Comunicação com o CLP → Posição**).
2. Aba **Mestre** → **Conectar (RegisterSession)** → em **Palavras de entrada** e **Palavras de saída**, coloque **8** → **Forward Open**.
3. No lugar das palavras 5 a 8 aparece o painel **Posição**:
   - **Habilitar** liga o bit 0 do P1100;
   - **Pulso ▶** faz o bit 1 ir de 0 para 1 e voltar, ou seja, um pulso;
   - **STOP**, **Reset** e **Zerar posição** são os bits 2, 3 e 4;
   - **Ângulo** (em graus), **Velocidade** (rpm) e **Tipo** (menor caminho, horário, anti-horário ou relativo) são convertidos sozinhos para o que vai na rede.
4. Embaixo do painel aparece **o que vai pela rede** em cada palavra (por exemplo, 90,0° = 900 = 0384h): é exatamente o que o seu programa no CODESYS terá de mandar.

Antes de ligar o CODESYS, clique em **Forward Close** e **Desconectar**: o drive aceita um mestre só.

### 8.7 Problemas comuns

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| Forward Open recusado (0x0109), P0801 em Wait Comm | a conexão no CODESYS é a de 4 palavras, ou o P0849 = 1 não foi feito | conexão **8 palavras (posicao)**; aplique com P0849 = 1 |
| Conecta, mas o drive não habilita | habilitando pela OUT1 (palavra de controle) | no modo posição quem habilita é o **P1100 bit 0** (`POS_CMD.0`) |
| O pulso não faz nada | `xPulso` já estava TRUE | o movimento começa na **subida**: volte a FALSE e ligue de novo |
| Anda 10 vezes mais (ou menos) | ângulo sem a conversão para décimos | `POS_ALVO := rAnguloGraus * 10` |
| Nada se move, mesmo habilitado | P1020 = 0 (aplicativo parado) ou P0202 diferente de 4 | P1020 = 1 e P0202 = 4 |
| No modo absoluto, o disco vai pelo lado "errado" | tipo 0 = menor caminho | use 1 (horário) ou 2 (anti-horário) para forçar o sentido |

### 8.8 Voltar para velocidade ou torque

1. **Comunicação com o CLP** → **Velocidade e torque** (ou, pelos outros caminhos: P0202 = 6, P0820…P0823 e P0835…P0838 = 0 e P0849 = 1).
2. No CODESYS, troque a conexão de volta para **Exclusive Owner, 4 palavras (velocidade e torque)**.

## Extra: As missões da bancada

A aba **Missões** do simulador traz **16 desafios** em sequência, do básico ao avançado. Cada um confere sozinho quando é cumprido:

| Missões | Assunto |
| --- | --- |
| 1 a 3 | abrir a sessão, P0202 = 6, conexão em Data Active |
| 4 a 7 | habilitar, 300 rpm, inversão em complemento de dois, função STOP |
| 8 a 11 | corrente numa palavra extra, equilibrar o peso por torque, cabo rompido (F00047), fim de curso |
| 12 | posicionar em 135,0° pelo Ladder |
| **13 a 16** | **posição pela rede:** conexão de 8 palavras, **4 pulsos de 45°**, posição absoluta (90° e 270°) e sentido forçado (de 270° a 0° pelo anti-horário) |

Faça-as pelo CLP virtual da aba **Mestre** ou pelo seu projeto no CODESYS. As missões 13 a 16 foram pensadas para o projeto da Parte 8.
