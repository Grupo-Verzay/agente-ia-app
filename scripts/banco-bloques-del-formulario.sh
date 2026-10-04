#!/usr/bin/env bash
# El banco de los BLOQUES del formulario «Página de detalle» de un plan
# (Panel › Planes): el formulario va en el mismo orden que la página pública y
# cada bloque grande se mueve entero.
#
# Dos mitades: la REGLA pura (soltar, subir y bajar, la raya de la caída y el
# bloque más cercano en vertical) con un barrido del código; y la PESTAÑA de
# verdad en Chromium, dentro del mismo diálogo que la monta Panel › Planes y
# sobre el CSS del build, a 1440 y a 390, con sus acciones de servidor mudas.
#
# `MODO=roto` pinta la pestaña de ANTES_REF —pinchado a un commit, nunca
# `origin/main`— y afirma el fallo: el formulario salía en el orden fijo de
# siempre aunque la página tuviera otro.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-165a431}"
export ANTES_REF

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

OUT=lib/__tests__/.compilado/bloques-del-formulario
mkdir -p "$OUT"
rm -f "$OUT/harness.js"

PESTANA="app/(root)/(protected)/admin/planes/_components/PlanDetailTab.tsx"
if [ "$MODO" = "roto" ]; then
  ANTES_DIR=lib/__tests__/.antes/bloques-del-formulario
  mkdir -p "$ANTES_DIR"
  git show "$ANTES_REF:$PESTANA" > "$ANTES_DIR/PlanDetailTab.tsx"
  PESTANA="$ANTES_DIR/PlanDetailTab.tsx"
else
  # 1. La regla pura.
  npx esbuild lib/bloques-del-formulario-del-plan.ts --platform=node --format=esm \
    --outdir="$OUT" --log-level=error
fi

# 2. La pestaña, con el componente REAL y sus acciones mudas.
node scripts/empaquetar-con-acciones-mudas.mjs \
  lib/__tests__/fingido/bloques-del-formulario-harness.tsx "$OUT/harness.js" \
  "--alias:pestana-del-detalle=./$PESTANA" \
  "--alias:@/actions/plan-detail-actions=./lib/__tests__/fingido/acciones-del-detalle-del-plan.ts"

node --test lib/__tests__/bloques-del-formulario-del-plan.test.mjs "$@"
