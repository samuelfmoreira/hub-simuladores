#!/usr/bin/env bash
# =====================================================================
#  Rede virtual do HUB de Simuladores (Linux)
#  Cria a interface "simhub" (tipo dummy) com o IP do CLP e um IP por
#  simulador. Se o kernel não tiver o módulo dummy, os IPs vão para a
#  interface lo com o rótulo lo:simhub. Precisa de root (sudo).
#
#  sudo bash rede/rede-hub.sh criar 192.168.100.10/24 192.168.100.20/24 ...
#  sudo bash rede/rede-hub.sh remover-ip 192.168.100.22
#  sudo bash rede/rede-hub.sh remover-tudo
#  bash rede/rede-hub.sh status
# =====================================================================
set -e
IF=simhub
ROTULO=lo:simhub
acao="${1:-status}"; shift || true

# onde os IPs ficam: na interface simhub, ou na lo (rótulo lo:simhub)
destino() { if ip link show "$IF" >/dev/null 2>&1; then echo "$IF"; else echo lo; fi; }
lista_ips() { ip -4 -o addr show | awk -v r="$ROTULO" -v i="$IF" '{ for (k = 2; k <= NF; k++) { f = $k; sub(/\\$/, "", f); if (f == r || (k == 2 && f == i)) { print $4; break } } }'; }

case "$acao" in
  criar)
    if ! ip link show "$IF" >/dev/null 2>&1; then
      if ip link add "$IF" type dummy 2>/dev/null; then echo "[OK] Interface $IF criada"
      else echo "[!] Sem suporte a interface dummy: os IPs vão para a lo ($ROTULO)"; fi
    fi
    DEV=$(destino)
    ip link set "$DEV" up
    for cidr in "$@"; do
      if lista_ips | grep -q "^${cidr%/*}/"; then echo "[OK] ${cidr%/*} já existia"; continue; fi
      if [ "$DEV" = lo ]; then ip addr add "$cidr" dev lo label "$ROTULO"; else ip addr add "$cidr" dev "$DEV"; fi
      echo "[OK] ${cidr%/*} adicionado"
    done
    echo "Obs.: a configuração some ao reiniciar o PC. Rode de novo depois de ligar."
    ;;
  remover-ip)
    for ipx in "$@"; do
      cidr=$(lista_ips | grep "^${ipx}/" || true)
      if [ -n "$cidr" ]; then ip addr del "$cidr" dev "$(destino)" && echo "[OK] $ipx removido"; else echo "$ipx não estava na rede do HUB"; fi
    done
    ;;
  remover-tudo)
    for cidr in $(ip -4 -o addr show dev lo | awk -v r="$ROTULO" '{ for (k = 2; k <= NF; k++) { f = $k; sub(/\\$/, "", f); if (f == r) { print $4; break } } }'); do ip addr del "$cidr" dev lo; done
    ip link del "$IF" 2>/dev/null || true
    echo "[OK] Rede do HUB removida"
    ;;
  status)
    lista_ips || true
    ;;
  *) echo "Ação desconhecida: $acao"; exit 1 ;;
esac
