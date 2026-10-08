#!/usr/bin/env bash
# Las notas de Verzy van a la pestaña «Notas» de la conversación y una ruta
# que falla nunca se enseña. Sin navegador: la regla y un barrido del servidor.
# La prueba de verdad (App servida, notas en la base) es banco-video-de-verzy.sh.
#   MODO=roto … contra ANTES_REF: escribía en la ficha y navegaba a la vista.
set -euo pipefail
cd "$(dirname "$0")/.."
ANTES_REF="${ANTES_REF:-422d935}"
RAIZ_NOTAS="$PWD"
if [ "${MODO:-}" = roto ]; then
  RAIZ_NOTAS="$(mktemp -d)/notas"
  git worktree add --detach -q "$RAIZ_NOTAS" "$ANTES_REF"
  trap 'git worktree remove --force "$RAIZ_NOTAS" 2>/dev/null || true' EXIT
else
  mkdir -p lib/__tests__/.compilado/notas
  npx esbuild lib/pantalla-de-verzy.ts --bundle --format=esm --platform=node \
    --outfile=lib/__tests__/.compilado/notas/pantalla-de-verzy.js --log-level=warning
fi
RAIZ_NOTAS="$RAIZ_NOTAS" MODO="${MODO:-}" node --test lib/__tests__/notas-de-verzy.test.mjs
