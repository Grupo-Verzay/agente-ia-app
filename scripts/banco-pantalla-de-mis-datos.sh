#!/usr/bin/env bash
# El banco de la PANTALLA de Mis datos (`/my-data`): lo que se arregló al
# documentarla (`lib/__tests__/pantalla-de-mis-datos.test.mjs`).
#
#   - las reglas puras: el separador que parte de verdad, la dirección del CSV
#     con su pestaña, la fuente y las columnas en español, el pie y la
#     paginación;
#   - un barrido del código: las dos opciones con las MISMAS piezas (pestañas,
#     «⋯», el lápiz y la papelera de cada fila) y ningún catch mudo.
#
# `MODO=roto` lee ANTES_MIS_DATOS_REF —pinchado a un commit, nunca
# `origin/main`— y afirma los fallos de antes.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
MODO="${MODO:-bueno}"
export MODO ANTES_MIS_DATOS_REF="${ANTES_MIS_DATOS_REF:-ab6b110}"

if [ "$MODO" != "roto" ]; then
  OUT="lib/__tests__/.compilado/pantalla-de-mis-datos"
  mkdir -p "$OUT"
  npx esbuild lib/pantalla-de-mis-datos.ts --bundle --platform=node --format=esm --outfile="$OUT/pantalla-de-mis-datos.mjs" --log-level=warning
  npx esbuild lib/url-de-google-sheets.ts --bundle --platform=node --format=esm --outfile="$OUT/url-de-google-sheets.mjs" --log-level=warning
fi
node --test lib/__tests__/pantalla-de-mis-datos.test.mjs
