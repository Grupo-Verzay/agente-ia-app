#!/usr/bin/env bash
# «Agregar caso» y «Agregar transición» en un paso del entrenamiento.
#
# Empaqueta con esbuild los dos constructores del prompt, el esquema que
# valida al guardar y el orden de los elementos (los de HOY), y el
# constructor de `ANTES_REF` sacado a un `git worktree`, para comparar un
# paso de los de siempre byte a byte.
#
# `MODO=roto` corre el constructor de `ANTES_REF` (pinchado, nunca
# `origin/main`) y AFIRMA que allí no existían ni el caso ni la transición.
set -euo pipefail
cd "$(dirname "$0")/.."

export MODO="${MODO:-bueno}"
export ANTES_REF="${ANTES_REF:-83159ac}"
# Antes de llevar caso y transición a Preguntas, Productos y Extras (#1100 fusionado).
export ANTES_FUERA_REF="${ANTES_FUERA_REF:-8958372}"
OUT=lib/__tests__/.compilado/casos-y-transicion
mkdir -p "$OUT"
H='app/(root)/ai/_components/helpers'

pack() { npx esbuild "$1" --bundle --platform=node --format=esm --outfile="$2" --log-level=error \
  --external:zod --alias:@=. "${@:3}"; }

ANTES_DIR="$(mktemp -d)/antes"
git worktree add --detach "$ANTES_DIR" "$ANTES_REF" >/dev/null 2>&1
trap 'git worktree remove --force "$ANTES_DIR" >/dev/null 2>&1 || true' EXIT
( cd "$ANTES_DIR" && npx --prefix "$OLDPWD" esbuild "$H/markdownBuilder.ts" --bundle --platform=node --format=esm \
    --outfile="$OLDPWD/$OUT/antes-markdown.mjs" --log-level=error --external:zod --alias:@=. )

if [ "$MODO" = "bueno" ]; then
  pack "$H/markdownBuilder.ts" "$OUT/markdown.mjs"
  pack "$H/buildSectionedPrompt.ts" "$OUT/sectioned.mjs"
  pack types/agentAi.ts "$OUT/tipos.mjs"
  pack lib/orden-de-elementos.ts "$OUT/orden.mjs"
  pack "$H/actionsBuilders.ts" "$OUT/pestanas.mjs"
  pack "$H/composePromptFromSections.ts" "$OUT/componer.mjs"
fi

echo "── Casos y transición (MODO=$MODO, antes=$ANTES_REF, fuera=$ANTES_FUERA_REF) ──"
NODE_PATH="$PWD/node_modules" node --test lib/__tests__/casos-y-transicion.test.mjs "$@"
