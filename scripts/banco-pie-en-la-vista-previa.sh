#!/usr/bin/env bash
# La fila de Chats decía «🖼️ Imagen» / «🎥 Video» aunque la foto o el video
# llevara un texto (pie). Ahora, con pie, enseña el icono y ese texto, igual
# que una nota interna; sin pie, todo sigue como antes. Vale para lo recibido
# y para lo enviado.
#
# `MODO=roto` monta la lista de `ANTES_REF` (1d733ad, pinchado a un commit,
# nunca `origin/main`) y AFIRMA el fallo: el pie no salía.
#
# Uso:  scripts/banco-pie-en-la-vista-previa.sh
#       MODO=roto scripts/banco-pie-en-la-vista-previa.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:$(pwd)/node_modules:/opt/node22/lib/node_modules"
export MODO="${MODO:-bueno}"
ANTES_REF="${ANTES_REF:-1d733ad}"
OUT=lib/__tests__/.compilado/pie-en-la-vista-previa
mkdir -p "$OUT"
RAIZ="$(pwd)"

limpiar() { [ -n "${ARBOL:-}" ] && git worktree remove --force "$ARBOL" 2>/dev/null || true; }
trap limpiar EXIT

if [ "$MODO" = "roto" ]; then
  ARBOL="$(mktemp -d)/antes"
  git worktree add --detach -q "$ARBOL" "$ANTES_REF"
  [ -d "$PWD/node_modules" ] && ln -s "$PWD/node_modules" "$ARBOL/node_modules"
  RAIZ="$ARBOL"
fi

npx esbuild "$(pwd)/lib/__tests__/pie-en-la-vista-previa/entrada.ts" --bundle --format=esm --platform=node \
  --tsconfig="$RAIZ/tsconfig.json" --alias:@="$RAIZ" --outfile="$OUT/chat.js" --log-level=error
node --test lib/__tests__/pie-en-la-vista-previa.test.mjs

echo "── banco del pie en la vista previa: OK (MODO=$MODO) ──"
