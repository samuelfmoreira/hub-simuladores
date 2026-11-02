@echo off
setlocal EnableExtensions
chcp 65001 >nul
title HUB de Simuladores - Desenvolvedor
cd /d "%~dp0"

rem ==========================================================================
rem  Abre o HUB do desenvolvedor (com a aba Desenvolvedor): aplicar a versão
rem  entregue pelo Claude, testar, ajustar versão e notas e publicar no GitHub.
rem  Na primeira vez baixa as dependências (precisa de internet).
rem
rem  O HUB roda por trás, sem janela preta; as mensagens ficam em hub.log.
rem  Ao fechar a janela do HUB, ele se encerra sozinho (ou use o botão Sair).
rem  Para abrir do jeito antigo, com a janela preta: HUB-DESENVOLVEDOR.bat janela
rem ==========================================================================

where node >nul 2>&1
if not errorlevel 1 goto :tem_node
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>&1
if not errorlevel 1 goto :tem_node
echo O Node.js nao esta instalado. Rode antes o CONFIGURAR-GITHUB.bat, que instala o que falta.
pause
exit /b 1

:tem_node
node hub\tools\instalar.js
if errorlevel 1 (
  pause
  exit /b 1
)

if /i "%~1"=="janela" (
  node hub\server.js
  echo.
  pause
  exit /b 0
)

echo.
echo Abrindo o HUB do desenvolvedor... (as mensagens ficam em hub.log)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'node' -ArgumentList 'hub\server.js','--oculto' -WorkingDirectory '%CD%' -WindowStyle Hidden"
timeout /t 2 >nul
exit /b 0
