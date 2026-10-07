#!/usr/bin/env bash
# Qué se ve en grande en la sala de la videollamada y el límite de duración.
# `MODO=roto` monta la sala de un commit PINCHADO (nunca origin/main) y afirma
# que allí no existía la regla.
set -euo pipefail
cd "$(dirname "$0")/.."
MODO="${MODO:-bueno}"; export MODO
# bf1a4af — antes de esto: el avatar se quedaba en grande y no había límite.
# 4c84c02 — antes del BUG 5: la miniatura bajaba encima de los mandos (`MODO=roto-mini`).
if [ "$MODO" = roto-mini ]; then ANTES_REF="${ANTES_REF:-4c84c02}"; else ANTES_REF="${ANTES_REF:-bf1a4af}"; fi
if [ "$MODO" = roto ] || [ "$MODO" = roto-mini ]; then
  ARBOL="$(mktemp -d)/sala"
  git worktree add --detach -q "$ARBOL" "$ANTES_REF"
  trap 'git worktree remove --force "$ARBOL" 2>/dev/null || true' EXIT
  ln -s "$PWD/node_modules" "$ARBOL/node_modules"
  export RAIZ_DE_LA_SALA="$ARBOL"
fi
NODE_PATH="${NODE_PATH:-$(npm root -g)}" node --test lib/__tests__/disposicion-de-la-videollamada.test.mjs
