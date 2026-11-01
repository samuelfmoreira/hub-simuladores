# O arquivo EDS

> A "ficha técnica eletrônica" do equipamento: diz ao software do CLP quem ele é, que conexões aceita e quais dados troca.

## Para que serve

O **EDS** (Electronic Data Sheet) é um arquivo de texto que o fabricante entrega junto com o equipamento. Instalado no CODESYS, no Studio 5000 ou no MasterTool, ele faz o equipamento aparecer no catálogo já com as conexões, os tamanhos e os parâmetros certos. Sem EDS, dá para usar um *Generic Ethernet Module*, mas aí cada número é digitado à mão.

Cada simulador do HUB traz o seu EDS no botão *Arquivos para o CLP*, em Dispositivos.

## As seções

Abra um EDS num editor de texto. As seções mais importantes:

| Seção | O que tem |
|---|---|
| `[File]` | data, revisão do próprio arquivo |
| `[Device]` | `VendCode`, `ProdType`, `ProdCode`, `MajRev`, `MinRev`, `ProdName` |
| `[Device Classification]` | em que rede o equipamento funciona (EtherNetIP) |
| `[Params]` | parâmetros: tipo de dado, faixa, padrão, unidade |
| `[Assembly]` | as assemblies e o que tem dentro de cada uma |
| `[Connection Manager]` | as conexões possíveis: tamanhos, RPI, caminho de conexão |

Um trecho do `[Device]` do CFW500:

```
[Device]
        VendCode = 853;
        VendName = "WEG";
        ProdType = 43;
        ProdTypeStr = "Generic Device";
        ProdCode = 6656;
        MajRev = 1;
        MinRev = 10;
        ProdName = "CFW500";
```

853 é o código ODVA da WEG; 43 é o tipo "Generic Device"; a revisão é 1.10.

## Chave eletrônica

Ao abrir a conexão, o CLP manda a **chave eletrônica**: fabricante, tipo, código do produto e revisão que ele espera encontrar. O equipamento compara com a própria identidade:

| Modo no CLP | O que precisa bater |
|---|---|
| Exact Match | tudo, inclusive a revisão menor |
| Compatible Module | fabricante, tipo e código; revisão maior igual e menor maior ou igual |
| Disable Keying | nada (útil para testes, perigoso em produção) |

Se não bater, o Forward Open volta com 0x0114 (fabricante ou produto) ou 0x0116 (revisão). Isso protege a máquina: se alguém trocar o inversor por outro modelo, o CLP não começa a mandar comandos para um equipamento diferente.

## As conexões do EDS

Dentro de `[Connection Manager]`, cada conexão ocupa vários campos: gatilho e transporte, RPI, tamanhos, nome e, no fim, o caminho. No CFW500, a `Connection1` (Manufacturer Speed + I/O data) termina com:

```
                "20 04 24 01 2C 64 2C 96";
```

É o caminho de conexão que você decodificou na aula de [EtherNet/IP](#/aprender/ethernetip-cip): configuração 1, O→T 100, T→O 150. As outras conexões do mesmo arquivo usam 120/170 e 121/171 (CIP Basic e Extended Speed) e 199/150 (Listen Only).

## Os EDS da bancada

| Simulador | EDS | Observação |
|---|---|---|
| CFW500 | `eip_cfw500_ceth2_v11x.eds` (e `v10x`) | arquivo oficial WEG |
| SCA06 | `0355002B00060200_SCA06_SIM_4x4.eds` | gerado pelo simulador, **não** é o oficial |
| Keyence CV-X | `Keyence_5005_0102.eds` | arquivo oficial Keyence |

> **Nota:** no EDS da Keyence, o canal "Tool Judge Value6" aponta para o parâmetro errado. O guia do simulador explica como contornar no CODESYS.

Próxima aula: [PROFINET](#/aprender/profinet).
