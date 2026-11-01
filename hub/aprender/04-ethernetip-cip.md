# EtherNet/IP e CIP

> O CLP abre uma conexão, combina o ritmo e o tamanho dos dados, e a partir daí os dois trocam pacotes sozinhos, a cada poucos milissegundos.

## Duas camadas

**CIP** (Common Industrial Protocol) é a linguagem: objetos, serviços e conexões. **EtherNet/IP** é o CIP viajando em TCP/IP. O mesmo CIP roda em DeviceNet e ControlNet, por isso os conceitos valem para as três redes.

Todo equipamento CIP é um conjunto de **objetos**. Cada objeto tem uma **classe**, **instâncias** e **atributos**:

| Classe | Objeto | Para que serve |
|---|---|---|
| 0x01 | Identity | fabricante, tipo, código do produto, revisão, número de série |
| 0x02 | Message Router | entrega cada pedido ao objeto certo |
| 0x04 | Assembly | blocos de dados de I/O (as "assemblies" 100, 150...) |
| 0x06 | Connection Manager | abre e fecha conexões (Forward Open e Forward Close) |
| 0xF5 | TCP/IP Interface | IP, máscara, gateway do equipamento |
| 0xA2 | específico do fabricante | nos drives WEG: os parâmetros (instância = número do parâmetro) |

## Mensagens explícitas e implícitas

| | Explícita | Implícita (I/O) |
|---|---|---|
| Transporte | TCP 44818 | UDP 2222 |
| Padrão | pergunta e resposta | cíclica, a cada RPI |
| Conteúdo | qualquer atributo de qualquer objeto | só as assemblies combinadas |
| Uso | ler e escrever parâmetros, diagnóstico | controle em tempo real |

Exemplo de explícita nos drives WEG: classe 0xA2, instância 202, atributo 5, serviço *Set Attribute Single* (0x10) escreve a P0202.

## A conexão de I/O, passo a passo

:::widget eip-sequencia

## Scanner, adapter, O→T e T→O

O **originator** (O) é quem abre a conexão: o CLP, também chamado de **scanner**. O **target** (T) é o equipamento, o **adapter**. Daí os sentidos:

- **O→T**: do CLP para o equipamento. São as **saídas** do CLP: palavra de controle, referência.
- **T→O**: do equipamento para o CLP. São as **entradas** do CLP: palavra de estado, velocidade, resultado.

> **Atenção:** muitos manuais descrevem as assemblies do ponto de vista do equipamento ("instância de entrada 100"). Do lado do CLP, a entrada do equipamento é a saída do CLP. Na dúvida, confie no caminho de conexão do EDS, que não tem ambiguidade.

## O caminho de conexão

No Forward Open, o CLP diz quais assemblies quer usar por um **caminho** de bytes. A ordem é sempre: configuração, O→T, T→O.

:::widget eip-caminho

## RPI e timeout

O **RPI** (Requested Packet Interval) é o período dos pacotes: com RPI de 10 ms, cada lado manda 100 pacotes por segundo. A conexão cai se nada chegar em RPI × multiplicador de timeout (4, 8, 16... vezes). Com RPI de 10 ms e multiplicador 4, bastam 40 ms sem pacote.

Num PC que roda CODESYS, três simuladores e um navegador com telas 3D, RPI de 10 ms é apertado. Se a conexão cair de vez em quando, use 20 a 50 ms antes de procurar outro problema.

## Cabeçalho Run/Idle

No sentido O→T, os dados vêm precedidos de 32 bits de cabeçalho. O bit 0 diz se o CLP está em **Run** (1) ou **Idle** (0). Com o CLP em STOP, o adapter continua recebendo pacotes, mas sabe que não deve aplicar as saídas. No T→O normalmente não há esse cabeçalho.

## Escala dos valores

Velocidade e referência viajam como inteiros de 16 bits, numa escala definida pelo fabricante. No CFW500, 8192 corresponde à frequência nominal do motor (P0403). No SCA06, 7FFFh (32767) corresponde a 18750 rpm. Valores negativos usam complemento de 2.

:::widget escala

## Quando o Forward Open é recusado

O adapter responde com status geral 0x01 e um código estendido. Os mais comuns na bancada:

| Código | Significado | O que conferir |
|---|---|---|
| 0x0100 | conexão já em uso | o CLP abriu a mesma conexão duas vezes |
| 0x0106 | conflito de dono | outro CLP já é o dono (Exclusive Owner) |
| 0x0109 | tamanho inválido | tamanho de entrada ou saída diferente do esperado |
| 0x0111 | RPI não suportado | RPI fora da faixa do EDS |
| 0x0114 | fabricante ou produto não confere | chave eletrônica: EDS de outro modelo |
| 0x0116 | revisão não confere | chave eletrônica: revisão diferente |
| 0x0117 | ponto de conexão inválido | assembly errada ou O→T e T→O trocados |
| 0x0127 / 0x0128 | tamanho O→T / T→O inválido | número de palavras diferente do configurado no equipamento |
| 0x0203 | conexão expirou | timeout: pacotes pararam de chegar |

Os simuladores do HUB devolvem esses mesmos códigos, e o log de cada um mostra o motivo em português.

Próxima aula: [O arquivo EDS](#/aprender/arquivo-eds).
