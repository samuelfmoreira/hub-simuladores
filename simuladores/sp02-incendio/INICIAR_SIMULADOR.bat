@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Simulador Sistema de Incendio (Modbus TCP)

where node >nul 2>nul
if errorlevel 1 if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 goto semnode

set "PORT=3000"
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
