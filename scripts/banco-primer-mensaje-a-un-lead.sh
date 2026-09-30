#!/usr/bin/env bash
# El banco del «primer mensaje a un lead recién guardado en el CRM».
#
# Un Waha de mentira que se comporta como el de producción —con un chatId que
# no es solo dígitos NO contesta— y la cadena de verdad: la ficha como la
# guardaba «Crear contacto» (`+50760270754@s.whatsapp.net`) → `canonicalToWahaJid`
# → `sendWahaText`. Más las reglas puras y un barrido de las dos pantallas.
#
# `MODO=roto` empaqueta la MISMA prueba con `lib/` de ANTES_REF (pinchado a un
# commit, nunca origin/main) y AFIRMA el fallo: el envío se cuelga 15 s y dice
# «el servidor no contestó a tiempo».
set -euo pipefail
cd "$(dirname "$0")/.."

export ANTES_REF="${ANTES_REF:-c7fbb82}"
OUT=lib/__tests__/.compilado/primer-mensaje
rm -rf "$OUT"; mkdir -p "$OUT/antes"

empaquetar() { # raíz, entrada, salida
  npx esbuild "$2" --bundle --platform=node --format=esm --outfile="$3" \
    --alias:@/lib/db="$(pwd)/lib/__tests__/fingido/db-de-waha.ts" --log-level=error \
    --tsconfig="$1/tsconfig.json"
}

empaquetar . lib/__tests__/fingido/entrada-primer-mensaje.ts "$OUT/entrada-primer-mensaje.js"
empaquetar . lib/__tests__/fingido/entrada-primer-mensaje-reglas.ts "$OUT/entrada-primer-mensaje-reglas.js"

ANTES=$(mktemp -d)
trap 'git worktree remove --force "$ANTES" >/dev/null 2>&1 || true' EXIT
git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
cp lib/__tests__/fingido/entrada-primer-mensaje.ts "$ANTES/entrada.ts"
empaquetar "$ANTES" "$ANTES/entrada.ts" "$OUT/antes/entrada-primer-mensaje.js"

node --test lib/__tests__/primer-mensaje-a-un-lead.test.mjs "$@"

echo
echo "── con el código de ANTES ($ANTES_REF): tiene que afirmar el fallo ──"
MODO=roto node --test lib/__tests__/primer-mensaje-a-un-lead.test.mjs
