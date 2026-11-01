@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Instalar dependencias - Simulador de Processo com Sistema de Visao 3D
echo ==========================================
echo  Instalando dependencias (npm install)...
echo ==========================================
where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado. Instale em https://nodejs.org e tente novamente.
  pause
  exit /b 1
)
call npm install
if errorlevel 1 (
  echo [ERRO] Falha na instalacao.
) else (
  echo.
  echo Dependencias instaladas. Execute iniciar_simulador.bat
)
pause
