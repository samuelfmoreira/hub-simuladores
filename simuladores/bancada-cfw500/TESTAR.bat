@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Testes - Bancada CFW500
where node >nul 2>nul
if errorlevel 1 if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
echo  Rodando os testes automaticos do simulador...
echo.
node tools\teste.js
echo.
echo  Se a ultima linha diz "0 falha(s)", a instalacao esta boa.
pause
