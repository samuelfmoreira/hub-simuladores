#!/usr/bin/env bash
# Prepara a VM Linux (Ubuntu/Debian) para rodar o TBEN-L-SIM.
# Uso: sudo ./scripts/setup-vm.sh <interface-profinet>     ex.: sudo ./scripts/setup-vm.sh enp0s8
set -euo pipefail
IFACE="${1:-}"
cd "$(dirname "$0")/.."
[ "$(id -u)" -eq 0 ] || { echo "Rode com sudo."; exit 1; }
[ -n "$IFACE" ] || { echo "Informe a interface dedicada ao PROFINET. Interfaces encontradas:"; ls /sys/class/net; exit 1; }
[ -e "/sys/class/net/$IFACE" ] || { echo "Interface $IFACE não existe."; exit 1; }

echo ">> Instalando dependências"
apt-get update -y
apt-get install -y build-essential cmake git iproute2 curl ca-certificates
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  apt-get install -y nodejs npm
fi
echo "   Node $(node -v), cmake $(cmake --version | head -1 | awk '{print $3}')"

echo ">> Compilando o driver PROFINET (p-net)"
bash pn-driver/build.sh

echo ">> Instalando pacotes Node e gerando o GSDML"
npm install --no-audit --no-fund
npm run gsdml

echo ">> Preparando a interface $IFACE (sem IP: o CODESYS atribui via DCP)"
ip address flush dev "$IFACE" || true
ip link set dev "$IFACE" up
mkdir -p /var/lib/tben-sim

if [ ! -f config.json ]; then
  sed "s/\"enp0s8\"/\"$IFACE\"/" config.example.json > config.json
  echo "   config.json criado com a interface $IFACE"
fi

cat <<MSG

Pronto. Próximos passos:
  1. Garanta que o netplan/NetworkManager não configure IP nem DHCP em $IFACE.
  2. Inicie:   sudo npm start
  3. Abra no Windows:  http://IP-DA-VM:8080
  4. Para iniciar junto com a VM:  sudo ./scripts/install-service.sh
MSG
