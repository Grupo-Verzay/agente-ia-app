#!/usr/bin/env bash
# La propuesta pública sin repeticiones y con la guía como en la landing:
#
# 1. El precio de un servicio que es un plan sale DOS veces: en «Inversión
#    total» arriba y junto al botón «Comenzar con el plan». Ni junto al nombre
#    del servicio ni en un «Total» al final.
# 2. La cuadrícula de secciones de la guía desplegada no deja huecos: sin
#    «Contáctanos» (no se sale de la propuesta), «Ver el vídeo de nuevo» ocupa
#    su sitio.
# 3. La guía del Agente IA no sale dentro de la propuesta (es para quien ya
#    compró): su función se queda sin «Ver guía».
# 4. Al abrir «Ver guía» el video se compacta, como en la página del plan.
#
# La propuesta REAL en Chromium sobre el CSS del build, con el MISMO arnés que
# `banco-propuesta-con-plan-dentro.sh`. `MODO=roto` pinta la misma propuesta
# con el código de ANTES_REF —pinchado a un commit, nunca `origin/main`— y
# AFIRMA los cuatro fallos.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-cbc47f6}"
export ANTES_REF

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

npx esbuild --version >/dev/null

RAIZ="$PWD"
OUT=lib/__tests__/.compilado/propuesta-sin-repeticiones
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
  ANTES="$RAIZ/lib/__tests__/.antes/propuesta-sin-repeticiones"
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

node --test --test-concurrency=1 lib/__tests__/propuesta-sin-repeticiones.test.mjs "$@"
