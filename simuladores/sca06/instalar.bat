@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Simulador SCA06 - Instalação
cd /d "%~dp0"

rem ==========================================================================
rem  Instalação do Simulador SCA06 + ECO5 (EtherNet/IP) no Windows
rem   1. instala o Node.js LTS, se não houver um Node 18 ou mais novo
rem   2. instala as dependências do projeto (npm install)
rem   3. libera no firewall as portas do simulador
rem   4. cria o atalho "Simulador SCA06" na Área de Trabalho
rem ==========================================================================

rem ---- precisa de administrador para instalar o Node.js e mexer no firewall
net session >nul 2>&1
if not errorlevel 1 goto :admin_ok
echo Pedindo permissão de administrador...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -WorkingDirectory '%~dp0' -Verb RunAs"
exit /b
:admin_ok

echo.
echo  ============================================================
echo    Simulador SCA06 + ECO5 - instalação
echo  ============================================================
echo.

rem ---- 1. Node.js
call :acha_node
if %NODE_MAJOR% GEQ 18 goto :node_ok
if not "%NODE_MAJOR%"=="0" echo Node.js %NODE_MAJOR% encontrado, mas o simulador precisa da versão 18 ou mais nova.
if "%NODE_MAJOR%"=="0" echo Node.js não encontrado.

where winget >nul 2>&1
if errorlevel 1 goto :node_msi
echo.
echo [1/4] Instalando o Node.js LTS pelo winget...
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
call :acha_node
if %NODE_MAJOR% GEQ 18 goto :node_ok

:node_msi
echo.
echo [1/4] Baixando o instalador oficial em nodejs.org...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\instalar-node.ps1"
call :acha_node
if %NODE_MAJOR% GEQ 18 goto :node_ok
echo.
echo  ERRO: não foi possível instalar o Node.js automaticamente.
echo  Instale a versão LTS manualmente em https://nodejs.org e rode este arquivo de novo.
goto :fim_erro

:node_ok
for /f "delims=" %%v in ('node -v') do echo [1/4] Node.js %%v OK

rem ---- 2. dependências do projeto
echo.
echo [2/4] Instalando as dependências do simulador (npm install)...
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo  ERRO: o npm install falhou. Verifique a conexão com a internet e rode este arquivo de novo.
  goto :fim_erro
)

rem ---- 3. firewall: EtherNet/IP, Modbus TCP e página web
echo.
echo [3/4] Liberando as portas no Firewall do Windows...
netsh advfirewall firewall delete rule name="Simulador SCA06 - EtherNet/IP" >nul 2>&1
netsh advfirewall firewall delete rule name="Simulador SCA06 - Modbus TCP" >nul 2>&1
netsh advfirewall firewall delete rule name="Simulador SCA06 - Pagina web" >nul 2>&1
netsh advfirewall firewall add rule name="Simulador SCA06 - EtherNet/IP" dir=in action=allow protocol=TCP localport=44818 >nul
netsh advfirewall firewall add rule name="Simulador SCA06 - EtherNet/IP" dir=in action=allow protocol=UDP localport=44818,2222 >nul
netsh advfirewall firewall add rule name="Simulador SCA06 - Modbus TCP" dir=in action=allow protocol=TCP localport=502,5020 >nul
netsh advfirewall firewall add rule name="Simulador SCA06 - Pagina web" dir=in action=allow protocol=TCP localport=3000 >nul
echo       TCP 44818 e UDP 44818/2222 (EtherNet/IP), TCP 502/5020 (Modbus TCP), TCP 3000 (página)

rem ---- 4. atalho na Área de Trabalho
echo.
echo [4/4] Criando o atalho "Simulador SCA06" na Área de Trabalho...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d 'Simulador SCA06.lnk')); $s.TargetPath='%~dp0iniciar.bat'; $s.WorkingDirectory='%~dp0'; $s.IconLocation=$env:SystemRoot+'\System32\shell32.dll,137'; $s.Save()"

echo.
echo  ============================================================
echo    Instalação concluída.
echo    Para abrir o simulador: atalho "Simulador SCA06" na Área de
echo    Trabalho ou o arquivo iniciar.bat nesta pasta.
echo  ============================================================
echo.
pause
exit /b 0

:fim_erro
echo.
pause
exit /b 1

rem ---- procura o node no PATH e na pasta padrão; devolve NODE_MAJOR (ex.: 22, ou 0 se não houver)
:acha_node
set "NODE_MAJOR=0"
where node >nul 2>&1
if errorlevel 1 if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>&1
if errorlevel 1 exit /b 0
for /f "tokens=1 delims=.v" %%a in ('node -v') do set "NODE_MAJOR=%%a"
exit /b 0
