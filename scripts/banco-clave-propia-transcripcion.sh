#!/usr/bin/env bash
# El banco de «con mi propia API key no transcribe: el servicio no respondió».
#
# Se empaqueta la lógica de transcripción de verdad con la base, el registro
# de llaves y OpenAI fingidos (lib/__tests__/fingido/clave-propia/): OpenAI
# contesta según la clave que le llega, igual que el de verdad.
#
#   MODO=roto scripts/banco-clave-propia-transcripcion.sh   <- afirma el fallo de 7c1db1f
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/node22/bin:$PATH"

ANTES_REF="${ANTES_REF:-7c1db1f}"
SALIDA=lib/__tests__/.compilado/clave-propia
rm -rf "$SALIDA"; mkdir -p "$SALIDA"
F=lib/__tests__/fingido

RAIZ=.
if [ "${MODO:-}" = "roto" ]; then
  RAIZ=$(mktemp -d)
  git worktree add --detach "$RAIZ" "$ANTES_REF" >/dev/null 2>&1
  trap 'git worktree remove --force "$RAIZ" >/dev/null 2>&1 || true' EXIT
  cp $F/clave-propia/entrada.ts "$RAIZ/entrada-del-banco.ts"
  ENTRADA="$RAIZ/entrada-del-banco.ts"
else
  ENTRADA=$F/clave-propia/entrada.ts
fi

ABS() { (cd "$(dirname "$1")" && echo "$PWD/$(basename "$1")"); }
npx esbuild "$ENTRADA" --bundle --platform=node --format=esm \
  --outfile="$SALIDA/entrada.js" --log-level=error \
  --alias:server-only="$(ABS $F/server-only-vacio.ts)" \
  --alias:@/lib/db="$(ABS $F/clave-propia/db.ts)" \
  --alias:@/lib/llaves-de-verzay="$(ABS $F/clave-propia/llaves.ts)" \
  --alias:openai="$(ABS $F/clave-propia/openai.ts)" \
  --alias:@="$(cd "$RAIZ" && pwd)"
npx esbuild lib/ai-key-validation.ts --bundle --platform=node --format=esm \
  --outfile="$SALIDA/validacion.js" --log-level=error

node --test lib/__tests__/clave-propia-transcripcion.test.mjs "$@"
