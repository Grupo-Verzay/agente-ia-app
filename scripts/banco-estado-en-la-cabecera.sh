#!/usr/bin/env bash
# La línea de estado bajo el nombre del contacto (escribiendo…, grabando
# audio…, en línea, últ. vez, el anuncio), dentro de los 78 px de la cabecera.
#
# Dos mitades:
#   1. La decisión, sin navegador: nombre (18) + estado (14) = la fila 1 (32),
#      y la cabecera sigue en 78 y 6.
#   2. La `ChatHeader` REAL, con sus acciones de servidor mudas, en Chromium
#      sobre el CSS del build (o `CSS_DEL_BANCO`), a 1440/1280/1024.
#
# `MODO=roto` empaqueta el MISMO arnés contra la `ChatHeader` de `ANTES_REF`
# (un `git worktree` aparte) y afirma el fallo: la línea recortada. El «antes»
# va PINCHADO a un commit, nunca a `origin/main`: en cuanto esto se fusione,
# `origin/main` sería el «ahora» y el modo roto pasaría sin reproducir nada.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
ANTES_REF="${ANTES_REF:-6686021}"
export MODO

mkdir -p lib/__tests__/.compilado
npx tsc lib/cabeceras-de-chats.ts --outDir lib/__tests__/.compilado \
  --module esnext --target es2022 --moduleResolution bundler --skipLibCheck
node --test lib/__tests__/estado-en-la-cabecera-numeros.test.mjs

if [ ! -d ".next/static/css" ] && [ -z "${CSS_DEL_BANCO:-}" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes, o pasa CSS_DEL_BANCO" >&2
  exit 1
fi

npx esbuild --version >/dev/null 2>&1 || true
RAIZ="$(pwd)"
OUT="$RAIZ/lib/__tests__/.compilado/estado-en-la-cabecera.js"

if [ "$MODO" = "roto" ]; then
  W="$(mktemp -d)/antes"
  trap 'git worktree remove --force "$W" >/dev/null 2>&1 || true' EXIT
  git worktree add -f "$W" "$ANTES_REF" -q
  ln -s "$RAIZ/node_modules" "$W/node_modules"
  mkdir -p "$W/lib/__tests__/estado-en-la-cabecera"
  cp lib/__tests__/estado-en-la-cabecera/* "$W/lib/__tests__/estado-en-la-cabecera/"
  (cd "$W" && node "$RAIZ/scripts/empaquetar-con-acciones-mudas.mjs" \
      lib/__tests__/estado-en-la-cabecera/entrada.tsx "$OUT")
else
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/estado-en-la-cabecera/entrada.tsx "$OUT"
fi

node --test lib/__tests__/estado-en-la-cabecera.test.mjs "$@"
