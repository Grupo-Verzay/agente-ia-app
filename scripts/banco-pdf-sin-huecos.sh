#!/usr/bin/env bash
# El PDF de una conversación fluye SEGUIDO: sin huecos grandes al final de una
# hoja, sin partir un mensaje corto, uno largo partido por sus líneas con
# «continúa», el separador de día pegado a su mensaje, y la hoja simétrica.
#
# `MODO=roto` corre lo mismo contra el generador de ANTES_REF —PINCHADO a un
# commit, nunca `origin/main`, que en cuanto esto se fusione sería el
# «ahora»— y AFIRMA los huecos.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/node22/bin:$PATH"
MODO="${MODO:-bueno}"
export MODO
# 8b1bdab — antes de esto: un mensaje que no cabía pasaba entero a la hoja siguiente.
ANTES_REF="${ANTES_REF:-8b1bdab}"

COMP=lib/__tests__/.compilado/pdf-sin-huecos
rm -rf "$COMP"; mkdir -p "$COMP"
if [ "$MODO" = "roto" ]; then
  ARBOL="$COMP/antes"
  git worktree remove --force "$ARBOL" 2>/dev/null || true
  git worktree add --detach "$ARBOL" "$ANTES_REF" >/dev/null 2>&1
  (cd "$ARBOL" && npx esbuild lib/conversacion-en-pdf.ts --bundle --platform=node --format=esm \
     --external:pdf-lib --outfile=../conversacion-en-pdf.mjs --log-level=error)
  git worktree remove --force "$ARBOL"
else
  npx esbuild lib/conversacion-en-pdf.ts --bundle --platform=node --format=esm \
    --external:pdf-lib --outfile="$COMP/conversacion-en-pdf.mjs" --log-level=error
fi
MODULO_DEL_PDF="$PWD/$COMP/conversacion-en-pdf.mjs" node --test lib/__tests__/pdf-sin-huecos.test.mjs "$@"
