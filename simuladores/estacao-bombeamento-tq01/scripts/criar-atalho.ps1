# Cria o atalho "Simulador Estacao TQ-01" na area de trabalho apontando para INICIAR_SIMULADOR.bat
param([string]$Pasta)
try {
    $Pasta = (Resolve-Path $Pasta).Path
    $desk = [Environment]::GetFolderPath('Desktop')
    $sh = New-Object -ComObject WScript.Shell
    $lnk = $sh.CreateShortcut((Join-Path $desk 'Simulador Estacao TQ-01.lnk'))
    $lnk.TargetPath = Join-Path $Pasta 'INICIAR_SIMULADOR.bat'
    $lnk.WorkingDirectory = $Pasta
    $ico = Join-Path $Pasta 'assets\simulador.ico'
    if (Test-Path $ico) { $lnk.IconLocation = "$ico,0" } else { $lnk.IconLocation = "$env:SystemRoot\System32\shell32.dll,13" }
    $lnk.Description = 'Simulador Estacao de bombeamento TQ-01 (OPC UA)'
    $lnk.Save()
    Write-Host '       Atalho criado.' -ForegroundColor Green
}
catch {
    Write-Host "       Nao foi possivel criar o atalho: $($_.Exception.Message)" -ForegroundColor Yellow
}
