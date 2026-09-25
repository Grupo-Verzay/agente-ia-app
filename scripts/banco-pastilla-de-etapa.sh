#!/usr/bin/env bash
# La etapa del embudo en Chats: la pastilla de la fila y el icono de la
# cabecera.
#
# Dos mitades:
#   1. Las reglas, sin navegador: el recorte a 14 caracteres —los mismos que
#      «Sin clasificar»—, que el índice del color y el color del tablero son el
#      mismo dato, y un barrido del código (la fila pinta la pastilla entre el
#      estado y «Asignar»; el botón de la cabecera es solo un icono).
#   2. La fila (`ChatContactItem`) y la cabecera (`ChatHeader`) REALES, con sus
#      acciones de servidor mudas, en Chromium sobre el CSS del build (o
#      `CSS_DEL_BANCO`), a 1440/1280/1024.
#
# `MODO=roto` empaqueta el MISMO arnés contra los componentes de `ANTES_REF`
# (un `git worktree` aparte) y afirma su fallo: ninguna pastilla en la fila y un
# botón con el nombre escrito que se come el ancho de sus vecinos.
#
# El «antes» va PINCHADO a un commit, nunca a `origin/main`: en cuanto esto se
# fusione, `origin/main` sería el «ahora» y el modo roto pasaría sin reproducir
# nada, que es la peor forma de tener un banco.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
# 3153ccf — antes de esto: el selector con el nombre de la etapa escrito al
#           lado y la fila sin ninguna pastilla de etapa.
ANTES_REF="${ANTES_REF:-3153ccf}"
export MODO

RAIZ="$(pwd)"
mkdir -p lib/__tests__/.compilado

# Las funciones puras SIEMPRE se compilan del árbol de ahora: en el «antes» no
# existían, así que no hay un «antes» suyo que afirmar. Lo que el modo roto lee
# del otro árbol son los COMPONENTES.
npx tsc lib/embudos.ts --outDir lib/__tests__/.compilado \
  --module esnext --target es2022 --moduleResolution bundler --skipLibCheck

if [ ! -d ".next/static/css" ] && [ -z "${CSS_DEL_BANCO:-}" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes, o pasa CSS_DEL_BANCO" >&2
  exit 1
fi

OUT="$RAIZ/lib/__tests__/.compilado/pastilla-de-etapa.js"

if [ "$MODO" = "roto" ]; then
  W="$(mktemp -d)/antes"
  git worktree add -f "$W" "$ANTES_REF" -q
  ln -s "$RAIZ/node_modules" "$W/node_modules"
  mkdir -p "$W/lib/__tests__/pastilla-de-etapa"
  cp lib/__tests__/pastilla-de-etapa/* "$W/lib/__tests__/pastilla-de-etapa/"
  (cd "$W" && node "$RAIZ/scripts/empaquetar-con-acciones-mudas.mjs" \
      lib/__tests__/pastilla-de-etapa/entrada.tsx "$OUT")
  # El CSS del «antes» sale de SU código: con el de ahora, las clases que aquel
  # no tenía existirían igual y se estaría midiendo otra cosa.
  (cd "$W" && npx tailwindcss -i app/globals.css -o "$W/antes.css" >/dev/null 2>&1)
  cp "$W/antes.css" "$RAIZ/lib/__tests__/.compilado/antes.css"
  DIR_ANTES="$W" node --test lib/__tests__/pastilla-de-etapa-reglas.test.mjs
  CSS_DEL_BANCO="$RAIZ/lib/__tests__/.compilado/antes.css" node --test lib/__tests__/pastilla-de-etapa.test.mjs "$@"
  git worktree remove --force "$W" >/dev/null 2>&1 || true
else
  node --test lib/__tests__/pastilla-de-etapa-reglas.test.mjs
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/pastilla-de-etapa/entrada.tsx "$OUT"
  node --test lib/__tests__/pastilla-de-etapa.test.mjs "$@"
fi
