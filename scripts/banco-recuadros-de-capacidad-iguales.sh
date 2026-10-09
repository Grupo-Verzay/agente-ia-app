#!/usr/bin/env bash
# Los recuadros de capacidad («Multimedia: PDFs, fotos, videos, etc.») se ven
# IGUAL en la página pública del plan y en la propuesta que lleva ese plan:
# la misma frase en UNA línea, el mismo tamaño de letra mientras cabe, y nunca
# un salto de línea antes de «etc.».
#
# Causa: la propuesta mete el recuadro dentro de dos cajas con relleno, así que
# mide ~15 px menos que en la página del plan y la frase, a 24 px fijos, se
# partía. Ahora el valor sigue el ancho de SU recuadro (`TAMANO_DEL_VALOR`).
#
# Monta las dos vistas REALES en Chromium sobre el CSS de Tailwind a 1440/1280/
# 1024/390. `MODO=roto` monta el código de ANTES_REF (pinchado a un commit,
# nunca `origin/main`) y AFIRMA el salto de línea en la propuesta.
#
# El CSS sale de `.next/static/css` (build) o, si no hay build, se genera con
# la CLI de Tailwind: `npx tailwindcss -i app/globals.css -o .next/static/css/banco.css`.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-7343076}"
export ANTES_REF

if [ ! -d ".next/static/css" ] || [ -z "$(ls .next/static/css/*.css 2>/dev/null)" ]; then
  mkdir -p .next/static/css
  npx tailwindcss -i app/globals.css -o .next/static/css/banco.css >/dev/null 2>&1
fi

RAIZ="$PWD"
OUT=lib/__tests__/.compilado/recuadros-iguales
rm -rf "$OUT"
mkdir -p "$OUT"

F=lib/__tests__/fingido
ALIAS=(
  --alias:next/link=./$F/next-link-ssr.tsx
  --alias:next/navigation=./$F/guia-tema/next-navigation.ts
  --alias:@/lib/introduccion-publica.server=./$F/guia-tema/introduccion-publica.ts
  --alias:@/lib/contacto-de-la-guia.server=./$F/guia-tema/contacto-de-la-guia.ts
  --alias:@/actions/guia-publica-actions=./$F/guia-tema/guia-publica-actions.ts
)
NAVEGADOR=(
  --bundle --format=iife --jsx=automatic
  --define:process.env.NODE_ENV=\"production\" --define:process.env='{}'
  --log-level=error
)

empaquetar() {
  # $1: el árbol del que se empaqueta (el de hoy o el de antes).
  (cd "$1" && npx esbuild $F/recuadros-iguales-harness.tsx "${NAVEGADOR[@]}" \
    --outfile="$RAIZ/$OUT/vistas.js" "${ALIAS[@]}")
}

if [ "$MODO" = "roto" ]; then
  # El código de ANTES, en un árbol aparte: sus `@/…` resuelven a SUS ficheros.
  ANTES="$RAIZ/lib/__tests__/.antes/recuadros-iguales"
  git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
  git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
  ln -s "$RAIZ/node_modules" "$ANTES/node_modules"
  mkdir -p "$ANTES/$F/guia-tema"
  cp $F/recuadros-iguales-harness.tsx $F/next-link-ssr.tsx "$ANTES/$F/"
  cp $F/guia-tema/*.ts "$ANTES/$F/guia-tema/"
  empaquetar "$ANTES"
  git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
  git worktree prune
else
  empaquetar "$RAIZ"
fi

node --test --test-concurrency=1 lib/__tests__/recuadros-iguales.test.mjs "$@"
