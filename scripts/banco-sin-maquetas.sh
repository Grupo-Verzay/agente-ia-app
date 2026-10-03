#!/usr/bin/env bash
# Ninguna maqueta se publica en la plataforma (se quitó `/ia/maqueta`).
#
# Barrido de `app/`, que el editor de verdad conserve los campos del caso y de
# la transición con los mismos valores que tenían, y —si hay build— que la
# ruta no esté en el manifiesto. `MODO=roto` lee `ANTES_REF` (pinchado, nunca
# `origin/main`) y AFIRMA que allí la maqueta estaba publicada.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/node22/bin:$PATH"
export MODO="${MODO:-bueno}"
export ANTES_REF="${ANTES_REF:-df810cd}"

mkdir -p lib/__tests__/.compilado
if [ "$MODO" = "bueno" ]; then
  npx esbuild lib/casos-y-transicion-del-paso.ts --bundle --platform=node --format=esm \
    --outfile=lib/__tests__/.compilado/casos-y-transicion-del-paso.mjs --log-level=error
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  git show "$ANTES_REF:lib/maqueta-del-paso.ts" > "$TMP/maqueta-del-paso.ts"
  npx esbuild "$TMP/maqueta-del-paso.ts" --bundle --platform=node --format=esm \
    --outfile=lib/__tests__/.compilado/maqueta-del-paso-antes.mjs --log-level=error
fi

echo "── Sin maquetas publicadas (MODO=$MODO) ──"
node --test lib/__tests__/sin-maquetas-publicadas.test.mjs "$@"
