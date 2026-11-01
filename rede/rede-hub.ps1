# =====================================================================
#  Rede virtual do HUB de Simuladores (Windows)
#
#  Uma única placa virtual (Microsoft KM-TEST Loopback Adapter) para todo
#  o laboratório, com:
#     - o IP do CLP / CODESYS (usado como origem pelo Windows)
#     - um IP por simulador (marcado SkipAsSource: o Windows não sai por ele)
#
#  Ações (-Acao):
#     status        mostra a situação em JSON (não precisa de administrador)
#     criar         cria a placa se faltar e acrescenta os IPs que faltam
#     remover-ip    tira os IPs indicados em -Ips
#     migrar        remove as placas antigas dos simuladores (CFW500-Rede,
#                   SIM_VISAO...) que usam a mesma faixa e depois faz "criar"
#     firewall      só recria as regras de firewall
#     remover-tudo  remove a placa e as regras de firewall
#
#  Chamado pelo HUB (aba Rede) ou pelo rede-virtual.bat.
# =====================================================================
param(
  [ValidateSet('status', 'criar', 'remover-ip', 'migrar', 'firewall', 'remover-tudo')]
  [string]$Acao = 'status',
  [string]$Adaptador = 'SIM-HUB',
  [int]$Prefixo = 24,
  [string]$IpClp = '192.168.100.10',
  [string]$Ips = '',
  [int]$PortaHub = 4000,
  [string]$Resultado = ''
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$GrupoFw = 'Simulador HUB'
$NomesAntigos = @('CFW500-Rede', 'SIM_VISAO')
$Mensagens = New-Object System.Collections.Generic.List[string]
$script:placa = $null

function Msg([string]$t, [string]$cor = 'Gray') {
  $Mensagens.Add($t)
  if ($Acao -ne 'status') { Write-Host $t -ForegroundColor $cor }
}
function Titulo([string]$t) { if ($Acao -ne 'status') { Write-Host ''; Write-Host "== $t ==" -ForegroundColor Cyan } }
function EhAdmin {
  $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
function Lista-Ips([string]$texto) { @($texto -split '[,; ]+' | Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}$' }) }
function IpParaNumero([string]$ip) {
  $b = ([System.Net.IPAddress]::Parse($ip)).GetAddressBytes(); [Array]::Reverse($b); [BitConverter]::ToUInt32($b, 0)
}
function MesmaRede([string]$a, [string]$b) {
  $mascara = [uint32]([math]::Pow(2, 32) - [math]::Pow(2, 32 - $Prefixo))
  ((IpParaNumero $a) -band $mascara) -eq ((IpParaNumero $b) -band $mascara)
}

# ---------------------------------------------------------------------
#  Instalação do adaptador loopback via SetupAPI (sem precisar do devcon)
# ---------------------------------------------------------------------
$codigoLoopback = @'
using System;
using System.Runtime.InteropServices;
public static class HubLoopback {
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
    Guid net = new Guid("4d36e972-e325-11ce-bfc1-08002be10318");
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

function Get-Placa { Get-NetAdapter -Name $Adaptador -ErrorAction SilentlyContinue }

function Get-OutrasLoopback {
  @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceDescription -like '*KM-TEST*' -and $_.Name -ne $Adaptador })
}

function Ips-DaPlaca($ifIndex) {
  @(Get-NetIPAddress -InterfaceIndex $ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue)
}

function Garantir-Placa {
  $p = Get-Placa
  if ($p) {
    Msg "  [OK] A placa $Adaptador já existe."
  } else {
    $antes = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object InterfaceDescription -like '*KM-TEST*' | ForEach-Object ifIndex)
    Msg '  Instalando o Microsoft KM-TEST Loopback Adapter...'
    Add-Type -TypeDefinition $codigoLoopback
    $inf = Join-Path $env:windir 'inf\netloop.inf'
    try {
      if ([HubLoopback]::Instalar($inf)) { Msg '  [!] O Windows pediu reinicialização. Se a placa não aparecer, reinicie e rode de novo.' 'Yellow' }
    } catch {
      throw ("Falha ao instalar a placa virtual: $($_.Exception.Message). Instale manualmente: Win+R, hdwwiz, " +
        '"Instalar o hardware que eu selecionar manualmente", Adaptadores de rede, Microsoft, "Microsoft KM-TEST Loopback Adapter". Depois rode de novo.')
    }
    $novo = $null
    for ($i = 0; $i -lt 30 -and -not $novo; $i++) {
      Start-Sleep -Milliseconds 500
      $novo = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceDescription -like '*KM-TEST*' -and $antes -notcontains $_.ifIndex } | Select-Object -First 1
    }
    if (-not $novo) { throw 'A placa virtual não apareceu. Reinicie o Windows e rode de novo.' }
    Rename-NetAdapter -Name $novo.Name -NewName $Adaptador
    $p = Get-Placa
    Msg "  [OK] Placa criada: $Adaptador" 'Green'
  }
  Enable-NetAdapter -Name $Adaptador -Confirm:$false -ErrorAction SilentlyContinue
  Set-NetIPInterface -InterfaceIndex $p.ifIndex -AddressFamily IPv4 -Dhcp Disabled -InterfaceMetric 500
  # endereço automático 169.254.x.x não serve para o laboratório
  Ips-DaPlaca $p.ifIndex | Where-Object { $_.IPAddress -like '169.254.*' } | Remove-NetIPAddress -Confirm:$false -ErrorAction SilentlyContinue
  $script:placa = $p
}

function Colocar-Ip([string]$ip, [bool]$dispositivo) {
  $existente = Get-NetIPAddress -IPAddress $ip -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1
  $papel = if ($dispositivo) { 'simulador' } else { 'CLP / CODESYS' }
  if ($existente) {
    if ($existente.InterfaceIndex -eq $script:placa.ifIndex) {
      if ([bool]$existente.SkipAsSource -ne $dispositivo) {
        Set-NetIPAddress -IPAddress $ip -InterfaceIndex $script:placa.ifIndex -SkipAsSource $dispositivo
      }
      Msg "  [OK] $ip ($papel) já estava na placa."
    } else {
      Msg "  [!] $ip já existe na placa '$($existente.InterfaceAlias)'. Não foi duplicado: use 'Migrar redes antigas' ou tire o IP de lá." 'Yellow'
    }
    return
  }
  New-NetIPAddress -InterfaceIndex $script:placa.ifIndex -IPAddress $ip -PrefixLength $Prefixo -SkipAsSource $dispositivo | Out-Null
  Msg "  [OK] $ip adicionado ($papel)." 'Green'
}

function Liberar-Firewall {
  Get-NetFirewallRule -Group $GrupoFw -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule -Group $GrupoFw -DisplayName 'HUB - EtherNet/IP (TCP 44818)' -Direction Inbound -Protocol TCP -LocalPort 44818 -Action Allow -Profile Any | Out-Null
  New-NetFirewallRule -Group $GrupoFw -DisplayName 'HUB - EtherNet/IP (UDP 44818, 2222, 2223)' -Direction Inbound -Protocol UDP -LocalPort 44818, 2222, 2223 -Action Allow -Profile Any | Out-Null
  New-NetFirewallRule -Group $GrupoFw -DisplayName 'HUB - Modbus TCP (502, 5020)' -Direction Inbound -Protocol TCP -LocalPort 502, 5020 -Action Allow -Profile Any | Out-Null
  New-NetFirewallRule -Group $GrupoFw -DisplayName 'HUB - Telas dos simuladores' -Direction Inbound -Protocol TCP -LocalPort @("$PortaHub", '3000-3001', '3100-3199', '8080') -Action Allow -Profile Any | Out-Null
  Msg "  [OK] Liberadas: TCP 44818, UDP 44818/2222/2223, TCP 502/5020 e as telas web (grupo '$GrupoFw')." 'Green'
}

function Criar {
  Titulo 'Placa virtual'
  Garantir-Placa
  Titulo 'Endereços IP'
  Colocar-Ip $IpClp $false
  foreach ($ip in (Lista-Ips $Ips)) { if ($ip -ne $IpClp) { Colocar-Ip $ip $true } }
  try { Set-NetConnectionProfile -InterfaceIndex $script:placa.ifIndex -NetworkCategory Private -ErrorAction Stop; Msg '  Perfil de rede: Privada.' }
  catch { Msg '  Perfil de rede mantido (as regras de firewall valem para qualquer perfil).' }
  Titulo 'Firewall'
  Liberar-Firewall
  Titulo 'Teste'
  $ok = Test-Connection -ComputerName $IpClp -Count 1 -Quiet
  Msg "  ping $IpClp : $(if ($ok) { 'OK' } else { 'sem resposta' })"
  Msg ''
  Msg "No CODESYS: placa '$Adaptador', IP $IpClp, máscara de $Prefixo bits."
  Msg 'Desmarque "Ajustar configurações do sistema operacional", senão o CODESYS apaga os IPs dos simuladores.'
}

function Migrar {
  Titulo 'Placas antigas'
  $removidas = 0
  foreach ($a in (Get-OutrasLoopback)) {
    $ipsA = @(Ips-DaPlaca $a.ifIndex | ForEach-Object IPAddress)
    $conflita = ($NomesAntigos -contains $a.Name) -or (@($ipsA | Where-Object { $_ -notlike '169.254.*' -and (MesmaRede $_ $IpClp) }).Count -gt 0)
    if (-not $conflita) { Msg "  Mantida: $($a.Name) (outra faixa de IP)."; continue }
    & pnputil.exe /remove-device "$($a.PnPDeviceID)" | Out-Null
    Msg "  [OK] Removida: $($a.Name) ($($ipsA -join ', '))" 'Green'
    $removidas++
  }
  if ($removidas -eq 0) { Msg '  Nenhuma placa antiga na faixa do laboratório.' }
  Start-Sleep -Seconds 1
  Criar
  if ($removidas -gt 0) {
    Msg ''
    Msg 'Não use mais os .bat de rede de cada simulador: eles recriam as placas antigas.'
    Msg "No CODESYS, escolha de novo a placa '$Adaptador' no dispositivo Ethernet."
  }
}

function RemoverIps {
  $p = Get-Placa
  if (-not $p) { Msg "  A placa $Adaptador não existe."; return }
  foreach ($ip in (Lista-Ips $Ips)) {
    $e = Get-NetIPAddress -IPAddress $ip -InterfaceIndex $p.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue
    if ($e) { $e | Remove-NetIPAddress -Confirm:$false; Msg "  [OK] $ip removido." 'Green' } else { Msg "  $ip não estava na placa." }
  }
}

function RemoverTudo {
  $p = Get-Placa
  if ($p) { & pnputil.exe /remove-device "$($p.PnPDeviceID)" | Out-Null; Msg "  [OK] Placa $Adaptador removida." 'Green' }
  else { Msg "  A placa $Adaptador não existe." }
  Get-NetFirewallRule -Group $GrupoFw -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  Msg '  [OK] Regras de firewall do HUB removidas.' 'Green'
}

function Status {
  $p = Get-Placa
  $ipsPlaca = @()
  if ($p) {
    $ipsPlaca = @(Ips-DaPlaca $p.ifIndex | ForEach-Object { [pscustomobject]@{ ip = $_.IPAddress; prefixo = [int]$_.PrefixLength; skipAsSource = [bool]$_.SkipAsSource } })
  }
  $outras = @(Get-OutrasLoopback | ForEach-Object {
      $ipsA = @(Ips-DaPlaca $_.ifIndex | ForEach-Object IPAddress)
      [pscustomobject]@{
        nome      = $_.Name
        ips       = $ipsA
        conflita  = ($NomesAntigos -contains $_.Name) -or (@($ipsA | Where-Object { $_ -notlike '169.254.*' -and (MesmaRede $_ $IpClp) }).Count -gt 0)
      }
    })
  $regras = 0
  try { $regras = @(Get-NetFirewallRule -Group $GrupoFw -ErrorAction SilentlyContinue).Count } catch { }
  $placaInfo = $null
  if ($p) { $placaInfo = [pscustomobject]@{ nome = $p.Name; status = [string]$p.Status; descricao = $p.InterfaceDescription } }
  [pscustomobject]@{
    admin          = [bool](EhAdmin)
    placa          = $placaInfo
    ips            = $ipsPlaca
    outrasLoopback = $outras
    regrasFirewall = $regras
  } | ConvertTo-Json -Depth 5 -Compress
}

function Finalizar([bool]$ok) {
  if ($Resultado) {
    [pscustomobject]@{ ok = $ok; mensagens = @($Mensagens.ToArray()) } | ConvertTo-Json -Depth 4 | Set-Content -Path $Resultado -Encoding UTF8
    Start-Sleep -Seconds 2   # deixa a janela visível por um instante
  }
  exit ([int](-not $ok))
}

# ---------------------------------------------------------------------
if ($Acao -eq 'status') { Status; exit 0 }

try {
  if (-not (EhAdmin)) { throw 'Esta ação precisa ser executada como administrador.' }
  switch ($Acao) {
    'criar'        { Criar }
    'migrar'       { Migrar }
    'remover-ip'   { Titulo 'Removendo IPs'; RemoverIps }
    'firewall'     { Titulo 'Firewall'; Liberar-Firewall }
    'remover-tudo' { Titulo 'Removendo a rede do HUB'; RemoverTudo }
  }
  Finalizar $true
} catch {
  Msg "ERRO: $($_.Exception.Message)" 'Red'
  Finalizar $false
}
