# Simulador Sistema de Incêndio (Modbus TCP)

Simulador da casa de bombas de incêndio da Situação-Problema 02: bomba principal, bomba reserva e bomba jockey, com painel de operação, quadro elétrico, duas micro soft-starters WEG SSW-05 Plus e dois pressostatos tipo KP, com a casa de bombas em 3D.

O simulador é o **cliente** Modbus TCP e o CLP é o **servidor**.

| Lado do simulador | Tipo Modbus | Lado do CLP |
|---|---|---|
| Saídas do simulador (chaves, botões, pressostatos) | Coils (escrita FC15 ou FC05) | Entradas I0.0 … I1.7 |
| Entradas do simulador (contatoras, sinaleiros) | Discrete inputs (leitura FC02) | Saídas Q0.0 … Q1.2 |

---

## 1. Abrir

Há duas formas. Use a do `.exe`; se o antivírus bloquear, use a dos `.bat`.

### Forma A — SimuladorSistemaIncendio.exe (não instala nada)

1. Dê dois cliques em **`SimuladorSistemaIncendio.exe`**. O Node.js já vai dentro dele.
2. Se aparecer **"O Windows protegeu o computador"**: **Mais informações** → **Executar assim mesmo**.
3. Uma janela preta abre e o navegador abre sozinho em `http://localhost:3000`.
4. Na primeira vez, o atalho **Simulador Sistema de Incêndio** é criado na área de trabalho.

Se o antivírus apagar ou bloquear o `.exe` (falso positivo comum em executáveis feitos com Node.js), use a Forma B ou peça à TI para liberar o arquivo.

### Forma B — INSTALAR.bat e INICIAR_SIMULADOR.bat

1. Extraia a pasta inteira (não rode de dentro do `.zip`).
2. Dê dois cliques em **`INSTALAR.bat`** (só na primeira vez). Ele instala o Node.js oficial (pelo winget ou pelo site nodejs.org), cria o atalho **Simulador Sistema de Incêndio** e pergunta se libera a porta 3000 no firewall.
3. Quando o Windows pedir permissão para instalar o Node.js, clique em **Sim**.
4. Para usar, dê dois cliques em **`INICIAR_SIMULADOR.bat`** (ou no atalho). O navegador abre sozinho.

Se o instalador não conseguir baixar o Node.js (proxy da empresa), instale manualmente a versão LTS em https://nodejs.org e rode o `INSTALAR.bat` de novo.

Nas duas formas, mantenha a janela preta aberta enquanto usar o simulador. Os dados ficam salvos em `%LOCALAPPDATA%\SimuladorSP02` (Forma A) ou na pasta `config` (Forma B).

**Diagrama elétrico:** o botão **Diagrama elétrico**, no topo do simulador, abre o diagrama da SP02 adaptado ao CLP Altus XP325, ao vivo e clicável (5 folhas, cadeia "siga o sinal" e exercício de ligação do motor da jockey).

**Programar o CLP:** o botão **Programar o CLP** abre o guia da lógica da SP02 no Altus XP325 (Ladder rede por rede, com figuras e versão em texto estruturado) e do ajuste dos pressostatos KP e da SSW-05 Plus, na bancada real e no simulador.

**Guia passo a passo:** o botão vermelho **Guia passo a passo**, no topo do simulador, abre o guia completo em uma nova guia do navegador (também funciona nos PCs dos alunos).

## 2. Conectar ao CLP

1. Na coluna da esquerda, em **Conexão com o CLP**, confira o IP (padrão `127.0.0.1`, o próprio PC) e a porta (padrão `502`).
2. Ajuste, se precisar, o **Unit ID** e os endereços da **1ª coil** (I0.0) e da **1ª entrada** (Q0.0).
3. Clique em **Conectar**. O selo ao lado do título fica verde: *Conectado*.
4. Para sair, clique em **Desconectar**. Os campos só podem ser editados desconectado.

O quadro **Diagnóstico** mostra conexões, erros, exceções Modbus e, se marcado, cada frame enviado (TX) e recebido (RX) em hexadecimal.

### Atenção ao mapeamento no CLP

As coils escritas pelo simulador precisam chegar às variáveis I0.0 … I1.7 do programa. Em CLPs cujo servidor Modbus liga as coils à área de saídas (por exemplo o bloco MB_SERVER da Siemens), aponte o servidor para uma área de memória e copie para as tags do programa no início do ciclo. Os endereços base são configuráveis no simulador para casar com o seu mapeamento.

## 3. Como a fila de requisições protege o CLP

O simulador nunca envia duas requisições ao mesmo tempo: manda uma, espera a resposta (ou o timeout), aguarda o *intervalo entre frames* e só então manda a próxima.

| Prioridade | O que é | Quando |
|---|---|---|
| P0 evento | Escrita das coils | Na hora em que um botão, chave ou pressostato muda |
| P1 leitura | Leitura das saídas do CLP (FC02) | A cada *Leitura a cada (ms)* |
| P2 sincronismo | Reescrita de todas as coils | A cada *Sincronismo (ms)*, garante que nada ficou perdido |
| P3 diagnóstico | Leitura de conferência das coils (FC01) | Opcional, a cada 3 s |

Regras da fila:

- **Coalescência**: se uma requisição igual já está esperando, a nova não entra; o valor enviado é sempre o mais atual.
- **Envelhecimento**: quem espera muito sobe de prioridade, então leitura nunca fica esquecida.
- **Timeout e novas tentativas**: escritas são repetidas até 2 vezes. Após 3 timeouts seguidos a conexão é encerrada e, se marcado, reconecta sozinha a cada 3 s.
- **Perda de comunicação**: as saídas do CLP são zeradas no simulador (contatoras abrem).
- **Pulso mínimo dos botões**: mesmo num clique rápido, o botão fica 300 ms acionado para o CLP enxergar.

## 4. Soft-starters SSW-05 Plus

Desenho conforme a frente do manual WEG 0899.5119: tampa articulada, 4 trimpots, dip-switch de 6 chaves, botão RESET e LEDs MOTOR PROTECTION / STARTER STATUS. Elas não conversam com o CLP: o contato 13-14 da contatora (K-B1/K-B2) leva a fase do A1 até a **DI1**.

| Ajuste | Faixa | SP02 |
| --- | --- | --- |
| ACCEL TIME | 1–20 s | **5 s** |
| DECEL TIME | OFF–20 s | **10 s** |
| PEDESTAL VOLTAGE | 30–80 % | 30–40 % |
| MOTOR CURRENT | 30–100 % da In da chave | corrente de placa ÷ In da chave |
| Chaves 1–5 (proteções) | OFF / ON | ON |
| Chave 6 (reset) | MAN / AUTO | MAN |

Falhas acendem o LED da proteção (PHASE LOSS, OVERLOAD, STALL, OVERCURRENT, PHASE SEQ) e são resetadas no **RESET**. Passo a passo completo no Guia (Passo 7) e em Programar o CLP (Parte 10).

## 5. Pressostatos (tipo KP 5)

Ajuste como no real: **Faixa** é a pressão em que o contato abre (alta) e **Diferencial** define onde ele volta a fechar (faixa − diferencial). Valores em bar, com o equivalente em kgf/cm² ao lado.

Padrão já ajustado para a SP02:

- **PJ**: faixa 9,8 bar e DIF 3,9 bar → fecha em ≈ 6 kgf/cm², abre em ≈ 10 kgf/cm².
- **PB**: faixa 9,8 bar e DIF 5,9 bar → fecha em ≈ 4 kgf/cm², abre em ≈ 10 kgf/cm².

A **alavanca de teste** inverte o contato enquanto estiver pressionada, como a função de desarme manual do KP.

## 6. Processo

- **Vazamento da rede** faz a pressão cair devagar (trabalho da jockey).
- **Abrir hidrante** simula um incêndio: a jockey não dá conta, a pressão cai abaixo do PB e a principal selecionada deve partir.
- **Quadro elétrico**: desarme disjuntores para criar falhas (sem 24 Vcc, sem controle na soft, falta de fase, motor jockey desligado do painel).

## 7. Várias bancadas ao mesmo tempo

Cada **sessão** (abas no topo) tem sua própria conexão, fila, processo e soft-starters. Use **+ Nova sessão** para cada CLP. Duplo clique na aba renomeia.

Outros PCs da rede podem abrir `http://IP-DESTE-PC:3000` (os endereços aparecem na janela preta). Cada um escolhe sua aba; o endereço da página guarda a sessão (ex.: `…:3000/#s2`).

## 8. Testar sem CLP

Na seção de conexão, clique em **Ligar CLP virtual de teste**. Ele cria um servidor Modbus TCP dentro do próprio simulador, na porta digitada (padrão 502), com uma lógica de referência simplificada da SP02. Depois clique em **Conectar** com `127.0.0.1`.

## 9. Para o desenvolvedor: pastas e como gerar um novo .exe

```
server.js                 servidor local (http://localhost:3000)
src/                      lógica: cliente Modbus, fila, processo, SSW-05
public/                   interface (HTML, CSS, JS)
tools/clp-teste.js        CLP virtual de teste
package.json              versão e configuração do empacotamento
```

Para rodar sem empacotar (precisa do Node.js 18 ou superior): abra o terminal na pasta e digite `node server.js`.

Para gerar o `.exe` depois de alterar algo:

1. Instale o Node.js LTS em https://nodejs.org (uma vez só).
2. Abra o terminal nesta pasta: na barra de endereço do Explorer, digite `cmd` e tecle Enter.
3. Aumente o número de `"version"` no `package.json`.
4. Digite `npx @yao-pkg/pkg . --compress Brotli` e tecle Enter.
5. O `.exe` novo aparece na pasta `dist`.

Para alterar os guias que abrem dentro do simulador: edite `docs/guia.md` ou `docs/guia-programacao.md` (as redes Ladder ficam em blocos ```ladder em JSON), rode `python tools/gerar-guia.py` (precisa do Python e de `pip install markdown`) e gere o `.exe` de novo. O script cria `public/guia.html` e `public/guia-programacao.html`.

## 10. Problemas comuns

| Sintoma | O que fazer |
|---|---|
| *ECONNREFUSED* no diagnóstico | O CLP não aceitou a conexão: confira IP, porta e se o servidor Modbus está ativo no programa. |
| *Timeout* repetido | Rede/cabo, IP em outra faixa ou Unit ID errado. Aumente o timeout se a rede for lenta. |
| *Exceção 2 (endereço ilegal)* | O CLP não tem aquele endereço: ajuste a 1ª coil / 1ª entrada. |
| *Exceção 1 (função ilegal)* | O CLP não aceita FC15: troque *Escrita das coils* para FC05. |
| Soft não parte | Veja se P229 = 1 (bornes), P263 = 1 e se D2/D3, DB1/DB2 e DG estão ligados. |
| Porta 3000 em uso | O simulador já está aberto em outra janela; o navegador abre nele. |
| Antivírus bloqueou o `.exe` | Executáveis gerados a partir do Node às vezes dão falso positivo. Libere o arquivo no antivírus ou peça à TI. |

As faixas da SSW-05 Plus seguem o catálogo WEG. Se a sua revisão divergir, os limites ficam em `src/ssw05.js` (listas `POTS` e `DIPS`). A vista 3D usa a biblioteca three.js (licença MIT) incluída em `public/vendor/three`.
