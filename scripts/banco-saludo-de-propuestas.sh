#!/usr/bin/env bash
# Banco del SALUDO DE ENVÍO por WhatsApp de las propuestas (Panel › Propuestas › Configuración).
# MODO=roto lee ANTES_REF (pinchado, nunca origin/main) y afirma que no existía.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/node22/bin:$PATH"
export ANTES_REF="${ANTES_REF:-62386d4}"
if [ "${MODO:-bueno}" != "roto" ]; then
  mkdir -p lib/__tests__/.compilado/saludo
  npx esbuild lib/propuestas.ts --bundle --platform=node --format=esm --outdir=lib/__tests__/.compilado/saludo --log-level=error
fi
node --test lib/__tests__/saludo-de-propuestas.test.mjs
