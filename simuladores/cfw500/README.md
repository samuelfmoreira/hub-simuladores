# Simulador WEG CFW500 · Adapter EtherNet/IP · Esteira 3D

Simulador didático do inversor de frequência **WEG CFW500 (firmware V1.8X) com o módulo plug-in CFW500-CETH-IP**.
O backend em Node.js implementa uma pilha **EtherNet/IP real** (TCP 44818, UDP 44818 e UDP 2222). Por isso, um CLP de verdade
(CompactLogix/ControlLogix, CODESYS, etc.) ou qualquer scanner EtherNet/IP enxerga o simulador como se fosse o inversor.
O inversor aciona uma **esteira transportadora em 3D** com carga, sensores e proteções.

Fontes usadas: Manual de Programação CFW500 V1.8X (10001469555), Manual Ethernet CFW500 rev. 03 (10003256298)
e o arquivo EDS oficial `eip_cfw500_ceth2_v11x.eds` (incluído na pasta `eds/`).

---

## 1. Instalação e execução

Requisito: Node.js 18 ou mais recente.

### No Windows (com os .bat)

| Arquivo | Quando usar |
|---|---|
| `1-instalar.bat` | Uma vez. Confere o Node.js e roda o `npm install`. |
| `2-criar-rede-virtual.bat` | Uma vez, para usar o CODESYS no mesmo PC. Pede administrador e cria o adaptador virtual **CFW500-Rede** com os IPs 192.168.100.10 (CODESYS) e 192.168.100.20 (CFW500). Também libera as portas no firewall. Para desfazer: `2-criar-rede-virtual.bat remover`. |
| `3-iniciar-simulador.bat` | Sempre. Se o IP 192.168.100.20 existir, o inversor responde nele; se não, responde em todas as placas (e o Modbus do inversor vai para a porta 5020, para não brigar com o Modbus do CODESYS). Abre a página no navegador. |
| `4-testar-ihm-sem-clp.bat` | Opcional. Sobe um "CLP de teste" (servidor Modbus na porta 1502 + scanner EtherNet/IP) para ver a IHM do painel funcionando sem o CODESYS. |

Para mudar os IPs, edite `2-criar-rede-virtual.bat` e a linha `set IP_CFW500=` do `3-iniciar-simulador.bat`.

### Manualmente

```bash
npm install
npm start                      # ou: node server.js
```

Abra **http://localhost:8080**.

| Opção | Padrão | Para que serve |
|---|---|---|
| `--ip 192.168.0.14` | todas as placas | IP da placa de rede onde o "CFW500" vai responder |
| `--http 8080` | 8080 | porta da interface web |
| `--modbus 502` | 502 | Modbus TCP **do inversor** (se a 502 não puder ser usada, ele passa para a 5020) |

Portas usadas pelo inversor simulado: **TCP 44818** (mensagens explícitas), **UDP 44818** (ListIdentity/descoberta),
**UDP 2222** (I/O cíclico) e **TCP 502** (Modbus TCP, até 2 clientes, igual ao módulo real).
No Windows, autorize o Node.js no firewall quando ele perguntar (rede privada).

### Trocar o IP pelo próprio simulador

Como no CFW500 real: **P0810 = 0** (IP por parâmetros), IP em **P0811…P0814**, máscara em **P0815** e **P0849 = 1** para
aplicar (ou desenergizar e energizar). Pode ser feito na HMI do inversor, na aba Parâmetros ou no quadro
**Endereço IP do inversor** da aba Rede EtherNet/IP, que lista os IPs deste computador. O IP precisa existir no PC
(placa física ou rede virtual); se não existir, o simulador avisa e continua no IP de inicialização. Com **P0810 = 1**
(DHCP), vale o IP de inicialização (`--ip` ou o do `.bat`). O Modbus TCP do inversor acompanha o mesmo IP, e o IP
escolhido fica salvo para as próximas vezes.

### Padrão de fábrica

O simulador sempre começa com o inversor no **padrão de fábrica WEG (60 Hz)**: comando pela HMI e pelas entradas
digitais, em LOC. O botão **Parametrizar inversor para comando via rede** (aba CLP virtual) muda isso. Para voltar:

* na HMI do inversor: ENTER → grupo PARAM → **P0204 = 5** (WEG 60 Hz) ou **6** (WEG 50 Hz), com o motor parado;
* ou pelo botão **Restaurar padrão de fábrica** (abas CLP virtual e Parâmetros), que faz o mesmo P0204 = 5.

Os botões de configuração pedem confirmação antes e mostram uma janela de sucesso (ou o motivo do erro) depois.

Os parâmetros ficam salvos em `data/eeprom.json`, como uma EEPROM. Para voltar ao padrão de fábrica, use **P0204 = 5**
ou apague a pasta `data/`.

---

## 2. Hierarquia da rede EtherNet/IP

```
 SCANNER / ORIGINATOR (CLP)                         ADAPTER / TARGET (CFW500 — este simulador)
 ───────────────────────────                        ───────────────────────────────────────────
 1) TCP 44818  RegisterSession      ───────────▶    devolve o Session Handle
 2) TCP 44818  Forward Open         ───────────▶    confere chave eletrônica, assemblies, tamanhos e RPI
                                    ◀───────────    aceita (IDs de conexão + API) ou recusa (código 0x01/ext)
 3) UDP 2222   O→T a cada RPI       ───────────▶    P0684 (controle), P0685 (referência), escritas #3..#14
 4) UDP 2222   T→O a cada RPI       ◀───────────    P0680 (estado), P0681 (velocidade), leituras #3..#14
 5) TCP 44818  Forward Close        ───────────▶    encerra a conexão
```

O adapter **nunca inicia a comunicação**. Quem abre a conexão, escolhe o RPI e diz o tamanho dos dados é o scanner;
o inversor só aceita ou recusa. O simulador mostra tudo isso ao vivo na aba **Rede EtherNet/IP** e no **Log de protocolo**,
que traz o dump hexadecimal de cada quadro.

### Identidade (do arquivo EDS)

| Atributo | Valor |
|---|---|
| Vendor ID | 853 (WEG) |
| Device Type | 43 (Generic Device, keyable) |
| Product Code | 6656 |
| Revisão | 1.10 |
| Product Name | CFW500 |

### Objetos CIP implementados

Identity (0x01, com Reset), Message Router (0x02, com Multiple Service Packet), Assembly (0x04), Connection Manager
(0x06: Forward Open, Large Forward Open, Forward Close, Unconnected Send), DLR (0x47), QoS (0x48),
**Parâmetros do CFW500 (0xA2)**, Port (0xF4), TCP/IP Interface (0xF5) e Ethernet Link (0xF6).
São aceitas mensagens explícitas **não conectadas** (SendRRData) e **conectadas Classe 3** (SendUnitData).

---

## 3. Mapa de dados

### Conexões disponíveis (EDS)

| Conexão | O→T (saída do CLP) | T→O (entrada do CLP) | Config |
|---|---|---|---|
| Manufacturer Speed + I/O data | **100** | **150** | 1 (0 bytes) |
| CIP Basic Speed + I/O data | 120 | 170 | 1 |
| CIP Ext. Speed + I/O data | 121 | 171 | 1 |
| Listen Only | 199 | 150 | 1 |

RPI: 4 a 3200 ms (padrão 10 ms). O→T ponto a ponto com cabeçalho Run/Idle de 32 bits. T→O unicast ou multicast.

> **Atenção à "pegadinha" do manual.** O item 7.6.3 do manual Ethernet diz "instância de entrada 100, de saída 150".
> Essa frase está no ponto de vista **do inversor**. No CLP é o contrário: o caminho de conexão do EDS
> (`20 04 24 01 2C 64 2C 96`) mostra que **100 é O→T (saída do CLP)** e **150 é T→O (entrada do CLP)**.
> Se o aluno inverter, o simulador recusa com `0x0117` (ponto de conexão inválido), como faria o equipamento real.

### Palavras (assemblies 100/150)

| Palavra | Saída do CLP (O→T) | Entrada do CLP (T→O) |
|---|---|---|
| 1 | P0684 – palavra de controle | P0680 – palavra de estado |
| 2 | P0685 – referência 13 bits | P0681 – velocidade 13 bits |
| 3…14 | parâmetro indicado em P0835…P0846 | parâmetro indicado em P0820…P0831 |

O primeiro P08xx igual a 0 encerra a lista. **Os tamanhos precisam ser iguais no CLP e no inversor.** Com o padrão
de fábrica são 2 palavras (4 bytes) em cada sentido. Se o CLP pedir outro tamanho, o Forward Open é recusado com
`0x0127` (saída) ou `0x0128` (entrada), e a segunda palavra de status traz o tamanho que o inversor aceitaria.
Assim como no equipamento real, alterações em P0820…P0846 só valem depois de **P0849 = 1** ou de desenergizar.

### P0684 – palavra de controle

| Bit | Função | Bit | Função |
|---|---|---|---|
| 0 | Gira/Para (habilita rampa) | 4 | Remoto |
| 1 | Habilita geral | 5 | 2ª rampa |
| 2 | Girar horário | 6 | Parada rápida |
| 3 | Habilita JOG | 7 | Reset de falha (borda de subida) |

Exemplo: **0x0017** = gira + habilita geral + horário + remoto. **0x0016** = parada por rampa.

### P0680 – palavra de estado

0 STO · 1 Comando gira · 2 Fire mode · 4 Parada rápida · 5 2ª rampa · 6 Modo config. · 7 Alarme · 8 Girando ·
9 Habilitado · 10 Horário · 11 JOG · 12 Remoto · 13 Subtensão · 14 Automático (PID) · 15 Falha.

### Escala de 13 bits (P0681 e P0685)

8192 corresponde a P0403 (frequência nominal do motor). Com P0403 = 60 Hz:
30 Hz → 4096 · 45 Hz → 6144 · 60 Hz → 8192 · −30 Hz → −4096 (0xF000).
O sentido final é o bit 2 da P0684 combinado com o sinal da P0685, e o valor é sempre limitado por P0133/P0134.
Com P0133 = 3,0 Hz, o motor gira a 3 Hz mesmo com referência 0. Esse é o comportamento real e costuma confundir.

### Mensagens explícitas (acíclicas)

Qualquer parâmetro pode ser lido ou escrito em **Classe 0xA2 (162), Instância = número do parâmetro, Atributo 5**,
como valor inteiro sem casas decimais (10,0 s → 100). Respostas de erro: `0x0E` somente leitura, `0x09` fora da
faixa, `0x10` parâmetro "cfg" com motor girando e `0x05` parâmetro inexistente.

---

## 4. Parametrizar o inversor para ser comandado pela rede

Padrão de fábrica: LOC pelas teclas da HMI e REM pelas DIs/AI1. Para comandar pela EtherNet/IP:

| Parâmetro | Valor | Significado |
|---|---|---|
| P0220 | 1 (sempre remoto) ou 10 (rede, REM) | fonte LOC/REM |
| P0222 | 11 | referência REM = CO/DN/PB/Eth (P0685) |
| P0226 | 9 | sentido de giro REM = rede (bit 2) |
| P0227 | 4 | gira/para REM = rede (bits 0 e 1) |
| P0228 | 5 | JOG REM = rede (bit 3), opcional |
| P0105 | 5 | 2ª rampa pela rede (bit 5), opcional |
| P0313 | 1 | ação no erro de comunicação: parar por rampa |

Esses parâmetros podem ser ajustados de três formas: pela HMI simulada (ENTER/MENU → grupo I/O ou NET), pela aba
**Parâmetros**, ou pelo botão "Parametrizar inversor para comando via rede" na aba **CLP virtual**. Os
parâmetros "cfg" só mudam com o motor parado.

**P0313 – ação no erro de comunicação.** A ação é aplicada quando a conexão de I/O dá timeout, o CLP vai para
IDLE ou a conexão do owner é encerrada. As opções são: 0 inativo · 1 para por rampa · 2 desabilita geral ·
3 vai para LOC · 4 LOC mantém habilitação · 5 causa falha F0249. Nas opções 1 a 4 aparece o alarme A0149.

---

## 5. Configurando o CLP

### Studio 5000 (CompactLogix/ControlLogix) – "Generic Ethernet Module"

* Comm Format: **Data – INT**
* IP: o IP do PC que roda o simulador (aparece no topo da página)
* Input: Assembly Instance **150**, Size **2** (INT)
* Output: Assembly Instance **100**, Size **2** (INT)
* Configuration: Assembly Instance **1**, Size **0**
* RPI: 10 ms (aceita de 4 a 3200 ms)

Se P0820 ou P0835 forem usados, aumente os tamanhos para o mesmo número de palavras que o simulador mostra
em "Configure no seu CLP". Também é possível registrar o EDS (`eds/eip_cfw500_ceth2_v11x.eds`) com o EDS Hardware
Installation Tool e inserir o CFW500 pelo catálogo.

### CODESYS

1. *Tools → Device Repository → Install* → `eds/eip_cfw500_ceth2_v11x.eds`.
2. Na árvore: Ethernet → **EtherNet/IP Scanner** → *Add Device* → **CFW500**.
3. No adapter, informe o IP do simulador e use a conexão "100/150 Manufacturer Speed + I/O data".
4. O mapeamento de I/O traz Control Word/Speed Ref (saída) e Status Word/Motor Speed (entrada).

### CLP e simulador no mesmo computador

O scanner também usa a **UDP 2222** para receber o T→O. Se o CODESYS Control Win e o simulador estiverem no mesmo
PC, a porta pode conflitar. Há três formas de contornar:

* rodar o simulador em outro PC ou numa máquina virtual (o mais parecido com a realidade);
* criar um segundo IP ou adaptador e iniciar com `node server.js --ip <esse IP>`. É o que o `2-criar-rede-virtual.bat`
  faz. Depois, no CODESYS, escolha a interface **CFW500-Rede** com IP 192.168.100.10, **desmarque "Ajustar
  configurações do sistema operacional"** e aponte o CFW500 para 192.168.100.20 com T→O ponto a ponto.
  Inicie o simulador **antes** do runtime do CODESYS. Se a janela do simulador mostrar
  `ERRO EtherNet/IP: UDP 2222 ... EADDRINUSE`, pare o CODESYS Control Win, inicie o simulador e depois o CODESYS;
* usar o **CLP virtual** do próprio simulador, que recebe o T→O na porta 2223 (informada ao adapter pelo item Sockaddr T→O do Forward Open).

---

## 6. IHM do painel (cliente Modbus TCP)

Na porta do painel QC-01 da cena 3D há uma **IHM 10,1"** com tela touch. Ela é um **cliente Modbus TCP** e não fala com
o inversor: quem faz a ponte é o **seu CLP**.

```
 IHM do painel ──Modbus TCP──► CLP (servidor Modbus) ──EtherNet/IP──► CFW500 (adapter)
  (este simulador)               (CODESYS, por exemplo)                  (este simulador)
```

**Como operar:** botão **IHM do painel** (a câmera vai até a IHM e dá para tocar na tela 3D), **IHM em janela** (uma
janela flutuante: arraste pela barra de título, mude o tamanho pela alça no canto, minimize com –; assim dá para ver o
inversor, a IHM e a esteira ao mesmo tempo; com a janela ativa, o teclado do PC digita no set point) e **Vista geral**.

**Tela:** set point de velocidade (toque abre um teclado numérico com verificação de faixa), mostrador da velocidade atual
com marcador do set point, botão **LIGAR/DESLIGAR**, botão **INVERTER SENTIDO**, lâmpada de motor em operação, sentido,
corrente e faixa de **FALHA** com botão **RESET**. Sem resposta do CLP, a tela mostra "SEM COMUNICAÇÃO" e bloqueia os
comandos; a reconexão é automática.

**Aba "IHM Modbus":** IP/porta/Unit ID do CLP, varredura, timeout, ordem das palavras de 32 bits e a **tabela de tags**.
Em cada tag você escolhe nome, área (Coil, Discrete Input, Input Register, Holding Register), endereço (base 0, com a
referência Modicon ao lado), tipo (BOOL, BIT de palavra, INT, UINT, DINT, UDINT, REAL), escala (fator/offset/decimais),
limites e, nos botões, **Alternar** (retentivo) ou **Pulso**. A aba também mostra os valores vivos, contadores (timeouts,
exceções, tempo de resposta), os telegramas Modbus decodificados e um **programa ST gerado** a partir das tags.
A configuração fica em `data/ihm-modbus.json`.

### Mapa padrão: botões em Coils, sinais em Discrete Inputs

| Tag | Área / endereço | Sentido | No CLP |
|---|---|---|---|
| CMD_LIGA | **Coil 0** | IHM escreve (alternar: 1 liga, 0 desliga) | P0684 bit 0 (Gira/Para) |
| CMD_REVERSO | **Coil 1** | IHM escreve (alternar: 1 anti-horário) | P0684 bit 2 = NOT CMD_REVERSO |
| CMD_RESET | **Coil 2** | IHM escreve (pulso de 500 ms) | P0684 bit 7 |
| ST_OPERANDO | **Discrete Input 0** | IHM lê | P0680 bit 8 |
| ST_REVERSO | **Discrete Input 1** | IHM lê | NOT P0680 bit 10 |
| ST_FALHA | **Discrete Input 2** | IHM lê | P0680 bit 15 |
| SP_VELOCIDADE (rpm, REAL) | Holding Registers 0 e 1 | IHM escreve | P0685 = SP × 8192 / 1800 |
| VEL_ATUAL (rpm, REAL) | Input Registers 0 e 1 | IHM lê | P0681 × 1800 / 8192 |
| CORRENTE (×0,1 A) | Input Register 2 | IHM lê | P0003 (P0820 = 3, 3ª palavra de entrada) |

Cada área tem a sua própria contagem, começando em 0: Coil 0, Discrete Input 0, HR 0 e IR 0 são endereços diferentes.
Se o seu CLP não tiver áreas de bit, troque na tabela de tags para Holding/Input Register com o tipo
**BOOL (0/≠0)** (o registrador inteiro vale 0 ou 1) ou **BIT de palavra** (um bit dentro do registrador).

P0684 também precisa de **bit 1 (Habilita Geral)** e **bit 4 (Remoto)** sempre em 1. 8192 = P0403 (60 Hz) = 1800 rpm síncronos.

### No CODESYS

1. Ethernet → *Add Device* → **ModbusTCP Slave Device**: porta 502, Unit ID 1. **Ative as áreas de bit** (Coils e Discrete Inputs, ≥ 3 cada); Holding Registers ≥ 1 e Input Registers ≥ 2.
2. No *I/O Mapping* do Slave Device, ligue as variáveis: Coils e Holding Registers chegam como **entradas** do CLP
   (%IX / %IW); Discrete Inputs e Input Registers saem como **saídas** (%QX / %QW). Se o mapeamento recusar o tipo de um
   registrador, declare como WORD e converta no programa.
3. No mesmo Ethernet, o **EtherNet/IP Scanner** com o CFW500 (seção 5).
4. Copie o programa ST da aba "IHM Modbus" (botão *Copiar*) e ajuste os nomes conforme o seu mapeamento.
5. Na aba IHM Modbus do simulador: IP do CLP (com a rede virtual: **192.168.100.10**), porta 502 → **Ativar comunicação**.

**Mesmo PC:** com a rede virtual, o Modbus do inversor fica em 192.168.100.20:502 e o do CODESYS em 192.168.100.10:502.
Sem a rede virtual, o `3-iniciar-simulador.bat` move o Modbus do inversor para a 5020, deixando a 502 livre para o CODESYS.
Se o CODESYS ainda acusar porta 502 em uso, mude `PORTA_MODBUS_CFW` no `.bat` para 5020.

### Testar sem CLP

`4-testar-ihm-sem-clp.bat` (ou `node tools/clp-modbus-teste.js 127.0.0.1 1502`) faz exatamente o papel do CLP com o mapa
padrão. Na aba IHM Modbus aponte para **127.0.0.1 : 1502** e ative a comunicação.

---

## 7. A esteira 3D

```
 Motor WEG (P0400..P0404) ─► redutor 25:1 (η 0,9) ─► tambor Ø140 mm ─► correia 4 m
 v_correia = n_motor / 25 · π · 0,14 / 60   →  ~0,50 m/s a 1710 rpm
```

* Cada caixa acrescenta atrito (μ = 0,5) e inércia. A massa vai de 2 a 80 kg, e a inclinação de ±10° acrescenta
  o efeito da gravidade.
* **Travar esteira** simula um objeto preso. O que acontece: o rotor perde velocidade, a corrente sobe, a
  limitação de corrente (P0135) segura a frequência, o alarme A0046 aparece quando P0037 passa de P0349 e, por
  fim, ocorre a falha **F0072** (sobrecarga do motor).
* Sensores fotoelétricos **S1 → DI5** e **S2 → DI6**. Eles aparecem em P0012, e o CLP pode lê-los **pela rede**
  programando **P0820 = 12** (palavra de leitura #3), seguido de P0849 = 1 e 3 palavras de entrada no CLP. Essa
  ligação nas DIs do inversor é uma escolha didática para fechar a malha sem cartão de I/O no CLP.
* A torre de sinalização mostra o estado do inversor: verde = girando, amarelo = alarme, vermelho = falha.

---

## 8. O que está simulado

**Inversor (manual de programação):** referência rápida completa de parâmetros; HMI com os 3 níveis
(monitoração/grupos/edição), senha P0000/P0200 e P0204 (padrão 60/50 Hz e memórias de usuário); seleção LOC/REM e
fontes de comando P0220…P0229; DIs (gira/para, habilita geral, avanço/retorno, 3 fios, sentido, JOG, E.P.,
multispeed, 2ª rampa, falha/alarme externo, reset); AI1 com ganho/offset/filtro; DOs e AOs; rampas 1ª/2ª/3ª e rampa S;
P0133/P0134; frequências evitadas; frenagem CC na parada; limitação de corrente e regulação do barramento CC
(P0150/P0151); proteções Ixt do motor e dos IGBTs; sub e sobretensão; falta à terra; curto; falta de fase do motor
(P0343); histórico de 3 falhas com dados; auto-reset P0340; P0680/P0681/P0690.

**Motor:** curva torque × escorregamento de Kloss (conjugado máximo 2,5×), corrente de magnetização mais corrente
rotórica, enfraquecimento de campo acima de P0403 e barramento CC com capacitor (energia regenerada na
desaceleração).

**Injeção de defeitos (aba Falhas e alarmes):** tensão de rede, falta à terra, curto, fase aberta, defeito no
módulo Ethernet, cabo de rede desconectado e CLP que para de transmitir sem Forward Close.

### Validação

O adapter foi testado com dois clientes independentes, além do scanner próprio (`npm run teste`):

* **pycomm3** (Python): ListIdentity, Get/Set não conectados, conectados Classe 3 e Unconnected Send com rota.
* **EIPScanner** (C++): Forward Open Classe 1 com 100/150, troca cíclica a 20 ms com o motor indo a 30 Hz e Forward Close.

Também foram verificados: recusas por tamanho (0x0128), dono duplicado (0x0106) e chave eletrônica (0x0116); Listen
Only; timeout → A0149 + P0313; IDLE com P0313 = 5 → F0249; e reset pelo bit 7 da P0684.

### Escolhas do simulador (limites conhecidos)

* O IP informado no ListIdentity e no objeto TCP/IP é o **IP real do PC**. P0810…P0819 são exibidos, mas não
  trocam o IP do computador.
* Os manuais não detalham as assemblies 120/121/170/171 (perfil CIP AC Drive). Elas foram implementadas
  conforme o perfil ODVA: RunFwd/RunRev/FaultReset e referência em rpm, convertida por P0402.
* O Forward Close do owner também aplica a ação de P0313 (por segurança do acionamento).
* Os modos VVW, PID, SoftPLC, Flying Start e Ride-Through têm parâmetros, mas não alteram o controle (V/f é sempre usado).
* Os objetos LLDP e SNMP do EDS não foram implementados. DLR e QoS respondem apenas leitura básica.
* Valores "conforme modelo" usam o CFW500A04P3T4 (380-480 V / 4,3 A).

---

## 9. Sugestões de aulas práticas

1. **Descoberta e identidade:** listar o dispositivo pelo RSLinx/CODESYS e conferir vendor, produto e revisão com o EDS.
2. **Primeira conexão:** configurar 100/150 com 2 palavras, observar P0801 passando de 2 (Wait Comm) para 4 (Data Active) e os LEDs MS/NS.
3. **Erro proposital de tamanho:** pedir 3 palavras de entrada e ler o código 0x0128 no CLP. Depois corrigir com P0820 = 12 + P0849.
4. **Escala de 13 bits:** fazer a rotina no CLP que converte Hz ↔ P0685/P0681 usando P0403 lido por mensagem explícita.
5. **Segurança na perda de rede:** com o motor girando, desconectar o cabo e comparar P0313 = 1, 2 e 5.
6. **Intertravamento com sensores:** parar a esteira quando S2 detectar a caixa, lendo P0012 pela palavra #3.
7. **Sobrecarga:** travar a esteira e acompanhar P0003, P0037 e o gráfico até F0072, ajustando P0156/P0135.
8. **Rampas:** comparar rampa linear e rampa S (P0104), e reduzir P0101 com carga para ver a regulação do barramento CC.

---

## 10. Estrutura

```
server.js                  inicialização, laço de simulação (5 ms), Socket.IO, CLP virtual
src/drive/params.js        banco de parâmetros (faixas, padrões, propriedades, grupos)
src/drive/cfw500.js        lógica do inversor, rampas, motor, proteções, palavras de controle/estado
src/drive/hmi.js           máquina de estados da HMI
src/drive/faults.js        falhas e alarmes
src/eip/cip.js             encapsulamento, CPF, EPATH, códigos de status
src/eip/objects.js         objetos CIP (Identity, Assembly, TCP/IP, Ethernet Link, classe A2h…)
src/eip/adapter.js         servidor EtherNet/IP: sessões, Forward Open/Close, I/O UDP, watchdog, P0801, LEDs
src/modbus/server.js       servidor Modbus TCP do módulo
src/modbus/client.js       cliente Modbus TCP (usado pela IHM do painel)
src/ihm/ihm-modbus.js      IHM do painel: tags, varredura, comandos, escala e tipos
src/scanner/scanner.js     scanner EtherNet/IP (CLP virtual e testes)
src/plant/conveyor.js      física da esteira
public/                    interface web (HMI, bornes, rede, parâmetros, gráficos, log, three.js)
tools/scanner-test.js      roteiro de teste completo (npm run teste)
tools/clp-modbus-teste.js  "CLP de teste": servidor Modbus + scanner EtherNet/IP (npm run clp-teste)
eds/                       arquivos EDS oficiais da WEG
```
