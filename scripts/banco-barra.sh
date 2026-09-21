#!/usr/bin/env bash
# El banco de la barra de escribir compartida.
#
# Dos mitades, y hacen falta las dos:
#
#   1. **La decisión**, sin navegador y en los dos modos. El modo roto es la
#      barra del chat de equipo tal como estaba —plegada siempre y sin pegar
#      del portapapeles— y **afirma el fallo**: sin eso, lo verde del modo
#      normal no probaría que se arregló la causa.
#   2. **Las dos barras de verdad**, en Chromium y sobre la página servida:
#      eso lo hace `scripts/probar-barra.mjs`, que necesita el build y una
#      base de usar y tirar (ver el encabezado de ese fichero).
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"

npx tsc lib/barra-de-escribir.ts --outDir lib/__tests__/.compilado/barra \
  --module es2022 --target es2022 --lib es2022,dom \
  --moduleResolution bundler --skipLibCheck

echo "── la decisión, con la barra UNIFICADA ──"
node --test lib/__tests__/barra-de-escribir.test.mjs

echo
echo "── la decisión, con la del chat de equipo de ANTES (afirma el fallo) ──"
MODO=roto node --test lib/__tests__/barra-de-escribir.test.mjs
