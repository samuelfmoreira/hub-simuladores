# Contrato do HUB

> O que um simulador precisa ter para entrar na bancada, rodar junto com os outros e ser atualizado por .zip.

## Resumo

Um simulador do HUB é uma pasta com:

| Item | Obrigatório | Para que serve |
|---|---|---|
| `package.json` | sim | nome do pacote (identifica o simulador nas atualizações), versão, dependências |
| `simulador.json` | recomendado | a ficha: nome, protocolos, porta da tela, IP, portas, EDS, guia |
| `server.js` (ou outro) | sim | o programa; deve ler as variáveis abaixo |
| `README.md` | recomendado | o guia que aparece no botão *Guia* |
| arquivo `.eds` | se for EtherNet/IP | aparece em *Arquivos para o CLP* |

## Variáveis que o HUB envia

Ao iniciar o simulador, o HUB define estas variáveis de ambiente:

| Variável | Exemplo | O simulador deve |
|---|---|---|
| `HUB` | `1` | saber que foi iniciado pelo HUB (opcional) |
| `SIM_HTTP_PORT` | `8080` | abrir a tela nesta porta |
| `SIM_IP` | `192.168.100.20` ou `0.0.0.0` | prender os servidores (EtherNet/IP, Modbus...) neste IP |
| `SIM_<VARIAVEL>` | `SIM_MODBUS=502` | uma para cada item de `variaveis` da ficha |

O jeito mais simples de seguir o contrato:

```
const PORTA_WEB = Number(process.env.SIM_HTTP_PORT) || 3000;
const IP = process.env.SIM_IP || '0.0.0.0';
const PORTA_MODBUS = Number(process.env.SIM_MODBUS) || 502;

servidorWeb.listen(PORTA_WEB);
servidorModbus.listen(PORTA_MODBUS, IP);
```

Se preferir argumentos de linha de comando, use marcadores na ficha: `"args": ["server.js", "--ip", "{ip}", "--http", "{http}"]`. O HUB troca `{ip}`, `{http}` e `{nome-da-variavel}` pelos valores.

> **Atenção:** tudo que for servidor (EtherNet/IP, Modbus TCP, outro protocolo) precisa escutar em `SIM_IP`, e não em `0.0.0.0` fixo. É isso que permite vários equipamentos com a mesma porta no mesmo PC. A tela web pode escutar em todas as placas.

Também ajuda:

- escrever as mensagens no console (`console.log`): elas aparecem em *Mensagens do simulador*;
- gravar dados do usuário numa pasta `data/` e listar essa pasta em `preservarAoAtualizar`;
- se o simulador tiver um "CLP virtual" interno, conectar no `SIM_IP` em vez de `127.0.0.1`.

## A ficha `simulador.json`

```
{
  "id": "meu-equipamento",
  "nome": "Fabricante Modelo",
  "fabricante": "Fabricante",
  "tipo": "Inversor de frequência",
  "versao": "1.0.0",
  "descricao": "Uma ou duas frases sobre o que o simulador faz.",
  "protocolos": ["Modbus TCP"],
  "papel": "Servidor Modbus TCP",
  "iniciar": { "comando": "node", "args": ["server.js"] },
  "web": { "porta": 3200, "caminho": "/" },
  "rede": {
    "precisaIp": true,
    "ipSugerido": "192.168.100.30",
    "portas": [ { "proto": "tcp", "porta": "{modbus}", "uso": "Modbus TCP" } ],
    "seSemIp": { "modbus": 5021 }
  },
  "variaveis": { "modbus": 502 },
  "arquivos": { "guia": "README.md", "eds": [] },
  "preservarAoAtualizar": ["data/"],
  "aprender": ["modbus-tcp"],
  "cor": "#2C6CB0",
  "icone": "inversor"
}
```

| Campo | Explicação |
|---|---|
| `id` | identificador único, sem espaços; não mude depois de publicar |
| `iniciar` | comando e argumentos; `"node"` usa o Node do HUB (inclusive no executável) |
| `web.porta` | porta preferida da tela; se estiver ocupada, o HUB escolhe outra e avisa |
| `rede.precisaIp` | `true` para quem atende conexões (adapter, servidor); `false` para cliente |
| `rede.ipSugerido` | IP padrão na rede virtual; use a faixa 192.168.100.20 a .99 |
| `rede.portas` | portas que o simulador abre; o HUB verifica conflitos antes de iniciar |
| `rede.descricaoIp` | opcional, para quem não usa IP do HUB: texto mostrado no lugar do IP (ex.: "IP gravado pelo CLP via DCP") |
| `rede.seSemIp` | valores de variáveis quando não houver IP próprio (ex.: Modbus 502 → 5020) |
| `variaveis` | valores padrão enviados como `SIM_<NOME>` |
| `preservarAoAtualizar` | arquivos e pastas mantidos ao importar uma versão nova |
| `aprender` | aulas relacionadas, pelo id (`modbus-tcp`, `ethernetip-cip`, `arquivo-eds`, `redes-ip`, `diagnostico`) |
| `cor` | cor de destaque do cartão e da ilustração |
| `modos` | opcional: jeitos de iniciar, escolhidos na tela. Lista de `{ "id", "nome", "args", "plataformas": ["win32", "linux"], "requerRoot", "observacao" }`. Modos de outro sistema aparecem desativados. Ex.: TBEN-L com "Demonstração" e "PROFINET real" |
| `remoto` | opcional: instância rodando em outra máquina (ex.: VM Linux). `{ "titulo", "texto", "urlPadrao" }`; o HUB guarda o endereço, verifica se está no ar e abre a tela |
| `icone` | desenho do cartão: o nome de um arquivo `.png`/`.svg` da pasta do simulador (ex.: `"icone.png"`, fundo transparente; o CFW500 e o SCA06 usam o desenho da própria tela) ou uma ilustração do HUB: `inversor`, `servo`, `visao` (controlador com câmera), `processo`, `remoto-io` (bloco de I/O IP67), `modbus`, `clp`, `ihm`, `robo`, `sensor`, `generico`. Sem o campo, o HUB escolhe pelo `tipo`. O arquivo é mantido nas atualizações por .zip |

## IPs já usados

| IP | Equipamento |
|---|---|
| 192.168.100.10 | CLP / CODESYS |
| 192.168.100.20 | CFW500 |
| 192.168.100.21 | Keyence CV-X (câmera 1) |
| 192.168.100.22 | SCA06 |
| 192.168.100.23 | TBEN-L (EtherNet/IP) |
| — | Sistema de Incêndio + Soft SSW-05: cliente Modbus TCP, não ocupa IP (conecta no CLP) |

## Publicar e atualizar

1. Compacte a pasta do simulador num .zip (sem `node_modules` e sem `data/`).
2. No HUB: *Adicionar e atualizar*, solte o .zip.
3. Mesmo `id` (ou mesmo `name` no `package.json`): vira atualização, com backup. Caso contrário, entra como simulador novo.
