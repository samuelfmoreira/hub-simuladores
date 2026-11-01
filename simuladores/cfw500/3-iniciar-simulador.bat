@echo off
chcp 65001 >nul
title Simulador CFW500 EtherNet/IP
cd /d "%~dp0"

rem ==============================================================
rem  IP em que o "CFW500" vai responder.
rem  Precisa ser o mesmo usado em 2-criar-rede-virtual.bat
rem ==============================================================
set IP_CFW500=192.168.100.20
set PORTA_WEB=8080
rem Porta Modbus TCP do inversor (a IHM do painel usa a do CLP, configurada na aba IHM Modbus)
set PORTA_MODBUS_CFW=502

if not exist "node_modules\express" (
  echo Dependências não instaladas. Rodando 1-instalar.bat...
  call "%~dp01-instalar.bat"
  if errorlevel 1 exit /b 1
)

rem ---------- o IP do CFW500 existe nesta máquina? ----------
set ARG_IP=
ipconfig | findstr /c:"%IP_CFW500%" >nul
if errorlevel 1 (
  echo.
  echo [AVISO] O IP %IP_CFW500% não existe neste computador.
  echo         Rode 2-criar-rede-virtual.bat para criar o adaptador virtual.
  echo         Por enquanto o simulador vai responder em TODAS as placas de rede
  echo         ^(serve para CLP em outro computador ou para o CLP virtual^).
  echo         O Modbus do inversor vai para a porta 5020 para deixar a 502
  echo         livre para o servidor Modbus do CODESYS ^(IHM do painel^).
  echo.
  set PORTA_MODBUS_CFW=5020
) else (
  set ARG_IP=--ip %IP_CFW500%
  echo CFW500 vai responder em %IP_CFW500% ^(adaptador virtual^).
)

echo Abrindo http://localhost:%PORTA_WEB% no navegador...
start "" cmd /c "timeout /t 3 >nul & start http://localhost:%PORTA_WEB%"

echo Para encerrar o simulador feche esta janela ou pressione Ctrl+C.
echo.
node server.js %ARG_IP% --http %PORTA_WEB% --modbus %PORTA_MODBUS_CFW%

echo.
echo O simulador foi encerrado.
pause
