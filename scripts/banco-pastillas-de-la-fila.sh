#!/usr/bin/env bash
# El banco de la fila de pastillas de cada tarjeta de Chats.
#
# La fila (estado, asignación, contadores, etiquetas) ya llegaba al borde de su
# tarjeta; lo que no llegaba al borde de la columna era la TARJETA: la barra de
# desplazamiento de la lista —pista transparente, 10 px con barras clásicas—
# se quedaba su ancho a la derecha. 13 px de margen a la izquierda y 23 a la
# derecha, y esos 10 px eran los que mandaban las etiquetas a otra línea.
#
# Se mide en Chromium CON barras de verdad (sin `--hide-scrollbars`, que es lo
# que Playwright pone por defecto y que esconde justo el fallo), sobre el CSS
# del build y con `ChatContactItem` real, a 1440/1280/1024 y con la ficha
# lateral abierta y cerrada.
#
# `MODO=roto` pinta la lista con la clase de `ANTES_REF`, sacada de git —no
# escrita aquí—, y AFIRMA el fallo.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
# El commit de ANTES del arreglo. Pinchado, nunca `origin/main`: en cuanto el
# arreglo se fusiona, `origin/main` pasa a ser el «después» y el modo roto
# saldría verde sin reproducir nada.
ANTES_REF="${ANTES_REF:-093f071}"

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

ENTRY=".banco-pastillas-entry.tsx"
LISTA_ANTES=".banco-lista-antes.ts"
OUT="lib/__tests__/.compilado/harness-pastillas-de-la-fila.js"
mkdir -p "$(dirname "$OUT")"
trap 'rm -f "$ENTRY" "$LISTA_ANTES"' EXIT

if [ "$MODO" = "roto" ]; then
  CLASE=$(git show "$ANTES_REF:app/(root)/chats/_components/chat-sidebar.tsx" \
    | grep -o 'className="flex-1 overflow-y-auto[^"]*"' | head -1 | sed 's/className="\(.*\)"/\1/')
  if [ -z "$CLASE" ]; then
    echo "no se encontró la clase de la lista en $ANTES_REF" >&2
    exit 1
  fi
  echo "export const LISTA_DE_CHATS = \"$CLASE\";" > "$LISTA_ANTES"
  LISTA="./$LISTA_ANTES"
else
  LISTA="@/lib/lista-de-chats"
fi

sed -e 's#__FILA__#@/app/(root)/chats/_components/ChatContactItem#' \
    -e "s#__LISTA__#$LISTA#" \
    lib/__tests__/fingido/entrada-de-pastillas-de-la-fila.tsx > "$ENTRY"

npx --yes esbuild "$ENTRY" --bundle --format=esm --outfile="$OUT" \
  --alias:@="$(pwd)" \
  --alias:@/actions/session-action=./lib/__tests__/fingido/acciones-mudas.ts \
  --alias:@/actions/advisor-assign-actions=./lib/__tests__/fingido/acciones-mudas.ts \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error

MODO="$MODO" node --test lib/__tests__/pastillas-de-la-fila.test.mjs "$@"
