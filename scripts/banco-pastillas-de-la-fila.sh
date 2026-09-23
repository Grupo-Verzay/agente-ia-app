#!/usr/bin/env bash
# El banco de la fila de pastillas de cada tarjeta de Chats.
#
# La lista de Chats enseña su barra de desplazamiento, como todas las listas de
# la plataforma, y la barra se come 10 px con barras clásicas. Con ella,
# «Descartado» + «Asignar» + tres contadores + etiquetas se partía en dos a
# 1024. El ancho se recupera bajando 2 px por lado el relleno de TODAS las
# pastillas de la fila (`lib/pastillas-de-la-fila.ts`).
#
# Se mide en Chromium CON barras de verdad (sin `--hide-scrollbars`), sobre el
# CSS del build y con `ChatContactItem` real, a 1440/1280/1024, con la ficha
# lateral abierta y cerrada, y con contadores de una y de dos cifras.
#
# `MODO=roto` pinta la MISMA lista con las pastillas de `ANTES_REF`, sacadas de
# git a un árbol aparte —no escritas aquí—, y AFIRMA el fallo.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
# El commit de ANTES: las pastillas con su relleno de siempre. Pinchado, nunca
# `origin/main`: en cuanto el arreglo se fusiona, `origin/main` pasa a ser el
# «después» y el modo roto saldría verde sin reproducir nada.
ANTES_REF="${ANTES_REF:-0808c00}"

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

ENTRY=".banco-pastillas-entry.tsx"
OUT="lib/__tests__/.compilado/harness-pastillas-de-la-fila.js"
ARBOL=""
mkdir -p "$(dirname "$OUT")"
limpiar() {
  rm -f "$ENTRY"
  if [ -n "$ARBOL" ]; then git worktree remove --force "$ARBOL" >/dev/null 2>&1 || true; fi
}
trap limpiar EXIT

# La lista es la de HOY en los dos modos: con su barra. Lo único que cambia
# entre ellos son las pastillas.
if [ "$MODO" = "roto" ]; then
  ARBOL="$(mktemp -d)/antes"
  git worktree add --detach "$ARBOL" "$ANTES_REF" >/dev/null
  ln -s "$(pwd)/node_modules" "$ARBOL/node_modules"
  RAIZ_DE_LAS_PASTILLAS="$ARBOL"
else
  RAIZ_DE_LAS_PASTILLAS="$(pwd)"
fi

sed -e "s#__FILA__#$RAIZ_DE_LAS_PASTILLAS/app/(root)/chats/_components/ChatContactItem#" \
    -e "s#__LISTA__#./lib/lista-de-chats#" \
    lib/__tests__/fingido/entrada-de-pastillas-de-la-fila.tsx > "$ENTRY"

npx --yes esbuild "$ENTRY" --bundle --format=esm --outfile="$OUT" \
  --alias:@="$RAIZ_DE_LAS_PASTILLAS" \
  --alias:@/actions/session-action=./lib/__tests__/fingido/acciones-mudas.ts \
  --alias:@/actions/advisor-assign-actions=./lib/__tests__/fingido/acciones-mudas.ts \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error

MODO="$MODO" node --test lib/__tests__/pastillas-de-la-fila.test.mjs "$@"
