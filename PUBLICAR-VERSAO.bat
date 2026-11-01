@echo off
chcp 65001 >nul
title HUB de Simuladores - Publicar versão
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0construir\publicacao\publicar-versao.ps1" -Zip "%~1"
echo.
pause
