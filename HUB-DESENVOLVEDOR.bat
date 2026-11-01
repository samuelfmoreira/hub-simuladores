@echo off
setlocal EnableExtensions
chcp 65001 >nul
title HUB de Simuladores - Desenvolvedor
cd /d "%~dp0"

rem ==========================================================================
rem  Abre o HUB do desenvolvedor (com a aba Desenvolvedor): aplicar a versão
rem  entregue pelo Claude, testar, ajustar versão e notas e publicar no GitHub.
rem  Na primeira vez baixa as dependências (precisa de internet).
rem  Esta cópia não se atualiza sozinha: quem recebe atualizações é o HUB
rem  instalado pelo HUB-Simuladores.exe.
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
node hub\server.js
echo.
pause
