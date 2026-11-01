@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Simulador de Processo com Sistema de Visao 3D - http://localhost:3000
if not exist "node_modules" (
  echo [ERRO] Dependencias nao instaladas. Execute instalar_dependencias.bat primeiro.
  pause
  exit /b 1
)
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"
node server.js
pause
