@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Instalador - Simulador Estacao de bombeamento TQ-01 (OPC UA)
echo.
echo  ==============================================================
echo    Simulador Estacao de bombeamento TQ-01 - CLP Altus XP325
echo    Instalacao do Node.js, dependencias e atalho
echo  ==============================================================
echo.

call :findnode
if defined NODEOK goto hasnode

echo  [1/4] Node.js nao encontrado. Instalando a versao LTS...
where winget >nul 2>nul
if errorlevel 1 goto msi
echo        Tentando pelo winget, o instalador de apps do Windows...
winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
call :findnode
if defined NODEOK goto hasnode

:msi
echo        Baixando o instalador oficial em nodejs.org...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\instalar-node.ps1"
call :findnode
if defined NODEOK goto hasnode

echo.
echo  [ERRO] Nao foi possivel instalar o Node.js automaticamente.
echo         1. Abra https://nodejs.org e baixe a versao LTS para Windows.
echo         2. Instale com as opcoes padrao.
echo         3. Rode este INSTALAR.bat de novo.
echo.
pause
exit /b 1

:hasnode
for /f "delims=" %%v in ('node -v') do set "NODEVER=%%v"
echo  [1/4] Node.js encontrado: %NODEVER%
node -e "process.exit(parseInt(process.versions.node,10)>=18?0:1)"
if errorlevel 1 goto oldnode

echo  [2/4] Dependencias do simulador (node-opcua, ws)...
if not exist "config" mkdir "config"
if exist "node_modules\node-opcua\package.json" (
  echo        Ja instaladas.
) else (
  echo        Baixando pela internet, leva 1 a 3 minutos...
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 goto npmfail
)
node --check server.js
if errorlevel 1 goto broken

echo  [3/4] Criando atalho "Simulador Estacao TQ-01" na area de trabalho...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\criar-atalho.ps1" -Pasta "%~dp0."

echo  [4/4] Acesso por outros PCs da rede
echo        Necessario so se alunos/outros PCs forem abrir o simulador pelo navegador.
choice /c SN /n /m "        Liberar a porta 3050 no firewall do Windows? [S/N] "
if errorlevel 2 goto done
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\liberar-firewall.ps1"

:done
echo.
echo  ==============================================================
echo    Instalacao concluida.
echo    Para usar: clique duas vezes em INICIAR_SIMULADOR.bat
echo    ou no atalho "Simulador Estacao TQ-01" da area de trabalho.
echo  ==============================================================
echo.
pause
exit /b 0

:oldnode
echo.
echo  [ERRO] A versao do Node.js e muito antiga. E necessario 18 ou superior.
echo         Desinstale o Node.js atual pelo Painel de Controle e rode este instalador de novo.
pause
exit /b 1

:npmfail
echo.
echo  [ERRO] O npm install falhou. Verifique a internet e rode este INSTALAR.bat de novo,
echo         ou use o pacote "completo", que ja traz a pasta node_modules.
pause
exit /b 1

:broken
echo.
echo  [ERRO] O arquivo server.js esta com problema. Extraia o .zip novamente.
pause
exit /b 1

:findnode
set "NODEOK="
where node >nul 2>nul
if not errorlevel 1 (
  set "NODEOK=1"
  goto :eof
)
if exist "%ProgramFiles%\nodejs\node.exe" (
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
  set "NODEOK=1"
)
goto :eof
