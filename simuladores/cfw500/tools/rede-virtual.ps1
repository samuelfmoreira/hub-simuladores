# =====================================================================
#  Rede virtual para o CODESYS conversar com o simulador CFW500
#  no MESMO computador.
#
#  Cria um "Microsoft KM-TEST Loopback Adapter" (placa de rede virtual
#  que já vem com o Windows), chamado CFW500-Rede, com dois IPs:
#
#     IpCodesys  (padrão 192.168.100.10)  -> o CODESYS / scanner usa este
#     IpCfw500   (padrão 192.168.100.20)  -> o simulador do inversor usa este
#
#  Também libera no firewall as portas do inversor:
#     TCP 44818, UDP 44818, UDP 2222 (EtherNet/IP), TCP 502 (Modbus TCP),
#     TCP 8080 (página do simulador)
#
#  Executar como administrador (o 2-criar-rede-virtual.bat já faz isso).
# =====================================================================
param(
  [string]$IpCodesys = '192.168.100.10',
  [string]$IpCfw500  = '192.168.100.20',
  [int]$Prefixo      = 24,
  [string]$Nome      = 'CFW500-Rede',
  [switch]$Remover
)

$ErrorActionPreference = 'Stop'
$GrupoFw = 'Simulador CFW500'

function Titulo($t) { Write-Host ''; Write-Host "== $t ==" -ForegroundColor Cyan }

# ---------------------------------------------------------------------
#  Remoção
# ---------------------------------------------------------------------
if ($Remover) {
  Titulo 'Removendo a rede virtual'
  $ad = Get-NetAdapter -Name $Nome -ErrorAction SilentlyContinue
  if ($ad) {
    $id = $ad.PnPDeviceID
    & pnputil.exe /remove-device "$id" | Out-Host
    Write-Host "Adaptador $Nome removido."
  } else { Write-Host "Adaptador $Nome não existe." }
  Get-NetFirewallRule -Group $GrupoFw -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  Write-Host 'Regras de firewall do simulador removidas.'
  exit 0
}

# ---------------------------------------------------------------------
#  Instalação do adaptador loopback via SetupAPI (sem precisar do devcon)
# ---------------------------------------------------------------------
$codigo = @'
using System;
using System.Runtime.InteropServices;
public static class Loopback {
  [StructLayout(LayoutKind.Sequential)]
  public struct SP_DEVINFO_DATA { public int cbSize; public Guid ClassGuid; public int DevInst; public IntPtr Reserved; }
  [DllImport("setupapi.dll", SetLastError = true)]
  static extern IntPtr SetupDiCreateDeviceInfoList(ref Guid ClassGuid, IntPtr hwndParent);
  [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool SetupDiCreateDeviceInfoW(IntPtr set, string name, ref Guid cls, string desc, IntPtr hwnd, int flags, ref SP_DEVINFO_DATA data);
  [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool SetupDiSetDeviceRegistryPropertyW(IntPtr set, ref SP_DEVINFO_DATA data, int prop, byte[] buf, int size);
  [DllImport("setupapi.dll", SetLastError = true)]
  static extern bool SetupDiCallClassInstaller(int func, IntPtr set, ref SP_DEVINFO_DATA data);
  [DllImport("setupapi.dll", SetLastError = true)]
  static extern bool SetupDiDestroyDeviceInfoList(IntPtr set);
  [DllImport("newdev.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool UpdateDriverForPlugAndPlayDevicesW(IntPtr hwnd, string hwid, string inf, int flags, out bool reboot);

  public static bool Instalar(string inf) {
    Guid net = new Guid("4d36e972-e325-11ce-bfc1-08002be10318");   // classe "Net"
    IntPtr set = SetupDiCreateDeviceInfoList(ref net, IntPtr.Zero);
    if (set == new IntPtr(-1)) throw new Exception("SetupDiCreateDeviceInfoList: " + Marshal.GetLastWin32Error());
    try {
      SP_DEVINFO_DATA d = new SP_DEVINFO_DATA();
      d.cbSize = Marshal.SizeOf(typeof(SP_DEVINFO_DATA));
      if (!SetupDiCreateDeviceInfoW(set, "NET", ref net, null, IntPtr.Zero, 1, ref d))
        throw new Exception("SetupDiCreateDeviceInfo: " + Marshal.GetLastWin32Error());
      byte[] hw = System.Text.Encoding.Unicode.GetBytes("*MSLOOP\0\0");
      if (!SetupDiSetDeviceRegistryPropertyW(set, ref d, 1, hw, hw.Length))
        throw new Exception("SetupDiSetDeviceRegistryProperty: " + Marshal.GetLastWin32Error());
      if (!SetupDiCallClassInstaller(0x19, set, ref d))
        throw new Exception("SetupDiCallClassInstaller: " + Marshal.GetLastWin32Error());
    } finally { SetupDiDestroyDeviceInfoList(set); }
    bool reboot;
    if (!UpdateDriverForPlugAndPlayDevicesW(IntPtr.Zero, "*MSLOOP", inf, 1, out reboot))
      throw new Exception("UpdateDriverForPlugAndPlayDevices: " + Marshal.GetLastWin32Error());
    return reboot;
  }
}
'@

Titulo 'Adaptador virtual'
$ad = Get-NetAdapter -Name $Nome -ErrorAction SilentlyContinue
if ($ad) {
  Write-Host "O adaptador $Nome já existe. Só vou conferir a configuração."
} else {
  $antes = @(Get-NetAdapter | Where-Object InterfaceDescription -like '*KM-TEST*' | ForEach-Object ifIndex)
  Write-Host 'Instalando o Microsoft KM-TEST Loopback Adapter...'
  Add-Type -TypeDefinition $codigo
  $inf = Join-Path $env:windir 'inf\netloop.inf'
  try {
    $reboot = [Loopback]::Instalar($inf)
    if ($reboot) { Write-Host 'O Windows pediu reinicialização; se o adaptador não aparecer, reinicie e rode de novo.' -ForegroundColor Yellow }
  } catch {
    Write-Host "Falha ao instalar automaticamente: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Instale manualmente: Win+R -> hdwwiz -> "Instalar o hardware que eu selecionar manualmente"'
    Write-Host '  -> Adaptadores de rede -> Microsoft -> "Microsoft KM-TEST Loopback Adapter". Depois rode este .bat de novo.'
    exit 1
  }
  # espera o adaptador aparecer
  $novo = $null
  for ($i = 0; $i -lt 30 -and -not $novo; $i++) {
    Start-Sleep -Milliseconds 500
    $novo = Get-NetAdapter | Where-Object { $_.InterfaceDescription -like '*KM-TEST*' -and $antes -notcontains $_.ifIndex } | Select-Object -First 1
  }
  if (-not $novo) { Write-Host 'O adaptador não apareceu. Reinicie o Windows e rode de novo.' -ForegroundColor Red; exit 1 }
  Rename-NetAdapter -Name $novo.Name -NewName $Nome
  $ad = Get-NetAdapter -Name $Nome
  Write-Host "Adaptador criado: $Nome ($($ad.InterfaceDescription))"
}
Enable-NetAdapter -Name $Nome -Confirm:$false -ErrorAction SilentlyContinue

# ---------------------------------------------------------------------
#  Endereços IP fixos
# ---------------------------------------------------------------------
Titulo 'Endereços IP'
Set-NetIPInterface -InterfaceAlias $Nome -AddressFamily IPv4 -Dhcp Disabled -InterfaceMetric 500
Get-NetIPAddress -InterfaceAlias $Nome -AddressFamily IPv4 -ErrorAction SilentlyContinue | Remove-NetIPAddress -Confirm:$false -ErrorAction SilentlyContinue
New-NetIPAddress -InterfaceAlias $Nome -IPAddress $IpCodesys -PrefixLength $Prefixo | Out-Null
# o IP do inversor não é usado como origem automática: assim o Windows sempre sai pelo IP do CODESYS
New-NetIPAddress -InterfaceAlias $Nome -IPAddress $IpCfw500 -PrefixLength $Prefixo -SkipAsSource $true | Out-Null
Get-NetIPAddress -InterfaceAlias $Nome -AddressFamily IPv4 | Format-Table IPAddress, PrefixLength, SkipAsSource -AutoSize | Out-Host

# rede "sem identificação" costuma cair no perfil Público; tenta marcar como Privada
try { Set-NetConnectionProfile -InterfaceAlias $Nome -NetworkCategory Private -ErrorAction Stop; Write-Host 'Perfil de rede: Privada' }
catch { Write-Host 'Não foi possível mudar o perfil para Privada (as regras abaixo valem para qualquer perfil).' }

# ---------------------------------------------------------------------
#  Firewall
# ---------------------------------------------------------------------
Titulo 'Firewall'
Get-NetFirewallRule -Group $GrupoFw -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -Group $GrupoFw -DisplayName 'CFW500 - EtherNet/IP TCP 44818' -Direction Inbound -Protocol TCP -LocalPort 44818 -Action Allow -Profile Any | Out-Null
New-NetFirewallRule -Group $GrupoFw -DisplayName 'CFW500 - EtherNet/IP UDP 44818 e 2222' -Direction Inbound -Protocol UDP -LocalPort 44818,2222 -Action Allow -Profile Any | Out-Null
New-NetFirewallRule -Group $GrupoFw -DisplayName 'CFW500 - Modbus TCP 502' -Direction Inbound -Protocol TCP -LocalPort 502 -Action Allow -Profile Any | Out-Null
New-NetFirewallRule -Group $GrupoFw -DisplayName 'CFW500 - Pagina web 8080' -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Any | Out-Null
Write-Host "Liberadas: TCP 44818, UDP 44818, UDP 2222, TCP 502, TCP 8080 (grupo '$GrupoFw')."

# ---------------------------------------------------------------------
#  Teste rápido
# ---------------------------------------------------------------------
Titulo 'Teste'
$ok1 = Test-Connection -ComputerName $IpCodesys -Count 1 -Quiet
$ok2 = Test-Connection -ComputerName $IpCfw500 -Count 1 -Quiet
Write-Host "ping $IpCodesys : $(if ($ok1) {'OK'} else {'falhou'})"
Write-Host "ping $IpCfw500 : $(if ($ok2) {'OK'} else {'falhou'})"

Titulo 'Pronto'
Write-Host "  CFW500 simulado : $IpCfw500  (use 3-iniciar-simulador.bat)"
Write-Host "  CODESYS         : $IpCodesys"
Write-Host ''
Write-Host '  No CODESYS, no dispositivo Ethernet (acima do EtherNet/IP Scanner):'
Write-Host "   1) Interface de rede: $Nome"
Write-Host "   2) Endereço IP: $IpCodesys   Máscara: 255.255.255.0"
Write-Host '   3) DESMARQUE "Ajustar configurações do sistema operacional"'
Write-Host '      (senão o CODESYS apaga o segundo IP do adaptador).'
Write-Host "   4) No CFW500 (adapter): IP $IpCfw500, conexão 100/150, T->O ponto a ponto."
