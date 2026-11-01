# Como o laboratório funciona

> O CLP conversa com equipamentos simulados exatamente como conversaria com os reais: mesma rede, mesmos protocolos, mesmos arquivos EDS.

## As três peças

Todo exercício da bancada tem as mesmas três peças:

| Peça | Quem é | O que faz |
|---|---|---|
| CLP | CODESYS Control Win no mesmo PC, ou um CLP real ligado no cabo | Comanda o processo: lê sensores, escreve saídas, fecha a lógica |
| Rede | A placa virtual **SIM-HUB** (ou a placa física, com CLP real) | Dá um IP para cada participante, como um switch |
| Equipamento | Um simulador do HUB: inversor, servo, câmera, máquina | Responde ao CLP como o equipamento real responderia |

```
  CLP / CODESYS               placa SIM-HUB                 simuladores
  192.168.100.10  ────────────────┬───────────────────  192.168.100.20  CFW500
                                  ├───────────────────  192.168.100.21  Keyence CV-X
                                  └───────────────────  192.168.100.22  SCA06
```

## Quem chama quem

Antes de configurar qualquer coisa, descubra o **papel** de cada lado. Ele está escrito na ficha de cada simulador, na Bancada.

| Protocolo | Quem inicia (chama) | Quem responde (atende) |
|---|---|---|
| EtherNet/IP | **Scanner** (o CLP) | **Adapter** (o equipamento) |
| Modbus TCP | **Cliente** | **Servidor** |

No EtherNet/IP o CLP sempre é o scanner: é ele que abre a conexão com o CFW500, o SCA06 e a câmera. No Modbus TCP depende do equipamento: o CFW500 e o SCA06 são **servidores** (o CLP lê e escreve neles), mas o *Processo com visão 3D* é **cliente**: a máquina é que conecta no servidor Modbus do CLP.

> **Nota:** "servidor" e "cliente" não dizem quem manda no processo. Dizem só quem abre a conexão de rede. Um CLP pode ser servidor Modbus e continuar sendo o cérebro da máquina.

## Roteiro de um exercício

1. **Rede virtual pronta** (aba Rede). Faça uma vez por PC.
2. **Inicie o simulador** na Bancada. Anote o IP que aparece no cartão e confira que o indicador ao lado dele ficou verde.
3. **Baixe o EDS** do simulador (botão em *Arquivos para o CLP*) e instale no repositório do CODESYS.
4. **Configure o CLP**: placa SIM-HUB, IP do CLP, equipamento com o IP do simulador.
5. **Faça o download e vá para RUN.** Acompanhe as *Mensagens do simulador*: a sessão, o Forward Open e o I/O aparecem ali.
6. **Teste pela tela do simulador**: mude um valor no CLP e veja o equipamento reagir; mude algo no equipamento e veja chegar no CLP.

## Os indicadores dos cartões

Cada equipamento da Bancada aparece num cartão com a ilustração do dispositivo e dois indicadores:

| Onde | Verde | Âmbar | Vermelho | Cinza |
|---|---|---|---|---|
| Selo sobre a ilustração | em execução | iniciando ou instalando | terminou com erro | parado |
| Ao lado do IP | em execução no IP próprio | em execução em todas as placas (sem IP próprio) | — | parado |

Com o indicador do IP em âmbar o simulador funciona, mas ocupa as portas 44818 e 2222 de **todas** as placas do PC. Por isso só um equipamento EtherNet/IP roda por vez nessa situação. A rede virtual resolve.

Próxima aula: [Redes IP para automação](#/aprender/redes-ip).
