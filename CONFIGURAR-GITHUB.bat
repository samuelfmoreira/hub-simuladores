@echo off
chcp 65001 >nul
title HUB de Simuladores - Configurar GitHub
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0construir\publicacao\configurar-github.ps1"
echo.
pause
