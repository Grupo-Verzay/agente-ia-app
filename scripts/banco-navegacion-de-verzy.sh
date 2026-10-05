#!/usr/bin/env bash
# La prueba REAL de la navegación libre de Verzy en la videollamada: la App
# servida, el Chromium del servidor dentro de «Verzay Ventas», y Verzy yendo a
# toda la landing y a pantallas de la plataforma (también las que no están en
# ninguna lista). Las reglas puras van en `banco-videollamada-ia.sh`.
#
#   npm run build && scripts/banco-navegacion-de-verzy.sh
#   MODO=roto … contra ANTES_REF: Verzy solo tenía una lista cerrada de destinos.
#   FOTOS_EN=<dir> guarda el último fotograma de cada pantalla.
set -euo pipefail
cd "$(dirname "$0")/.."
ANTES_REF="${ANTES_REF:-2f46b94}"
if [ "${MODO:-}" = "roto" ]; then
  if git show "$ANTES_REF:lib/pantalla-de-verzy.ts" | grep -q "DESTINOS_DE_VERZY"; then
    echo "ok   en $ANTES_REF Verzy solo podía ir a una lista cerrada (DESTINOS_DE_VERZY)"; exit 0
  fi
  echo "MAL  en $ANTES_REF ya no había lista cerrada"; exit 1
fi
SONDA=scripts/probar-navegacion-de-verzy.mjs exec scripts/banco-video-de-verzy.sh
