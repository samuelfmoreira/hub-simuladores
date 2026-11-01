# Baixa e instala o Node.js LTS oficial (nodejs.org), conferindo o SHA-256 do instalador.
# Chamado pelo instalar.bat quando o winget não está disponível.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$a = $env:PROCESSOR_ARCHITECTURE
if ($env:PROCESSOR_ARCHITEW6432) { $a = $env:PROCESSOR_ARCHITEW6432 }
switch ($a) { 'ARM64' { $arch = 'arm64' } 'x86' { $arch = 'x86' } default { $arch = 'x64' } }

Write-Host "Consultando a versão LTS atual em nodejs.org..."
$rel = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing | Where-Object { $_.lts } | Select-Object -First 1
$v = $rel.version
$nome = "node-$v-$arch.msi"
$msi = Join-Path $env:TEMP $nome

Write-Host "Baixando Node.js $v ($arch)..."
Invoke-WebRequest -Uri "https://nodejs.org/dist/$v/$nome" -OutFile $msi -UseBasicParsing

Write-Host "Conferindo a assinatura SHA-256..."
$somas = (Invoke-WebRequest -Uri "https://nodejs.org/dist/$v/SHASUMS256.txt" -UseBasicParsing).Content
$linha = ($somas -split "`n") | Where-Object { $_ -match [regex]::Escape($nome) } | Select-Object -First 1
$esperado = ($linha -split '\s+')[0].Trim().ToLower()
$obtido = (Get-FileHash -Algorithm SHA256 -Path $msi).Hash.ToLower()
if (-not $esperado -or $esperado -ne $obtido) {
    Remove-Item $msi -ErrorAction SilentlyContinue
    Write-Host "ERRO: o arquivo baixado não confere com o SHA-256 publicado. Instalação cancelada."
    exit 1
}

Write-Host "Instalando (pode levar alguns minutos)..."
$p = Start-Process msiexec.exe -ArgumentList @('/i', "`"$msi`"", '/qb', '/norestart') -Wait -PassThru
Remove-Item $msi -ErrorAction SilentlyContinue
if ($p.ExitCode -eq 3010) { exit 0 }   # instalado; pede reinício, mas já funciona
exit $p.ExitCode
