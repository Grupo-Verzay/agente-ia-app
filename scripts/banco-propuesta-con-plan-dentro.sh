#!/usr/bin/env bash
# El plan del panel de Planes, ENTERO, dentro de la propuesta pública:
#
# 1. Un servicio que se llama como un plan lleva ese plan dentro de su propia
#    fila: video, capacidad, «Qué incluye» con su acordeón, el precio y el
#    botón verde. El que no empareja sale después, en «Conoce el plan».
# 2. Nada saca al cliente de la propuesta: la guía de una función se despliega
#    ahí mismo, sin sus enlaces de salida, y el único enlace a otra pestaña es
#    el botón de comenzar (con `noopener`).
# 3. La propuesta sigue el modo claro u oscuro del DISPOSITIVO del cliente.
# 4. El logo y el eslogan van dentro de la tarjeta azul.
#
# La propuesta REAL en Chromium sobre el CSS del build. `MODO=roto` pinta la
# misma propuesta con el código de ANTES_REF —pinchado a un commit, nunca
# `origin/main`— y AFIRMA los fallos.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-94fcc3c}"
export ANTES_REF

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

npx esbuild --version >/dev/null

RAIZ="$PWD"
OUT=lib/__tests__/.compilado/propuesta-con-plan-dentro
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
  (cd "$1" && npx esbuild $F/propuesta-con-plan-dentro-harness.tsx "${NAVEGADOR[@]}" \
    --outfile="$RAIZ/$OUT/propuesta.js" "${ALIAS_GUIA[@]}")
}

if [ "$MODO" = "roto" ]; then
  # El código de ANTES, en un árbol aparte: sus `@/…` resuelven a SUS ficheros.
  ANTES="$RAIZ/lib/__tests__/.antes/propuesta-con-plan-dentro"
  git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
  git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
  ln -s "$RAIZ/node_modules" "$ANTES/node_modules"
  mkdir -p "$ANTES/$F/guia-tema"
  cp $F/propuesta-con-plan-dentro-harness.tsx $F/next-link-ssr.tsx "$ANTES/$F/"
  cp $F/guia-tema/*.ts "$ANTES/$F/guia-tema/"
  empaquetar "$ANTES"
  git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
  git worktree prune
else
  empaquetar "$RAIZ"
fi

node --test --test-concurrency=1 lib/__tests__/propuesta-con-plan-dentro.test.mjs "$@"
