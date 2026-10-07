#!/usr/bin/env bash
# Los mandos de la sala se esconden solos con una pantalla compartida y vuelven
# al mover el cursor. `MODO=roto` monta la sala de un commit PINCHADO (nunca
# origin/main) y afirma que allí no se escondían nunca.
set -euo pipefail
cd "$(dirname "$0")/.."
MODO="${MODO:-bueno}"; export MODO
# 47824de — antes de esto: los mandos se quedaban siempre a la vista.
ANTES_REF="${ANTES_REF:-47824de}"
if [ "$MODO" = roto ]; then
  ARBOL="$(mktemp -d)/sala"
  git worktree add --detach -q "$ARBOL" "$ANTES_REF"
  trap 'git worktree remove --force "$ARBOL" 2>/dev/null || true' EXIT
  ln -s "$PWD/node_modules" "$ARBOL/node_modules"
  export RAIZ_DE_LA_SALA="$ARBOL"
fi
NODE_PATH="${NODE_PATH:-$(npm root -g)}" node --test lib/__tests__/mandos-de-la-videollamada.test.mjs
