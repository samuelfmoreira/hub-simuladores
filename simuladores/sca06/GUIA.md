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
| **P0202** | **modo de operação** | **6** (rede) | **6** (rede) | **3** (Função Posicionador) |
| P0099 | habilitação (só no modo 3) | — | — | 0 (o CLP escreve 2 pela rede) |
| P0810 | IP pelos parâmetros | 0 | 0 | 0 |
| P0811…P0814 | endereço IP | 192.168.100.22 | 192.168.100.22 | 192.168.100.22 |
| P0815 | máscara (CIDR) | 24 | 24 | 24 |
| P0820…P0823 | palavras de entrada 5 a 8 | 0 | 0 | 52, 53, 6, 48 |
| P0835…P0838 | palavras de saída 5 a 8 | 0 | 0 | 99, 1079, 1171, 219 |
| P01151, P01191, P01201, P01211 | movimento 1 (tipo, velocidade, rampas) | — | — | 5 (absoluto), 100, 1000, 1000 |
| P01101, P01102, P01080, P01077 | ciclo 1 e disparo | — | — | 1, 0, 1, 0 (borda) |
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
| OUT5…OUT8 | — | — | habilitação (P0099), disparo (P01079), destino (P01171) e reset (P0219) |

As **entradas** IN1 a IN4 (estado, velocidade, corrente e modo atual) são iguais nos três modos. No modo posição, as entradas IN5 a IN8 trazem a posição (fração de volta P0052 e voltas P0053), o estado do servo (P0006) e o erro de lag (P0048).

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
| P0202 | Modo de operação | 2 (velocidade pela HMI) | **6** (velocidade/torque) ou **3** (posição) | 6 = Profibus DP/Ethernet: o CLP manda pelas palavras fixas de saída · 3 = Função Posicionador: movimentos programados em parâmetros, habilitados e disparados pela rede. Desabilitado |
| P0099 | Habilitação | 0 | 0 (o CLP escreve **2** no modo posição) | com P0202 = 3 é por aqui que o drive habilita: 0 desabilita · 1 habilita · 2 habilita sem gravar na memória |

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
| P0820…P0823 | Palavra de leitura #5 a #8 | 0 | 0 | **52, 53, 6, 48** | o que o drive manda nas entradas 5 a 8 |
| P0824…P0831 | Palavra de leitura #9 a #16 | 0 | 0 | 0 | entradas 9 a 16 (até 16 palavras) |
| P0835…P0838 | Palavra de escrita #5 a #8 | 0 | 0 | **99, 1079, 1171, 219** | onde o CLP escreve as saídas 5 a 8 |
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

#### Função Posicionador (P0202 = 3, firmware V2.1X)

Os movimentos ficam guardados no drive. Há **10 movimentos** (cada um com tipo, destino, velocidade e rampas) e **10 ciclos** (cada um com uma sequência de até 5 movimentos). O "X" nos números abaixo é o número do movimento: P01151 é o tipo do movimento 1, P01152 o do movimento 2, e assim por diante.

| Parâmetro | Nome | Fábrica | O que faz |
| --- | --- | --- | --- |
| P0115X | Tipo do movimento | 0 | 1 torque (Iq) · 2 velocidade · 3 relativo · **5 absoluto** · 7 jog · 8/9 seguidor · 10/11 busca de zero |
| P0116X | Timer do movimento | 0 | ms de espera entre o disparo e o início |
| P0117X | Posição: fração de volta | 0 | **16384 = 1 volta** (4096 = 90°, 8192 = 180°) |
| P0118X | Posição: número de voltas | 0 | voltas inteiras do destino (absoluto) ou do deslocamento (relativo) |
| P0119X | Velocidade / Iq | 0 | rpm do movimento (no tipo torque: décimos de ampère). Negativo inverte o sentido |
| P0120X | Aceleração | 0 | rpm/s (no tipo torque: A/s) |
| P0121X | Desaceleração | 0 | rpm/s |
| P0122X | Jerk | 0 | rpm/s² (curva S; o simulador usa perfil trapezoidal) |
| P01101…P01150 | Movimentos dos ciclos 1 a 10 | 0 | 5 por ciclo: P01101…P01105 são o 1º ao 5º movimento do ciclo 1. 0 encerra o ciclo |
| P01077 | Acionamento por borda ou nível | 0 | 0 borda de subida (um disparo por pulso) · 1 nível (repete enquanto estiver em 1) |
| P01078 | Filtro do acionamento | 0 | ms que o disparo precisa ficar em 1 para valer |
| P01079 | Acionamento do ciclo por parâmetro | 0 | **o disparo**: o CLP escreve 1 pela rede |
| P01080 | Ciclo acionado pelo P01079 | 0 | qual ciclo o disparo aciona. Positivo: um movimento por disparo. **Negativo: o ciclo inteiro** |
| P01071 | Reseta ciclo | 0 | na subida 0 → 1, os ciclos voltam para o primeiro movimento |

Leituras úteis para o CLP: **P0052** (fração de volta da posição atual), **P0053** (voltas), **P0006** (estado do servo: 0 desabilitado, 1 habilitado, 2 falha, 5 STOP, 6 STO) e **P0048** (erro de lag, em pulsos).

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

## Parte 8: Controle por posição (Função Posicionador)

### 8.1 Como funciona

Nas palavras fixas (P0202 = 6), o SCA06 só aceita **velocidade e torque**. Para posicionar, o firmware **V2.1X** do SCA06 tem a **Função Posicionador** (**P0202 = 3**): os movimentos ficam **programados em parâmetros** dentro do drive, e o CLP só faz quatro coisas, **tudo pela rede**:

```
CODESYS (CLP)                                   SCA06 (Função Posicionador)
  habilita  ─────── 5ª palavra de saída ──────▶  P0099  habilitação
  dispara   ─────── 6ª palavra de saída ──────▶  P01079 aciona o ciclo do P01080
  destino   ─────── 7ª palavra de saída ──────▶  P01171 destino do movimento 1
  reset     ─────── 8ª palavra de saída ──────▶  P0219  reset de falhas
  posição   ◀────── 5ª e 6ª palavras de entrada  P0052 fração de volta, P0053 voltas
  estado    ◀────── 7ª e 8ª palavras de entrada  P0006 estado do servo, P0048 erro de lag
```

O drive calcula sozinho a aceleração, a velocidade e a parada exata no destino. **Não é preciso programar ladder no drive.**

Três ideias para entender a Função Posicionador:

| Ideia | O que é |
| --- | --- |
| **Movimento** | um passo do eixo: tipo (absoluto, relativo, velocidade…), destino, velocidade e rampas. São 10 (P0115X a P0122X, com X = número do movimento) |
| **Ciclo** | uma sequência de até 5 movimentos. São 10 ciclos (P01101 a P01150) |
| **Disparo** | o **P01079** aciona o ciclo escolhido no **P01080**: positivo executa um movimento por disparo; negativo executa o ciclo inteiro |

**Posição em voltas:** o SCA06 mede a posição em **voltas + fração de volta**, com **16384 = 1 volta**. No disco da bancada:

| Ângulo | Fração de volta |
| --- | --- |
| 45° | 2048 |
| 90° | 4096 |
| 135° | 6144 |
| 180° | 8192 |
| 270° | 12288 |

Fração = graus × 16384 / 360. Para ler a posição: graus = (P0053 + P0052 / 16384) × 360.

**Tipos de movimento** (P0115X):

| Tipo | Movimento | No simulador |
| --- | --- | --- |
| 1 | controle de Iq (torque): aplica uma corrente e mantém | simulado |
| 2 | controle de velocidade: acelera até a velocidade e mantém | simulado |
| 3 e 4 | **posicionamento relativo**: anda o deslocamento a partir de onde está | simulado |
| 5 e 6 | **posicionamento absoluto**: vai até a posição de destino | simulado |
| 7 | jog: gira enquanto o disparo estiver em 1 | simulado |
| 8 e 9 | seguidor de posição e de velocidade | não simulado (a bancada não tem mestre de seguimento) |
| 10 e 11 | busca de zero máquina | não simulado (a bancada não tem sensor de zero) |

**O que muda no modo 3:**
- As **palavras fixas de saída** (controle, referências e modo) são **ignoradas**: a habilitação passa a ser pelo **P0099**.
- A **botoeira STOP** (DI1) e o **P0662** continuam valendo. O STOP cancela o movimento em andamento.
- **Por que não o modo 4 (Ladder)?** No SCA06 real, o modo 4 exige um programa feito no software WLP/WPS e gravado no drive. Este simulador, como um drive novo, não tem programa ladder gravado: com P0202 = 4 o eixo não é controlado.

### 8.2 Configurar o drive para posição

Com o drive **desabilitado**:

| Parâmetro | Fábrica | Valor | O que faz |
| --- | --- | --- | --- |
| **P0000** | 0 | **5** | senha: libera a alteração |
| **P0099** | 0 | **0** | começa desabilitado: quem habilita é o CLP, pela rede |
| **P0202** | 2 | **3** | Função Posicionador |
| P0810…P0815 | DHCP | IP fixo 192.168.100.22 / 24 | igual à seção 1.3 |
| **P01151** | 0 | **5** | movimento 1 = **posicionamento absoluto** |
| P01161 | 0 | 0 | sem espera antes do movimento |
| P01171 / P01181 | 0 | 0 / 0 | destino inicial (a fração quem escreve é o CLP) |
| **P01191** | 0 | **100** | velocidade do movimento: 100 rpm |
| **P01201** / **P01211** | 0 | **1000** / **1000** | aceleração e desaceleração: 1000 rpm/s |
| **P01101** / P01102 | 0 | **1** / 0 | ciclo 1 = só o movimento 1 (0 encerra o ciclo) |
| **P01080** | 0 | **1** | o disparo pelo P01079 aciona o ciclo 1 |
| P01077 / P01078 | 0 | 0 / 0 | disparo na borda de subida, sem filtro |
| **P0820…P0823** | 0 | **52, 53, 6, 48** | entradas 5 a 8: fração, voltas, estado, erro de lag |
| **P0835…P0838** | 0 | **99, 1079, 1171, 219** | saídas 5 a 8: habilitação, disparo, destino, reset |
| **P0662** | 0 | **3** | se a comunicação cair, desabilita o drive |
| **P0849** | 0 | **1** | aplica o IP e as palavras de troca |

Você escolhe o caminho:

- **Caminho A, assistente:** botão **Comunicação com o CLP** → **Posição (Função Posicionador)**. São 8 etapas, com duas a mais que na velocidade: **O movimento** e **O ciclo e o disparo**.
- **Caminho B, HMI do drive:** como na seção 1.3. Para os parâmetros P01xxx, segure **▲** para correr a lista até o número.
- **Caminho C, aba Parâmetros:** no filtro, escolha **Função Posicionador (P1070–P1230)** e grave os valores da tabela. P0202, P0099 e o IP estão no filtro "Todos".

**Confira:** o chip **P0202** do topo mostra **3**.

### 8.3 No CODESYS: a conexão de 8 palavras

1. Dois cliques no SCA06 → aba **Connections**. Apague a conexão de 4 palavras e adicione **Exclusive Owner, 8 palavras (posicao)**. Os tamanhos ficam **16 bytes** em cada sentido.
2. Acrescente na **GVL_SCA**:

```
    // Função Posicionador: palavras extras (entradas)
    POS_FRACAO  : INT;   // IN5  P0052 fração de volta (16384 = 1 volta)
    POS_VOLTAS  : INT;   // IN6  P0053 número de voltas
    POS_ESTADO  : INT;   // IN7  P0006 estado do servo (1 = habilitado, 2 = falha)
    POS_LAG     : INT;   // IN8  P0048 erro de lag, em pulsos
    // Função Posicionador: palavras extras (saídas)
    POS_HAB     : INT;   // OUT5 P0099 habilitação (2 habilita, 0 desabilita)
    POS_DISPARO : INT;   // OUT6 P01079 disparo (subida 0 -> 1)
    POS_DESTINO : INT;   // OUT7 P01171 destino do movimento 1 (fração de volta)
    POS_RESET   : INT;   // OUT8 P0219 reset de falhas (subida 0 -> 1)

    // comandos e leituras do modo posição (use no online ou numa visualização)
    xPulso         : BOOL;            // cada FALSE -> TRUE dispara um movimento
    rAnguloGraus   : REAL := 90.0;    // destino (absoluto) ou incremento (relativo), de 0 a 359,9°
    rPosAtualGraus : REAL;
    xEmPosicao, xMovendo : BOOL;
```

3. No **I/O Mapping**, ligue os 8 canais novos (IN5…IN8 e OUT5…OUT8) às variáveis POS_ acima, na mesma ordem.

### 8.4 Programa ST (Posicao_SCA)

Crie o programa e coloque-o na **MainTask** (Add Call). Os programas PLC_PRG e Velocidade_SCA podem continuar na tarefa: no modo 3, o drive ignora as palavras fixas que eles escrevem.

```
PROGRAM Posicao_SCA

// 1) habilitação: P0099 = 2 (habilita sem gravar na memória do drive)
IF GVL_SCA.xHabilita THEN
    GVL_SCA.POS_HAB := 2;
ELSE
    GVL_SCA.POS_HAB := 0;
END_IF

// 2) destino: graus -> fração de volta (16384 = 1 volta)
GVL_SCA.POS_DESTINO := REAL_TO_INT(LIMIT(0.0, GVL_SCA.rAnguloGraus, 359.9) * 16384.0 / 360.0);

// 3) disparo e reset: o drive reage à subida 0 -> 1
GVL_SCA.POS_DISPARO := BOOL_TO_INT(GVL_SCA.xPulso);
GVL_SCA.POS_RESET   := BOOL_TO_INT(GVL_SCA.xReset);

// 4) leituras
GVL_SCA.rPosAtualGraus := (INT_TO_REAL(GVL_SCA.POS_VOLTAS) + INT_TO_REAL(GVL_SCA.POS_FRACAO) / 16384.0) * 360.0;
GVL_SCA.rVelAtualRpm   := INT_TO_REAL(GVL_SCA.VEL) * 18750.0 / 32767.0;
GVL_SCA.xMovendo       := ABS(GVL_SCA.rVelAtualRpm) > 3.0;
GVL_SCA.xEmPosicao     := NOT GVL_SCA.xMovendo AND GVL_SCA.POS_LAG >= 0 AND GVL_SCA.POS_LAG < 10;
```

| Trecho | O que faz |
| --- | --- |
| `POS_HAB := 2` | habilita sem gravar o P0099 na memória do drive a cada ciclo da rede |
| `* 16384.0 / 360.0` | o drive trabalha em fração de volta: 90° viram 4096 |
| `POS_DISPARO := BOOL_TO_INT(xPulso)` | o drive reage à **subida**: para disparar de novo, o xPulso precisa voltar a FALSE antes |
| `POS_LAG < 10` | o erro de lag é o que falta para chegar: menos de 10 pulsos (0,2°) e parado = em posição |

**Disparo automático (opcional):** para o disco andar sozinho de tempos em tempos, troque a linha do `POS_DISPARO` por dois temporizadores: um marca o intervalo (2 s) e o outro gera o pulso, de 200 ms:

```
VAR
    tCiclo : TON;   // marca o intervalo entre os disparos
    tPulso : TP;    // gera um pulso de duração fixa
END_VAR

tCiclo(IN := GVL_SCA.xHabilita AND NOT tCiclo.Q, PT := T#2S);
tPulso(IN := tCiclo.Q, PT := T#200MS);
GVL_SCA.POS_DISPARO := BOOL_TO_INT(tPulso.Q);   // 200 ms em 1 a cada 2 s = um disparo
```

O pulso tem 200 ms, e não um ciclo só, de propósito: a rede manda os dados a cada RPI (20 ms, por exemplo), e um valor que fica em 1 por menos tempo que isso pode não chegar ao drive.

### 8.5 Testar

**Build**, **Login** e **Start**. O chip **P0801** deve estar em **Data Active**. Altere os valores no online (**Ctrl+F7**):

| Ação no CODESYS | Resultado esperado |
| --- | --- |
| `xHabilita := TRUE` | `POS_ESTADO` = 1 (servo ready) e o chip P0006 mostra 1 |
| `rAnguloGraus := 90`, depois `xPulso := TRUE` e `FALSE` | o disco vai para **90°**; `rPosAtualGraus` = 90 e `xEmPosicao` = TRUE |
| `rAnguloGraus := 270` e um pulso | o disco vai para **270°** |
| outro pulso com o mesmo ângulo | nada se mexe: no absoluto, o destino é a posição final |
| `xHabilita := FALSE` | o drive desabilita |

**Posição por pulso (relativo):** na aba Parâmetros (ou na HMI), mude o **P01151 para 3**. O destino passa a ser **incremento**: com `rAnguloGraus := 45`, cada pulso anda **45°**; quatro pulsos dão meia volta. Volte o P01151 para 5 para o absoluto.

**Ciclo completo (ida e volta com um disparo):** programe o movimento 2 como absoluto em 0° (**P01152 = 5**, P01172 = 0, P01182 = 0, P01192 = 100, P01202 = P01212 = 1000), coloque-o no ciclo 1 (**P01102 = 2**) e mude o **P01080 para −1**. Um único pulso leva o disco ao destino e o traz de volta a 0°. Com **P01162 = 1000**, ele espera 1 s no destino.

As **missões 12 a 16** da aba Missões seguem esse roteiro e conferem sozinhas.

### 8.6 Testar sem o CODESYS: o painel Posição da aba Mestre

Com o drive configurado (8.2), a aba **Mestre** do simulador faz o papel do CLP:

1. **Conectar (RegisterSession)** → ajuste **8** palavras de entrada e **8** de saída → **Forward Open**, com **CLP em RUN** marcado.
2. O painel **Posição pela Função Posicionador** aparece abaixo das palavras de saída:
   - **Habilitar** escreve 2 na 5ª palavra (P0099);
   - **Destino do movimento 1** converte os graus em fração de volta e escreve na 7ª palavra (P01171);
   - **Disparar ▶** dá um pulso de 300 ms na 6ª palavra (P01079);
   - **Reset** dá um pulso na 8ª palavra (P0219).
3. Embaixo, o painel mostra a posição atual, se está movendo ou em posição, o erro de lag e o estado do servo. As palavras de entrada 5 a 8 aparecem decodificadas no quadro **Entradas**.

### 8.7 Outros movimentos: velocidade, torque e jog

A mesma Função Posicionador faz outros movimentos, só mudando o tipo no P0115X:

| Movimento | Tipo | O que programar | Ao disparar |
| --- | --- | --- | --- |
| Velocidade | 2 | P0119X = rpm, P0120X / P0121X = rampas (rpm/s) | acelera e mantém a velocidade até outro movimento |
| Torque (Iq) | 1 | P0119X = corrente em décimos de A, P0120X = rampa em A/s | aplica a corrente e mantém |
| Jog | 7 | P0119X = rpm, rampas; **P01077 = 1** (nível) | gira enquanto o P01079 ficar em 1 e para ao voltar a 0 |

Exemplo do próprio manual da WEG: um ciclo com um movimento de **velocidade** (tipo 2) seguido de um **relativo** de 1/4 de volta (tipo 3, fração 4096). O primeiro disparo faz o disco girar; o segundo o faz andar mais um quarto de volta e parar.

### 8.8 Problemas comuns

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| O disparo não faz nada | drive desabilitado (`POS_ESTADO` ≠ 1), P01080 = 0, ciclo vazio (P01101 = 0) ou o P01079 não voltou a 0 entre um disparo e outro | habilite; confira P01080 e P01101; volte o xPulso a FALSE |
| Não habilita | P0202 ≠ 3, emergência (STO), falha (`POS_ESTADO` = 2) ou queda de comunicação com P0662 = 3 | confira P0202; libere o STO; reset; depois de uma queda, escreva 0 e depois 2 no P0099 |
| O disco vai para o lugar errado | destino em graus em vez de fração de volta, ou movimento relativo (P01151 = 3) quando se queria absoluto | fração = graus × 16384 / 360; confira o P01151 |
| O disco dá uma volta inteira para chegar | o absoluto conta voltas: se o disco já deu uma volta (posição 450°), o destino 90° com 0 voltas fica uma volta atrás | use o relativo, ou acerte as voltas no P01181 |
| Conexão recusada (0x0109) | o drive não tem 8 palavras aplicadas | P0849 = 1 depois de mapear P0820…P0838 |
| P0202 = 4 e nada acontece | não há programa ladder gravado | use P0202 = 3 (Função Posicionador) |

### 8.9 Voltar para velocidade ou torque

Com o drive desabilitado: **P0099 = 0**, **P0202 = 6**, P0820…P0823 e P0835…P0838 = 0 e **P0849 = 1**. No CODESYS, volte para a conexão **Exclusive Owner, 4 palavras**. O assistente, na opção **Velocidade e torque**, faz isso sozinho.

## Extra: As missões da bancada

A aba **Missões** do simulador traz **16 desafios** em sequência, do básico ao avançado. Cada um confere sozinho quando é cumprido:

| Missões | Assunto |
| --- | --- |
| 1 a 3 | abrir a sessão, P0202 = 6, conexão em Data Active |
| 4 a 7 | habilitar, 300 rpm, inversão em complemento de dois, função STOP |
| 8 a 11 | corrente numa palavra extra, equilibrar o peso por torque, cabo rompido (F00047), fim de curso |
| **12 a 16** | **posição pela Função Posicionador:** configurar e conectar com 8 palavras, posicionar em 135,0°, **4 pulsos de 45°**, posição absoluta (90° e 270°) e ciclo completo (vai a 180° e volta com um só disparo) |

Faça-as pelo CLP virtual da aba **Mestre** ou pelo seu projeto no CODESYS. As missões 12 a 16 foram pensadas para o projeto da Parte 8.
