@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Instalador do modo OPC DA (MasterTool em simulacao)
echo.
echo  ==============================================================
echo    Modo OPC DA - estacao de bombeamento com o MasterTool em
echo    modo Simulacao (sem CLP fisico, sem Control Win)
echo  ==============================================================
echo.
echo  Este modo usa o servidor OPC DA do MasterTool (CoDeSys.OPC.DA) e o
echo  "OPC DA Automation Wrapper" da Graybox (gbda_aut.dll), gratuito.
echo.
if exist "tools\opcda\gbda_aut.dll" goto reg
echo  [1/2] Falta o arquivo tools\opcda\gbda_aut.dll
echo        Baixe o "Graybox OPC DA Auto Wrapper" (versao x86) em
echo        https://gray-box.net/download_daawrapper.php
echo        descompacte e copie o gbda_aut.dll para a pasta tools\opcda\
echo        Depois rode este INSTALAR_OPCDA.bat de novo.
echo.
pause
exit /b 1
:reg
echo  [1/2] Registrando o wrapper (precisa de permissao de administrador)...
if exist "%SystemRoot%\SysWOW64\regsvr32.exe" (
  "%SystemRoot%\SysWOW64\regsvr32.exe" /s "%~dp0tools\opcda\gbda_aut.dll"
) else (
  regsvr32 /s "%~dp0tools\opcda\gbda_aut.dll"
)
if errorlevel 1 (
  echo        O registro falhou. Clique com o botao direito neste .bat e escolha
  echo        "Executar como administrador".
  pause
  exit /b 1
)
echo        ok
echo  [2/2] Testando contra o MasterTool (precisa estar em simulacao, em RUN,
echo        com a Configuracao do OPC em 127.0.0.1 porta 11739)...
echo.
set "PS=%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell"
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\opcda\teste-opcda.ps1"
echo.
echo  Se terminou com "Tudo certo", abra o simulador, escolha o modo
echo  "OPC DA - MasterTool em simulacao" e clique em Conectar.
pause
