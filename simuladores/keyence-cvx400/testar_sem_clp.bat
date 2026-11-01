@echo off
chcp 65001 >nul
title Teste do simulador sem CLP
cd /d %~dp0
echo Abre uma conexao EtherNet/IP com uma camera do simulador (como o CLP faria),
echo dispara 3 leituras e mostra os dados recebidos.
echo O simulador precisa estar rodando (iniciar_simulador.bat).
echo.
set "IPCAM=127.0.0.1"
set /p "IPCAM=IP da camera (Enter = 127.0.0.1, quando a camera esta em Todos os IPs): "
set "OPC="
set /p "DISCO=A camera esta com o programa 042 DISCO_FUROS? (s/N): "
if /i "%DISCO%"=="s" set "OPC=--disco"
echo.
node teste_scanner.js %IPCAM% 496 2223 %OPC%
pause
