#!/usr/bin/env bash
# El banco de dos arreglos de «Qué incluye este plan» en la página pública de
# un plan (`/planes/<plan>`), pedidos juntos:
#
# 1. «Ver todas las funciones» las enseña TODAS en el orden del editor, de
#    principio a fin: cada función en SU sitio entre las destacadas, no el resto
#    pegado al final (`seVeLaFuncion`, una sola lista).
# 2. Abrir la guía paso a paso de una función no mueve la página: el video se
#    queda donde estaba, la guía sale justo debajo, y solo si su principio cae
#    por debajo de la vista se baja lo justo para verla sin que el video se vaya
#    por arriba (`cuantoBajarParaVerLaGuia`). Se mide sobre el contenedor que de
#    verdad se desplaza (el de la página pública), con la guía cargando como en
#    la App y el video servido de `public/guia`.
#
# Las reglas sin navegador, y la página REAL en Chromium sobre el CSS del build.
# `MODO=roto` pinta la misma página con el código de ANTES_REF —pinchado a un
# commit, nunca `origin/main`— y AFIRMA los fallos.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-0764700}"
export ANTES_REF

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

npx esbuild --version >/dev/null

RAIZ="$PWD"
OUT=lib/__tests__/.compilado/plan-orden-y-guia-sin-saltos
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
  npx esbuild $F/plan-orden-y-guia-reglas.ts --bundle --platform=node --format=esm \
    --jsx=automatic --log-level=error \
    --alias:next/link=./$F/next-link-ssr.tsx \
    --alias:@/actions/guia-publica-actions=./$F/guia-tema/guia-publica-actions.ts \
    --define:process.env.NODE_ENV=\"production\" \
    --banner:js='import{createRequire as __cr}from "module";const require=__cr(import.meta.url);' \
    --outfile="$OUT/reglas.mjs"
fi

empaquetar() {
  # $1: el árbol del que se empaqueta (el de hoy o el de antes).
  (cd "$1" && npx esbuild $F/plan-orden-y-guia-harness.tsx "${NAVEGADOR[@]}" \
    --outfile="$RAIZ/$OUT/plan.js" "${ALIAS_GUIA[@]}")
}

if [ "$MODO" = "roto" ]; then
  # El código de ANTES, en un árbol aparte: sus `@/…` resuelven a SUS ficheros.
  ANTES="$RAIZ/lib/__tests__/.antes/plan-orden-y-guia-sin-saltos"
  git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
  git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
  ln -s "$RAIZ/node_modules" "$ANTES/node_modules"
  mkdir -p "$ANTES/$F/guia-tema"
  cp $F/plan-orden-y-guia-harness.tsx $F/next-link-ssr.tsx "$ANTES/$F/"
  cp $F/guia-tema/*.ts "$ANTES/$F/guia-tema/"
  empaquetar "$ANTES"
  git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
  git worktree prune
else
  empaquetar "$RAIZ"
fi

node --test --test-concurrency=1 lib/__tests__/plan-orden-y-guia-sin-saltos.test.mjs "$@"
