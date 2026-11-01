@echo off
chcp 65001 >nul
title CLP de teste (Modbus Server + EtherNet/IP) para a IHM do painel
cd /d "%~dp0"

rem ==============================================================
rem  "CLP de teste": faz o papel do seu CLP para a IHM do painel.
rem    IHM --Modbus TCP (porta 1502)--> este script --EtherNet/IP--> CFW500
rem  Deixe o 3-iniciar-simulador.bat aberto. Depois, na aba "IHM Modbus"
rem  do simulador, use IP 127.0.0.1 e porta 1502 e ative a comunicação.
rem ==============================================================
set IP_CFW500=192.168.100.20
set PORTA=1502

ipconfig | findstr /c:"%IP_CFW500%" >nul
if errorlevel 1 set IP_CFW500=127.0.0.1

echo CFW500 em %IP_CFW500%  ·  servidor Modbus de teste na porta %PORTA%
echo Na aba IHM Modbus: IP 127.0.0.1, porta %PORTA%, Ativar comunicação.
echo Para encerrar feche esta janela.
echo.
node tools\clp-modbus-teste.js %IP_CFW500% %PORTA%
pause
