#!/usr/bin/env bash
# El banco de tres arreglos que se pidieron juntos:
#
# 1. En la página de un plan, «Qué incluye» es un ACORDEÓN: cada función se
#    abre ahí mismo con su video o su guía, y su enlace dice «Ver tutorial»,
#    nunca el nombre de la guía (antes «Guía de Agente IA» salía en funciones
#    que no tenían nada que ver entre sí).
# 2. Todos los bloques de esa página miden lo MISMO que la landing
#    (`ANCHO_DE_LA_LANDING`), sin rayas entre bloques.
# 3. Las páginas de las guías (`/guia/*`) siguen el tema de la App (claro u
#    oscuro) con los tokens `--guia-*`; la guía metida en la landing sigue clara.
#
# Lo puro y un barrido del código sin navegador, y las pantallas REALES en
# Chromium sobre el CSS del build. `MODO=roto` pinta las mismas pantallas con el
# código de ANTES_REF —pinchado a un commit, nunca `origin/main`— y AFIRMA los
# fallos.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-2fda6a3}"
export ANTES_REF

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

RAIZ="$PWD"
OUT=lib/__tests__/.compilado/plan-acordeon
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

empaquetar_pantallas() {
  # $1: el árbol del que se empaqueta (el de hoy o el de antes).
  (cd "$1" && npx esbuild $F/plan-acordeon-harness.tsx "${NAVEGADOR[@]}" \
    --outfile="$RAIZ/$OUT/plan.js" --alias:next/link=./$F/next-link-ssr.tsx)
  (cd "$1" && npx esbuild $F/guia-tema-harness.tsx "${NAVEGADOR[@]}" \
    --outfile="$RAIZ/$OUT/guia.js" "${ALIAS_GUIA[@]}")
}

if [ "$MODO" = "roto" ]; then
  # El código de ANTES, en un árbol aparte: sus `@/…` resuelven a SUS ficheros.
  ANTES="$RAIZ/lib/__tests__/.antes/plan-acordeon"
  git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
  git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
  ln -s "$RAIZ/node_modules" "$ANTES/node_modules"
  mkdir -p "$ANTES/$F/guia-tema"
  cp $F/plan-acordeon-harness.tsx $F/guia-tema-harness.tsx $F/next-link-ssr.tsx "$ANTES/$F/"
  cp $F/guia-tema/*.ts "$ANTES/$F/guia-tema/"
  empaquetar_pantallas "$ANTES"
  git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
  git worktree prune
else
  # Lo puro, para node.
  npx esbuild $F/entrada-plan-acordeon.ts --bundle --platform=node --format=esm \
    --outfile="$OUT/puro.mjs" --external:@prisma/client --log-level=error
  empaquetar_pantallas "$RAIZ"
fi

node --test --test-concurrency=1 lib/__tests__/plan-acordeon-y-guias-tema.test.mjs "$@"
