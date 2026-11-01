# Modbus TCP

> Pergunta e resposta: o cliente pede, o servidor responde. Simples, aberto e presente em quase todo equipamento industrial.

## O modelo de dados

Um servidor Modbus expõe quatro tabelas. Cada uma tem até 65.536 posições, numeradas a partir de 0 no protocolo:

| Tabela | Tamanho de cada item | Acesso | Numeração de tabela | Uso típico |
|---|---|---|---|---|
| Coils (bobinas) | 1 bit | leitura e escrita | 0xxxx (00001...) | saídas digitais, comandos |
| Entradas discretas | 1 bit | só leitura | 1xxxx (10001...) | entradas digitais |
| Input registers | 16 bits | só leitura | 3xxxx (30001...) | medições |
| Holding registers | 16 bits | leitura e escrita | 4xxxx (40001...) | parâmetros, referências |

Nos drives WEG do HUB (CFW500 e SCA06) a regra é direta: **o parâmetro Pxxxx é o holding register xxxx**, com offset zero. P0680 é o registrador 680; P0121 é o 121.

> **Atenção:** a numeração "de tabela" (40001, 40002...) começa em 1, mas o endereço que viaja no quadro começa em 0. O registrador 40001 é o offset 0. Se o seu CLP ou IHM usa base 1, P0121 vira 40122. Essa diferença de um é o erro mais comum em Modbus.

## As funções

| Função | Nome | Tabela |
|---|---|---|
| FC01 | Ler coils | coils |
| FC02 | Ler entradas discretas | entradas discretas |
| FC03 | Ler holding registers | holding registers |
| FC04 | Ler input registers | input registers |
| FC05 | Escrever 1 coil | coils |
| FC06 | Escrever 1 registrador | holding registers |
| FC15 | Escrever vários coils | coils |
| FC16 | Escrever vários registradores | holding registers |

## O quadro

Todo quadro Modbus TCP começa com um cabeçalho de 7 bytes, o **MBAP**, seguido da função e dos dados (a **PDU**). Tudo em big-endian: byte mais significativo primeiro. Mude os campos abaixo e passe o mouse sobre os bytes:

:::widget modbus-quadro

O campo **Comprimento** conta os bytes que vêm depois dele: o Unit ID mais a PDU. O **Unit ID** identifica o escravo atrás de um gateway Modbus TCP ↔ RTU; num equipamento TCP puro costuma ser 1 ou 255, e muitos servidores o ignoram.

## Quando dá errado: exceções

Se o servidor entende o pedido mas não pode atender, ele responde com a função somada a 80h e um código:

| Código | Nome | Causa comum |
|---|---|---|
| 01 | Função ilegal | o equipamento não implementa aquela função |
| 02 | Endereço ilegal | registrador inexistente, ou erro de base 0/1 |
| 03 | Valor ilegal | valor fora da faixa ou parâmetro somente leitura |
| 04 | Falha no servidor | erro interno ao executar |
| 06 | Servidor ocupado | tente de novo depois |

Se não vier resposta nenhuma, o problema é de rede (IP, porta, firewall) ou de conexão: o CFW500 e o SCA06 aceitam no máximo **2 clientes** Modbus ao mesmo tempo, como os módulos reais.

## Valores de 32 bits

Um registrador tem 16 bits. Um REAL ou um DINT ocupa dois registradores, e o protocolo **não define a ordem** entre eles. Cada fabricante escolhe: ABCD (palavra alta primeiro), CDAB (palavra baixa primeiro) e, mais raramente, as trocas de byte.

:::widget registro-32

> **Dica:** quando um valor chega absurdo (um float como 1,2e-38, um contador que salta de milhões), troque a ordem das palavras antes de procurar outro erro. Use a tabela acima para achar a ordem em que o valor faz sentido.

## Na bancada

| Simulador | Papel Modbus | O que fazer |
|---|---|---|
| CFW500 | Servidor, porta 502 (5020 sem IP próprio) | Leia P0680 (estado) e P0681 (velocidade) com FC03 |
| SCA06 | Servidor, porta 502 (5020 sem IP próprio) | Leia P0002 (velocidade) e escreva parâmetros com FC06 |
| Processo com visão 3D | **Cliente** | Crie um servidor Modbus no CODESYS: a máquina escreve 10 coils (sensores) e lê 10 entradas (atuadores) |

Próxima aula: [EtherNet/IP e CIP](#/aprender/ethernetip-cip).
