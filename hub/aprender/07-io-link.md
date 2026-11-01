# IO-Link

> Um cabo comum de 3 fios entre o mestre e o sensor que, além do sinal, leva dados, parâmetros e diagnóstico. Não é uma rede: é uma ligação ponto a ponto.

## A ideia

**IO-Link** (IEC 61131-9) liga **um** device a **uma** porta do mestre, com o mesmo cabo M12 não blindado de um sensor comum, até 20 m. O mestre (o remoto TBEN-L-SIM, com 8 portas) conversa com cada device e repassa tudo ao CLP pela rede de campo (aqui, PROFINET).

```
CLP ── PROFINET ── mestre IO-Link (8 portas)
                     ├─ X0 ── esteira de entrada (C1)
                     ├─ X1 ── laser de altura (B1)
                     ├─ ...
                     └─ X7 ── torre sinaleira (H1)
```

| Modo da porta | O que é |
|---|---|
| Desativada | a porta não faz nada |
| DI / DO (SIO) | entrada ou saída digital comum, no pino 4, como um sensor sem IO-Link |
| IO-Link | comunicação digital com o device: dados, parâmetros e eventos |

Velocidades: COM1 (4,8 kbit/s), COM2 (38,4 kbit/s) e COM3 (230,4 kbit/s). O device informa a sua e um **tempo de ciclo mínimo**; o mestre pode usar um tempo maior.

## Três tipos de dados

| Tipo | Como viaja | Exemplos |
|---|---|---|
| Dados de processo | cíclicos, a cada tempo de ciclo, até 32 bytes por sentido | distância medida, velocidade, estado das válvulas |
| Parâmetros (ISDU) | acíclicos, por índice e subíndice, quando alguém pede | ponto de comutação, velocidade nominal, nome do produto |
| Eventos | quando acontecem | lente suja, faixa excedida, falha de hardware |

## Estados da porta

Ao ligar um device, a porta passa por **STARTUP** (o mestre lê a identidade do device), **PREOPERATE** (parâmetros e Data Storage) e **OPERATE** (dados de processo válidos). Erros param o caminho: sem device, curto em L+ ou erro de validação.

## PQI: a qualidade da porta

Junto com os dados de processo de cada porta, o mestre entrega ao CLP um byte **PQI** (Port Qualifier Information). O programa deve conferir o PQI **antes** de usar os dados:

| Bit | Nome | Significa |
|---|---|---|
| 7 | PQ | dados de processo válidos |
| 6 | DevCom | device comunicando em IO-Link |
| 5 | DevErr | device ou porta com erro ou aviso |
| 0 a 4 | — | reservados |

:::widget pqi

## Validação e Data Storage

Na configuração da porta (no TBEN-L-SIM, o registro 0x0200 enviado pelo CLP), você escolhe:

- **Validação:** o mestre compara o **Vendor ID** e o **Device ID** esperados com os do device ligado. Device diferente fica em erro de validação (evento 0x1802 ou 0x1803, PQ = 0), e o processo não usa dados de um sensor errado.
- **Data Storage:** o mestre guarda uma cópia dos parâmetros do device (**Backup**). Quando um device novo do mesmo tipo é ligado, o mestre grava a cópia nele (**Restore**). A troca de um sensor na manutenção fica "plug and play".

> **Atenção:** sem Data Storage, o device novo chega com os parâmetros de fábrica. No simulador, troque o laser B1 sem Data Storage: o ponto de comutação volta a 1000 mm e a célula para de detectar as caixas corretamente.

## ISDU e IOL_CALL

Cada parâmetro do device tem um **índice** (e às vezes um subíndice). Alguns são padronizados para todo device IO-Link, por exemplo 0x0010 (nome do fabricante), 0x0012 (nome do produto) e 0x0015 (número de série); os demais são de cada fabricante e estão na **IODD**, o arquivo XML que descreve o device (o equivalente IO-Link do GSDML).

O CLP acessa esses parâmetros pelo bloco padronizado **IOL_CALL**, que no PROFINET usa o registro **0xB400** do mestre. Se o valor for recusado, o device responde com um código de erro; por exemplo, **0x8030**: valor fora da faixa.

## Eventos

Os eventos têm códigos padronizados. Os da porta começam com 0x18xx; os do device dependem do tipo:

| Código | Evento |
|---|---|
| 0x1800 | sem device na porta |
| 0x1802 / 0x1803 | Vendor ID / Device ID incorreto (validação) |
| 0x1806 | curto-circuito em L+ |
| 0x5000 | falha de hardware do device |
| 0x8C20 | faixa de medição excedida |
| 0x8C40 | manutenção necessária: limpeza |

No TBEN-L-SIM, a aba **Falhas** provoca esses eventos e a aba **Eventos** mostra o histórico; com o CODESYS conectado, eles chegam como diagnóstico PROFINET.

## Na bancada

Os exercícios do `LEIA-ME.md` do simulador (em *Arquivos para o CLP*) treinam exatamente isso: trocar device com e sem Data Storage, ligar o modelo errado com e sem validação, e ler e gravar parâmetros pelo IOL_CALL.

Próxima aula: [Diagnóstico](#/aprender/diagnostico).
