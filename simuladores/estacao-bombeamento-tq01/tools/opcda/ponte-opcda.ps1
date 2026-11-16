# Ponte OPC DA -> simulador da estação de bombeamento.
# Conecta no servidor OPC DA do MasterTool (CoDeSys.OPC.DA), que enxerga a CPU em modo Simulação
# pela porta 11739 (veja o artigo da Altus "Xpress e FluidSIM via OPC DA"), lê as saídas do CLP a cada
# ciclo e escreve as entradas que o simulador manda. Fala com o simulador por JSON, uma linha por mensagem.
#
# Precisa do "OPC DA Automation Wrapper" (gbda_aut.dll, Graybox) registrado com a mesma arquitetura
# deste PowerShell. INSTALAR_OPCDA.bat cuida disso.
#
# Parâmetros: -ProgId (padrão CoDeSys.OPC.DA) -Prefixo (padrão PLC.Application.GVL_SIMULADOR.) -PeriodoMs (padrão 100)
param(
  [string]$ProgId = 'CoDeSys.OPC.DA',
  [string]$Prefixo = 'PLC.Application.GVL_SIMULADOR.',
  [int]$PeriodoMs = 100
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
function Emit($obj) { [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 4)); [Console]::Out.Flush() }

# ---- variáveis da GVL_SIMULADOR: uma por sinal, sem vetores (mesma tabela de server/tags.js)
$LE = @()   # o CLP escreve, a ponte lê
$LE += @{ n = 'H1'; t = 'bool' }
$LE += @{ n = 'H2'; t = 'bool' }
$LE += @{ n = 'H3'; t = 'bool' }
$LE += @{ n = 'H4'; t = 'bool' }
$LE += @{ n = 'Inv_Gira'; t = 'bool' }
$LE += @{ n = 'Inv_Reset'; t = 'bool' }
$LE += @{ n = 'Ref_Bruto'; t = 'int' }
$LE += @{ n = 'HB_CLP'; t = 'uint' }
$LE += @{ n = 'IHM_Nivel'; t = 'int' }
$ESC = @()  # o simulador escreve
$ESC += @{ n = 'S1_Liga'; t = 'bool' }
$ESC += @{ n = 'S2_Desliga_NF'; t = 'bool' }
$ESC += @{ n = 'S3_Reset'; t = 'bool' }
$ESC += @{ n = 'S4_Auto'; t = 'bool' }
$ESC += @{ n = 'S0_Emerg_NF'; t = 'bool' }
$ESC += @{ n = 'Inv_Rodando'; t = 'bool' }
$ESC += @{ n = 'Inv_OK'; t = 'bool' }
$ESC += @{ n = 'LSHH'; t = 'bool' }
$ESC += @{ n = 'LSLL'; t = 'bool' }
$ESC += @{ n = 'LT01_Bruto'; t = 'int' }
$ESC += @{ n = 'HB_Sim'; t = 'uint' }
$ESC += @{ n = 'IHM_Velocidade'; t = 'int' }
$ESC += @{ n = 'IHM_Setpoint'; t = 'int' }

function Converter($tipo, $v) {
  switch ($tipo) {
    'bool' { return [bool]$v }
    'int'  { return [int16]$v }
    'uint' { return [uint16]$v }
    'real' { return [single]$v }
    default { return $v }
  }
}

# ---- conexão
try {
  $opc = New-Object -ComObject 'OPC.Automation.1'
} catch {
  Emit @{ err = "Wrapper OPC Automation não registrado (gbda_aut.dll). Rode INSTALAR_OPCDA.bat. Detalhe: $($_.Exception.Message)" }; exit 2
}
try {
  $opc.Connect($ProgId, '')
} catch {
  Emit @{ err = "Não conectou no servidor OPC DA '$ProgId'. O MasterTool está em simulação, em RUN, com a Configuração do OPC em 127.0.0.1:11739? Detalhe: $($_.Exception.Message)" }; exit 3
}
$grp = $opc.OPCGroups.Add('estacao')
$grp.IsActive = $true
$grp.IsSubscribed = $false
$grp.UpdateRate = $PeriodoMs
$itens = @{}
$falhas = @()
foreach ($d in ($LE + $ESC)) {
  try { $it = $grp.OPCItems.AddItem($Prefixo + $d.n, 1); $itens[$d.n] = $it } catch { $falhas += $d.n }
}
if ($itens.Count -eq 0) { Emit @{ err = "Nenhum item encontrado com o prefixo '$Prefixo'. Confira o nome da GVL e a Configuração de Símbolos (compile!)." }; exit 4 }
Emit @{ ok = $true; itens = $itens.Count; faltam = $falhas; servidor = $ProgId; prefixo = $Prefixo }

# ---- leitor de stdin em outro runspace (comandos de escrita do simulador)
$fila = New-Object 'System.Collections.Concurrent.ConcurrentQueue[string]'
$rs = [runspacefactory]::CreateRunspace(); $rs.Open(); $rs.SessionStateProxy.SetVariable('fila', $fila)
$leitor = [powershell]::Create(); $leitor.Runspace = $rs
[void]$leitor.AddScript({ while ($true) { $l = [Console]::In.ReadLine(); if ($null -eq $l) { $fila.Enqueue('__fim__'); break }; $fila.Enqueue($l) } })
$hLeitor = $leitor.BeginInvoke()

# ---- laço: escreve o que chegou, lê as saídas do CLP, publica
$ultimo = @{}
$vivo = $true
while ($vivo) {
  $linha = $null
  while ($fila.TryDequeue([ref]$linha)) {
    if ($linha -eq '__fim__') { $vivo = $false; break }
    try {
      $cmd = $linha | ConvertFrom-Json
      if ($cmd.w) {
        $erros = @()
        foreach ($par in @($cmd.w)) {
          if ($null -eq $par -or $par.Count -lt 2) { continue }
          $nome = [string]$par[0]; $val = $par[1]
          $def = $ESC | Where-Object { $_.n -eq $nome } | Select-Object -First 1
          if ($null -eq $def -or -not $itens.ContainsKey($nome)) { $erros += $nome; continue }
          try { $itens[$nome].Write((Converter $def.t $val)) } catch { $erros += "$nome ($($_.Exception.Message))" }
        }
        Emit @{ wok = $cmd.id; erros = $erros }
      }
    } catch { Emit @{ err = "comando inválido: $($_.Exception.Message)" } }
  }
  if (-not $vivo) { break }
  $leitura = @{}
  foreach ($d in $LE) {
    if (-not $itens.ContainsKey($d.n)) { continue }
    try {
      $v = $null; $q = $null; $ts = $null
      $itens[$d.n].Read(2, [ref]$v, [ref]$q, [ref]$ts)   # 2 = OPCDevice
      $leitura[$d.n] = $v
    } catch { }
  }
  Emit @{ r = $leitura; t = [DateTimeOffset]::Now.ToUnixTimeMilliseconds() }
  Start-Sleep -Milliseconds $PeriodoMs
}
try { $opc.Disconnect() } catch { }
