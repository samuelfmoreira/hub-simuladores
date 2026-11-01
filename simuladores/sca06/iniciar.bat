@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Simulador SCA06 + ECO5 - EtherNet/IP
cd /d "%~dp0"

rem ---- Node.js instalado? (procura também na pasta padrão, caso o PATH ainda não tenha sido atualizado)
where node >nul 2>&1
if errorlevel 1 if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>&1
if errorlevel 1 goto :sem_node

rem ---- primeira execução: instala as dependências
if exist "node_modules\ws\package.json" goto :deps_ok
echo Instalando as dependências na primeira execução...
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 goto :erro_npm
:deps_ok

rem ---- porta da página (config.json)
set "PORTA=3000"
for /f "usebackq delims=" %%p in (`node -p "require('./config.json').httpPort"`) do set "PORTA=%%p"

cls
echo.
echo  ============================================================
echo    Simulador SCA06 + ECO5  -  adapter EtherNet/IP
echo  ============================================================
echo    Página do simulador:  http://localhost:%PORTA%
echo.
echo    Endereços deste PC para o CLP ou para outro computador:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo       %%a
echo.
echo    EtherNet/IP: TCP/UDP 44818 e UDP 2222  ^|  Modbus TCP: 502
echo    Para encerrar: feche esta janela ou tecle Ctrl+C.
echo  ============================================================
echo.

rem ---- abre o navegador alguns segundos depois de o servidor subir
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://localhost:%PORTA%/'"

node server.js
echo.
echo O simulador foi encerrado.
pause
exit /b 0

:sem_node
echo.
echo  O Node.js não está instalado neste computador.
echo  Rode primeiro o arquivo instalar.bat, que fica nesta mesma pasta.
echo.
pause
exit /b 1

:erro_npm
echo.
echo  ERRO: não foi possível instalar as dependências (npm install).
echo  Verifique a conexão com a internet ou rode o instalar.bat.
echo.
pause
exit /b 1
