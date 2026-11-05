# Novidades do HUB de Simuladores

As notas de cada versão aparecem no HUB quando a atualização é oferecida. Escreva a seção da versão nova antes do push.

## 1.10.6
- Ordem dos cartões em Dispositivos: o Sistema de Incêndio + Soft SSW-05 fica por último. A ficha dos simuladores ganhou o campo opcional "ordem" (menor primeiro; sem o campo, a ordem alfabética continua).

## 1.10.5
- Cartão do Sistema de Incêndio + Soft SSW-05 no mesmo estilo dos outros: desenho da casa de bombas (bomba, motor, manômetro, registro e chama) com a soft-starter SSW-05 ligada ao motor, sobre fundo claro. Embaixo, "cliente, sem IP próprio", como no Processo 3D.

## 1.10.4
- Sistema de Incêndio + Soft SSW-05 atualizado para a versão 1.9.3: cada sessão (bancada) tem o seu próprio CLP virtual de teste; se a porta 502 estiver ocupada, o simulador escolhe sozinho a próxima livre e preenche IP e porta. O simulador também não deixa duas sessões conectarem no mesmo CLP.

## 1.10.3
- Sistema de Incêndio + Soft SSW-05 atualizado para a versão 1.9.2: na casa de bombas 3D, manômetro, PJ e PB ganharam um rótulo único ("Instrumentos") acima deles, que mostra a pressão e o estado dos pressostatos sem cobrir os instrumentos.

## 1.10.2
- Sistema de Incêndio atualizado para a versão 1.9.0 (novo nome: Simulador Sistema de Incêndio; SP02 é o exercício). Novidades: botão Enunciado com a Situação-Problema 02 (páginas, diagrama elétrico, ficha do pressostato e tabela de variáveis) e endereçamento do Altus XP325 (I00, I17…).
- Cartão novo: "Sistema de Incêndio + Soft SSW-05", com um ícone que junta a casa de bombas (chama, bomba, motor, manômetro e registro) e a soft-starter SSW-05 ligada ao motor.

## 1.10.1
- Sistema de incêndio SP02 atualizado para a versão 1.7.9: gráfico de pressão redesenhado e, no guia, o Passo 11 virou um roteiro de simulação de falhas (SSW-05, pressostatos e jockey), com como provocar, o que observar e como corrigir cada falha.

## 1.10.0
- Novo dispositivo: Sistema de incêndio SP02. Simula a casa de bombas de um sistema de prevenção e combate a incêndio, que mantém a rede pressurizada e responde sozinho a emergências: bomba jockey, principal e reserva, duas soft-starters WEG SSW-05 Plus, pressostatos KP, painel de operação, quadro elétrico e casa de bombas em 3D. É cliente Modbus TCP: conecta no CLP (CODESYS na SIM-HUB: 192.168.100.10, porta 502) e traz um CLP virtual de teste.
- Guia do SP02 no botão Guia, com uma parte "No HUB" (qual IP usar para cada CLP) e o passo a passo completo do simulador.

## 1.9.0
- Servomotor SCA06 segue o firmware V2.1X e funciona só por controle via rede. Velocidade e torque continuam pelas palavras fixas (P0202 = 6). A posição passa a ser pela Função Posicionador do drive (P0202 = 3): movimentos programados em parâmetros, habilitados, disparados e com destino escritos pelo CLP nas palavras 5 a 8, sem programar ladder.
- O aplicativo ladder didático DISCO_POS saiu (no drive real, o ladder é feito no WLP). Com P0202 = 4 o drive avisa que não há programa ladder gravado. Valores antigos dele em P1100…P1113 são descartados uma vez.
- Assistente de comunicação, painel Posição da aba Mestre, missões 12 a 16, EDS, README e guia (Parte 8 nova) atualizados para a Função Posicionador.

## 1.8.5
- Guia do Servomotor SCA06: nova seção "Parâmetros por modo de controle", com velocidade, torque e posição lado a lado (o valor de cada parâmetro em cada modo, o que o CLP manda em cada palavra e o tamanho da conexão).
- A configuração do modo velocidade (seção 1.3) traz a tabela completa, com o IP e o P0849.
- O controle por torque (Parte 7) ganhou o passo a passo completo: como funciona, parâmetros, variáveis, programa com proteção de velocidade, teste com o peso (ângulos esperados), segurança e problemas comuns.

## 1.8.4
- Guias do Inversor CFW500 e do Servomotor SCA06: nova seção "Lista de parâmetros da comunicação", com todos os parâmetros da EtherNet/IP num lugar só (acesso e estado, quem manda, endereço IP, palavras de troca, segurança, aplicar e padrão de fábrica; no SCA06, também o posicionamento), com o valor de fábrica, o valor para a rede e o que cada um faz.

## 1.8.3
- Guia do CFW500: a seção 1.4 (tags da IHM Modbus) explica as quatro áreas do Modbus, por que cada tag tem o seu tipo (REAL, UINT, BOOL), fator e casas decimais, o mapa dos registradores, o erro clássico do REAL que ocupa dois registradores e a ordem das palavras de 32 bits.

## 1.8.2
- Inversor CFW500, aba IHM Modbus: o mapa padrão das tags agora é o mesmo do guia (set point e velocidade em REAL, corrente no Input Register 2). Antes a corrente ficava no Input Register 1, em cima da velocidade, e aparecia como 0,0 A.
- A tabela de tags avisa quando duas tags usam o mesmo registrador, lembrando que um REAL ocupa dois registradores.

## 1.8.1
- Inversor CFW500: ler a corrente do motor pela rede ficou explícito. No assistente, a etapa 3 se chama "Ler a corrente do motor pela rede" e o resumo diz onde a corrente chega no CLP. No guia, a seção nova 3.4 ensina o passo a passo (P0820 = 3, 6 bytes no CODESYS, mapeamento, conversão para ampères e teste) e mostra outras grandezas que dá para ler do mesmo jeito.

## 1.8.0
- Remoto IO-Link TBEN-L agora fala EtherNet/IP direto no Windows, sem máquina virtual: inicie no modo "EtherNet/IP (Windows)" e o CODESYS conecta pela SIM-HUB (IP 192.168.100.23), como o CFW500 e o SCA06. Como o TBEN-L real, ele é multiprotocolo: o PROFINET continua disponível na máquina virtual Linux.
- TBEN-L: EDS novo em "Arquivos para o CLP", com cada campo das portas com o nome da variável do programa pronto (GVL_TBEN).
- TBEN-L: guia novo, com mapa de dados, configuração no CODESYS, I/O Mapping, programa pronto da célula de paletização, testes e diagnóstico IO-Link.

## 1.7.12
- Correção: a tela do Remoto IO-Link TBEN-L abria uma página em branco (o endereço da máquina virtual Linux). Agora abre a célula de paletização que roda no seu PC. O endereço da máquina virtual continua no botão "Abrir" da seção "Instância remota".

## 1.7.11
- Fechou a janela da tela de um simulador? Ele para sozinho alguns segundos depois, liberando o IP e as portas. Recarregar a página não para. Para deixar o simulador rodando só para o CLP, desmarque a nova opção "Parar o simulador ao fechar a tela dele", na tela Dispositivos.
- O botão "Abrir tela" abre o simulador numa janela própria, maximizada, como ao iniciar.

## 1.7.10
- A janela do HUB e as dos simuladores voltam a abrir na frente e maximizadas (na 1.7.9 podiam abrir minimizadas na barra de tarefas).

## 1.7.9
- As janelas do HUB e dos simuladores abrem no Google Chrome, se ele estiver instalado. Sem o Chrome, abrem no Edge, como antes.

## 1.7.8
- O botão "Sair" fecha a janela do HUB também depois de você navegar pelas abas (antes, a janela às vezes ficava aberta em "HUB encerrado").

## 1.7.7
- A janela do HUB e as telas dos simuladores voltam a abrir maximizadas.

## 1.7.6
- Assistente de comunicação com o CLP: os títulos ficaram legíveis no fundo escuro (no SCA06 apareciam em azul-escuro), e a escolha do modo no SCA06 ficou mais clara: "Como o CLP vai comandar o servomotor?", com exemplos e o que muda no drive e no CLP em cada modo.

## 1.7.5
- Ao clicar em "Sair", a janela do HUB fecha sozinha (antes, às vezes ficava aberta mostrando "HUB encerrado"). As janelas dos simuladores abertas pelo HUB também fecham.
- A janela do HUB passa a usar um perfil próprio do Edge, separado do seu navegador do dia a dia. Por isso, na primeira vez, a escolha de fundo claro ou escuro volta ao padrão.

## 1.7.4
- Servomotor SCA06, aba Mestre (CLP virtual): novo painel Posição, que aparece quando o drive está em modo posição. Tem botões Habilitar, Pulso, STOP, Reset e Zerar posição, ângulo em graus, velocidade e tipo de movimento, mostra a posição atual e o que vai pela rede em cada palavra.
- A 4ª palavra (modo de controle) ganhou uma explicação: posição e pulso são o modo posição do drive (P0202 = 4), comandado pelas palavras 5 a 8.

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
