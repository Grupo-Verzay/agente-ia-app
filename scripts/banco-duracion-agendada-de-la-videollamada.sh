#!/usr/bin/env bash
# La videollamada con Verzy dura lo que se AGENDÓ en la cita (20, 30, 45…),
# con los avisos 5 y 1 minuto antes de ese corte. Antes se cortaba SIEMPRE a
# los 30 (aviso a los 25 y a los 29): el tope de 30 estaba fijo en el código y
# la duración salía del límite de la cuenta, nunca de la cita.
#
#   1. Las reglas puras.
#   2. `abrirLaVideollamada` compilado con dobles de la base y un Tavus de
#      mentira: lo que reciben la sala y Tavus.
#   3. La sala MONTADA en Chromium con el reloj falso, de 20 y de 45 minutos.
#
# `MODO=roto` compila lo mismo de `ANTES_REF` (8004e67, pinchado a un commit,
# nunca `origin/main`) y AFIRMA el fallo: todo cortaba a los 30.
#
# Uso:  scripts/banco-duracion-agendada-de-la-videollamada.sh
#       MODO=roto scripts/banco-duracion-agendada-de-la-videollamada.sh
set -euo pipefail
cd "$(dirname "$0")/.."
MODO="${MODO:-bueno}"; export MODO
# 8004e67 — antes de esto: la sala y Tavus iban siempre a 30 minutos.
ANTES_REF="${ANTES_REF:-8004e67}"
if [ "$MODO" = roto ]; then
  ARBOL="$(mktemp -d)/sala"
  git worktree add --detach -q "$ARBOL" "$ANTES_REF"
  trap 'git worktree remove --force "$ARBOL" 2>/dev/null || true' EXIT
  ln -s "$PWD/node_modules" "$ARBOL/node_modules"
  export RAIZ_DE_LA_SALA="$ARBOL"
fi
NODE_PATH="${NODE_PATH:-$(npm root -g)}" node --test lib/__tests__/duracion-agendada-de-la-videollamada.test.mjs
