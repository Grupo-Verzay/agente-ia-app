#!/usr/bin/env bash
# El banco de cuatro arreglos que se pidieron juntos:
#
# 1. En la página de un plan, «Ver la guía paso a paso» de una función se
#    DESPLIEGA dentro del mismo acordeón, debajo del video, sin salir de la
#    página ni abrir otra pestaña; y el video se compacta para dejarle sitio.
# 2. «Qué incluye este plan» arranca PLEGADO bajo un solo encabezado.
# 3. El cierre del plan no lleva título: el precio en blanco y destacado encima
#    del botón verde «Comenzar con el plan X».
# 4. Las landings no llevan franjas, líneas ni sombras entre secciones.
#
# Un barrido del código sin navegador, y las pantallas REALES en Chromium sobre
# el CSS del build. `MODO=roto` pinta las mismas pantallas con el código de
# ANTES_REF —pinchado a un commit, nunca `origin/main`— y AFIRMA los fallos.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-97b6d07}"
export ANTES_REF

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

# El empaquetador de las acciones mudas busca esbuild en la caché de npx.
npx esbuild --version >/dev/null

RAIZ="$PWD"
OUT=lib/__tests__/.compilado/plan-guia-dentro
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

empaquetar() {
  # $1: el árbol del que se empaqueta (el de hoy o el de antes).
  (cd "$1" && npx esbuild $F/plan-acordeon-harness.tsx "${NAVEGADOR[@]}" \
    --outfile="$RAIZ/$OUT/plan.js" "${ALIAS_GUIA[@]}")
  (cd "$1" && node "$RAIZ/scripts/empaquetar-con-acciones-mudas.mjs" \
    $F/landing-entera-harness.tsx "$RAIZ/$OUT/landing.js" \
    --alias:next/link=./$F/next-link-ssr.tsx \
    --alias:next/navigation=./$F/next-navigation-mudo.ts)
}

if [ "$MODO" = "roto" ]; then
  # El código de ANTES, en un árbol aparte: sus `@/…` resuelven a SUS ficheros.
  ANTES="$RAIZ/lib/__tests__/.antes/plan-guia-dentro"
  git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
  git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
  ln -s "$RAIZ/node_modules" "$ANTES/node_modules"
  mkdir -p "$ANTES/$F/guia-tema"
  cp $F/plan-acordeon-harness.tsx $F/landing-entera-harness.tsx \
    $F/next-link-ssr.tsx $F/next-navigation-mudo.ts "$ANTES/$F/"
  cp $F/guia-tema/*.ts "$ANTES/$F/guia-tema/"
  empaquetar "$ANTES"
  git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
  git worktree prune
else
  empaquetar "$RAIZ"
fi

node --test --test-concurrency=1 lib/__tests__/plan-guia-dentro.test.mjs "$@"
