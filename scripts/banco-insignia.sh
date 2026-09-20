#!/usr/bin/env bash
# El banco del numero sobre el favicon, en un navegador de verdad.
#
# Decodifica el PNG que acaba en el `<link rel="icon">` del documento: un
# `data:` distinto no prueba nada, lo que prueba que la insignia esta es que
# aparezca rojo donde antes no habia y en su esquina.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
# Playwright va instalado en el sistema, no en el proyecto.
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"

npx tsc lib/insignia-del-favicon.ts --outDir lib/__tests__/.compilado \
  --module es2022 --target es2022 --lib es2022,dom \
  --moduleResolution bundler --skipLibCheck

echo "=== MODO NUEVO ==="
node --test lib/__tests__/insignia-en-el-documento.test.mjs
echo
echo "=== MODO VIEJO (el <link> al final, sin apartar a los demas) ==="
MODO=viejo node --test lib/__tests__/insignia-en-el-documento.test.mjs
