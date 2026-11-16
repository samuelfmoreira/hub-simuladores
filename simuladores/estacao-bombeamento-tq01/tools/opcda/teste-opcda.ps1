# Teste passo a passo do OPC DA com o MasterTool em simulação.
# Uso (PowerShell 32 bits): powershell -ExecutionPolicy Bypass -File teste-opcda.ps1 [-Prefixo PLC.Application.GVL_SIMULADOR.]
param([string]$ProgId = 'CoDeSys.OPC.DA', [string]$Prefixo = 'PLC.Application.GVL_SIMULADOR.')
$ErrorActionPreference = 'Stop'
Write-Host "1) Wrapper OPC Automation..." -NoNewline
try { $opc = New-Object -ComObject 'OPC.Automation.1'; Write-Host " ok" } catch { Write-Host " FALHOU: $($_.Exception.Message)"; Write-Host "   Registre o gbda_aut.dll (INSTALAR_OPCDA.bat)."; exit 1 }
Write-Host "2) Servidores OPC DA neste PC: " -NoNewline
try { $lista = $opc.GetOPCServers(); Write-Host ($lista -join ', ') } catch { Write-Host "(não listou: $($_.Exception.Message))" }
Write-Host "3) Conectando em $ProgId..." -NoNewline
try { $opc.Connect($ProgId, ''); Write-Host " ok (estado do servidor: $($opc.ServerState))" } catch { Write-Host " FALHOU: $($_.Exception.Message)"; Write-Host "   MasterTool em simulação + RUN, Configuração do OPC em 127.0.0.1 porta 11739."; exit 2 }
Write-Host "4) Itens disponíveis (navegação):"
try {
  $b = $opc.CreateBrowser(); $b.ShowBranches(); $b.ShowLeafs($true)
  $n = 0
  foreach ($item in $b) { if ($n -lt 60) { Write-Host "   $item" }; $n++ }
  if ($n -ge 60) { Write-Host "   ... ($n itens no total)" }
} catch { Write-Host "   (navegação não suportada: $($_.Exception.Message))" }
Write-Host "5) Lendo $($Prefixo)HB_CLP..." -NoNewline
try {
  $g = $opc.OPCGroups.Add('teste'); $g.IsActive = $true
  $it = $g.OPCItems.AddItem($Prefixo + 'HB_CLP', 1)
  $v = $null; $q = $null; $t = $null; $it.Read(2, [ref]$v, [ref]$q, [ref]$t)
  Write-Host " valor = $v (qualidade $q)"
} catch { Write-Host " FALHOU: $($_.Exception.Message)"; Write-Host "   Confira o prefixo: deve ser o caminho que aparece na navegação acima, até o nome da GVL, terminando com ponto."; exit 3 }
Write-Host "6) Escrevendo $($Prefixo)S1_Liga = TRUE e lendo de volta..." -NoNewline
try {
  $it2 = $g.OPCItems.AddItem($Prefixo + 'S1_Liga', 2); $it2.Write([bool]$true)
  Start-Sleep -Milliseconds 300
  $v = $null; $q = $null; $t = $null; $it2.Read(2, [ref]$v, [ref]$q, [ref]$t); Write-Host " leu $v"
  $it2.Write([bool]$false)
} catch { Write-Host " FALHOU: $($_.Exception.Message)"; Write-Host "   A variável está na Configuração de Símbolos com direito de escrita?"; exit 4 }
Write-Host "Tudo certo: o simulador pode usar o modo OPC DA."
$opc.Disconnect()
