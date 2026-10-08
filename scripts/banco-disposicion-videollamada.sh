#!/usr/bin/env bash
# Qué se ve en grande en la sala de la videollamada y el límite de duración.
# `MODO=roto` monta la sala de un commit PINCHADO (nunca origin/main) y afirma
# que allí no existía la regla.
set -euo pipefail
cd "$(dirname "$0")/.."
MODO="${MODO:-bueno}"; export MODO
# bf1a4af — antes de esto: el avatar se quedaba en grande y no había límite.
ANTES_REF="${ANTES_REF:-bf1a4af}"
# 47824de — antes de esto: si la pantalla que pedía Verzy fallaba o la ocultaba,
# Verzy volvía a pantalla grande. `MODO=roto-miniatura` lo afirma.
ANTES_MINIATURA_REF="${ANTES_MINIATURA_REF:-47824de}"
if [ "$MODO" = roto-miniatura ]; then ANTES_REF="$ANTES_MINIATURA_REF"; fi
if [ "$MODO" = roto ] || [ "$MODO" = roto-miniatura ]; then
  ARBOL="$(mktemp -d)/sala"
  git worktree add --detach -q "$ARBOL" "$ANTES_REF"
  trap 'git worktree remove --force "$ARBOL" 2>/dev/null || true' EXIT
  ln -s "$PWD/node_modules" "$ARBOL/node_modules"
  export RAIZ_DE_LA_SALA="$ARBOL"
fi
NODE_PATH="${NODE_PATH:-$(npm root -g)}" node --test lib/__tests__/disposicion-de-la-videollamada.test.mjs
