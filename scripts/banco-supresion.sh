#!/usr/bin/env bash
# El banco de la supresión de ruido del micrófono.
#
# Es puro —sin navegador ni base—: prueba la preferencia que se recuerda, la
# restricción que se le pasa al micrófono y la decisión de si `applyConstraints`
# prendió. El procesado en sí lo hace el navegador.
set -euo pipefail
cd /home/user/agente-ia-app

export PATH="/opt/node22/bin:$PATH"

npx esbuild lib/supresion-de-ruido.ts --bundle \
  --platform=node --format=esm \
  --outfile=lib/__tests__/.compilado/supresion/supresion.mjs --log-level=error

node --test lib/__tests__/supresion-de-ruido.test.mjs "$@"
