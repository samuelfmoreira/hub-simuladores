# =====================================================================
#  Publicar uma versão nova do HUB
#  Aberto pelo PUBLICAR-VERSAO.bat. Arraste em cima do .bat o zip que
#  o Claude entregou: os arquivos do projeto são trocados pelos do zip
#  (preservando a chave privada, o .git e os seus dados) e a versão é
#  enviada ao GitHub, que publica e atualiza os HUBs instalados.
#  Sem zip, apenas envia o que estiver na pasta.
# =====================================================================
param([string]$Zip = '', [switch]$SemNavegador)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
$Raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Raiz

function Titulo($t) { Write-Host ''; Write-Host "==================== $t ====================" -ForegroundColor Cyan }
function Info($t) { Write-Host "  $t" }
function Ok($t) { Write-Host "  [OK] $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "  [!] $t" -ForegroundColor Yellow }
function Git-Rodar { & git @args; if ($LASTEXITCODE -ne 0) { throw "O comando 'git $($args -join ' ')' falhou (código $LASTEXITCODE)." } }
function Git-Silencioso {
  $antes = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $saida = & git @args 2>&1 | Out-String; $codigo = $LASTEXITCODE
  $ErrorActionPreference = $antes
  return @{ codigo = $codigo; saida = $saida.Trim() } }
function Versao($pasta) { (Get-Content (Join-Path $pasta 'hub/package.json') -Raw | ConvertFrom-Json).version }

# O que nunca é apagado nem substituído pelo zip
$PastasProtegidas = @('.git', 'node_modules', 'backups')
$CaminhosProtegidos = @('construir/chave-privada.pem', 'hub/chave-publica.pem', 'hub-config.json', 'canal.json', 'canal.local.json', 'construir/.cache', 'construir/dist')
function Protegido([string]$rel) {
  $r = $rel -replace '\\', '/'
  $partes = $r.Split('/')
  foreach ($p in $partes) { if ($PastasProtegidas -contains $p) { return $true } }
  foreach ($c in $CaminhosProtegidos) { if ($r -eq $c -or $r.StartsWith("$c/")) { return $true } }
  if ($r -match '^simuladores/[^/]+/data(/|$)') { return $true }
  if ($partes[0] -match '^_(atualizando|hub-antigo|importando)-') { return $true }
  return $false
}
function Relativo($base, $cheio) { $cheio.Substring($base.TrimEnd('\', '/').Length + 1) -replace '\\', '/' }

# Deixa "destino" igual a "origem": apaga o que não existe mais e copia o resto (fora os protegidos)
function Espelhar($origem, $destino) {
  $novos = @{}
  Get-ChildItem -LiteralPath $origem -Recurse -File -Force | ForEach-Object { $novos[(Relativo $origem $_.FullName)] = $_.FullName }
  $apagados = 0
  Get-ChildItem -LiteralPath $destino -Recurse -File -Force | ForEach-Object {
    $rel = Relativo $destino $_.FullName
    if (-not (Protegido $rel) -and -not $novos.ContainsKey($rel)) { Remove-Item -LiteralPath $_.FullName -Force; $apagados++ }
  }
  foreach ($rel in $novos.Keys) {
    if (Protegido $rel) { continue }
    $alvo = Join-Path $destino $rel
    $dir = Split-Path -Parent $alvo
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Copy-Item -LiteralPath $novos[$rel] -Destination $alvo -Force
  }
  # pastas que ficaram vazias
  Get-ChildItem -LiteralPath $destino -Recurse -Directory -Force | Sort-Object { $_.FullName.Length } -Descending | ForEach-Object {
    $rel = Relativo $destino $_.FullName
    if (-not (Protegido $rel) -and -not (Get-ChildItem -LiteralPath $_.FullName -Force)) { Remove-Item -LiteralPath $_.FullName -Force }
  }
  return @{ copiados = $novos.Count; apagados = $apagados }
}

try {
  Write-Host ''
  Write-Host '  PUBLICAR VERSÃO - HUB de Simuladores' -ForegroundColor White
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'O Git não está instalado. Rode primeiro o CONFIGURAR-GITHUB.bat.' }
  if (-not (Test-Path (Join-Path $Raiz '.git'))) { throw 'Esta pasta ainda não está ligada ao GitHub. Rode primeiro o CONFIGURAR-GITHUB.bat.' }
  $antes = Versao $Raiz

  # ------------------------------------------------------------------
  if ($Zip) {
    Titulo 'Aplicar o zip na pasta do projeto'
    if (-not (Test-Path -LiteralPath $Zip) -or [IO.Path]::GetExtension($Zip) -ne '.zip') { throw "Arquivo inválido: $Zip" }
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ("hub-zip-" + [Guid]::NewGuid().ToString('N'))
    Expand-Archive -LiteralPath $Zip -DestinationPath $tmp -Force
    $srv = Get-ChildItem -LiteralPath $tmp -Recurse -File -Filter 'server.js' | Where-Object { (Split-Path -Leaf (Split-Path -Parent $_.FullName)) -eq 'hub' } | Select-Object -First 1
    if (-not $srv) { Remove-Item -LiteralPath $tmp -Recurse -Force; throw 'Este zip não é o projeto do HUB (não achei hub\server.js). Se for o zip de um simulador, use a tela do HUB.' }
    $origem = Split-Path -Parent (Split-Path -Parent $srv.FullName)
    if (-not (Test-Path (Join-Path $origem '.github/workflows/publicar.yml'))) { Remove-Item -LiteralPath $tmp -Recurse -Force; throw 'Este zip não tem o arquivo de publicação (.github). Peça ao Claude o zip completo do projeto.' }
    $nova = Versao $origem
    Info "Versão na pasta: $antes   ->   versão no zip: $nova"
    $r = Espelhar $origem $Raiz
    Remove-Item -LiteralPath $tmp -Recurse -Force
    Ok "Arquivos atualizados ($($r.copiados) no projeto, $($r.apagados) removidos por não existirem mais)."
  }

  # ------------------------------------------------------------------
  Titulo 'Conferências'
  $versao = Versao $Raiz
  if (-not (Test-Path (Join-Path $Raiz 'hub/chave-publica.pem'))) { throw 'Falta hub\chave-publica.pem. Rode o CONFIGURAR-GITHUB.bat.' }
  if ((Git-Silencioso check-ignore -q construir/chave-privada.pem).codigo -ne 0) { throw 'Segurança: o .gitignore não está protegendo a chave privada. Envio cancelado.' }
  Ok 'Chave privada protegida (não vai para o GitHub).'
  $novidades = Join-Path $Raiz 'NOVIDADES.md'
  if ((Test-Path $novidades) -and ((Get-Content $novidades -Raw) -match "(?m)^## $([regex]::Escape($versao))\b")) { Ok "Notas da versão $versao encontradas no NOVIDADES.md." }
  else { Aviso "O NOVIDADES.md não tem a seção '## $versao'. A versão sai sem notas." }
  $tags = Git-Silencioso ls-remote --tags origin "v$versao"
  if ($tags.codigo -eq 0 -and $tags.saida) {
    Aviso "A versão $versao JÁ foi publicada. As mudanças serão salvas no GitHub, mas os HUBs só"
    Aviso 'atualizam quando o número da versão (hub\package.json) aumentar.'
  }

  # ------------------------------------------------------------------
  Titulo 'Enviar para o GitHub'
  Git-Rodar add -A
  if ((Git-Silencioso diff --cached --quiet).codigo -ne 0) { Git-Rodar commit -q -m "HUB $versao"; Ok "Versão $versao registrada." }
  else { Ok 'Nenhuma mudança nos arquivos.' }
  Git-Rodar push -q origin HEAD
  Ok 'Enviado.'

  $url = ((Git-Silencioso remote get-url origin).saida -replace '\.git$', '')
  Titulo 'Pronto'
  Info 'O GitHub está montando a versão (5 a 10 minutos). Acompanhe na aba Actions:'
  Info '  bolinha amarela = montando, VERDE = publicado, vermelha = erro (mande o texto para o Claude).'
  Info "Quando ficar verde, os HUBs instalados se atualizam na próxima vez que forem abertos."
  if (-not $SemNavegador) { try { Start-Process "$url/actions" } catch { Info "Endereço: $url/actions" } }
} catch {
  Write-Host ''
  Write-Host "  [ERRO] $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
