# CODESYS Control Win + TBEN-L-SIM

## 1. Preparar o Windows
- Instale o Npcap, marcando a opção de compatibilidade com a API do WinPcap. O CODESYS Control Win usa essa camada para falar PROFINET; confira na documentação da sua versão do CODESYS se ela exige essa opção.
- Confirme o IP do adaptador host-only do VirtualBox no Windows (padrão: 192.168.56.1). Ele será o IP do controlador.

## 2. Instalar o GSDML
- Abra http://IP-DA-VM:8080 e clique em **Baixar GSDML**, ou copie o arquivo da pasta `gsdml/` do projeto.
- No CODESYS: Ferramentas > Repositório de dispositivos > Instalar, e escolha o arquivo `GSDML-V2.4-Simulab-TBEN-L-SIM-*.xml`.

## 3. Montar a árvore de dispositivos
1. Clique com o botão direito em Device > Adicionar dispositivo > **Ethernet Adapter**. Na aba Geral, escolha a interface do adaptador host-only.
2. Sob o Ethernet, adicione **PROFINET IO Controller**.
3. Sob o controlador, adicione **TBEN-L-SIM 8IOL**. Os 8 módulos (X0 a X7) entram sozinhos nos slots 1 a 8, porque são fixos no GSDML.
4. No device, defina o nome de estação `tben-l-sim` e um IP livre na mesma rede, por exemplo 192.168.56.50. O gateway pode ficar como estiver: o simulador ignora esse valor de propósito, para não mexer na rota da VM.
5. Com o simulador rodando na VM, use **Scan** no controlador para ver o device. Se o nome não aparecer, atribua o nome pelo diálogo de busca.

## 4. Importar o programa
- Crie a GVL `GVL_TBEN` com o conteúdo de `GVL_TBEN.st`.
- Crie os DUTs `E_Estado` e `E_Passo` e as funções `F_U16`, `F_W16` e `F_PortaOk` de `Tipos_e_Funcoes.st`.
- Crie o programa `PRG_Paletizador` com `PRG_Paletizador.st` e chame-o na MainTask (ciclo de 4 a 10 ms).
- Em cada módulo X0 a X7, na aba de mapeamento de I/O, ligue cada canal à variável de mesmo nome da GVL. Os canais seguem a ordem de bytes da tabela abaixo.

| Slot | Módulo | Entradas (bytes) | Saídas (bytes) |
|---|---|---|---|
| 1 | X0 C1 esteira de entrada | Status, Velocidade, PQI | Controle, Velocidade |
| 2 | X1 B1 laser de altura | Distância (2), Flags, Qualidade, PQI | |
| 3 | X2 Y1 válvulas | Status, PQI | Válvulas |
| 4 | X3 K1 hub | Byte 0, Byte 1, PQI | |
| 5 | X4 M1 inversor | Status, Código de falha, Velocidade (2), PQI | Controle, Reservado, Velocidade (2) |
| 6 | X5 B2 laser do elevador | Distância (2), Flags, Qualidade, PQI | |
| 7 | X6 C2 esteira de saída | Status, Velocidade, PQI | Controle, Velocidade |
| 8 | X7 H1 torre | PQI | Lâmpadas |

## 5. Testar
- Na tela do simulador, mude o modo para **CODESYS**. O LED BUS fica verde quando a AR PROFINET sobe.
- Faça login e rode o programa. Pressione Rearmar e depois Partir na tela do simulador.
- Se a distância do laser vier com valor absurdo (800 mm aparecendo como 8195), mude `xTrocarBytes` para TRUE na GVL.

## 6. Configuração das portas IO-Link (registro 0x0200)
Cada módulo X0 a X7 tem o parâmetro **Configuração da porta IO-Link**, que o CODESYS envia ao device na partida da conexão. Ele fica na aba de parâmetros do módulo.

| Campo | Valores |
|---|---|
| Modo da porta | Desativada ou IO-Link |
| Validação e Data Storage | Sem verificação; Tipo compatível; Tipo compatível com Backup + Restore (padrão); Tipo compatível com Restore |
| Tempo de ciclo | em ms; 0 usa o mínimo do device (2 ms) |
| Vendor ID esperado | 1952 (0x07A0) para todos os devices do simulador |
| Device ID esperado | já vem com o ID do device original de cada porta |

Com o CODESYS conectado, a tela do simulador mostra a configuração, mas não deixa alterar: quem manda é o CLP. Sem o CODESYS, a configuração é feita na aba Porta da tela.

**Exercícios sugeridos:**
- Troque o B1 (X1) por um "novo do mesmo modelo". Com Backup + Restore, o SP1 volta para 750 mm e a célula segue. Repita com "Tipo compatível" sem Data Storage: o sensor novo fica com SP1 de fábrica (1000 mm), passa a "ver" caixa o tempo todo e o ciclo se perde.
- Troque o B2 (X5) pelo LDS-1500. Com validação, a porta fica em erro de validação (evento 0x1803, PQ = 0). Sem validação, ele entra, mas não mede acima de 1500 mm e acusa faixa excedida (0x8C20).
- Troque o hub K1 (X3) pelo DI8: só existem 8 entradas, então "emergência OK" (I9) nunca chega e o CLP fica em emergência.

## 7. Diagnóstico e eventos IO-Link
Os eventos IO-Link de cada porta viram diagnóstico de canal PROFINET no submódulo da porta. O **código do evento IO-Link vai no valor adicional** (ExtChannelAddValue) do diagnóstico.

| Evento IO-Link | Origem | Erro de canal PROFINET |
|---|---|---|
| 0x1800 Sem device | porta | 0x0006 ruptura de fio |
| 0x1806 Curto em L+ | porta | 0x0001 curto-circuito |
| 0x1802 / 0x1803 Vendor ID / Device ID incorreto | porta | 0x0010 erro de parametrização |
| 0x4000 Sobrecarga (rolo) | device | 0x0004 sobrecarga |
| 0x5000 Falha de hardware (inversor) | device | 0x0009 erro |
| 0x8C00 Falha da aplicação (sem ar) | device | 0x0009 erro |
| 0x8C20 Faixa de medição excedida | device | 0x0009 erro |
| 0x8C40 Manutenção: limpeza (lente suja) | device | 0x0009 erro |
| 0xFF91 Pedido de upload do Data Storage | device | só notificação, sem diagnóstico |

O histórico completo de eventos de cada porta fica na aba **Eventos** da tela. O programa também pode reagir pelo PQI: PQ = 0 quando a porta não está em OPERATE, DevErr = 1 quando há evento de erro ou aviso do device.

## 8. Parâmetros ISDU pelo CLP: IOL_CALL (registro 0xB400)
O acesso acíclico usa o IOL_CALL: escreva o pedido no registro **0xB400** e depois leia a resposta no mesmo registro. O simulador aceita o registro em qualquer submódulo (DAP no slot 0 ou portas nos slots 1 a 8). A porta vem dentro do pedido e vai de **1 a 8** (X0 = porta 1, X7 = porta 8).

**Pedido:**

| Byte | Conteúdo |
|---|---|
| 0 | 0x08 (função estendida) |
| 1 | porta IO-Link, 1 a 8 |
| 2 e 3 | FI_Index = 65098 (0xFE4A) |
| 4 | controle: 0x02 ler, 0x03 escrever |
| 5 e 6 | índice ISDU |
| 7 | subíndice (use 0) |
| 8 em diante | dados, só na escrita |

**Resposta:** o mesmo cabeçalho de 8 bytes. Em caso de sucesso, o byte 4 repete o controle e, na leitura, os dados começam no byte 8. Em caso de erro, o byte 4 vale 0x80 e os bytes 8 e 9 trazem o código: 0x8011 (índice inexistente), 0x8023 (somente leitura), 0x8030 (valor fora da faixa) ou 0x8000 (porta sem comunicação). Se a leitura vier logo após a escrita e falhar, repita-a: a resposta pode ainda não estar pronta.

Os números são UINT16 big-endian, os contadores UDINT e os textos UTF-8. Uma escrita bem-sucedida também atualiza o Data Storage quando a porta está em "Backup + Restore".

O bloco IOL_CALL ou os blocos de leitura e escrita de registro (RDREC/WRREC) variam entre versões do CODESYS, por isso este exemplo não traz o bloco pronto. A estrutura acima segue o IOL_CALL, mas ainda não foi validada contra o bloco do CODESYS.
