#!/usr/bin/env bash
# «Verzy, yo sigo desde aquí» y la pantalla compartida que cambia de ruta rápido.
# MODO=roto lee la sala y la pantalla de ae856c1 (pinchado, nunca origin/main).
set -euo pipefail
cd "$(dirname "$0")/.."
MODO="${MODO:-bueno}"; export MODO
ANTES_REF="${ANTES_REF:-ae856c1}"
if [ "$MODO" = roto ]; then
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  git show "$ANTES_REF:components/videollamada/SalaDeLaVideollamada.tsx" > "$TMP/sala.tsx"
  git show "$ANTES_REF:lib/pantalla-de-verzy.server.ts" > "$TMP/pantalla.ts"
  export SALA="$TMP/sala.tsx" PANTALLA="$TMP/pantalla.ts"
else
  mkdir -p lib/__tests__/.compilado
  npx esbuild lib/silencio-de-verzy.ts --bundle --format=esm --platform=node \
    --outfile=lib/__tests__/.compilado/silencio-de-verzy.js --log-level=warning
  export SALA=components/videollamada/SalaDeLaVideollamada.tsx PANTALLA=lib/pantalla-de-verzy.server.ts
fi
node --test lib/__tests__/silencio-y-pantalla-rapida.test.mjs
