# Baixa e instala a versao LTS mais recente do Node.js (site oficial nodejs.org).
$ErrorActionPreference = 'Stop'
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Write-Host '       Consultando a versao LTS atual...'
    $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing
    $lts = $index | Where-Object { $_.lts } | Select-Object -First 1
    $v = $lts.version
    $arch = 'x64'
    if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { $arch = 'arm64' }
    elseif (-not [Environment]::Is64BitOperatingSystem) { $arch = 'x86' }
    $url = "https://nodejs.org/dist/$v/node-$v-$arch.msi"
    $msi = Join-Path $env:TEMP "node-$v-$arch.msi"
    Write-Host "       Baixando Node.js $v ($arch)..."
    Invoke-WebRequest -Uri $url -OutFile $msi -UseBasicParsing
    Write-Host '       Instalando. Se o Windows pedir permissao, clique em Sim.'
    $p = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i', "`"$msi`"", '/passive', '/norestart') -Verb RunAs -Wait -PassThru
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { throw "o instalador retornou o codigo $($p.ExitCode)" }
    Remove-Item $msi -ErrorAction SilentlyContinue
    Write-Host '       Node.js instalado.' -ForegroundColor Green
    exit 0
}
catch {
    Write-Host "       Falha ao instalar: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '       Verifique a internet/proxy da rede ou instale manualmente em https://nodejs.org'
    exit 1
}
