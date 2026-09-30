#!/usr/bin/env bash
# El banco de la pantalla de FINANZAS simétrica: lo que se arregló en sus seis
# listas al documentarla (la guía pública tiene el suyo, `banco-guia-finanzas.sh`).
#
#   `lib/__tests__/finanzas-simetrica.test.mjs`: las reglas puras —los accesos
#   y cuál se marca, el periodo y el año, el eje corto, fijo o variable— y un
#   barrido de que las pantallas las usan: una sola tabla, el mismo filtro de
#   periodo y los mismos botones de fila en las cuatro listas, flechas de año
#   en el resumen, los títulos de dinero a la derecha, la vista previa de una
#   venta sin el concepto cortado, los dos detalles con la misma forma y sitio
#   para la X, el concepto de un gasto y el código de un contacto sin repetir.
#
# `MODO=roto` lee ANTES_FINANZAS_REF —pinchado a un commit, nunca
# `origin/main`— y afirma los fallos: tres tablas distintas, accesos sin
# Resumen, un resumen sin año, el eje con «.0» y un arriendo variable.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
MODO="${MODO:-bueno}"
export MODO ANTES_FINANZAS_REF="${ANTES_FINANZAS_REF:-ab6b110}"

if [ "$MODO" != "roto" ]; then
  OUT="lib/__tests__/.compilado/finanzas-simetrica"
  mkdir -p "$OUT"
  for M in accesos-de-finanzas periodo-de-finanzas tabla-de-finanzas detalle-de-finanzas; do
    npx esbuild "lib/$M.ts" --bundle --platform=node --format=esm --outfile="$OUT/$M.mjs" --log-level=warning
  done
fi
node --test lib/__tests__/finanzas-simetrica.test.mjs
