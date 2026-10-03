#!/usr/bin/env bash
# Pulsar un mes del resumen anual de Finanzas NO cambia de cuenta.
#
#   `lib/__tests__/cuenta-del-resumen.test.mjs`: las reglas puras, la ida y
#   vuelta selector → servidor → enlace de un mes → servidor para cada
#   selección posible, y un barrido de que el resumen y las tres listas usan la
#   regla en vez de preguntar `consolidando`.
#
# La pantalla servida —pulsar el mes de verdad, en Chromium— la prueba
# `scripts/banco-cuenta-del-resumen-navegador.sh`.
#
# `MODO=roto` lee ANTES_REF —pinchado a un commit, nunca `origin/main`, que deja
# de ser el «antes» en cuanto esto se fusiona— y AFIRMA el fallo.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
MODO="${MODO:-bueno}"
export MODO ANTES_REF="${ANTES_REF:-fd21c8f}"

OUT="lib/__tests__/.compilado/cuenta-del-resumen"
rm -rf "$OUT"
mkdir -p "$OUT"

if [ "$MODO" = "roto" ]; then
  # El módulo de la familia DE ANTES: el servidor resolvía igual, así que la ida
  # y vuelta tiene que fallar por el enlace, no por otra cosa.
  TMP="$(mktemp -d)"
  git show "$ANTES_REF:lib/finanzas-de-la-familia.ts" > "$TMP/finanzas-de-la-familia.ts"
  npx esbuild "$TMP/finanzas-de-la-familia.ts" --bundle --platform=node --format=esm \
    --outfile="$OUT/finanzas-de-la-familia.mjs" --log-level=warning
  rm -rf "$TMP"
else
  for M in finanzas-de-la-familia accesos-de-finanzas; do
    npx esbuild "lib/$M.ts" --bundle --platform=node --format=esm --outfile="$OUT/$M.mjs" --log-level=warning
  done
fi

node --test lib/__tests__/cuenta-del-resumen.test.mjs
