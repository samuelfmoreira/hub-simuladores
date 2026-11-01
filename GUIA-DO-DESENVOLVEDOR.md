# Guia do desenvolvedor

> Como publicar o HUB e as versões novas. Escrito para quem não é programador: você só dá dois cliques em arquivos e segue as instruções; a parte técnica é feita pelos assistentes.

O usuário final não vê nada disto: ele só baixa o `HUB-Simuladores.exe` e abre.

## Antes de começar

Você vai precisar de:
- sua conta no GitHub;
- uns 15 minutos, só na primeira vez;
- uma pasta **fixa** para o projeto, por exemplo `C:\HUB-Simuladores-projeto`.

> **Atenção:** essa pasta é a "matriz" do HUB. Ela guarda a sua chave de assinatura e a ligação com o GitHub. Não use a pasta Downloads, não apague e não confunda com a pasta onde o HUB é instalado nos PCs.

Os dois arquivos que você vai usar ficam na raiz da pasta:

| Arquivo | Quando usar |
|---|---|
| `CONFIGURAR-GITHUB.bat` | uma vez só, na primeira vez |
| `PUBLICAR-VERSAO.bat` | alternativa: publica arrastando o zip, sem abrir o HUB |
| `HUB-DESENVOLVEDOR.bat` | sempre que for trabalhar: abre o HUB com a aba **Desenvolvedor** |

Se o Windows mostrar **"O Windows protegeu o computador"** ao abrir um deles, clique em **Mais informações** e depois em **Executar assim mesmo**. Os arquivos são seus.

---

## Parte 1: configurar (uma vez só)

**1. Extraia o projeto.** Clique com o botão direito no zip > **Extrair tudo...** > escolha `C:\` > **Extrair**. Renomeie a pasta criada para `HUB-Simuladores-projeto`, se quiser.

**2. Abra o assistente.** Na pasta, dê dois cliques em `CONFIGURAR-GITHUB.bat`. Abre uma janela preta: é o assistente. Ele tem 8 passos e para em cada um esperando você.

**Passo 1, programas:** se faltar o Git ou o Node.js, ele instala sozinho. O Windows pode perguntar se permite alterações: clique em **Sim**.

**Passo 2, seu nome:** digite seu nome e Enter; depois o e-mail da sua conta do GitHub e Enter.

**Passo 3, criar o repositório:** o navegador abre a página *Create a new repository*.
- Em **Repository name**, escreva `hub-simuladores`.
- Escolha **Public** ou **Private** (veja a diferença logo abaixo).
- **Não** marque *Add a README file*, *.gitignore* nem *license*.
- Clique no botão verde **Create repository**.
- Copie o endereço que aparece na barra do navegador (`https://github.com/SEU-USUARIO/hub-simuladores`).
- Volte para a janela preta, aperte Enter, cole o endereço (Ctrl+V ou botão direito do mouse) e aperte Enter.
- Responda **S** se escolheu Private, ou **N** se escolheu Public.

| | Public | Private |
|---|---|---|
| Quem vê o código | qualquer pessoa com o link | só você e quem você convidar |
| Quem baixa o HUB | qualquer pessoa com o link | só você; você distribui o arquivo |
| Configuração | mais simples | precisa do passo 6 (token) |

**Passo 4, chave de assinatura:** o assistente cria a chave e abre uma pasta com o arquivo `chave-privada.pem` selecionado. **Copie esse arquivo para um pendrive ou outro lugar seguro.** Sem ele, não dá para publicar atualizações; com ele, qualquer pessoa conseguiria publicar em seu nome. Depois aperte Enter na janela preta.

**Passo 5, guardar a chave no GitHub:** o assistente já copiou um texto longo para você. O navegador abre a página *New secret*:
- **Name:** `HUB_CHAVE_PRIVADA`
- **Secret:** clique na caixa grande e aperte **Ctrl+V**
- Clique em **Add secret**, volte para a janela preta e aperte Enter.

**Passo 6, token (só se o repositório for Private):** o navegador abre *New fine-grained personal access token*:
- **Token name:** `HUB leitura`
- **Expiration:** escolha **Custom** e a data mais distante que o GitHub permitir. Anote essa data na agenda: antes dela, faça um token novo.
- **Repository access:** marque **Only select repositories** e escolha `hub-simuladores`
- **Permissions > Repository permissions > Contents:** escolha **Read-only**
- Clique em **Generate token** e depois no ícone de copiar ao lado do token.
- Volte para a janela preta e aperte Enter. Abre de novo a página *New secret*: **Name** `HUB_TOKEN_LEITURA`, **Secret** Ctrl+V, **Add secret**. Aperte Enter.

> **Nunca** cole o token na janela preta, em e-mail ou em conversas (nem com o Claude). Ele vai só para o GitHub.

**Passo 7, enviar o projeto:** na primeira vez, aparece uma janela *Connect to GitHub*. Clique em **Sign in with your browser**, entre na sua conta e clique em **Authorize**. O envio continua sozinho.

**Passo 8, acompanhar:** o navegador abre a aba **Actions** do repositório.
- Aparece **Publicar HUB** com uma bolinha **amarela**: está montando (5 a 10 minutos).
- Bolinha **verde**: publicado.
- Bolinha **vermelha**: deu erro. Clique nela, abra a etapa com o X vermelho, copie o texto e mande para o Claude.

**3. Pegue o link do HUB.** Com a bolinha verde, abra `https://github.com/SEU-USUARIO/hub-simuladores/releases`. Em **Assets** está o **`HUB-Simuladores.exe`**: é só isso que o usuário final precisa. O link fixo, que sempre entrega a versão mais recente, é:

`https://github.com/SEU-USUARIO/hub-simuladores/releases/latest/download/HUB-Simuladores.exe`

---

## Parte 2: o que o usuário final faz

1. Baixa o `HUB-Simuladores.exe` pelo link fixo. Se o repositório for Private, só você consegue baixar: copie o arquivo para os PCs por pendrive, pasta de rede ou Teams.
2. Dá dois cliques. Se aparecer "O Windows protegeu o computador": **Mais informações** > **Executar assim mesmo**.
3. Na primeira vez, o HUB se instala sozinho (na pasta do usuário, sem pedir administrador), cria o atalho **HUB de Simuladores** na Área de Trabalho e no Menu Iniciar e abre. O Windows pede permissão uma vez para criar a rede virtual dos simuladores, e o Firewall pode perguntar se permite: **Permitir acesso**.
4. Daí em diante, ele abre pelo atalho. Quando você publicar uma versão nova, aparece a mensagem **"Vamos atualizar o seu HUB"**: ele clica em **OK** e pronto.

---

## Parte 3: publicar cada versão nova

**Pela aba Desenvolvedor (recomendado):**

1. Dê dois cliques no `HUB-DESENVOLVEDOR.bat`. O HUB abre com a aba **Desenvolvedor** no topo. Na primeira vez, ele baixa as dependências (leva alguns minutos).
2. Na aba **Desenvolvedor**:
   - **1. Aplicar a versão que o Claude entregou:** solte o zip na caixa. Os arquivos são trocados; a chave, a ligação com o GitHub e os dados ficam.
   - Se quiser testar antes: clique em **Reiniciar este HUB** e use a Bancada normalmente. Depois volte à aba Desenvolvedor.
   - **2. Versão e notas:** a versão normalmente já vem certa no zip. Se você mesmo mudou algo, clique em **correção** (ex.: 1.5.0 → 1.5.1) ou **novidade** (1.5.0 → 1.6.0), escreva o que muda (uma linha por item, começando com "- ") e clique em **Salvar versão e notas**. Esse texto é o que o usuário lê na mensagem de atualização.
   - **3. Publicar no GitHub:** clique em **Publicar versão**. O andamento aparece na caixa preta. Na primeira vez, o Git pode abrir uma janela para você entrar na conta do GitHub.
3. Clique em **Ver no Actions** e espere a bolinha verde (5 a 10 minutos). Pronto: os HUBs instalados mostram a mensagem de atualização na próxima vez que forem abertos.

**Sem abrir o HUB:** arraste o zip em cima do `PUBLICAR-VERSAO.bat`. Ele aplica e publica de uma vez.

Se a aba avisar que **a versão já foi publicada**, os HUBs não vão oferecer atualização: aumente o número da versão antes de publicar.

---

## Se algo der errado

| O que aconteceu | O que fazer |
|---|---|
| "winget não é reconhecido" no passo 1 | Instale o **Instalador de Aplicativo** pela Microsoft Store, ou instale o Git (git-scm.com) e o Node.js LTS (nodejs.org) manualmente, e abra o assistente de novo |
| O assistente parou com [ERRO] | Leia a mensagem, corrija e abra de novo: ele continua de onde parou, sem perder nada |
| Bolinha vermelha no Actions | Clique nela, copie o texto da etapa com erro e mande para o Claude (sem tokens nem senhas) |
| Errei o valor de um secret | Repositório > **Settings** > **Secrets and variables** > **Actions** > lápis ao lado do secret |
| O token venceu (repositório Private) | Faça um token novo (passo 6), atualize o secret `HUB_TOKEN_LEITURA` e publique uma versão. Depois que os PCs atualizarem, apague o token antigo |
| Um PC não atualiza | No HUB: **Adicionar e atualizar** > **Procurar atualização**. A mensagem explica o motivo |
| Perdi a `chave-privada.pem` | Os PCs instalados param de aceitar atualizações. Fale com o Claude: será preciso gerar outra chave e reinstalar o HUB nos PCs |

## Nunca faça

- Mandar a `chave-privada.pem` ou tokens para alguém (nem para o Claude).
- Apagar a pasta do projeto sem ter cópia da `chave-privada.pem`.
- Distribuir a pasta do projeto: os PCs usam só o `HUB-Simuladores.exe`.
