# TBEN-L-SIM

Simulador de um remoto IO-Link de 8 portas no estilo Turck TBEN-L, que fala **PROFINET de verdade** com o CODESYS Control Win e comanda uma célula de paletização 3D.

Não é um produto Turck nem usa o GSDML da Turck: o device tem identidade própria (TBEN-L-SIM), com o mesmo tipo de organização por portas.

## Arquitetura

```
Windows                                   VM Linux (VirtualBox)
┌─────────────────────────┐               ┌───────────────────────────────────────────┐
│ CODESYS Control Win     │  PROFINET RT  │ pn-driver/bin/tben-pn-driver (C, p-net)   │
│  PROFINET IO Controller ├───────────────┤  device "tben-l-sim", slots 1..8 = X0..X7 │
│  (adaptador host-only)  │  rede virtual │            │ UDP 127.0.0.1:50100/50101    │
│                         │               │ src/server.js (Node.js)                   │
│ Navegador ──────────────┼─── HTTP/WS ───┤  planta, devices IO-Link, ISDU, falhas    │
└─────────────────────────┘     :8080     └───────────────────────────────────────────┘
```

- **pn-driver/**: driver PROFINET. É o app de exemplo do p-net v0.2.0 com três arquivos trocados. `app_gsdml.*` define os 8 módulos, e `app_data.c` faz a ponte UDP, os diagnósticos e o gateway ISDU.
- **src/core/portmap.js**: fonte única do mapa de I/O. O GSDML, a tela e a simulação saem daqui. Se mudar tamanhos aqui, mude também `in_size`/`out_size` em `pn-driver/src/app_data.c`.
- **src/core/sim.js**: física da célula e comportamento dos devices (PQI, falhas travadas, ISDU).
- **src/core/demo-plc.js**: CLP interno para testar sem CODESYS. O programa equivalente em ST fica em `codesys/`.
- **public/**: cena 3D e painel do módulo. Funciona offline, porque o three.js vem do `node_modules`.

## Mestre IO-Link simulado

O PROFINET entre o CODESYS e o TBEN-L-SIM é real. O lado IO-Link (do mestre até cada device) é simulado dentro do servidor, porque IO-Link é ponto a ponto num cabo de 3 fios e não existe como rede. O que o mestre simulado faz:

- **Estados de porta:** desativada, sem device, STARTUP, PREOPERATE, OPERATE, erro de validação e curto em L+. O PQI segue o estado.
- **Configuração de porta:** modo, validação, Data Storage e tempo de ciclo. Vem do CLP pelo registro 0x0200 de cada porta ou, sem CLP, da aba Porta da tela.
- **Validação de device:** compara Vendor ID e Device ID esperados com os do device conectado.
- **Data Storage:** guarda os parâmetros do device e restaura num device novo do mesmo tipo.
- **Eventos IO-Link com códigos padrão**, enviados ao CLP como diagnóstico PROFINET.
- **IOL_CALL no registro 0xB400** para ler e gravar parâmetros ISDU.
- **Troca de device:** por um novo do mesmo modelo ou por um modelo parecido, para treinar validação e Data Storage.

Veja os exercícios sugeridos em `codesys/LEIA-ME.md`.

## Modos de controle

| Modo | Quem comanda as saídas | Precisa de |
|---|---|---|
| CLP demo | lógica interna do simulador | nada |
| Manual | você, pela aba Dados de processo | nada |
| CODESYS | o controlador PROFINET | driver rodando e AR ativa |

No modo CODESYS, as saídas ficam zeradas (estado seguro) enquanto a AR não está ativa ou quando o controlador manda IOPS ruim.

## Rede virtual no VirtualBox

1. **Arquivo > Ferramentas > Network Manager > Host-only Networks**: crie uma rede (ex.: 192.168.56.1/24) e **desative o servidor DHCP** dela. Quem atribui o IP do device é o CODESYS, via DCP.
2. Na VM:
   - **Adaptador 1:** NAT, com redirecionamento de porta 8080 → 8080 se quiser abrir em `localhost:8080`.
   - **Adaptador 2:** host-only, na rede acima, com **Modo promíscuo: Permitir tudo**. Essa placa é exclusiva do PROFINET.
3. Na VM (Ubuntu 22.04/24.04 ou Debian 12), garanta que o adaptador 2 fica sem IP e sem DHCP no netplan.

## Instalação na VM

```bash
unzip tben-l-sim.zip && cd tben-l-sim
sudo ./scripts/setup-vm.sh enp0s8     # troque pelo nome real da 2ª placa (veja: ip link)
sudo npm start                         # precisa de root: Ethernet bruta e ajuste de IP
```

Abra `http://IP-DA-VM:8080` no Windows. Para iniciar junto com a VM, rode `sudo ./scripts/install-service.sh`.

**Sem PROFINET**, só a planta com o CLP demo, inclusive no Windows: `npm install` e depois `npm run start:demo`.

## CODESYS

Siga `codesys/LEIA-ME.md`: Npcap, instalação do GSDML, árvore de dispositivos, mapeamento de I/O e o programa ST pronto (`PRG_Paletizador`).

## Comandos úteis

| Comando | O que faz |
|---|---|
| `npm run test:sim` | 12 testes acelerados: ciclo, falhas, validação, Data Storage, eventos, tempo de ciclo e IOL_CALL |
| `npm run gsdml` | regenera o GSDML a partir do `portmap.js` |
| `npm run build:driver` | recompila o driver PROFINET |
| `config.json` | interface, nome de estação, porta HTTP, modo inicial |

## Estado do projeto

**Verificado:**
- O driver compila contra o p-net v0.2.0.
- A ponte UDP troca dados com o Node a cerca de 250 Hz.
- O IOL_CALL responde leituras e recusa escritas fora da faixa com 0x8030.
- Validação, Data Storage, eventos e tempo de ciclo passam nos 12 cenários de `npm run test:sim`.
- O GSDML é XML válido, e seus tamanhos batem com o driver.
- A planta completa pallets sem perder caixas com caixas de 250, 300 e 350 mm.

**Ainda não verificado:** a conexão real com o CODESYS Control Win. Os pontos mais prováveis de ajuste são estes:
- a importação do GSDML (se as listas de valores derem erro, gere sem elas com `GSDML_SEM_LISTAS=1 npm run gsdml`);
- o envio do registro 0x0200 na partida;
- a ordem de bytes dos valores de 16 bits (veja `xTrocarBytes`);
- o formato exato do IOL_CALL esperado pelo bloco do CODESYS.

Para aceitar o registro 0xB400, o `build.sh` aplica um patch pequeno no p-net, que por padrão só repassa à aplicação registros até 0x7FFF.

## Licenças

O driver usa a pilha **p-net** da RT-Labs, licenciada em GPLv3 (uso comercial exige licença deles). O Vendor ID 0x0493 do GSDML pertence à RT-Labs e serve apenas para laboratório.
