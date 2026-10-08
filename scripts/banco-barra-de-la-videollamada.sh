#!/usr/bin/env bash
# La sala de la videollamada con pantalla compartida: sin la etiqueta de la ruta,
# la pantalla ENTERA (sin cortar abajo) y sin deformar, y la miniatura de Verzy
# en la barra, alineada con los botones; en móvil, tableta y escritorio.
# `MODO=roto` monta la sala de un commit PINCHADO (nunca origin/main) y afirma
# el corte de abajo. `CAPTURAS=dir` guarda las capturas ahí.
set -euo pipefail
cd "$(dirname "$0")/.."
MODO="${MODO:-bueno}"; export MODO
# 60d2a1b — antes de esto: la pantalla iba object-cover hasta el borde de abajo y
# la barra de mandos tapaba su parte de abajo (la barra de escribir).
ANTES_REF="${ANTES_REF:-60d2a1b}"
if [ "$MODO" = roto ]; then
  ARBOL="$(mktemp -d)/sala"
  git worktree add --detach -q "$ARBOL" "$ANTES_REF"
  trap 'git worktree remove --force "$ARBOL" 2>/dev/null || true' EXIT
  ln -s "$PWD/node_modules" "$ARBOL/node_modules"
  export RAIZ_DE_LA_SALA="$ARBOL"
fi
NODE_PATH="${NODE_PATH:-$(npm root -g)}" node --test lib/__tests__/barra-de-la-videollamada.test.mjs
