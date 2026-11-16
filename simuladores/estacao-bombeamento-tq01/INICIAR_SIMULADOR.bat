@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Simulador Estacao de bombeamento TQ-01 (OPC UA)

where node >nul 2>nul
if errorlevel 1 if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 goto semnode
if not exist "node_modules\node-opcua\package.json" goto semdeps

set "PORT=3050"
set "OPEN_BROWSER=1"
echo.
echo  Iniciando o simulador... o navegador abre sozinho em instantes.
echo  Mantenha esta janela aberta enquanto usar o simulador.
node server.js
echo.
echo  O simulador foi encerrado.
pause
exit /b 0

:semnode
echo.
echo  Node.js nao encontrado neste PC.
echo  Rode primeiro o INSTALAR.bat que esta nesta mesma pasta.
echo.
pause
exit /b 1

:semdeps
echo.
echo  As dependencias ainda nao foram instaladas.
echo  Rode primeiro o INSTALAR.bat que esta nesta mesma pasta.
echo.
pause
exit /b 1
