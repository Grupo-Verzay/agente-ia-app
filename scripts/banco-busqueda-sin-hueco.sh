#!/usr/bin/env bash
# Buscar por palabras en Chats dejaba un hueco en blanco enorme encima de los
# resultados «En mensajes»: el aviso «No hay chats que coincidan» ocupaba el
# alto entero de la columna, centrado, y empujaba los resultados al fondo.
#
#   1. La regla y un barrido, sin navegador.
#   2. El ChatEmptyState REAL en Chromium, midiendo el hueco a 1440/1024/390.
#
# `MODO=roto` pinta el del commit pinchado (`ANTES_REF`, nunca origin/main) y
# AFIRMA el hueco.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"; export MODO
# a3c678e — antes de esto: el vacío ocupaba siempre el alto y centraba.
ANTES_REF="${ANTES_REF:-a3c678e}"
RAIZ="$(pwd)"
OUTDIR="$RAIZ/lib/__tests__/.compilado/busqueda-sin-hueco"
mkdir -p "$OUTDIR"
ARBOL=""
limpiar() { if [ -n "$ARBOL" ]; then git worktree remove --force "$ARBOL" >/dev/null 2>&1 || true; fi; }
trap limpiar EXIT

if [ "$MODO" != "roto" ]; then
  npx esbuild lib/__tests__/busqueda-sin-hueco/reglas.ts --bundle --format=esm \
    --alias:@=. --outfile="$OUTDIR/reglas.js" --log-level=error
  node --test lib/__tests__/busqueda-sin-hueco-reglas.test.mjs
  ARBOL_DE_PRUEBA="$RAIZ"
else
  ARBOL="$(mktemp -d)/antes"
  git worktree add --detach "$ARBOL" "$ANTES_REF" >/dev/null
  ln -s "$RAIZ/node_modules" "$ARBOL/node_modules"
  mkdir -p "$ARBOL/lib/__tests__/busqueda-sin-hueco"
  cp lib/__tests__/busqueda-sin-hueco/entrada.tsx "$ARBOL/lib/__tests__/busqueda-sin-hueco/"
  ARBOL_DE_PRUEBA="$ARBOL"
fi

(cd "$ARBOL_DE_PRUEBA" && npx esbuild lib/__tests__/busqueda-sin-hueco/entrada.tsx --bundle --format=esm \
  --alias:@=. --jsx=automatic --define:process.env.NODE_ENV='"production"' \
  --outfile="$OUTDIR/entrada.js" --log-level=error \
  && npx tailwindcss -i app/globals.css -o "$OUTDIR/estilos.css" >/dev/null 2>&1)

BUNDLE_DEL_BANCO="$OUTDIR/entrada.js" CSS_DEL_BANCO="$OUTDIR/estilos.css" \
  node --test lib/__tests__/busqueda-sin-hueco.test.mjs
echo "banco-busqueda-sin-hueco ($MODO): ok"
