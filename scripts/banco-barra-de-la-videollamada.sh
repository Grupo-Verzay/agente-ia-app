#!/usr/bin/env bash
# La sala de la videollamada con pantalla compartida: sin la etiqueta de la ruta,
# sin franjas negras y la miniatura de Verzy en la barra, alineada con los botones.
# `MODO=roto` monta la sala de un commit PINCHADO (nunca origin/main) y afirma
# la etiqueta y la franja. `CAPTURAS=dir` guarda las capturas ahí.
set -euo pipefail
cd "$(dirname "$0")/.."
MODO="${MODO:-bueno}"; export MODO
# 42e8f15 — antes de esto: «Verzy te está mostrando: /ruta» encima de la pantalla.
ANTES_REF="${ANTES_REF:-42e8f15}"
if [ "$MODO" = roto ]; then
  ARBOL="$(mktemp -d)/sala"
  git worktree add --detach -q "$ARBOL" "$ANTES_REF"
  trap 'git worktree remove --force "$ARBOL" 2>/dev/null || true' EXIT
  ln -s "$PWD/node_modules" "$ARBOL/node_modules"
  export RAIZ_DE_LA_SALA="$ARBOL"
fi
NODE_PATH="${NODE_PATH:-$(npm root -g)}" node --test lib/__tests__/barra-de-la-videollamada.test.mjs
