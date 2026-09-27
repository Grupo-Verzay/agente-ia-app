#!/usr/bin/env bash
# El banco del botón "Conectar Gmail": que esté ENCENDIDO de verdad.
#
#   1. El código, siempre: la vuelta de producción es la registrada, el botón
#      depende de las dos variables, la plantilla las nombra vacías y el repo
#      no lleva ningún secreto de Google.
#   2. Google, si hay GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET en el
#      entorno: acepta esa vuelta y ese secreto.
#   3. Producción, si hay PORTAINER_URL y PORTAINER_TOKEN: el servicio y sus
#      contenedores vivos llevan las dos llaves y están sanos.
#
# Las credenciales se pasan por el ENTORNO al correrlo, nunca en este fichero:
#   GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... scripts/banco-gmail-oauth.sh
#
# `MODO=roto` afirma que la mitad de Google discrimina: una vuelta con una
# barra de más y un secreto equivocado tienen que ser rechazados.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/node22/bin:$PATH"
export MODO="${MODO:-bueno}"

mkdir -p lib/__tests__/.compilado/correo-puro
npx esbuild lib/correo.ts --bundle --platform=node --format=esm \
  --outdir=lib/__tests__/.compilado/correo-puro --log-level=error

node --test --test-reporter=spec lib/__tests__/gmail-oauth.test.mjs
