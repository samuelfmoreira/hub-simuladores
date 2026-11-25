# Cria o atalho "Sensor ultrassonico de nivel LT-01" na area de trabalho apontando para INICIAR_SIMULADOR.bat
param([string]$Pasta)
try {
    $Pasta = (Resolve-Path $Pasta).Path
    $desk = [Environment]::GetFolderPath('Desktop')
    $sh = New-Object -ComObject WScript.Shell
    $lnk = $sh.CreateShortcut((Join-Path $desk 'Sensor ultrassonico de nivel LT-01.lnk'))
    $lnk.TargetPath = Join-Path $Pasta 'INICIAR_SIMULADOR.bat'
    $lnk.WorkingDirectory = $Pasta
    $ico = Join-Path $Pasta 'assets\simulador.ico'
    if (Test-Path $ico) { $lnk.IconLocation = "$ico,0" } else { $lnk.IconLocation = "$env:SystemRoot\System32\shell32.dll,13" }
    $lnk.Description = 'Sensor ultrassonico de nivel LT-01 (Modbus TCP)'
    $lnk.Save()
    Write-Host '       Atalho criado.' -ForegroundColor Green
}
catch {
    Write-Host "       Nao foi possivel criar o atalho: $($_.Exception.Message)" -ForegroundColor Yellow
}
