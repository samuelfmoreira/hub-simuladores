# Libera a porta 3001 (entrada TCP) no firewall do Windows. Pede permissao de administrador.
$cmd = 'netsh advfirewall firewall delete rule name="Sistema de Incendio (porta 3001)" >nul 2>&1 & netsh advfirewall firewall add rule name="Sistema de Incendio (porta 3001)" dir=in action=allow protocol=TCP localport=3001'
try {
    $p = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', $cmd) -Verb RunAs -Wait -PassThru -WindowStyle Hidden
    if ($p.ExitCode -eq 0) { Write-Host '       Porta 3000 liberada no firewall.' -ForegroundColor Green }
    else { Write-Host "       O firewall retornou o codigo $($p.ExitCode)." -ForegroundColor Yellow }
}
catch {
    Write-Host '       Permissao negada. A regra do firewall nao foi criada (o simulador funciona normalmente neste PC).' -ForegroundColor Yellow
}
