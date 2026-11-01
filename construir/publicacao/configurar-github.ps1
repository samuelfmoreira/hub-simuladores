# =====================================================================
#  Assistente de configuração do GitHub (rodar UMA vez)
#  Aberto pelo CONFIGURAR-GITHUB.bat. Faz as partes técnicas e guia
#  você pelas telas do GitHub, uma de cada vez.
# =====================================================================
param([switch]$SemEnviar)   # só para testes: não faz o envio final

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
$Raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Raiz

function Titulo($n, $t) { Write-Host ''; Write-Host "==================== PASSO $n de 8: $t ====================" -ForegroundColor Cyan }
function Info($t) { Write-Host "  $t" }
function Ok($t) { Write-Host "  [OK] $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "  [!] $t" -ForegroundColor Yellow }
function Esperar($t = 'Quando terminar, volte aqui e aperte ENTER') { Write-Host ''; Read-Host "  >> $t" | Out-Null }
function Abrir($url) { Info "Abrindo no navegador: $url"; try { Start-Process $url } catch { Aviso "Não consegui abrir o navegador. Abra este endereço manualmente: $url" } }
function Atualizar-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function Git-Rodar { & git @args; if ($LASTEXITCODE -ne 0) { throw "O comando 'git $($args -join ' ')' falhou (código $LASTEXITCODE)." } }
function Git-Silencioso {
  $antes = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $saida = & git @args 2>&1 | Out-String; $codigo = $LASTEXITCODE
  $ErrorActionPreference = $antes
  return @{ codigo = $codigo; saida = $saida.Trim() } }
function Garantir($cmd, $idWinget, $nome) {
  if (Get-Command $cmd -ErrorAction SilentlyContinue) { Ok "$nome já está instalado"; return }
  Aviso "$nome não está instalado. Instalando pelo winget (o Windows pode pedir permissão)..."
  winget install -e --id $idWinget --accept-source-agreements --accept-package-agreements
  Atualizar-Path
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "Não consegui instalar o $nome. Feche esta janela, instale o $nome manualmente e rode o assistente de novo." }
  Ok "$nome instalado"
}

try {
  Write-Host ''
  Write-Host '  ASSISTENTE DE CONFIGURAÇÃO DO GITHUB - HUB de Simuladores' -ForegroundColor White
  Write-Host '  Siga as instruções. Quando uma página abrir no navegador, faça o que'
  Write-Host '  está escrito aqui e volte para esta janela.'

  # ------------------------------------------------------------------
  Titulo 1 'Programas necessários'
  Garantir 'git' 'Git.Git' 'Git'
  Garantir 'node' 'OpenJS.NodeJS.LTS' 'Node.js'

  # ------------------------------------------------------------------
  Titulo 2 'Seu nome no Git'
  $nome = (Git-Silencioso config --global user.name).saida
  $email = (Git-Silencioso config --global user.email).saida
  if ($nome -and $email) { Ok "Já configurado: $nome <$email>" }
  else {
    Info 'O Git anota quem fez cada versão. Use o mesmo e-mail da sua conta do GitHub.'
    if (-not $nome) { $nome = Read-Host '  Seu nome (ex.: Samuel Moreira)'; Git-Rodar config --global user.name $nome }
    if (-not $email) { $email = Read-Host '  Seu e-mail do GitHub'; Git-Rodar config --global user.email $email }
    Ok "Configurado: $nome <$email>"
  }

  # ------------------------------------------------------------------
  Titulo 3 'Criar o repositório no GitHub'
  Info 'Vai abrir a página "Create a new repository". Preencha assim:'
  Info '  - Repository name:  hub-simuladores'
  Info '  - Public (qualquer um pode baixar) ou Private (só quem você autorizar)'
  Info '  - NÃO marque "Add a README file", nem .gitignore, nem license'
  Info '  - Clique no botão verde "Create repository"'
  Abrir 'https://github.com/new'
  Esperar 'Depois de criar o repositório, volte aqui e aperte ENTER'
  $url = ''
  while ($url -notmatch '^https://github\.com/([^/\s]+)/([^/\s]+?)(\.git)?/?$') {
    Info 'Copie o endereço da página do repositório que acabou de abrir (barra de endereços do navegador).'
    $url = (Read-Host '  Cole aqui o endereço (ex.: https://github.com/seu-usuario/hub-simuladores)').Trim()
  }
  $dono = $Matches[1]; $repo = $Matches[2]
  $base = "https://github.com/$dono/$repo"
  $privado = (Read-Host '  O repositório é privado? Digite S para sim ou N para não').Trim().ToUpper().StartsWith('S')
  Ok "Repositório: $base ($(if ($privado) { 'privado' } else { 'público' }))"

  # ------------------------------------------------------------------
  Titulo 4 'Chave de assinatura'
  $pub = Join-Path $Raiz 'hub\chave-publica.pem'
  $priv = Join-Path $Raiz 'construir\chave-privada.pem'
  if ((Test-Path $pub) -and (Test-Path $priv)) { Ok 'As chaves já existem neste computador. Vou usar as mesmas.' }
  elseif ((Test-Path $pub) -and -not (Test-Path $priv)) {
    Aviso 'Existe a chave pública, mas a chave privada não está nesta pasta.'
    Info 'Se você tem uma cópia de chave-privada.pem, feche esta janela, coloque o arquivo em construir\ e rode de novo.'
    $novo = (Read-Host '  Gerar um par novo? Só faça isso se ainda NÃO há HUBs instalados (S/N)').Trim().ToUpper().StartsWith('S')
    if (-not $novo) { throw 'Configuração interrompida: falta a chave privada.' }
    node construir/gerar-chaves.js --substituir | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar as chaves.' }
    Ok 'Par de chaves novo gerado.'
  } else {
    node construir/gerar-chaves.js | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar as chaves.' }
    Ok 'Chaves geradas.'
  }
  Aviso 'IMPORTANTE: guarde uma cópia do arquivo construir\chave-privada.pem num lugar seguro'
  Aviso '(pendrive, pasta pessoal na rede). Sem ela, você não consegue publicar atualizações.'
  Aviso 'Esse arquivo NUNCA vai para o GitHub nem deve ser enviado para ninguém.'
  try { Start-Process explorer.exe "/select,`"$priv`"" } catch { }
  Esperar 'Depois de guardar a cópia, aperte ENTER'

  # ------------------------------------------------------------------
  Titulo 5 'Guardar a chave no GitHub (secret)'
  $segredo = [Convert]::ToBase64String([IO.File]::ReadAllBytes($priv))
  $copiado = $false
  try { Set-Clipboard -Value $segredo; $copiado = $true } catch { }
  if ($copiado) { Ok 'O código secreto foi COPIADO. Você só vai precisar colar (Ctrl+V).' }
  else { Aviso 'Não consegui copiar sozinho. Selecione e copie o texto abaixo:'; Write-Host $segredo }
  Info 'Vai abrir a página "New secret". Preencha assim:'
  Info '  - Name:    HUB_CHAVE_PRIVADA'
  Info '  - Secret:  clique na caixa e aperte Ctrl+V'
  Info '  - Clique em "Add secret"'
  Abrir "$base/settings/secrets/actions/new"
  Esperar 'Depois de clicar em "Add secret", aperte ENTER'
  try { Set-Clipboard -Value ' ' } catch { }

  # ------------------------------------------------------------------
  Titulo 6 'Token de leitura (só para repositório privado)'
  if (-not $privado) { Ok 'Repositório público: não precisa de token.' }
  else {
    Info 'Os HUBs precisam de uma "senha só de leitura" para baixar as atualizações.'
    Info 'Vai abrir a página "New fine-grained personal access token". Preencha assim:'
    Info '  - Token name:   HUB leitura'
    Info '  - Expiration:   escolha "Custom" e a data mais distante permitida (anote para renovar)'
    Info "  - Repository access:  'Only select repositories' e escolha $repo"
    Info '  - Permissions > Repository permissions > Contents:  Read-only'
    Info '  - Clique em "Generate token" e depois no botão de copiar ao lado do token'
    Aviso 'NÃO cole o token nesta janela nem em conversas. Ele vai só para o GitHub, no próximo passo.'
    Abrir 'https://github.com/settings/personal-access-tokens/new'
    Esperar 'Depois de copiar o token, aperte ENTER'
    Info 'Agora vai abrir de novo a página "New secret":'
    Info '  - Name:    HUB_TOKEN_LEITURA'
    Info '  - Secret:  Ctrl+V (o token que você copiou)'
    Info '  - Clique em "Add secret"'
    Abrir "$base/settings/secrets/actions/new"
    Esperar 'Depois de clicar em "Add secret", aperte ENTER'
  }

  # ------------------------------------------------------------------
  Titulo 7 'Enviar o projeto para o GitHub'
  $versao = (Get-Content (Join-Path $Raiz 'hub\package.json') -Raw | ConvertFrom-Json).version
  if (-not (Test-Path (Join-Path $Raiz '.git'))) { Git-Rodar init -b main | Out-Null; Ok 'Pasta preparada para o Git.' }
  $ign = Git-Silencioso check-ignore -q construir/chave-privada.pem
  if ($ign.codigo -ne 0) { throw 'Segurança: o .gitignore não está protegendo a chave privada. Envio cancelado.' }
  Git-Rodar add -A
  $st = Git-Silencioso diff --cached --quiet
  if ($st.codigo -ne 0) { Git-Rodar commit -q -m "HUB $versao"; Ok "Versão $versao registrada." } else { Ok 'Nada novo para registrar.' }
  $rem = Git-Silencioso remote get-url origin
  if ($rem.codigo -eq 0) { Git-Rodar remote set-url origin "$base.git" } else { Git-Rodar remote add origin "$base.git" }
  if ($SemEnviar) { Aviso 'Modo de teste: envio pulado.' }
  else {
    Info 'Enviando... Se abrir uma janela pedindo para entrar no GitHub, escolha "Sign in with your browser"'
    Info 'e autorize. Isso só acontece na primeira vez.'
    Git-Rodar push -u origin HEAD
    Ok 'Projeto enviado.'
  }

  # ------------------------------------------------------------------
  Titulo 8 'Acompanhar a publicação'
  Info 'Vai abrir a aba "Actions". Aparece "Publicar HUB" com uma bolinha amarela (rodando).'
  Info 'Leva de 5 a 10 minutos. Bolinha VERDE = publicado. Vermelha = deu erro:'
  Info 'nesse caso clique nela, abra o passo que falhou e mande o texto para o Claude.'
  Abrir "$base/actions"
  Info ''
  Info "Quando ficar verde, a versão aparece em: $base/releases"
  Info 'O arquivo HUB-Simuladores.exe de lá é o que o usuário final baixa: dois cliques e pronto.'
  Info "Link fixo (sempre a versão mais recente): $base/releases/latest/download/HUB-Simuladores.exe"
  Write-Host ''
  Ok 'Configuração concluída. Nas próximas versões, abra o HUB-DESENVOLVEDOR.bat e use a aba Desenvolvedor.'
} catch {
  Write-Host ''
  Write-Host "  [ERRO] $($_.Exception.Message)" -ForegroundColor Red
  Write-Host '  Nada foi perdido. Corrija o problema e rode o assistente de novo: ele continua de onde parou.'
  exit 1
}
