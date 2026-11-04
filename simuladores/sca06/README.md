# Simulador SCA06 + ECO5 — adapter EtherNet/IP com bancada 3D

Simulador didático do servoconversor **WEG SCA06** com o acessório **ECO5 (EtherNet/IP)**.
O backend em Node.js é um **adapter EtherNet/IP de verdade**: um CLP real (CompactLogix, CODESYS…)
ou qualquer software scanner conversa com ele pela rede, como se fosse o drive.
A interface web mostra uma bancada 3D com servomotor, disco graduado de Ø250 mm, fins de curso,
peso de desbalanceamento, botoeiras e um CLP virtual para treinar os comandos.

> Fontes usadas: **Manual da Comunicação Ethernet SCA06** (doc. 10003986896/00) e **Manual de
> Programação SCA06 V2.1X** (doc. 10000662686/07). Todo valor que não veio desses manuais está
> marcado como **[SIM]** na tabela de parâmetros: confira no equipamento real.

---

## 1. Hierarquia de rede

```
  ┌──────────────────────┐   TCP 44818 (sessão, mensagens explícitas)   ┌───────────────────────────┐
  │  SCANNER / MESTRE    │ ───────────────────────────────────────────▶ │  ADAPTER / ESCRAVO        │
  │  "originator"        │   UDP 2222  O→T  assembly 150 (saídas)       │  "target" = SCA06 + ECO5  │
  │  CLP, CODESYS, CLP   │ ───────────────────────────────────────────▶ │  (este simulador)         │
  │  virtual da bancada  │ ◀─────────────────────────────────────────── │                           │
  └──────────────────────┘   UDP 2222  T→O  assembly 100 (entradas)     └───────────────────────────┘
```

| Item | Valor |
|---|---|
| Assembly de entrada (T→O) | **100** [ETH 8.6.3] |
| Assembly de saída (O→T) | **150** [ETH 8.6.3] |
| Assembly de configuração | qualquer instância, tamanho 0 (ex.: 1) |
| Formato | O→T com header run/idle 32 bits · T→O sem header (modeless) |
| Tamanho | 4 a 16 palavras INT (4 fixas + P0820…P0831 / P0835…P0846) |
| Parâmetros via mensagem explícita | classe **0xA2 (162)**, instância = nº do parâmetro, atributo **5** [ETH Tabela 8.2] |
| Identity | Vendor ID **853 (WEG)**, Device Type 43, Product Code 6, revisão 2.10 — *ajustável em `config.json`* |
| Conexões | 1 Exclusive Owner + Input Only (198) + Listen Only (199) · até 6 explícitas classe 3 |
| Modbus TCP | até **2 conexões** [ETH 8.5], porta 502 (ou 5020) |
| Servidor WEB | `http://<ip>:3000/webserver/` [ETH cap. 10] |

## 2. Instalar e rodar

Requisito: **Node.js 18 ou superior**.

### Windows (dois cliques)
1. **`instalar.bat`** — rode uma vez (ele pede permissão de administrador). Instala o Node.js LTS
   (pelo winget ou, sem winget, baixando o instalador oficial de nodejs.org com conferência do SHA-256
   via `tools/instalar-node.ps1`), faz o `npm install`, libera no Firewall do Windows TCP 44818,
   UDP 44818/2222, TCP 502/5020 e TCP 3000, e cria o atalho **Simulador SCA06** na Área de Trabalho.
2. **`iniciar.bat`** (ou o atalho) — sobe o simulador, mostra os IPs do PC para configurar o CLP e
   abre a página no navegador. Para encerrar, feche a janela ou tecle Ctrl+C.

### Linux / macOS / terminal

```bash
npm install
npm start
```

Abra **http://localhost:3000**. Na primeira execução o drive vem com os padrões de fábrica e a
ligação da bancada (DI1 = STOP, DI2/DI3 = fins de curso). Os parâmetros alterados ficam salvos em
`data/eeprom.json` (apague o arquivo para voltar ao padrão, ou use P0204 = 5).

**Firewall do Windows:** o `instalar.bat` já libera as portas; sem ele, libere TCP 44818, UDP 44818, UDP 2222, TCP 502/5020 e TCP 3000.
**Conflitos de porta:** feche o RSLinx (ou outro simulador) se ele já ocupa a 44818/2222.
**Porta 502:** no Linux/macOS exige administrador; sem isso o simulador usa 5020 automaticamente.

### Sem instalar nada
`dist/bancada-sca06-demo.html` abre direto no navegador (também no celular). Nesse **modo
demonstração** o CLP virtual chama o modelo do drive diretamente, sem pacotes de rede reais.

## 3. Conectar um mestre de verdade

O IP do adapter é o IP do PC que roda o simulador (com P0810 = 1 / DHCP). Se quiser usar o padrão
de fábrica **192.168.0.10** (P0810 = 0), adicione esse IP como endereço secundário da placa de rede do PC.

### Studio 5000 / RSLogix 5000 — *Generic Ethernet Module*
| Campo | Valor |
|---|---|
| Comm Format | **Data – INT** |
| IP Address | IP do PC do simulador |
| Input | Assembly Instance **100**, Size **4** (ou o número de palavras programado) |
| Output | Assembly Instance **150**, Size **4** |
| Configuration | Assembly Instance **1**, Size **0** |
| RPI | 10 ms ou mais · marque *Use Unicast Connection* (multicast também funciona) |

Se o tamanho não bater, o Forward Open é recusado com **0x0109** e o adapter informa o tamanho que espera.

### CODESYS — EtherNet/IP Scanner
1. *Ferramentas → Repositório de dispositivos → Instalar* o arquivo
   `docs/0355002B00060200_SCA06_SIM.eds` (gerado pelo simulador, **não é o EDS oficial WEG**).
   O EDS tem duas conexões: **4 palavras** (velocidade e torque, P0202 = 6) e **8 palavras** (posição pelo Ladder,
   P0202 = 4 com P0820…P0823 e P0835…P0838 mapeados). Para gerar de novo: `node tools/gera-eds.js`.
2. Adicione *Ethernet → EtherNet/IP Scanner → SCA06 ECO5 (simulador)*, informe o IP e escolha a
   conexão *Exclusive Owner*.

### Python (validação usada no desenvolvimento)
```python
from pycomm3 import CIPDriver, Services, INT
with CIPDriver('192.168.0.50') as d:      # IP do PC do simulador
    d.generic_message(service=Services.set_attribute_single, class_code=0xA2,
                      instance=202, attribute=5, request_data=INT.encode(6))   # P0202 = 6
    print(d.generic_message(service=Services.get_attribute_single, class_code=0xA2,
                            instance=2, attribute=5, data_type=INT).value)       # P0002 (rpm)
```
I/O implícito: o simulador foi testado com o **EEIP.py** (Forward Open + UDP 2222).
Teste rápido em Node: `npm run teste` (faz o papel de CLP contra o simulador).

## 4. Palavras de I/O  [ETH cap. 6]

**Entradas (escravo → mestre, assembly 100)**

| Palavra | Conteúdo | Escala |
|---|---|---|
| 1ª | Palavra de estado | bit2 habilitado · bit3 falha · bit4 potência energizada · bit5 STOP · bit6 STO · bit7 alarme · bit14 fim de curso horário · bit15 fim de curso anti-horário |
| 2ª | Velocidade do motor | 7FFFh (32767) = 18750 rpm; negativo = anti-horário; valor instantâneo, sem filtro |
| 3ª | Corrente de torque | A × 10 (47 = 4,7 A) |
| 4ª | Modo de controle atual | 0 torque · 1 velocidade · 3 posição |
| 5ª…16ª | Parâmetro apontado em P0820…P0831 | valor inteiro, sem casas decimais |

**Saídas (mestre → escravo, assembly 150)** — só valem com **P0202 = 6**

| Palavra | Conteúdo | Escala |
|---|---|---|
| 1ª | Palavra de controle | bit2 aciona STOP · bit3 habilita · bit7 reset de falhas (borda 0→1) |
| 2ª | Referência de velocidade | 7FFFh = 18750 rpm (300 rpm = 524 = 020Ch) |
| 3ª | Referência de torque | A × 10 |
| 4ª | Modo de controle | 0 torque · 1 velocidade |
| 5ª…16ª | Parâmetro apontado em P0835…P0846 | valor inteiro |

Para **posicionamento**, o simulador segue o firmware **V2.1X** e usa a **Função Posicionador** (P0202 = 3,
capítulo 20 do Manual de Programação): até 10 movimentos programados em parâmetros (P01151…P01230), executados
em ciclos (P01101…P01150) e disparados pelo **P01079** (ciclo em P01080). O CLP comanda tudo pela rede,
mapeando nas palavras extras:

| Palavra | Parâmetro | Função |
|---|---|---|
| Saída 5 | P0099 | habilitação (2 habilita sem gravar, 0 desabilita) |
| Saída 6 | P01079 | disparo (borda 0 → 1, com P01077 = 0) |
| Saída 7 | P01171 | destino do movimento 1 (fração de volta, 16384 = 1 volta) |
| Saída 8 | P0219 | reset de falhas (borda) |
| Entradas 5 e 6 | P0052, P0053 | posição: fração de volta e voltas |
| Entradas 7 e 8 | P0006, P0048 | estado do servo e erro de lag (pulsos) |

Simulados: tipos 1 (Iq), 2 (velocidade), 3/4 (relativo), 5/6 (absoluto) e 7 (jog), timer, ciclos simples e
completos, borda/nível e filtro. Não simulados: seguidor (8/9), busca de zero (10/11), disparo por entrada
digital e curva S (o jerk é aceito, o perfil é trapezoidal). O modo **P0202 = 4 (Ladder)** existe, mas o drive
não tem aplicativo gravado, como um SCA06 novo: o eixo não é controlado (no equipamento real, o programa é feito
no WLP/WPS). Parâmetros gravados por versões antigas do simulador em P01100…P01113 são descartados uma vez.

## 5. O que o "firmware" simula

- **Estados da interface** (P0801): Setup → Init → Wait Comm → Idle/Data Active, Error (timeout) e
  Access Error (acessório desencaixado). **LED NS** e **LEDs Link** conforme Tabelas 3.2 e 8.1.
- **Endereçamento**: P0810–P0819 e P0803 só valem após **P0849 = 1** ou reset, como no manual.
- **Erro de comunicação** (timeout de I/O ou mestre em IDLE) → A00147 e a ação de **P0662**:
  0 só alarme (o motor *mantém* a última referência), 1 falha F00047, 2 função STOP, 3 desabilita.
- **Watchdog Modbus TCP** P0806. **F00048/A00148** ao desencaixar o ECO5.
- **Malhas**: corrente (kt P0417), velocidade PI (P0161/P0162), posição (P0159); limites P0133/P0134 e
  P0136; rampas P0100/P0101 (modo velocidade) e **P0105 em ms/krpm** (função STOP).
- **Entradas digitais** P0300–P0302 (tabela 10.20): STOP, fim de curso, habilitação, limpa falha…
  Fim de curso força a referência de velocidade a zero no sentido limitado e não atua em modo torque.
- **STO** (emergência) → display "Sto", bit 6; **F00002** ao desligar a potência com o drive habilitado.
- **HMI** de 6 dígitos com teclas PROG, SHIFT, ▲, ▼ e Reset: modos busca/exibição/alteração,
  senha P0000 = 5, alarmes "A00147" e falhas "F00047" que somem com qualquer tecla.
- **Física** do disco: alumínio Ø250 × 4 mm, peso de 300 g a 100 mm (torque gravitacional
  m·g·r·senθ), atrito de Coulomb e viscoso, batentes em ±178° quando as cames estão montadas.

## 6. Vista frontal 2D do SCA06 (HMI tecla por tecla)

À esquerda da tela, junto com o painel de configurações (telas a partir de 1200 px; entre 900 e 1200 px só
o painel fica à esquerda e o desenho vai para a aba **SCA06**; no celular, também na aba **SCA06**), fica o desenho frontal do
drive, baseado na vista frontal do Manual do Usuário: tampa da potência (X9), slots de acessório com
tampas cegas e o **ECO5 no slot 2**, coluna com X1, X2 (resolver), X3 (USB), LEDs **USB / POWER ON /
FAULT** e **RESET**, faixa da HMI com o display de 6 dígitos e as teclas **▲ P ▼ ◄**, conectores X5/X4 e o
suporte de aterramento. O mesmo desenho é a textura da frente do drive em 3D.

- As teclas funcionam como no drive físico: **segure ▲/▼** para rolar (espera 450 ms, repete a cada
  90 ms e acelera após 2 s).
- No teclado do computador: **↑ ↓** navegam, **Enter** = P, **←** = SHIFT.
- Fluxo típico: P00000 → **P** → ▲×5 → **P** (senha liberada) → segure ▲ até P00121 → **P** →
  **◄ ◄** (dígito das centenas) → ▲ → **P**: com P0202 = 2 e P0099 = 1 o disco gira a 100 rpm.
- Clique no conector da porta XA171 para desconectar o cabo.

## 7. Bancada 3D — o que dá para clicar

A bancada do motor é montada como uma bancada real: base de alumínio com pés de borracha, cantoneira
em L com reforços, **servomotor flangeado e à vista** (carcaça preta com ranhuras, tampa traseira laranja, conectores circulares de potência e resolver no topo,
placa de identificação, berço traseiro), disco de alumínio usinado Ø250 × 4 mm com furos de alívio e
**escala gravada de 1°**, preso no eixo por um cubo de 4 parafusos, e **ponteiro vermelho fixo** às 12 h:
o ângulo P0050 é lido diretamente no ponteiro. O conjunto começa girado ~29° para o motor aparecer de
frente; o botão **Motor** leva a câmera para a lateral. **A bancada do motor pode ser arrastada** sobre a
mesa (clique e arraste o motor, a base ou o disco) e girada com **⟲ 15° / ⟳ 15°** (ou Q/E com o 3D em foco);
os cabos acompanham e a posição fica salva no navegador. **Posição original** volta ao lugar de fábrica.
No painel: canaleta recortada 40 × 45 mm com tampa, trilhos DIN TS35 com batentes (switch, CLP, disjuntor
e bornes) e o SCA06 fixado pelo suporte, como no manual. Acima de ~50 rpm o disco ganha borrão de
movimento, como numa filmagem real. O arco verde das missões é pintado no disco: quando ele passa
sob o ponteiro, a posição está dentro da tolerância.

Teclas da HMI · tecla Reset · cabo e conector RJ45 da porta XA171 (simula cabo rompido) ·
módulo ECO5 (desencaixa) · emergência (STO) · botoeira STOP (DI1) · disjuntor de potência ·
peso de desbalanceamento · chaves de fim de curso (monta/retira as cames) · CLP (abre o painel do mestre).
O sinaleiro mostra verde = habilitado, âmbar = alarme/STOP, vermelho = falha.

**16 missões** guiam a aula: abrir sessão, P0202 = 6, Data Active, habilitar, 300 rpm, inversão em
complemento de dois, função STOP, mapear P0003 na 5ª palavra, equilibrar o peso em modo torque,
diagnosticar F00047 com cabo rompido e fim de curso. As 5 últimas comandam a **posição pela Função
Posicionador** (P0202 = 3), tudo pela rede: configurar e conectar com 8 palavras, posicionar em 135,0°,
pulsos de 45°, posição absoluta (90° e 270°) e ciclo completo (ida e volta com um só disparo).

## 8. Limitações e pontos para conferir

- **Identity** (Device Type, Product Code) e o **EDS** são do simulador. Confira e ajuste com o EDS
  oficial do SCA06 (weg.net) em `config.json`. O Vendor ID 853 é o da WEG na ODVA.
- **P0105**: o exemplo do manual Ethernet ("5,0 s → 50") diverge do Manual de Programação (ms/krpm).
  O simulador segue o Manual de Programação. Bom exercício para os alunos.
- **P0531** (STOP nível/borda): o padrão de fábrica não foi confirmado; o simulador usa 1 (nível).
- Ganhos internos das malhas, temperaturas, inércia/forma do motor SWA e dimensões do drive são [SIM].
- P0202 = 3 (Função Posicionador) e 5 (CANopen) não são simulados; a tabela de modelos de P0385 também não.
- Marcadores SoftPLC por Modbus (FC01/02/05/15) não são simulados (respondem exceção 02).
- A identidade visual da WEG (logotipo) não foi reproduzida no modelo 3D.

## 9. Arquivos

```
server.js                 servidor: firmware + adapter + Modbus + web + scanner virtual
config.json               portas, identidade CIP, formato de I/O
public/core/sca06-core.js modelo do SCA06 (parâmetros, HMI, malhas, física) — Node e navegador
src/enip/cip.js           codificação CIP/encapsulação/CPF/EPATH
src/enip/adapter.js       adapter EtherNet/IP (TCP 44818, UDP 2222, UDP 44818)
src/enip/scanner.js       mestre virtual (originator) usado pelo painel
src/modbus/server.js      Modbus TCP do ECO5
src/web/drive-webserver.js página web do acessório (Figura 10.1)
public/                   interface: bench3d.js (Three.js), drive2d.js (frontal 2D), app.js, demo.js, styles.css
tools/                    teste-scanner.js, gera-eds.js, build-demo.js
docs/                     EDS do simulador
dist/                     bancada em arquivo único (modo demonstração)
```

Validação feita: pycomm3 (ListIdentity, Get Attributes All, classe 0xA2 conectada e não
conectada, erros 0x0E/0x16), EEIP.py (Forward Open, I/O implícito, Input Only, Listen Only,
recusa 0x0119), scanner Node (0x0109, 0x0106, IDLE, timeout, P0849) e cliente Modbus TCP.
