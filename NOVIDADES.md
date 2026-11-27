# Novidades do HUB de Simuladores

As notas de cada versão aparecem no HUB quando a atualização é oferecida. Escreva a seção da versão nova antes do push.

## 1.18.2
- Varredura de portas: nenhuma porta de tela repetida, nenhuma na faixa reservada do HUB (3100–3299) nem nas portas do CODESYS. Corrigida a sobreposição dos endereços dos CLPs de teste: o CLP virtual do Sistema de Incêndio (2.0.3.5) passa a usar 127.0.0.100 a .149 e o CLP de demonstração do sensor VEGA (1.3.0.2) 127.0.0.150 a .199, sempre na porta 502 (antes, 127.0.0.70–99 e 127.0.0.80–99 se cruzavam). Cada bloco comporta 50 sessões. O mapa de portas do CONTRATO.md foi atualizado.

## 1.18.1
- Bancada didática WEG CFW500 atualizada para a 1.6.3 (1.6.3.1 no HUB). A tela passa a usar a porta 3053, sem conflito com nenhum outro simulador; o mapa de portas do CONTRATO.md foi atualizado. Ajuste do HUB mantido: o topo e a aba do navegador mostram "Bancada didática WEG CFW500".

## 1.18.0
- Bancada didática WEG CFW500 atualizada para a 1.5.1 (1.5.1.1 no HUB). A tela passa a usar a porta 3052, sem conflito com nenhum outro simulador; o mapa de portas do CONTRATO.md foi atualizado. Ajuste do HUB mantido: o topo e a aba do navegador mostram "Bancada didática WEG CFW500".
- Sensor ultrassônico VEGA atualizado para a 1.3.0 (1.3.0.1 no HUB); cada aba entra numa sessão sozinha. Ajustes do HUB reaplicados: nome "Sensor ultrassônico VEGA" e fabricante "Didático · VEGASON 61"; IP padrão do CLP 192.168.100.10 (o CODESYS na rede virtual); CLP de demonstração sempre na porta 502, num endereço próprio por sessão (127.0.0.80, .81…).

## 1.17.6
- Keyence (1.0.2): o nome passa a ser "Sistema de visão Keyence CV-X400" no cartão, no topo da tela, na aba do navegador e no guia. A linha de tipo do cartão fica "Controlador e câmeras", para não repetir.

## 1.17.5
- CFW500 (1.0.16): o nome passa a ser "CFW500 em rede EtherNet/IP" no cartão, no topo da tela, na aba do navegador e no guia, para não confundir com a Bancada didática WEG CFW500. O subtítulo do topo fica "Inversor WEG · IHM Modbus · Esteira 3D".

## 1.17.4
- Bancada didática WEG CFW500 atualizada para a 1.3.1 (1.3.1.1 no HUB). A tela passa a usar a porta 3051 (antes 3350), sem conflito com nenhum outro simulador; o mapa de portas do CONTRATO.md foi atualizado. Ajuste do HUB mantido: o topo e a aba do navegador mostram "Bancada didática WEG CFW500".

## 1.17.3
- Bancada didática WEG CFW500 atualizada para a 1.2.0 (1.2.0.1 no HUB): osciloscópio na aba Medições, contatora na bancada, missões novas e guia com imagens novas. O painel lateral agora se oculta pelo botão « da própria bancada (e volta pelo » Painel); o botão "Ocultar painel" que o HUB tinha posto no topo saiu, para não haver dois botões fazendo o mesmo. Ajuste do HUB mantido: o topo e a aba do navegador mostram "Bancada didática WEG CFW500".

## 1.17.2
- Sistema de Incêndio (2.0.3.4): o nome passa a ser só "Sistema de Incêndio", sem "Simulador", no topo da tela, na aba do navegador, nos guias, no diagrama elétrico, nas janelas e no atalho da área de trabalho.

## 1.17.1
- Modbus TCP sempre na porta 502. Os CLPs de teste e demonstração internos voltam para a 502, cada um num endereço só deste PC, para não disputarem a 502 entre si nem com o CODESYS (192.168.100.10): estação de bombeamento 127.0.0.50, IHM do SCA06 127.0.0.60, Sistema de Incêndio 127.0.0.70, .71… (um por sessão) e sensor VEGA 127.0.0.80, .81… (um por sessão). A tela de cada um mostra e preenche o endereço certo. Se o Windows recusar o endereço, o CLP de teste volta para 127.0.0.1 numa porta alternativa e avisa.

## 1.17.0
- Estação de bombeamento abre na primeira tentativa: a biblioteca OPC UA (milhares de arquivos) só é carregada quando o OPC UA é usado. Antes, ela era lida sempre ao iniciar, e no Windows, na primeira vez, o antivírus conferia cada arquivo e a tela demorava a responder.
- HUB: espera até 90 s a tela do simulador responder (antes 25 s) e avisa depois de 8 s que a primeira vez pode demorar; a tela abre sozinha quando fica pronta, sem precisar de uma segunda tentativa.
- Portas sem conflito (mapa completo no CONTRATO.md): SCA06 passa para a 3060 e o Sistema de Incêndio para a 3070 (os dois dividiam a 3000 com o Processo 3D); o TBEN-L usa a 8081 também fora do HUB (antes 8080, a do CFW500). Os servidores internos de teste não ocupam mais as portas do CODESYS: o CLP da IHM do SCA06 vai para 5502–5510, o CLP virtual do Sistema de Incêndio para 5030–5099 no HUB, o XP325 de demonstração da estação para 4841–4850, e o CLP de demonstração do sensor VEGA para 1520–1579 (a 1502 é da estação).
- Ao adicionar um simulador cuja porta de tela já é de outro, o HUB avisa.

## 1.16.2
- Bancada didática WEG CFW500 (1.0.2.3): botão "Ocultar painel" no topo da tela. As abas somem e a bancada 3D ocupa a tela toda (também em tela estreita, como tablet); "Mostrar painel" traz as abas de volta, e a tela lembra a escolha. O título do topo passa a mostrar o nome novo.

## 1.16.1
- Nomes dos cartões: "Bancada didática WEG CFW500" e "Sensor ultrassônico VEGA" (sem o LT-01, que continua como a tag do transmissor no processo). O fabricante do sensor passa a ser "Didático · VEGASON 61", numa linha só.

## 1.16.0
- Novo: **Bancada didática CFW500** (1.0.2.1). Bancada 3D para ligar e parametrizar o inversor WEG CFW500 como na prática: arrastar componentes, passar os fios borne a borne, medir com o multímetro e operar pela HMI. Partida por entrada digital (2 e 3 fios), sentido de giro, potenciômetro e 4–20 mA na AI1, multispeed, saídas a relé e a transistor, rampas, falhas e link DC. Não usa CLP nem rede; cada aluno tem a sua sessão.
- Novo: **Sensor ultrassônico de nível LT-01** (1.1.1.1), com dados do VEGASON 61. Tanque com transmissor ultrassônico em 3D (tempo de voo, zona morta, eco falso, temperatura, espuma, perda de eco); o CLP recebe o nível como entrada analógica de 15 bits por Modbus TCP e faz a escala e os alarmes. CLP de demonstração interno em 127.0.0.1. Ajuste do HUB: o IP padrão do CLP passa a ser 192.168.100.10 (o CODESYS na rede virtual).

## 1.15.3
- CFW500: botão "Padrão de fábrica" no topo da tela (antes ficava escondido nas abas). Além do P0204 = 5 (padrão WEG 60 Hz), ele agora zera a imagem térmica do motor (Ixt, P0037) e limpa os alarmes: o inversor deixa de ligar com A0046 (Carga Alta no Motor) depois de uma aula com sobrecarga. Só funciona com o motor parado, como o P0204 real. O botão "Restaurar padrão de fábrica" das abas faz o mesmo.

## 1.15.2
- Guia do CFW500: nova seção "Consulta rápida", no começo do guia, com todos os bits da Control Word (P0684) e da Status Word (P0680), valores prontos (parado = 22, gira horário = 23, gira anti-horário = 19, reset = 150), o que o inversor responde em cada situação (medido no simulador), a escala de 13 bits da velocidade e a ordem das palavras na conexão EtherNet/IP.

## 1.15.1
- Estação de bombeamento: o cartão passa a mostrar "Didático · WEG CFW500".

## 1.15.0
- Sistema de Incêndio + Soft SSW-05 atualizado para a versão 2.0.3, com a soft-starter SSW-05 Plus atualizada. Ajustes do HUB mantidos: a tela abre na porta escolhida pelo HUB, o CLP virtual de teste escuta só neste PC e "Restaurar original" limpa todas as telas.
- Estação de bombeamento: o cartão e as telas passam a se chamar só "Estação de bombeamento" (TQ-01 continua como a tag do tanque no processo).

## 1.14.1
- Estação de bombeamento TQ-01: o Modbus TCP é o caminho principal. A tela abre com o Modbus marcado e o IP do CODESYS (192.168.100.10) preenchido; quem tinha a versão antiga, que guardava uma conexão OPC UA, passa a abrir no Modbus. O cartão traz em "Arquivos para o CLP" a GVL, o programa e a tabela de tags Modbus, e a aula de Modbus TCP em "Aprender".

## 1.14.0
- Estação de bombeamento TQ-01 atualizada para a versão 0.12.1: processo enxuto para a aula de canal analógico, com uma entrada analógica (transmissor de nível LT-01, 4–20 mA, no EA0) e uma saída analógica (referência de velocidade do inversor CFW500 da bomba, 0–10 V, no SA0), em contagens de 15 bits. O CFW500 é o mesmo modelo do simulador do HUB e já vem parametrizado. Válvula manual HV-01 para o instrutor perturbar o consumo, laboratório de histerese e guia novo.
- Três jeitos de conectar o CLP: Modbus TCP, OPC UA ou OPC DA (MasterTool em simulação, depois do INSTALAR_OPCDA.bat). Os dois CLPs de demonstração (Modbus e OPC UA) rodam só neste PC e usam a próxima porta livre se a padrão estiver ocupada pelo CODESYS.
- Desenho novo do cartão: reservatório, bomba, tanque TQ-01 com o LT-01, válvula HV-01 e o CFW500.

## 1.13.0
- Servomotor SCA06: nova aba IHM, um painel touch de 7" com as telas Início, Velocidade, Torque, Posição absoluta e Pulso. Como numa máquina real, a IHM conversa com o CLP por Modbus TCP e o CLP comanda o servo pela EtherNet/IP. Habilitar geral, STOP, reset, escolha do modo, referências, PARTIR/PARAR, IR PARA O DESTINO e PULSO, com lâmpadas, mostradores e um mostrador circular da posição.
- Os quatro modos funcionam sem reconfigurar o drive: o CLP escreve o tipo, a velocidade/corrente e as voltas do movimento da Função Posicionador. Nova conexão no EDS: Exclusive Owner, IHM (8 entrada / 11 saida). Nova opção no assistente de comunicação: IHM (todos os modos).
- CLP de demonstração na aba IHM, para usar a IHM sem o CODESYS: ele roda o mesmo programa do guia.
- Guia do SCA06: Parte 9 nova, com a configuração do drive, a conexão de 8/11 palavras, o servidor Modbus no CODESYS, o mapa de tags e o programa PRG_IHM_Servo em texto estruturado, bloco a bloco, com testes e problemas comuns.

## 1.12.0
- Novo dispositivo: Estação de bombeamento TQ-01. Processo 3D com entradas e saídas analógicas para programar o Altus XP325: tanque com transmissor de nível 4–20 mA, válvula de controle FV-01, bomba centrífuga com inversor CFW500 comandado por 0–10 V, pressão, vazão e PT100, quadro de comando operável. É cliente OPC UA (o CLP é o servidor, porta 4840) e traz um XP325 de demonstração; se a 4840 estiver ocupada (por exemplo, pelo CODESYS), a demonstração usa a próxima porta livre. Guia completo no botão Guia.
- A verificação do contrato dos simuladores passa a ler também o arquivo principal do package.json (simuladores organizados em subpastas).

## 1.11.0
- Novo em todos os simuladores: botão "Restaurar original", no painel do cartão. Volta o simulador ao estado de quando foi instalado: apaga parâmetros, configurações, sessões, progresso das missões e preferências da tela, e devolve IP, porta, modo e endereço da VM ao padrão. Se estiver rodando, ele é parado e iniciado de novo. A versão do simulador não muda.

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
