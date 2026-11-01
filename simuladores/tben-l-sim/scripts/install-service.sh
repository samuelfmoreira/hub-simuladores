#!/usr/bin/env bash
# Instala o TBEN-L-SIM como serviço systemd (inicia com a VM).
set -euo pipefail
cd "$(dirname "$0")/.."
[ "$(id -u)" -eq 0 ] || { echo "Rode com sudo."; exit 1; }
DIR="$(pwd)"; NODE="$(command -v node)"
cat > /etc/systemd/system/tben-sim.service <<UNIT
[Unit]
Description=TBEN-L-SIM (PROFINET + IO-Link + celula 3D)
After=network-online.target

[Service]
WorkingDirectory=$DIR
ExecStart=$NODE $DIR/src/server.js
Restart=on-failure
User=root

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now tben-sim
echo "Serviço ativo. Logs: journalctl -u tben-sim -f"
