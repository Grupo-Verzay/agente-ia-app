#!/usr/bin/env bash
# La grabación de la videollamada empezaba tarde (un minuto o más): el audio
# de la grabación (un `AudioContext`) nace PARADO si la página no recibió un
# clic, y con él parado no se graba nada, ni el video. Se arrancaba una sola
# vez al empezar y luego solo con el primer toque en la página.
#
#   1. Las constantes puras (cada cuánto se insiste, cuándo se pide el toque).
#   2. La sala MONTADA en Chromium con la regla del navegador FINGIDA
#      (Playwright no la aplica): si el navegador deja arrancar el audio sin
#      clic, graba sola desde ese momento; si no deja, pide el toque con el
#      botón de la sala y no dice «Grabando» mientras no graba.
#
# `MODO=roto` monta la sala de `ANTES_REF` (2954e39, pinchado a un commit,
# nunca `origin/main`) y AFIRMA el fallo: sin clic, ni un byte, aunque el
# navegador ya dejara, y ningún botón pedía el toque.
#
# Uso:  scripts/banco-grabacion-sin-clic.sh
#       MODO=roto scripts/banco-grabacion-sin-clic.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:$(pwd)/node_modules:/opt/node22/lib/node_modules"
export MODO="${MODO:-bueno}"
ANTES_REF="${ANTES_REF:-2954e39}"

limpiar() { [ -n "${ARBOL:-}" ] && git worktree remove --force "$ARBOL" 2>/dev/null || true; }
trap limpiar EXIT

if [ "$MODO" = "roto" ]; then
  ARBOL="$(mktemp -d)/antes"
  git worktree add --detach -q "$ARBOL" "$ANTES_REF"
  ln -s "$PWD/node_modules" "$ARBOL/node_modules"
  export RAIZ_DEL_ANTES="$ARBOL"
else
  mkdir -p lib/__tests__/.compilado/grabacion-de-videollamada
  npx esbuild lib/grabacion-de-videollamada.ts --bundle --format=esm --platform=node \
    --alias:@="$(pwd)" --outfile=lib/__tests__/.compilado/grabacion-de-videollamada/puro.js --log-level=error
  npx esbuild lib/grabacion-de-reunion.ts --bundle --format=esm --platform=node \
    --alias:@="$(pwd)" --outfile=lib/__tests__/.compilado/grabacion-de-videollamada/reunion.js --log-level=error
  node --test lib/__tests__/grabacion-de-videollamada.test.mjs
fi

node --test lib/__tests__/sala-que-graba-sin-clic.test.mjs
echo "── banco de la grabación sin clic: OK (MODO=$MODO) ──"
