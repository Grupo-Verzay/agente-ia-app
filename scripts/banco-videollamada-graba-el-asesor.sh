#!/usr/bin/env bash
# La videollamada con IA que se PRUEBA con la sesión iniciada no dejaba ni
# audio ni video, y en el chat salía con el teléfono.
#
#   1. Quién graba (`laSalaGraba`, puro): el cliente siempre; el asesor solo
#      cuando no hay cliente en la sala.
#   2. La sala MONTADA en Chromium con el Daily de mentira de
#      `lib/__tests__/sala-que-graba/`: el asesor solo con Verzy graba y sube
#      trozos; con el cliente dentro no; si el cliente se va, empieza.
#   3. El chat: «🎥 Videollamada…» en la lista y la burbuja con `isVideo`.
#
# `MODO=roto` monta la sala y el chat de `ANTES_REF` (7343076, pinchado a un
# commit, nunca `origin/main`) y AFIRMA los fallos: el asesor solo no subía ni
# un byte, y la lista decía «📞 Videollamada…».
#
# Uso:  scripts/banco-videollamada-graba-el-asesor.sh
#       MODO=roto scripts/banco-videollamada-graba-el-asesor.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:$(pwd)/node_modules:/opt/node22/lib/node_modules"
export MODO="${MODO:-bueno}"
ANTES_REF="${ANTES_REF:-7343076}"
OUT=lib/__tests__/.compilado/videollamada-graba-el-asesor
mkdir -p "$OUT"
RAIZ="$(pwd)"

limpiar() { [ -n "${ARBOL:-}" ] && git worktree remove --force "$ARBOL" 2>/dev/null || true; }
trap limpiar EXIT

if [ "$MODO" = "roto" ]; then
  ARBOL="$(mktemp -d)/antes"
  git worktree add --detach -q "$ARBOL" "$ANTES_REF"
  ln -s "$PWD/node_modules" "$ARBOL/node_modules"
  export RAIZ_DEL_ANTES="$ARBOL"
  RAIZ="$ARBOL"
else
  # ── 1. Quién graba ──────────────────────────────────────────────────────
  mkdir -p lib/__tests__/.compilado/grabacion-de-videollamada
  npx esbuild lib/grabacion-de-videollamada.ts --bundle --format=esm --platform=node \
    --alias:@="$(pwd)" --outfile=lib/__tests__/.compilado/grabacion-de-videollamada/puro.js --log-level=error
  npx esbuild lib/grabacion-de-reunion.ts --bundle --format=esm --platform=node \
    --alias:@="$(pwd)" --outfile=lib/__tests__/.compilado/grabacion-de-videollamada/reunion.js --log-level=error
  node --test lib/__tests__/grabacion-de-videollamada.test.mjs
fi

# ── 3. El chat (los de RAIZ: el de ahora, o el de ANTES_REF) ──────────────
npx esbuild "$(pwd)/lib/__tests__/icono-de-la-videollamada/entrada.ts" --bundle --format=esm --platform=node \
  --tsconfig="$RAIZ/tsconfig.json" --alias:@="$RAIZ" --outfile="$OUT/chat.js" --log-level=error
node --test lib/__tests__/icono-de-la-videollamada.test.mjs

# ── 2. La sala en Chromium ──────────────────────────────────────────────────
node --test lib/__tests__/sala-del-asesor-que-graba.test.mjs

echo "── banco de la videollamada que graba el asesor: OK (MODO=$MODO) ──"
