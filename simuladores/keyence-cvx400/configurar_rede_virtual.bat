@echo off
chcp 65001 >nul
title Simulador de Visao - Rede virtual
cd /d %~dp0

REM Precisa de administrador: se nao for, abre de novo pedindo permissao
net session >nul 2>&1
if errorlevel 1 (
    echo Pedindo permissao de administrador...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

REM PowerShell de 64 bits (necessario para instalar o adaptador virtual)
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if exist "%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe" set "PS=%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe"

"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0rede_virtual.ps1" -Pasta "%~dp0."
echo.
pause
