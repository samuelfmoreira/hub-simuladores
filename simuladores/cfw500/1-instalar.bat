@echo off
chcp 65001 >nul
title Simulador CFW500 - Instalacao
cd /d "%~dp0"

echo ==============================================================
echo   Simulador CFW500 EtherNet/IP - instalação das dependências
echo ==============================================================
echo.

rem ---------- 1) Node.js instalado? ----------
where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js não foi encontrado neste computador.
  echo        Instale a versão LTS em https://nodejs.org e rode este arquivo de novo.
  start "" https://nodejs.org/pt-br/download
  echo.
  pause
  exit /b 1
)

rem ---------- 2) Versão mínima 18 ----------
for /f "tokens=1 delims=." %%v in ('node -v') do set NODEV=%%v
set NODEV=%NODEV:v=%
if %NODEV% LSS 18 (
  echo [ERRO] Node.js versão %NODEV% encontrado. É preciso a versão 18 ou mais nova.
  start "" https://nodejs.org/pt-br/download
  pause
  exit /b 1
)
for /f %%v in ('node -v') do echo Node.js %%v encontrado.
for /f %%v in ('npm -v') do echo npm %%v encontrado.
echo.

rem ---------- 3) Instala express, socket.io e three.js ----------
echo Baixando as dependências (precisa de internet só desta vez)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo [ERRO] O npm install falhou. Verifique a internet ou o proxy da rede.
  echo        Em rede com proxy: npm config set proxy http://usuario:senha@proxy:porta
  pause
  exit /b 1
)

echo.
echo ==============================================================
echo   Instalação concluída.
echo   Próximo passo: 2-criar-rede-virtual.bat (uma vez só)
echo   e depois 3-iniciar-simulador.bat
echo ==============================================================
pause
