# Simulador do Sistema de Visão Keyence CV-X400 (adapter EtherNet/IP)

Simula a câmera lendo a etiqueta (1 QR maior + 5 QR menores) e entrega os dados
ao CLP XP325 por EtherNet/IP, como o CV-X real. O CLP enxerga o PC como se fosse
a câmera (mesma identidade do EDS `Keyence_5005_0102.eds`).

## Tela no estilo do CV-X

A interface reproduz a tela de operação do CV-X: programa (Conf. 041 INSPECAO_ETIQUETA),
Cont, Cont NG, Prog. Hora, Interv, Status Total, faixa de ferramentas e o painel
de resultado de cada ferramenta.

| Ferramenta | Função |
|---|---|
| T100 Leitor de Código 2D | QR maior (face frontal) |
| T101 a T105 Leitor de Código 2D | QR menores 1 a 5 (1 = peça da frente) |
| T106 Pos de padrão de perf | Posição da caixa (se NG, todos os leitores dão NG) |

### Atribuição de saída (bytes 4 a 11)

Igual à tabela "Endereço / Item a trans / Tempor da sd" do CV-X. Padrão:

| Endereço | Item a trans | Tempor da sd |
|---|---|---|
| 0004:bit0 | Status Total | No estado NG |
| 0004:bit1 | Status Total | No estado OK |
| 0004:bit2 | T100 (QR maior) | No estado NG |
| 0004:bit3 a bit5 | T101 a T103 (QR menores 1 a 3) | No estado NG |
| 0004:bit7 | T105 (QR menor 5) | No estado NG |
| 0005:bit0 | T104 (QR menor 4) | No estado NG |

O 0004:bit6 fica livre de propósito: no EDS da Keyence o "Tool Judge Value6" aponta
para o parâmetro errado (Command Result) e o CODESYS não o mapeia como BOOL.
No CODESYS, bit N do byte 4 = canal "Tool Judge Value N"; 0005:bit0 = "Tool Judge Value8".

No CODESYS/MasterTool o I/O Mapping gerado pelo EDS mostra cada "Tool Judge Value"
como um BYTE separado, mas na rede os bits vêm todos no byte 4. Mapeie um BYTE no
canal "Tool Judge Value0" (byte 4 do assembly) e separe os bits no programa.

Os bits mudam ao fim de cada inspeção (em modo execução). Outras linhas podem ser
incluídas no modo programação, aba Saída EtherNet/IP (Status Total ou uma ferramenta).

### Modo execução x modo programação

- **Execução**: RUN = 1, READY1 = 1. Aceita o TRG1 do CLP (e o botão Exec) e
  atualiza a saída EtherNet/IP, o Cont e o Cont NG.
- **Programação**: RUN = 0 e READY1 = 0. O TRG1 do CLP é ignorado. O botão Exec faz
  uma medição de teste só na tela, sem mexer na saída para o CLP. As abas Ferramenta,
  Saída EtherNet/IP e Programa permitem ver e alterar a configuração.

O **Painel do simulador** (botão no alto) reúne o que não existe no equipamento real:
etiqueta na frente da câmera, cenários de teste, falhas simuladas, disparo automático,
sinais, mapa de bytes e eventos. A configuração de rede fica em **Utilidade**.

## Programas (como o cartão SD do CV-X)

A troca de programa é feita **na própria câmera**: clique no seletor
**"Conf. 041 INSPECAO_ETIQUETA"** no alto da tela para abrir a lista de programas: carregar, criar (escolhendo o tipo de inspeção), duplicar o carregado e
excluir. Cada CLP conectado tem os seus programas. Durante a troca (cerca de 0,6 s)
o BUSY fica ligado, o READY1 desligado e a área de dados é zerada.

| Programa | Tipo | Ferramentas |
|---|---|---|
| 041 INSPECAO_ETIQUETA | Validação de etiqueta (6 QR codes) | T100 a T105 leitores de código, T106 posição |
| 042 DISCO_FUROS | Disco com furos | T100 posição, T101 Ø externo, T102 Ø interno, T103 contagem de furos |

### Programa 042 DISCO_FUROS

Peça: flange Ø80 mm com furo central Ø40 mm e 6 furos Ø10 mm no diâmetro primitivo
de 60 mm. Tolerâncias padrão (editáveis no modo programação, aba Ferramenta):
Ø externo 79,800 a 80,200 mm, Ø interno 39,850 a 40,150 mm, 6 furos.

| Bytes (assembly 100) | Dado | Formato |
|---|---|---|
| 48..51 | DIAMETRO_EXTERNO | DINT mm x 1000 (ou REAL em mm) |
| 52..55 | DIAMETRO_INTERNO | DINT mm x 1000 (ou REAL em mm) |
| 56..59 | QTD_FUROS | DINT |
| 4 (bits) | bit0 Status NG, bit1 Status OK, bit2 T100 NG, bit3 T101 NG, bit4 T102 NG, bit5 T103 NG | |

Valores fora da tolerância são enviados normalmente (com a ferramenta em NG). Zero só
quando não há medição (sem peça ou peça fora de posição). No Painel do simulador dá
para definir os diâmetros reais, o nº de furos, a variação da medição e os cenários.

### Troca de programa

Feita somente na própria câmera, pelo seletor de programas da tela. Se o CLP
mandar um Command request, a câmera responde Command complete + Command error
(não executa). Teste sem CLP com o programa 042 carregado na tela:
`node teste_scanner.js 127.0.0.1 496 --disco`

## Rede virtual e várias câmeras independentes

Cada **câmera** do simulador é um equipamento separado: tem o seu IP, as suas portas
TCP 44818 / UDP 2222 presas a esse IP, os seus programas, peça, sinais e contadores, e
um único CLP dono (como o CV-X real: um segundo CLP recebe "Ownership conflict").
Dois CLPs, cada um apontando para o IP de uma câmera, ficam totalmente separados,
inclusive no tráfego EtherNet/IP.

### configurar_rede_virtual.bat (rodar uma vez, pede administrador)

1. **Rede virtual neste PC** (CODESYS Control Win e câmeras no mesmo PC): instala o
   Microsoft KM-TEST Loopback Adapter, renomeia para `SIM_VISAO` e coloca o IP do
   CODESYS (padrão 192.168.100.10) e um IP por câmera (padrão 192.168.100.21, .22...).
   Os IPs das câmeras ficam marcados para o Windows não usá-los como origem, então o
   CODESYS sai sempre pelo IP dele.
2. **IPs de câmeras numa placa existente** (CLPs reais ligados na rede): acrescenta os
   IPs das câmeras na placa escolhida (ela precisa estar com IP fixo).
3. **Remover** IPs, adaptador virtual e regras de firewall.
4. **Mostrar** a configuração atual.

Nas opções 1 e 2 o script também libera TCP 44818 e UDP 44818/2222 no firewall e grava
o `config_cameras.json` (uma câmera por IP). Depois, reinicie o simulador.

### No CODESYS / MasterTool

- Dispositivo Ethernet na placa `SIM_VISAO` (192.168.100.10) quando for no mesmo PC.
- Cada CV_X400_Series com o IP de uma câmera (192.168.100.21, .22...).
- Conexão T->O **ponto a ponto** (multicast não circula numa placa de loopback).

### Na tela

Uma aba por câmera na barra superior (nome, IP, estado do CLP, programa e último
resultado; o IP do CLP aparece ao parar o mouse na aba). **+ Câmera** cria outra
câmera num IP livre; em **Utilidade** dá para renomear, trocar o IP e informar o IP do
CLP (só em casos especiais). O "×" na aba remove a câmera (sem CLP conectado). Se o IP
gravado não existir mais no PC, a aba mostra **ERRO DE REDE**.
"Disparar em todos" e "Aplicar cenário em todas" agem em todas as câmeras.

## Arquivos

| Arquivo | Função |
|---|---|
| `eip-adapter.js` | EtherNet/IP do lado do dispositivo (uma instância por câmera/IP) |
| `cvx.js` | Modelo do CV-X400: assemblies 100/101, TRG1/BUSY/READY, programas |
| `programas.js` | Tipos de programa: validação de etiqueta e disco com furos |
| `server.js` | Cria as câmeras do `config_cameras.json` e serve a interface em http://localhost:3001 |
| `configurar_rede_virtual.bat` + `rede_virtual.ps1` | Cria a rede virtual / IPs das câmeras no Windows |
| `teste_scanner.js` | Faz o papel do CLP para testar sem hardware |
| `public/` | Interface web |

## Mapa do assembly 100 (entrada do CLP)

| Bytes | Conteúdo |
|---|---|
| 0 | bit3 Result ready, bit4 Result OR (1 = alguma leitura NG) |
| 1 | bit0 READY1 |
| 2 | bit0 ACK1 |
| 3 | bit0 BUSY, bit1 ERROR, bit3 RUN |
| 4 | Atribuição de saída: bit0 = Status Total no estado NG, bit1 = Status Total no estado OK |
| 16..19 | Total count |
| 48..263 | QRCODE_MAIOR (54 caracteres, 1 por INT32) |
| 264..463 | QRCODE_MENOR_1..5 (10 caracteres cada, 1 por INT32) |

Assembly 101 (saída do CLP): byte 0 bit3 = Result ack, byte 1 bit0 = TRG1.

## Configuração no MasterTool (scanner EtherNet/IP do XP325)

1. Importe o `Keyence_5005_0102.eds` e adicione o CV-X400 como adapter.
2. IP do adapter = IP da câmera do simulador que este CLP vai usar.
3. Conexão "Class1" (dono exclusivo), assemblies 101 (saída) e 100 (entrada).
4. Tamanho de entrada de pelo menos **464 bytes** (o padrão do EDS, 496, serve).
5. RPI de 20 ms ou mais (no Windows o temporizador do Node tem resolução de ~15 ms).

## Problema: o CLP abre a conexão e ela cai a cada 10 s

Sintoma nos Eventos: "CLP em RUN" e, 10 s depois, a conexão é reaberta pelo CLP
(aviso "ATENÇÃO: ... reabriu a conexão"; a aba mostra **CLP SEM T->O**).
Significa que a câmera recebe os dados do CLP (O->T), mas o CLP **não recebe os
dados da câmera** (T->O). Os 10 s são o tempo que o CIP espera pelo primeiro pacote.

Causas, da mais comum para a menos comum, no mesmo PC do CODESYS:

1. **Disputa da porta UDP 2222.** O CODESYS precisa receber na 2222 e a câmera também
   usava a 2222. No Windows, quem abre a porta depois pode ficar sem receber.
   Solução: em Utilidade, mude a **Porta UDP de I/O** da câmera para **2223** (uma por
   câmera: 2223, 2224...), aplique e reinicie a aplicação no CODESYS (ou faça login
   e Reset a frio). A câmera informa a porta nova ao CLP na abertura da conexão e
   continua enviando para a 2222 do CLP.
   Se depois disso aparecer "timeout (sem dados do CLP)" logo após abrir, o CODESYS
   não aceitou a porta alternativa: volte para 2222 e inicie primeiro o CODESYS
   (aplicação em RUN) e só depois o simulador.
2. **Firewall**: rode o configurar_rede_virtual.bat (libera UDP 2222 a 2240 e TCP 44818).
3. **RPI muito baixo**: no Windows use RPI de 20 ms e multiplicador de timeout
   x64 na aba Connections do CV_X400_Series.


## Problema: a conexão cai de vez em quando com "Connection timed out (16#203)"

Intervalos irregulares (às vezes segundos, às vezes minutos) e, no log do CODESYS,
"Connection failure (16#1) / Extended Status: Connection timed out (16#203)".
O CLP está recebendo os dados da câmera, mas algum pacote atrasou mais que o timeout
dele (RPI x multiplicador). Com RPI 10 ms e x4, o limite é de só 40 ms, e o Windows
atrasa um pacote além disso de vez em quando (o simulador não é tempo real).

No CV_X400_Series, aba **Connections**: **RPI 20 ms** e **multiplicador de timeout
x64** (timeout de 1,28 s). Esta é a configuração testada com o CODESYS Control Win e o
simulador no mesmo PC; com x16 ainda podem ocorrer quedas rápidas de vez em quando. O painel do simulador mostra o
timeout do CLP, o maior intervalo medido entre pacotes e quantos atrasos houve.

## CODESYS mostra "Not updated (check tooltip)" nos canais

Não é falha de comunicação: o CODESYS só atualiza canais mapeados a variáveis usadas no
programa. Mapeie as variáveis (coluna Variable do I/O Mapping) ou, embaixo da tabela,
ajuste **Always update variables** para **Enabled 1 (use bus cycle task if not used in
any task)**.

## Problema: "Message request timed out" e quedas em intervalos irregulares

Se o CODESYS mostra várias vezes seguidas "Message request timed out", o simulador
ficou parado e não respondeu. A causa mais comum no Windows: **clicar ou selecionar
texto na janela preta do simulador** (edição rápida do console). O Windows pausa o
programa até a seleção ser desfeita (tecla Esc). Por isso:

- o iniciar_simulador.bat abre essa janela minimizada; não clique nela;
- os eventos aparecem na tela do simulador e no arquivo `eventos.log`, não na janela;
- se o programa ficar parado mais de 0,3 s, o painel Eventos mostra um aviso com o tempo.

## Quedas rápidas (Connection failure 16#1 / 16#203)

Quando o CLP derruba e reabre a conexão, o painel Eventos mostra a causa medida:
- "Causa: o SIMULADOR atrasou o envio": o PC ficou ocupado; aumente RPI/multiplicador.
- "O simulador enviou todos os pacotes no prazo": o atraso foi no CODESYS. Aumente o
  multiplicador e, em PLC Settings, ponha a "Bus cycle task" numa tarefa rápida (10–20 ms).
- "o CLP não recebe os dados da câmera": troque a Porta UDP de I/O em Utilidade.
