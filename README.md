# HUB de Simuladores Industriais

Bancada única para escolher um equipamento simulado, colocá-lo na rede e treinar a integração com o CLP. Inclui aulas de redes, Modbus TCP, EtherNet/IP, PROFINET e IO-Link.

Há duas formas de receber o HUB:

| | Usuário final | Desenvolvedor (você) |
|---|---|---|
| Recebe | um arquivo: `HUB-Simuladores.exe` | esta pasta do projeto |
| Faz | baixa e abre | publica versões novas |
| Configura | nada | só o GitHub, uma vez |

## Para o usuário final

1. Baixe o **`HUB-Simuladores.exe`**. O link fixo sempre entrega a versão mais recente: `https://github.com/SEU-USUARIO/hub-simuladores/releases/latest/download/HUB-Simuladores.exe`.
2. Dê dois cliques nele. Na primeira vez:
   - ele se instala sozinho na pasta do usuário (`%LOCALAPPDATA%\HUB-Simuladores`), sem pedir administrador;
   - cria o atalho **HUB de Simuladores** na Área de Trabalho e no Menu Iniciar;
   - abre o HUB e prepara a rede virtual dos simuladores (o Windows pede permissão uma vez).
3. Nas vezes seguintes, use o atalho.

**Atualizações:** quando o desenvolvedor publica uma versão nova, o HUB mostra ao abrir a mensagem **"Vamos atualizar o seu HUB"**, com o que muda. O usuário clica em **OK, atualizar agora** e em menos de um minuto o HUB volta atualizado, mantendo IPs, configurações e parâmetros salvos. Se clicar em **Depois**, o aviso fica no topo da tela até ele atualizar.

O usuário vê só o uso do HUB (Dispositivos, Rede virtual e Aprender). As funções de desenvolvimento não existem na versão dele.

**Avisos do Windows:** o `.exe` não tem assinatura digital de empresa. Na primeira vez pode aparecer "O Windows protegeu o computador": clique em **Mais informações** > **Executar assim mesmo**. Se o Firewall perguntar, clique em **Permitir acesso**.

**Desinstalar:** feche o HUB, apague a pasta `%LOCALAPPDATA%\HUB-Simuladores` (cole esse endereço na barra do Explorador de Arquivos) e os dois atalhos.

## Para o desenvolvedor (você)

O passo a passo completo, em linguagem simples, está no **GUIA-DO-DESENVOLVEDOR.md**. Na pasta do projeto você usa três arquivos:

| Arquivo | Quando |
|---|---|
| `CONFIGURAR-GITHUB.bat` | uma vez: instala o que faltar, gera a chave de assinatura, guia você pelas telas do GitHub e envia o projeto |
| `HUB-DESENVOLVEDOR.bat` | sempre: abre o HUB com a aba **Desenvolvedor**, onde você aplica o zip que o Claude entregar, testa, ajusta versão e notas e publica no GitHub. Roda sem janela preta (mensagens em `hub.log`); para ver as mensagens ao vivo, rode `HUB-DESENVOLVEDOR.bat janela` |
| `PUBLICAR-VERSAO.bat` | alternativa sem abrir o HUB: arraste o zip em cima dele e ele aplica e publica |

Ao receber uma versão nova, o GitHub Actions (`.github/workflows/publicar.yml`) monta, assina e cria o release `v<versão>` com o `HUB-Simuladores.exe` (para instalações novas), o pacote de atualização e o `versao.json` (para os HUBs instalados). Se o número da versão (`hub/package.json`) não mudou, nada é publicado.

> **Atenção:** perder ou trocar a chave privada (`construir/chave-privada.pem`) quebra a atualização automática dos HUBs já instalados. Guarde uma cópia.

## Simuladores incluídos

| Simulador | Protocolos | IP padrão | Tela |
|---|---|---|---|
| Inversor WEG CFW500 | EtherNet/IP adapter, Modbus TCP servidor | 192.168.100.20 | 8080 |
| Visão Keyence CV-X400 | EtherNet/IP adapter | 192.168.100.21 | 3001 |
| Servomotor WEG SCA06 | EtherNet/IP adapter, Modbus TCP servidor | 192.168.100.22 | 3000 |
| Processo com visão 3D | Modbus TCP cliente | (cliente) | 3000 → 3100 se ocupada |
| Remoto IO-Link TBEN-L | PROFINET device, mestre IO-Link | IP via DCP (CODESYS) | 8081 |

O CLP / CODESYS fica em **192.168.100.10**.

O TBEN-L tem dois modos, escolhidos no detalhe do simulador:
- **Demonstração (sem PROFINET):** roda no próprio Windows. Inclui a planta 3D, o mestre IO-Link, o CLP demo e o modo manual.
- **PROFINET real (p-net):** só numa VM Linux com placa host-only, como root. O HUB guarda o endereço da VM, verifica se ela está no ar e abre a tela de lá.

Detalhes no guia do simulador e na aula de PROFINET.

## Adicionar um simulador novo

Leia `modelo-simulador/CONTRATO.md`. Em resumo: uma ficha `simulador.json` (com a ilustração em `"icone"`) e o programa lendo `SIM_HTTP_PORT` e `SIM_IP` (e `SIM_<VARIAVEL>` se precisar).

## Estrutura

No PC do usuário final (`%LOCALAPPDATA%\HUB-Simuladores`):

```
HUB Simuladores.exe   o HUB (Node embutido); as atualizações trocam os arquivos ao lado dele
hub/  simuladores/  rede/  runtime/  canal.json  hub-config.json  backups/
```

Pasta do projeto (desenvolvedor):

```
CONFIGURAR-GITHUB.bat  HUB-DESENVOLVEDOR.bat  PUBLICAR-VERSAO.bat
GUIA-DO-DESENVOLVEDOR.md  README.md  NOVIDADES.md (notas de cada versão, aparecem no HUB)
hub/                  servidor, tela (public/), aulas (aprender/), atualizador, chave-publica.pem
simuladores/          um simulador por pasta, cada um com simulador.json
rede/                 rede-hub.ps1 (Windows) e rede-hub.sh (Linux)
modelo-simulador/     CONTRATO.md (como criar um simulador novo)
construir/            montagem do .exe (construir.js, publicar.js), assistentes (publicacao/), chaves
.github/workflows/    publicação automática (GitHub Actions)
```

Para gerar o `HUB-Simuladores.exe` no seu PC sem passar pelo GitHub: `node construir/construir.js` (sai em `construir/dist/`; essa cópia não procura atualizações).

## Alterações feitas nos simuladores originais

Todas marcadas com `[HUB]` no código. Mantenha nas suas cópias principais:

| Simulador | Alteração |
|---|---|
| CFW500 | o CLP virtual usa o IP do adapter quando o campo está em 127.0.0.1 |
| SCA06 | lê `SIM_HTTP_PORT`, `SIM_IP` e `SIM_MODBUS`; Modbus no IP do adapter; ListIdentity informa o IP certo; CLP virtual usa o IP do adapter |
| Keyence CV-X400 | lê `SIM_HTTP_PORT`; sem `config_cameras.json`, a câmera 1 usa `SIM_IP` |
| Processo com visão 3D | lê `SIM_HTTP_PORT` |

## Pontos de atenção

- **CODESYS:** desmarque *Ajustar configurações do sistema operacional* no dispositivo Ethernet, senão ele apaga os IPs dos simuladores. Use T→O ponto a ponto (multicast não circula na placa virtual).
- **Placas antigas:** o `CFW500-Rede` e o `SIM_VISAO`, criados pelos .bat de cada simulador, usam a mesma faixa. Use *Migrar redes antigas* na aba Rede e não rode mais aqueles .bat.
- **Keyence:** programas criados ou editados na câmera não são gravados em disco; voltam ao padrão (041 e 042) ao reiniciar.
- **SCA06:** o CLP virtual pode dar timeout se for acionado no primeiro segundo depois de iniciar; com o uso normal da tela, conecta.

## O que ainda precisa de teste no Windows

Testado aqui:
- o caminho do usuário final, com o mesmo mecanismo do `.exe` (versão para Linux): baixar, abrir, instalar sozinho em 4 s, abrir o HUB sem assistente, rodar simuladores sem Node no PC e, na abertura seguinte, receber uma versão nova sozinho;
- o `.exe` do Windows gerado com o `node.exe` oficial: ícone, versão e o HUB embutido;
- a atualização com dados preservados e a recusa de pacotes alterados ou assinados por outra chave;
- os assistentes do desenvolvedor, com um repositório local no lugar do GitHub.

Falta testar no seu ambiente:
- **No Windows:** abrir o `.exe`, os atalhos, a permissão para a rede virtual, o reinício após a atualização e a janela do Edge.
- **No GitHub:** o login, o workflow em si e o caminho com token para repositório privado.
