#!/usr/bin/env bash
# La puerta del administrador de Evolution (/evo y Panel › Evo): se decide con la
# SESIÓN —el rol de la cuenta que manda y el propio de verdad—, igual en las dos
# pantallas y en sus acciones. Nunca con `user.role` de la persona.
#
# Uso:  scripts/banco-puerta-de-evolution.sh
#       MODO=roto scripts/banco-puerta-de-evolution.sh   (afirma el fallo en ANTES_REF)
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/node22/bin:$PATH"

echo "== se compila la decisión =="
npx esbuild lib/puerta-de-evolution.ts --bundle --format=esm --platform=node \
  --outfile=lib/__tests__/.compilado/puerta-de-evolution.js --log-level=warning

echo "== modo bueno =="
node --test lib/__tests__/puerta-de-evolution.test.mjs
echo "== modo roto (afirma el fallo) =="
MODO=roto node --test lib/__tests__/puerta-de-evolution.test.mjs
echo "TODO EN VERDE"
