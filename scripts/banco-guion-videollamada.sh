#!/usr/bin/env bash
# El guion de Verzy editable por cuenta (Agente IA › Videollamadas).
# `MODO=roto` lee el código de un commit PINCHADO (nunca origin/main) y afirma
# que el guion iba escrito a mano.
set -euo pipefail
cd "$(dirname "$0")/.."
MODO="${MODO:-bueno}"; export MODO
# 304d3bb — antes de esto: guion fijo en el código.
ANTES_REF="${ANTES_REF:-304d3bb}"
if [ "$MODO" = roto ]; then
  ARBOL="$(mktemp -d)/antes"
  git worktree add --detach -q "$ARBOL" "$ANTES_REF"
  trap 'git worktree remove --force "$ARBOL" 2>/dev/null || true' EXIT
  export RAIZ_DE_ANTES="$ARBOL"
else
  mkdir -p lib/__tests__/.compilado
  npx esbuild lib/guion-videollamada.ts --bundle --format=esm --platform=node \
    --outfile=lib/__tests__/.compilado/guion-videollamada.js --log-level=warning
  npx esbuild lib/pantalla-del-avatar.ts --bundle --format=esm --platform=node \
    --outfile=lib/__tests__/.compilado/pantalla-del-avatar.js --log-level=warning
fi
node --test lib/__tests__/guion-videollamada.test.mjs
