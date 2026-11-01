# Diagnóstico

> Quando o CLP não conversa com o equipamento, siga a ordem: rede, porta, conexão, dados. Quase sempre o problema está no primeiro degrau que você pulou.

## A escada do diagnóstico

1. **O IP existe?** Na aba Rede, todos os pontos devem estar verdes. No cartão em Dispositivos, o indicador verde ao lado do IP mostra que o simulador está no IP próprio.
2. **O IP responde?** No Prompt de Comando: `ping 192.168.100.20`. Sem resposta, o problema é de rede: placa, máscara, IP digitado errado.
3. **A porta está aberta?** No PowerShell: `Test-NetConnection 192.168.100.20 -Port 44818`. *TcpTestSucceeded: False* indica simulador parado, firewall ou outro programa ocupando a porta.
4. **A conexão abre?** Nas *Mensagens do simulador*, procure o Forward Open. Se foi recusado, o código diz o motivo (tabela na aula de [EtherNet/IP](#/aprender/ethernetip-cip)).
5. **Os dados fazem sentido?** Com a conexão aberta, confira escala, ordem das palavras e qual bit é qual. Aqui o problema já é de programa, não de rede.

## Quem está usando a porta?

Se o HUB avisar que uma porta está ocupada por outro programa:

```
netstat -ano | findstr :44818
tasklist /fi "PID eq 1234"
```

O primeiro comando mostra o PID de quem ocupa a porta; o segundo, o nome do programa. Suspeitos comuns: RSLinx, um simulador aberto pelo .bat antigo (fora do HUB), o próprio CODESYS.

## Wireshark

Com o Wireshark, você vê os pacotes de verdade. Na placa virtual, capture na interface **SIM-HUB** (instale o Npcap marcando *Support loopback traffic*). Filtros úteis:

| Filtro | Mostra |
|---|---|
| `enip` | todo o EtherNet/IP (sessão, explícitas) |
| `cip.cm` | só o Connection Manager: Forward Open e Close |
| `udp.port == 2222` | o I/O cíclico |
| `mbtcp` | Modbus TCP |
| `modbus.exception_code` | só as respostas de exceção Modbus |
| `ip.addr == 192.168.100.20` | tudo de e para um equipamento |
| `pn_dcp` / `pn_io` / `pn_rt` | PROFINET: nome e IP, conexão e registros, dados cíclicos |

Exercício: abra a conexão do CFW500, filtre `cip.cm` e encontre no Forward Open o caminho `20 04 24 01 2C 64 2C 96`. Depois filtre `udp.port == 2222` e veja o intervalo entre pacotes: deve ser o RPI.

## Sintomas e causas

| Sintoma | Causa provável |
|---|---|
| CODESYS não acha o equipamento no Scan | placa errada no dispositivo Ethernet; firewall bloqueando UDP 44818 |
| Forward Open recusado com 0x0117 | O→T e T→O trocados (100 e 150 invertidos) |
| Forward Open recusado com 0x0127 ou 0x0128 | tamanho diferente entre CLP e equipamento |
| Conexão abre e cai em seguida | T→O em multicast numa placa virtual; firewall bloqueando UDP 2222 |
| Conexão cai de vez em quando | RPI baixo demais para o PC; janela do simulador pausada por seleção de texto |
| Simulador recebe, mas não obedece | CLP em STOP (Idle) ou equipamento não parametrizado para comando pela rede |
| Valor Modbus "deslocado de um" | base 0 x base 1 (40001 é o offset 0) |
| Float chega absurdo | ordem das palavras (ABCD x CDAB) |
| IPs dos simuladores somem | CODESYS com *Ajustar configurações do sistema operacional* marcado |
| PROFINET: device não encontrado | nome de estação diferente do projeto; adaptador do controlador não é a placa host-only da VM |
| PROFINET: AR não sobe | módulos do projeto diferentes do GSDML; GSDML de outra versão; Npcap ausente no Windows |
| PROFINET: AR cai sozinha | watchdog estourado (PC ou VM sobrecarregados); placa host-only sem modo promíscuo |
| IO-Link: PQ = 0 na porta | device errado (validação), porta em PREOPERATE, curto em L+ ou sem device |

## Glossário

| Termo | Significado |
|---|---|
| Adapter | equipamento que responde ao scanner no EtherNet/IP (o "escravo") |
| Assembly | bloco de dados de I/O, identificado por um número de instância |
| CIP | Common Industrial Protocol, a linguagem do EtherNet/IP |
| EDS | arquivo que descreve o equipamento para o software do CLP |
| Explícita | mensagem de pergunta e resposta, por TCP |
| Forward Open | pedido do scanner para abrir uma conexão de I/O |
| Implícita | troca cíclica de I/O, por UDP |
| MBAP | cabeçalho de 7 bytes do Modbus TCP |
| O→T / T→O | sentidos da conexão: do CLP para o equipamento e vice-versa |
| RPI | intervalo entre pacotes de I/O |
| Scanner | quem abre as conexões no EtherNet/IP (o CLP) |
| SkipAsSource | IP que o Windows não usa como origem; usado nos IPs dos simuladores |
| Unit ID | endereço do escravo no Modbus TCP |
| AR | Application Relationship: a conexão PROFINET entre controlador e device |
| DCP | protocolo PROFINET que encontra o device pelo nome e grava o IP |
| GSDML | arquivo que descreve o device PROFINET (equivalente ao EDS) |
| IODD | arquivo que descreve o device IO-Link |
| ISDU | acesso acíclico aos parâmetros de um device IO-Link |
| PQI | byte de qualidade da porta IO-Link (PQ, DevCom, DevErr) |
