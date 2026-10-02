#!/usr/bin/env bash
# La MAQUETA del paso con «Agregar caso» y «Transición» (`/ia/maqueta`).
#
# Dos mitades:
#   1. Las reglas puras (`lib/maqueta-del-paso.ts`) y un barrido: el orden de
#      arriba abajo, el menú con las dos nuevas, los rótulos de sus campos, y
#      que la maqueta NO toque el editor de verdad (ni el menú real, ni el
#      guardado, ni el prompt).
#   2. La pantalla REAL en Chromium sobre el CSS del build, a 1440/1024/390:
#      el orden pintado, los campos, la lista de la transición y el menú.
#
# `MODO=roto` lee el árbol de `ANTES_REF` (pinchado, nunca `origin/main`) y
# AFIRMA que allí no había ni maqueta ni acciones nuevas.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
export MODO="${MODO:-bueno}"
export ANTES_REF="${ANTES_REF:-7a0d1ac}"

mkdir -p lib/__tests__/.compilado
npx esbuild lib/maqueta-del-paso.ts --bundle --platform=node --format=esm \
  --outfile=lib/__tests__/.compilado/maqueta-del-paso.mjs --log-level=error

if [ "$MODO" = "bueno" ]; then
  if [ ! -d ".next/static/css" ]; then
    echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
    exit 1
  fi
  ENTRY=".banco-maqueta-entry.tsx"
  trap 'rm -f "$ENTRY"' EXIT
  cat > "$ENTRY" <<'TSX'
import React from "react";
import { createRoot } from "react-dom/client";
import { MaquetaDelPaso } from "@/app/(root)/ia/maqueta/MaquetaDelPaso";
createRoot(document.getElementById("pantalla")!).render(React.createElement(MaquetaDelPaso));
(window as any).listo = true;
TSX
  node scripts/empaquetar-con-acciones-mudas.mjs \
    "$ENTRY" lib/__tests__/.compilado/harness-maqueta-del-paso.js \
    --alias:sonner=./lib/__tests__/fingido/sonner-mudo.ts
fi

echo "── Maqueta del paso (MODO=$MODO) ──"
node --test lib/__tests__/maqueta-del-paso.test.mjs "$@"
