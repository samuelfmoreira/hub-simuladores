#!/usr/bin/env bash
# Compila o driver PROFINET do TBEN-L-SIM (p-net v0.2.0 + arquivos deste diretório).
# Uso: ./build.sh            (gera bin/tben-pn-driver)
set -euo pipefail
cd "$(dirname "$0")"
PNET_TAG="v0.2.0"
WORK=".build"
mkdir -p "$WORK" bin

if [ ! -d "$WORK/p-net" ]; then
  echo ">> Baixando p-net $PNET_TAG"
  git clone --depth 1 --branch "$PNET_TAG" --recurse-submodules --shallow-submodules \
    https://github.com/rtlabs-com/p-net.git "$WORK/p-net"
fi

APP="$WORK/p-net/sample_app"
echo ">> Aplicando os arquivos do TBEN-L-SIM"
cp src/app_gsdml.h src/app_gsdml.c src/app_data.h src/app_data.c "$APP/"
# Dados de processo a cada 1 ms (o exemplo original usa 100 ms)
sed -i 's/#define APP_TICKS_UPDATE_DATA  100/#define APP_TICKS_UPDATE_DATA  1/' "$APP/sampleapp_common.h"
# Chama a ponte com o Node.js a cada tick da thread principal do p-net
if ! grep -q "app_data_tick" "$APP/sampleapp_common.c"; then
  sed -i 's/^\(\s*\)update_button_states (app);/&\n\1app_data_tick (app->net, app_is_connected_to_controller (app));/' "$APP/sampleapp_common.c"
fi
grep -q "app_data_tick" "$APP/sampleapp_common.c" || { echo "Falha ao aplicar o patch do loop principal"; exit 1; }

# O p-net v0.2.0 só repassa à aplicação registros até 0x7FFF. O IOL_CALL usa 0xB400
# (faixa de perfil 0xB000-0xBFFF): libera essa faixa como registro de usuário.
for f in pf_cmrpc.c pf_cmwrr.c pf_cmrdr.c pf_fspm.c; do
  F="$WORK/p-net/src/device/$f"
  if ! grep -q "TBEN_PROFILE_IDX" "$F"; then
    sed -i -E 's/\((p_(write|read)_request)->index <= PF_IDX_USER_MAX\)/(\1->index <= PF_IDX_USER_MAX || (\1->index >= 0xB000 \&\& \1->index <= 0xBFFF) \/* TBEN_PROFILE_IDX *\/)/g' "$F"
  fi
done
[ "$(grep -l TBEN_PROFILE_IDX "$WORK"/p-net/src/device/pf_{cmrpc,cmwrr,cmrdr,fspm}.c | wc -l)" -eq 4 ] || { echo "Falha ao liberar o índice 0xB400 no p-net"; exit 1; }

echo ">> Configurando (9 slots: DAP + 8 portas IO-Link)"
cmake -S "$WORK/p-net" -B "$WORK/out" \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=OFF \
  -DPNET_MAX_SLOTS=9 -DPNET_MAX_SUBSLOTS=3 \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5 > "$WORK/cmake.log"
cmake --build "$WORK/out" --target pn_dev -j"$(nproc)"
cp "$WORK/out/pn_dev" bin/tben-pn-driver
cp bin-scripts/set_network_parameters bin-scripts/set_profinet_leds bin/
chmod +x bin/*
echo ">> Pronto: $(pwd)/bin/tben-pn-driver"
