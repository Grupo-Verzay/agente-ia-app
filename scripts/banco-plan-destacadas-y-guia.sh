#!/usr/bin/env bash
# El banco de cinco arreglos de la página pública de un plan, pedidos juntos:
#
# 1. «Qué incluye este plan»: el título centrado, de entrada las funciones
#    DESTACADAS (la misma marca que la tarjeta corta de la landing) y el resto
#    detrás de «Ver todas las funciones». La flecha de abrir se distingue.
# 2. La fila de la guía de una función: «Guía paso a paso» a la izquierda y
#    «Ver guía» / «Ocultar guía» a la derecha.
# 3. Con la guía abierta, el video de la función no se pinta.
# 4. La guía desplegada sigue el tema de la App (claro u oscuro).
# 5. La barra de arriba lleva «Inicio» a la derecha.
#
# Las reglas sin navegador, y la página REAL en Chromium sobre el CSS del build,
# bajo el `ThemeProvider` de la App. `MODO=roto` pinta la misma página con el
# código de ANTES_REF —pinchado a un commit, nunca `origin/main`— y AFIRMA los
# fallos.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-15568a8}"
export ANTES_REF

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

npx esbuild --version >/dev/null

RAIZ="$PWD"
OUT=lib/__tests__/.compilado/plan-destacadas-y-guia
rm -rf "$OUT"
mkdir -p "$OUT"

F=lib/__tests__/fingido
ALIAS_GUIA=(
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

# Las reglas, del árbol de hoy (en el modo roto no se usan: ahí se lee git).
if [ "$MODO" != "roto" ]; then
  npx esbuild $F/plan-destacadas-reglas.ts --bundle --platform=node --format=esm \
    --jsx=automatic --log-level=error \
    --alias:next/link=./$F/next-link-ssr.tsx \
    --alias:@/actions/guia-publica-actions=./$F/guia-tema/guia-publica-actions.ts \
    --define:process.env.NODE_ENV=\"production\" \
    --banner:js='import{createRequire as __cr}from "module";const require=__cr(import.meta.url);' \
    --outfile="$OUT/reglas.mjs"
fi

empaquetar() {
  # $1: el árbol del que se empaqueta (el de hoy o el de antes).
  (cd "$1" && npx esbuild $F/plan-destacadas-harness.tsx "${NAVEGADOR[@]}" \
    --outfile="$RAIZ/$OUT/plan.js" "${ALIAS_GUIA[@]}")
}

if [ "$MODO" = "roto" ]; then
  # El código de ANTES, en un árbol aparte: sus `@/…` resuelven a SUS ficheros.
  ANTES="$RAIZ/lib/__tests__/.antes/plan-destacadas-y-guia"
  git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
  git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
  ln -s "$RAIZ/node_modules" "$ANTES/node_modules"
  mkdir -p "$ANTES/$F/guia-tema"
  cp $F/plan-destacadas-harness.tsx $F/next-link-ssr.tsx "$ANTES/$F/"
  cp $F/guia-tema/*.ts "$ANTES/$F/guia-tema/"
  empaquetar "$ANTES"
  git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
  git worktree prune
else
  empaquetar "$RAIZ"
fi

node --test --test-concurrency=1 lib/__tests__/plan-destacadas-y-guia.test.mjs "$@"
