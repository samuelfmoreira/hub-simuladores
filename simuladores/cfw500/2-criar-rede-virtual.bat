@echo off
chcp 65001 >nul
title Rede virtual CFW500 x CODESYS
cd /d "%~dp0"

rem ==============================================================
rem  Cria o adaptador "Microsoft KM-TEST Loopback" com o nome CFW500-Rede
rem  e dois IPs:  192.168.100.10 = CODESYS (scanner)
rem               192.168.100.20 = CFW500 simulado (adapter)
rem
rem  Uso:  2-criar-rede-virtual.bat           cria / reconfigura
rem        2-criar-rede-virtual.bat remover   remove o adaptador e as regras de firewall
rem ==============================================================

rem ---------- precisa de administrador: pede elevação ----------
net session >nul 2>&1
if errorlevel 1 (
  echo Pedindo permissão de administrador...
  if "%~1"=="" (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  ) else (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%~1' -Verb RunAs"
  )
  exit /b
)

if /i "%~1"=="remover" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\rede-virtual.ps1" -Remover
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\rede-virtual.ps1" -IpCodesys 192.168.100.10 -IpCfw500 192.168.100.20
)
echo.
pause
