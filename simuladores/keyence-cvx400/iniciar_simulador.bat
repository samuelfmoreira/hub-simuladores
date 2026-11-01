@echo off
chcp 65001 >nul
title Simulador de Visao - Inicializacao
cd /d %~dp0

if not exist node_modules (
    echo [ERRO] Dependencias nao instaladas. Rode primeiro o instalar_dependencias.bat
    pause
    exit /b 1
)

REM Encerra apenas o simulador que estiver preso na porta 3001
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    echo Encerrando simulador pendente - PID %%p
    taskkill /F /PID %%p >nul 2>&1
)

REM Sobe o simulador em uma nova janela (fechar a janela encerra o simulador)
REM Janela minimizada: clicar/selecionar texto nela faz o Windows pausar o programa
start "Simulador de Visao Keyence - EtherNet/IP" /min cmd /k node server.js

timeout /t 2 /nobreak >nul
start "" http://localhost:3001
