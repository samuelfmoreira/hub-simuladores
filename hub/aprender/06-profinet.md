# PROFINET

> O CLP procura cada equipamento pelo nome, dá um IP a ele e abre uma relação de aplicação. Depois, os dados cíclicos viajam direto na camada Ethernet, sem IP nem UDP.

## Os papéis

| Papel | Quem é | O que faz |
|---|---|---|
| IO-Controller | o CLP (CODESYS, S7...) | configura os devices, abre as conexões e troca I/O cíclico |
| IO-Device | o remoto, o inversor, a ilha de válvulas | responde ao controlador e entrega os dados |
| IO-Supervisor | o software de engenharia | comissionamento e diagnóstico |

Na bancada, o CODESYS é o IO-Controller e o **TBEN-L-SIM** é o IO-Device.

## Nome, não IP

No PROFINET, quem identifica o device é o **nome de estação** (NameOfStation), por exemplo `tben-l-sim`. O IP é consequência: na partida, o controlador procura o device com aquele nome e entrega o IP configurado no projeto.

Isso é feito pelo **DCP** (Discovery and Configuration Protocol), que roda direto na camada Ethernet:

1. **Identify:** o controlador pergunta à rede "quem se chama `tben-l-sim`?".
2. **Set:** o device responde, e o controlador grava nele o IP e a máscara.
3. A partir daí o device é alcançável por IP para a parte acíclica.

> **Dica:** device novo, de fábrica, não tem nome. A primeira tarefa no comissionamento é **atribuir o nome** pelo Scan do CODESYS (ou da ferramenta do fabricante). Nome errado é a causa número um de "device não encontrado".

## O arquivo GSDML

O **GSDML** (GSD Markup Language) é o equivalente PROFINET do EDS: um XML que descreve o device para o software do CLP.

| Conceito | O que é | No TBEN-L-SIM |
|---|---|---|
| DAP | Device Access Point: o "cabeçalho" do device, com a interface Ethernet | slot 0 |
| Slot | posição de um módulo | slots 1 a 8 = portas X0 a X7 |
| Subslot | subdivisão do slot, onde ficam os dados | subslot 1 de cada porta |
| Módulo / submódulo | o que está encaixado e o tamanho de entrada e saída | um por porta, tamanhos do device IO-Link |
| Parâmetros (registros) | dados acíclicos enviados na partida | registro 0x0200: configuração da porta IO-Link |

O CLP só aceita a conexão se os módulos configurados baterem com os do device. Módulo diferente vira diagnóstico de "módulo errado" e o slot fica sem dados.

## A conexão: AR

O controlador abre uma **AR** (Application Relationship) com cada device. A abertura usa mensagens acíclicas (DCE/RPC sobre UDP, porta 34964):

1. **Connect:** o controlador envia a configuração esperada (slots, submódulos, tamanhos) e cria as relações de comunicação (IOCR de entrada e de saída, e a de alarmes).
2. **Parametrização:** o controlador grava os registros de cada submódulo (no TBEN-L-SIM, o 0x0200 de cada porta).
3. **PrmEnd / ApplicationReady:** fim da parametrização; o device avisa que está pronto.
4. **Dados cíclicos:** começam a fluir nos dois sentidos.

No simulador, o LED **BUS** fica verde e o log mostra "AR PROFINET ativa" quando isso termina.

## Dados cíclicos (RT)

Os dados de I/O viajam em quadros Ethernet com EtherType **0x8892**, sem IP. Cada quadro leva os dados de todos os submódulos, o contador de ciclo e o estado de quem produz (**IOPS**) e de quem consome (**IOCS**). IOPS "GOOD" (0x80) diz que o dado é válido; "BAD" diz para não usar.

O tempo de atualização é o **send clock** (normalmente 1 ms) vezes o **fator de redução**. Com 1 ms × 4, um quadro a cada 4 ms. Se faltarem quadros por mais que o **watchdog** (tempo de atualização × fator, por exemplo × 3), a AR cai e as saídas do device vão para o estado seguro. No simulador, saídas zeradas.

| Classe | Uso típico |
|---|---|
| RT (Conformance Class A e B) | automação em geral: remotos, inversores, válvulas. É o que a bancada usa |
| IRT (Conformance Class C) | movimento sincronizado, com switches especiais e tempo reservado |

## Acíclico: registros e alarmes

Fora do ciclo, controlador e device trocam **registros** (Read Record / Write Record, por índice). Exemplos no TBEN-L-SIM:

| Índice | Uso |
|---|---|
| 0x0200 | configuração da porta IO-Link: modo, validação, Data Storage, tempo de ciclo |
| 0xB400 | IOL_CALL: ler e gravar parâmetros (ISDU) do device IO-Link ligado na porta |

Os **alarmes** chegam por uma relação própria. Um diagnóstico de canal indica slot, subslot, tipo de erro e um valor adicional. No TBEN-L-SIM, os eventos IO-Link viram diagnóstico de canal, com o código do evento no valor adicional.

## Por que a bancada usa uma VM

O PROFINET RT não usa IP: são quadros Ethernet brutos. Por isso:

- o device precisa de acesso direto à placa de rede (no Linux, como root);
- a placa virtual do HUB (SIM-HUB) não serve aqui, porque ela entrega pacotes IP no próprio PC, mas não quadros Ethernet de um sistema para outro;
- o caminho é uma **VM Linux** com uma placa **host-only** do VirtualBox, em modo promíscuo, compartilhada com o Windows. O CODESYS usa essa placa como adaptador do PROFINET IO Controller.

Sem a VM, o modo **Demonstração** do simulador roda no próprio Windows: a planta, o mestre IO-Link, o CLP demo e o comando manual funcionam; só o PROFINET fica desligado.

## Wireshark

Capture na placa host-only. Filtros úteis: `pn_dcp` (nome e IP), `pn_io` (conexão, registros, alarmes), `pn_rt` (dados cíclicos) e `eth.type == 0x8892` (todo o PROFINET em tempo real).

Próxima aula: [IO-Link](#/aprender/io-link).
