# Novidades do HUB de Simuladores

As notas de cada versão aparecem no HUB quando a atualização é oferecida. Escreva a seção da versão nova antes do push.

## 1.7.3
- Assistente de comunicação com o CLP (CFW500 e SCA06): agora dá para navegar livremente. Clique em qualquer etapa na trilha do topo para ir direto a ela, use "Pular" para seguir sem gravar, ou as setas do teclado. No SCA06, o primeiro item da trilha troca entre velocidade/torque e posição.

## 1.7.2
- Inversor CFW500: o quadro da aba Rede EtherNet/IP agora se chama "Endereço IP e configurações da rede EtherNet/IP" e mostra tudo o que define a comunicação: origem do IP, endereço, máscara, gateway, taxa, palavras de troca, tamanho da conexão no CLP, se o comando vem da rede, a ação se a comunicação cair e o estado (P0801). Ele avisa quando algo foi gravado mas ainda não aplicado com P0849 = 1.

## 1.7.1
- Inversor CFW500 e Servomotor SCA06: novo "Assistente de comunicação com o CLP" (botão no topo de cada simulador). Ele configura o equipamento para a rede EtherNet/IP em etapas, na ordem de campo (IP, quem manda, palavras de troca, segurança e aplicar), explicando cada parâmetro, e a HMI do equipamento mostra cada gravação. No fim, mostra o que configurar no CLP.
- O assistente substitui os botões automáticos anteriores. Os guias explicam o assistente e o caminho parâmetro por parâmetro, lado a lado.

## 1.7.0
- Servomotor SCA06: os três modos de controle pela rede, velocidade, torque e posição. Na posição, o CLP manda o ângulo de destino ou faz o disco andar um ângulo a cada pulso.
- SCA06: botões "Preparar: velocidade e torque pela rede" e "Preparar: posição pela rede", na aba Parâmetros.
- SCA06: EDS novo, com duas conexões para escolher no CODESYS (4 palavras para velocidade e torque, 8 palavras para posição).
- SCA06: 4 missões novas de posição pela rede, incluindo "cada pulso gira 45°".
- SCA06: guia com as partes de torque e de posição, passo a passo.
- SCA06: a tela do simulador sempre conversa com o drive que o CLP enxerga, mesmo em computadores mais lentos.
- Inversor CFW500: o guia ensina a configurar o endereço IP pelos parâmetros (P0810 a P0815 e P0849), como no inversor real, pelo botão, pela HMI ou pela aba Parâmetros. O botão "Preparar para o tutorial" também grava o IP.

## 1.6.3
- Inversor CFW500 e Servomotor SCA06 saem de fábrica e podem ser configurados para a rede de dois jeitos: parâmetro por parâmetro (pela HMI ou pela aba Parâmetros, como na vida real) ou com um botão que faz tudo de uma vez.
- CFW500: novo botão "Preparar para o tutorial (CODESYS)", na aba CLP virtual.
- SCA06: novos botões "Preparar para EtherNet/IP" e "Restaurar padrão de fábrica", na aba Parâmetros.
- Guias dos dois com o passo a passo de cada caminho, tecla por tecla.

## 1.6.2
- Ajustes internos de manutenção. Nada muda no uso do HUB.

## 1.6.1
- Guia novo do Inversor CFW500: tutorial completo IHM Modbus + CODESYS + EtherNet/IP, com os prints do projeto funcionando.
- Guia novo do Servomotor SCA06: tutorial completo CODESYS + EtherNet/IP, com mapa de dados, Ladder, ST, roteiro de teste, problemas comuns e controle por torque.
- Os guias dos simuladores agora mostram imagens.

## 1.6.0
- A janela preta do HUB não fica mais aberta: o HUB roda por trás e você vê só a tela dele.
- Ao fechar a janela do HUB, ele se encerra sozinho em 20 segundos (se houver simulador aberto, espera o simulador ser parado).
- Novo botão "Sair", no topo, para encerrar o HUB e os simuladores de uma vez.

## 1.5.10
- "Procurar atualização" agora sempre responde: mostra "Procurando…" durante a busca e, depois, "Você já está na versão mais recente" com o horário, a mensagem de atualização ou o motivo do erro.

## 1.5.9
- A janela do HUB agora se chama "HUB de Simuladores de Dispositivos de Automação Industrial".

## 1.5.8
- A busca por versões novas não usa mais respostas guardadas em cache, e o HUB confere de novo 3 minutos depois de abrir. A mensagem de atualização aparece sem precisar clicar em "Procurar atualização".

## 1.5.7
- O HUB procura versões novas com mais frequência: a cada 30 minutos (antes, 6 horas) e também quando você volta para a janela dele.

## 1.5.6
- Ajuste no texto da tela Dispositivos: "Escolha um equipamento, inicie e conecte com o seu CLP."

## 1.5.5
- Botão no topo, à direita, para escolher o fundo claro ou escuro. A escolha fica guardada; sem escolha, o HUB segue o tema do Windows.

## 1.5.4
- A tela "Bancada" agora se chama "Dispositivos", no menu, no título e nas aulas.

## 1.5.3
- O simulador do SCA06 agora se chama "Servomotor WEG SCA06" (antes "Servo motor"), no cartão da Bancada e na ficha.

## 1.5.2
- Servo SCA06: divisórias arrastáveis entre o drive, o painel do meio e a bancada 3D. Arraste para mudar a largura de cada painel; dois cliques voltam ao padrão. As larguras ficam guardadas.

## 1.5.1
- Servo SCA06: as abas do painel do meio (Mestre, SCA06, Parâmetros, Missões, Rede, Bancada) aparecem inteiras em qualquer tamanho de tela.
- Aulas: em telas estreitas, o índice das aulas não fica mais grudado no topo cobrindo o conteúdo.

## 1.5.0
- Duas versões a partir do mesmo código: a do usuário final (instalada pelo HUB-Simuladores.exe) mostra só o uso do HUB; a do desenvolvedor (pasta do projeto) tem a aba Desenvolvedor.
- Atualização com mensagem: quando há versão nova, o HUB mostra "Vamos atualizar o seu HUB" e o usuário clica em OK.
- Aba Desenvolvedor: aplicar o zip do Claude, versão e notas, publicar no GitHub e link para o usuário final.

## 1.4.1
- Publicação e atualização automática pelo GitHub: cada versão nova vira um release e os HUBs instalados se atualizam ao abrir.
- Para o usuário final, um único HUB-Simuladores.exe: dois cliques e ele se instala, cria os atalhos, prepara a rede e abre, sem configurar nada.
- Para o desenvolvedor, os assistentes CONFIGURAR-GITHUB.bat e PUBLICAR-VERSAO.bat e o GUIA-DO-DESENVOLVEDOR.md.
- A chave pública não é apagada quando um zip sem ela é aplicado à mão.

## 1.4.0
- O HUB se atualiza sozinho: ao abrir, procura a versão nova, confere a assinatura e instala.
- Painel "Atualização do HUB" em Adicionar e atualizar, com a opção de instalar sozinho ao abrir.
- Pacote portátil para Windows (HUB Simuladores.exe) gerado automaticamente a cada versão.

## 1.3.1
- CFW500 1.0.1: o valor em edição na IHM pisca sem sumir e fica parado enquanto você ajusta.

## 1.3.0
- Remoto IO-Link TBEN-L (PROFINET), com modo Demonstração e instância remota na VM Linux.
- Aulas de PROFINET e IO-Link, com exercício de decodificação do PQI.

## 1.2.0
- A tela do simulador abre sozinha ao iniciar.
- Desenhos dos equipamentos nos cartões.
