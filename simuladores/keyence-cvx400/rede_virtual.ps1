# =====================================================================
#  REDE VIRTUAL DO SIMULADOR DE VISÃO (Keyence CV-X / EtherNet/IP)
# =====================================================================
#  Chamado pelo configurar_rede_virtual.bat (já como administrador).
#
#  1) Rede virtual neste PC (CODESYS Control Win + câmeras no mesmo PC)
#     - instala o "Microsoft KM-TEST Loopback Adapter" e o renomeia SIM_VISAO
#     - IP do CLP (CODESYS) e um IP por câmera, todos na mesma placa
#     - os IPs das câmeras são marcados "SkipAsSource": o Windows não os usa
#       como origem, então o CODESYS sai sempre pelo IP dele
#  2) IPs de câmeras numa placa existente (CLPs reais ligados na rede)
#  3) Remover tudo (IPs, adaptador virtual, regras de firewall)
#  4) Mostrar a configuração atual
#
#  Em todos os casos: libera TCP 44818 e UDP 44818/2222 no firewall e grava
#  o config_cameras.json do simulador (uma câmera por IP).
# =====================================================================

param([string]$Pasta = $PSScriptRoot)

$ErrorActionPreference = "Stop"
$NOME_PLACA = "SIM_VISAO"
$ARQ_CAMERAS = Join-Path $Pasta "config_cameras.json"
$REGRA = "Simulador CV-X EtherNet/IP"

# ---------------------------------------------------------------------
# Instalação do adaptador de loopback pela SetupAPI (mesmo método do devcon)
# ---------------------------------------------------------------------
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public static class LoopbackInstaller {
    [StructLayout(LayoutKind.Sequential)]
    struct SP_DEVINFO_DATA { public int cbSize; public Guid ClassGuid; public int DevInst; public IntPtr Reserved; }

    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool SetupDiGetINFClassW(string infName, out Guid classGuid, StringBuilder className, int size, out int required);
    [DllImport("setupapi.dll", SetLastError = true)]
    static extern IntPtr SetupDiCreateDeviceInfoList(ref Guid classGuid, IntPtr hwnd);
    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool SetupDiCreateDeviceInfoW(IntPtr set, string name, ref Guid classGuid, string desc, IntPtr hwnd, int flags, ref SP_DEVINFO_DATA data);
    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool SetupDiSetDeviceRegistryPropertyW(IntPtr set, ref SP_DEVINFO_DATA data, int property, byte[] buffer, int size);
    [DllImport("setupapi.dll", SetLastError = true)]
    static extern bool SetupDiCallClassInstaller(int function, IntPtr set, ref SP_DEVINFO_DATA data);
    [DllImport("setupapi.dll", SetLastError = true)]
    static extern bool SetupDiDestroyDeviceInfoList(IntPtr set);
    [DllImport("newdev.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool UpdateDriverForPlugAndPlayDevicesW(IntPtr hwnd, string hardwareId, string infPath, int flags, out bool reboot);

    const int DICD_GENERATE_ID = 1;
    const int SPDRP_HARDWAREID = 1;
    const int DIF_REGISTERDEVICE = 0x19;
    const int INSTALLFLAG_FORCE = 1;

    public static bool Instalar(string inf, string hardwareId) {
        Guid classe;
        StringBuilder nomeClasse = new StringBuilder(256);
        int req;
        if (!SetupDiGetINFClassW(inf, out classe, nomeClasse, 256, out req)) throw new Win32Exception();

        IntPtr set = SetupDiCreateDeviceInfoList(ref classe, IntPtr.Zero);
        if (set == new IntPtr(-1)) throw new Win32Exception();
        try {
            SP_DEVINFO_DATA d = new SP_DEVINFO_DATA();
            d.cbSize = Marshal.SizeOf(typeof(SP_DEVINFO_DATA));
            if (!SetupDiCreateDeviceInfoW(set, nomeClasse.ToString(), ref classe, null, IntPtr.Zero, DICD_GENERATE_ID, ref d))
                throw new Win32Exception();
            byte[] hw = Encoding.Unicode.GetBytes(hardwareId + "\0\0");
            if (!SetupDiSetDeviceRegistryPropertyW(set, ref d, SPDRP_HARDWAREID, hw, hw.Length)) throw new Win32Exception();
            if (!SetupDiCallClassInstaller(DIF_REGISTERDEVICE, set, ref d)) throw new Win32Exception();
        } finally {
            SetupDiDestroyDeviceInfoList(set);
        }
        bool reboot;
        if (!UpdateDriverForPlugAndPlayDevicesW(IntPtr.Zero, hardwareId, inf, INSTALLFLAG_FORCE, out reboot))
            throw new Win32Exception();
        return reboot;
    }
}
'@

# ---------------------------------------------------------------------
# Utilitários
# ---------------------------------------------------------------------
function Titulo($t) { Write-Host ""; Write-Host "== $t ==" -ForegroundColor Cyan }
function Ok($t) { Write-Host "  [OK] $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "  [!] $t" -ForegroundColor Yellow }

function Perguntar($texto, $padrao) {
    $r = Read-Host "$texto [$padrao]"
    if ([string]::IsNullOrWhiteSpace($r)) { return [string]$padrao }
    return $r.Trim()
}

function EhIp($t) {
    if ($t -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { return $false }
    foreach ($n in $t.Split('.')) { if ([int]$n -gt 255) { return $false } }
    return $true
}

function Get-PlacaVirtual {
    Get-NetAdapter -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -eq $NOME_PLACA -or $_.InterfaceDescription -like "*KM-TEST*" } |
        Select-Object -First 1
}

function Criar-PlacaVirtual {
    $p = Get-PlacaVirtual
    if ($p) {
        if ($p.Name -ne $NOME_PLACA) { Rename-NetAdapter -Name $p.Name -NewName $NOME_PLACA }
        Ok "Adaptador virtual ja existe: $NOME_PLACA ($($p.InterfaceDescription))"
        return
    }
    Write-Host "  Instalando o Microsoft KM-TEST Loopback Adapter..."
    $inf = Join-Path $env:windir "inf\netloop.inf"
    if (-not (Test-Path $inf)) { throw "Arquivo $inf nao encontrado neste Windows." }
    $reboot = [LoopbackInstaller]::Instalar($inf, "*MSLOOP")
    for ($i = 0; $i -lt 30 -and -not $p; $i++) {
        Start-Sleep -Seconds 1
        $p = Get-PlacaVirtual
    }
    if (-not $p) { throw "O adaptador foi instalado, mas nao apareceu nas conexoes de rede. Reinicie o PC e rode de novo." }
    Rename-NetAdapter -Name $p.Name -NewName $NOME_PLACA
    Ok "Adaptador virtual criado: $NOME_PLACA"
    if ($reboot) { Aviso "O Windows pediu reinicializacao para concluir a instalacao do driver." }
}

function Colocar-Ip($alias, $ip, $prefixo, $pularOrigem) {
    # Não mexe em IP de outra placa: só recria se já estiver nesta mesma placa
    $existente = Get-NetIPAddress -IPAddress $ip -ErrorAction SilentlyContinue
    if ($existente) {
        if ($existente.InterfaceAlias -ne $alias) {
            throw "O IP $ip ja esta em uso na placa '$($existente.InterfaceAlias)'. Escolha outra faixa de IPs."
        }
        $existente | Remove-NetIPAddress -Confirm:$false
    }
    New-NetIPAddress -InterfaceAlias $alias -IPAddress $ip -PrefixLength $prefixo -SkipAsSource $pularOrigem | Out-Null
}

function Liberar-Firewall {
    Get-NetFirewallRule -DisplayName "$REGRA*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName "$REGRA (TCP 44818)" -Direction Inbound -Protocol TCP -LocalPort 44818 -Action Allow -Profile Any | Out-Null
    New-NetFirewallRule -DisplayName "$REGRA (UDP 44818 e 2222-2240)" -Direction Inbound -Protocol UDP -LocalPort 44818, "2222-2240" -Action Allow -Profile Any | Out-Null
    Ok "Firewall: TCP 44818 e UDP 44818 / 2222 a 2240 liberados em todas as redes"
}

function Gravar-Cameras($ips) {
    $linhas = @()
    for ($i = 0; $i -lt $ips.Count; $i++) {
        $linhas += "    { ""nome"": ""Câmera $($i + 1)"", ""ip"": ""$($ips[$i])"", ""ipClp"": """" }"
    }
    $json = "{`r`n  ""cameras"": [`r`n" + ($linhas -join ",`r`n") + "`r`n  ]`r`n}`r`n"
    [IO.File]::WriteAllText($ARQ_CAMERAS, $json, (New-Object Text.UTF8Encoding($false)))
    Ok "Simulador configurado com $($ips.Count) camera(s): $ARQ_CAMERAS"
}

function Ips-Sequencia($base, $inicio, $qtd) {
    $lista = @()
    for ($i = 0; $i -lt $qtd; $i++) { $lista += "$base.$($inicio + $i)" }
    return $lista
}

# ---------------------------------------------------------------------
# 1) Rede virtual neste PC
# ---------------------------------------------------------------------
function Opcao-Virtual {
    Titulo "Rede virtual neste PC (CODESYS + cameras)"
    $base = Perguntar "Rede (3 primeiros numeros)" "192.168.100"
    if (-not (EhIp "$base.1")) { throw "Rede invalida: $base" }
    $finalClp = [int](Perguntar "Final do IP do CLP/CODESYS" "10")
    $qtd = [int](Perguntar "Quantidade de cameras" "2")
    if ($qtd -lt 1 -or $qtd -gt 20) { throw "Use de 1 a 20 cameras." }
    $inicio = [int](Perguntar "Final do IP da primeira camera" "21")
    $ipClp = "$base.$finalClp"
    $ipsCam = Ips-Sequencia $base $inicio $qtd
    if ($ipsCam -contains $ipClp -or ($inicio + $qtd - 1) -gt 254) { throw "Faixa de IPs invalida." }

    foreach ($ip in @($ipClp) + $ipsCam) {
        $e = Get-NetIPAddress -IPAddress $ip -ErrorAction SilentlyContinue
        if ($e -and $e.InterfaceAlias -ne $NOME_PLACA) { throw "O IP $ip ja esta em uso na placa '$($e.InterfaceAlias)'. Escolha outra rede." }
    }
    Criar-PlacaVirtual
    Set-NetIPInterface -InterfaceAlias $NOME_PLACA -AddressFamily IPv4 -Dhcp Disabled
    Get-NetIPAddress -InterfaceAlias $NOME_PLACA -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Remove-NetIPAddress -Confirm:$false
    Colocar-Ip $NOME_PLACA $ipClp 24 $false
    Ok "CLP / CODESYS: $ipClp"
    foreach ($ip in $ipsCam) {
        Colocar-Ip $NOME_PLACA $ip 24 $true
        Ok "Camera: $ip"
    }
    try { Set-NetConnectionProfile -InterfaceAlias $NOME_PLACA -NetworkCategory Private } catch { }
    Liberar-Firewall
    Gravar-Cameras $ipsCam

    Titulo "Proximos passos"
    Write-Host "  1. No CODESYS, no dispositivo Ethernet, escolha a placa $NOME_PLACA ($ipClp)."
    Write-Host "  2. Em cada CV_X400_Series, coloque o IP de uma camera:"
    for ($i = 0; $i -lt $ipsCam.Count; $i++) { Write-Host "       Camera $($i + 1): $($ipsCam[$i])" }
    Write-Host "  3. Use conexao T->O ponto a ponto (multicast nao circula numa placa de loopback)."
    Write-Host "  4. Inicie (ou reinicie) o simulador com o iniciar_simulador.bat."
}

# ---------------------------------------------------------------------
# 2) IPs de câmeras numa placa existente
# ---------------------------------------------------------------------
function Opcao-Placa {
    Titulo "IPs de cameras numa placa de rede existente"
    $placas = @(Get-NetAdapter | Where-Object { $_.Status -eq "Up" -and $_.Name -ne $NOME_PLACA } | Sort-Object Name)
    if (-not $placas.Count) { throw "Nenhuma placa de rede conectada." }
    for ($i = 0; $i -lt $placas.Count; $i++) {
        $ip = (Get-NetIPAddress -InterfaceAlias $placas[$i].Name -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Select-Object -First 1)
        $txt = if ($ip) { "$($ip.IPAddress)/$($ip.PrefixLength)" } else { "sem IPv4" }
        Write-Host ("  {0}) {1}  [{2}]  {3}" -f ($i + 1), $placas[$i].Name, $txt, $placas[$i].InterfaceDescription)
    }
    $n = [int](Perguntar "Numero da placa" "1") - 1
    if ($n -lt 0 -or $n -ge $placas.Count) { throw "Opcao invalida." }
    $alias = $placas[$n].Name

    $iface = Get-NetIPInterface -InterfaceAlias $alias -AddressFamily IPv4
    if ($iface.Dhcp -eq "Enabled") {
        throw "A placa '$alias' esta em DHCP (IP automatico) e o Windows nao aceita IPs extras assim. Coloque um IP fixo nela (Painel de Controle > Central de Rede > Propriedades > IPv4) e rode de novo."
    }
    $atual = Get-NetIPAddress -InterfaceAlias $alias -AddressFamily IPv4 | Select-Object -First 1
    $partes = $atual.IPAddress.Split('.')
    $base = "$($partes[0]).$($partes[1]).$($partes[2])"
    Write-Host "  IP atual da placa: $($atual.IPAddress)/$($atual.PrefixLength)"
    $qtd = [int](Perguntar "Quantidade de cameras" "2")
    $inicio = [int](Perguntar "Final do IP da primeira camera (na rede $base)" "201")
    $ipsCam = Ips-Sequencia $base $inicio $qtd

    foreach ($ip in $ipsCam) {
        $ehDeste = Get-NetIPAddress -IPAddress $ip -ErrorAction SilentlyContinue
        if (-not $ehDeste -and (Test-Connection -ComputerName $ip -Count 1 -Quiet)) {
            throw "O IP $ip ja responde na rede (outro equipamento). Escolha outra faixa."
        }
    }
    foreach ($ip in $ipsCam) {
        Colocar-Ip $alias $ip $atual.PrefixLength $true
        Ok "Camera: $ip na placa $alias"
    }
    Liberar-Firewall
    Gravar-Cameras $ipsCam

    Titulo "Proximos passos"
    Write-Host "  Em cada CLP, no CV_X400_Series, coloque o IP de uma camera:"
    for ($i = 0; $i -lt $ipsCam.Count; $i++) { Write-Host "       Camera $($i + 1): $($ipsCam[$i])" }
    Write-Host "  Depois inicie (ou reinicie) o simulador."
}

# ---------------------------------------------------------------------
# 3) Remover
# ---------------------------------------------------------------------
function Opcao-Remover {
    Titulo "Remover a configuracao"
    if (Test-Path $ARQ_CAMERAS) {
        $cfg = Get-Content $ARQ_CAMERAS -Raw | ConvertFrom-Json
        foreach ($c in $cfg.cameras) {
            if ($c.ip -and $c.ip -ne "0.0.0.0") {
                $end = Get-NetIPAddress -IPAddress $c.ip -ErrorAction SilentlyContinue
                if ($end) { $end | Remove-NetIPAddress -Confirm:$false; Ok "IP $($c.ip) removido" }
            }
        }
        Remove-Item $ARQ_CAMERAS
        Ok "config_cameras.json apagado (o simulador volta a ter 1 camera em todos os IPs)"
    }
    $p = Get-PlacaVirtual
    if ($p) {
        $dev = Get-PnpDevice -FriendlyName $p.InterfaceDescription -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($dev) {
            & pnputil /remove-device "$($dev.InstanceId)" | Out-Null
            if ($LASTEXITCODE -eq 0) { Ok "Adaptador $NOME_PLACA removido" }
            else { Aviso "Remova o adaptador '$($p.InterfaceDescription)' no Gerenciador de Dispositivos > Adaptadores de rede." }
        }
    }
    Get-NetFirewallRule -DisplayName "$REGRA*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    Ok "Regras de firewall removidas"
}

# ---------------------------------------------------------------------
# 4) Mostrar
# ---------------------------------------------------------------------
function Opcao-Mostrar {
    Titulo "Configuracao atual"
    $p = Get-PlacaVirtual
    if ($p) {
        Write-Host "  Adaptador virtual: $($p.Name) ($($p.Status))"
        Get-NetIPAddress -InterfaceAlias $p.Name -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            ForEach-Object { Write-Host ("    {0}/{1}  {2}" -f $_.IPAddress, $_.PrefixLength, $(if ($_.SkipAsSource) { "camera" } else { "CLP / CODESYS" })) }
    } else {
        Write-Host "  Sem adaptador virtual."
    }
    if (Test-Path $ARQ_CAMERAS) {
        Write-Host "  config_cameras.json:"
        (Get-Content $ARQ_CAMERAS -Raw | ConvertFrom-Json).cameras |
            ForEach-Object { Write-Host "    $($_.nome): $($_.ip)" }
    } else {
        Write-Host "  Sem config_cameras.json (1 camera em todos os IPs)."
    }
    $r = Get-NetFirewallRule -DisplayName "$REGRA*" -ErrorAction SilentlyContinue
    Write-Host "  Regras de firewall do simulador: $(@($r).Count)"
}

# ---------------------------------------------------------------------
Titulo "Rede do Simulador de Visao CV-X"
Write-Host "  1) Criar rede virtual neste PC (CODESYS Control Win + cameras no mesmo PC)"
Write-Host "  2) Adicionar IPs de cameras numa placa existente (CLPs reais na rede)"
Write-Host "  3) Remover a configuracao (IPs, adaptador virtual e firewall)"
Write-Host "  4) Mostrar a configuracao atual"
$op = Perguntar "Opcao" "1"
try {
    switch ($op) {
        "1" { Opcao-Virtual }
        "2" { Opcao-Placa }
        "3" { Opcao-Remover }
        "4" { Opcao-Mostrar }
        default { Aviso "Opcao invalida." }
    }
} catch {
    Write-Host ""
    Write-Host "  [ERRO] $($_.Exception.Message)" -ForegroundColor Red
}
