@echo off
chcp 65001 >nul
title Simulador de Visao - Instalacao
cd /d %~dp0

where node >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Node.js nao encontrado. Instale em https://nodejs.org e tente de novo.
    pause
    exit /b 1
)

echo Instalando dependencias...
call npm install
if errorlevel 1 (
    echo [ERRO] Falha no npm install. Verifique a conexao com a internet.
    pause
    exit /b 1
)
echo.
echo Dependencias instaladas com sucesso.
pause
