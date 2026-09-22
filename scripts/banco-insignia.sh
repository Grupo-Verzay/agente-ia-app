#!/usr/bin/env bash
# El banco del numero sobre el favicon, en un navegador de verdad.
#
# Decodifica el PNG que acaba en el `<link rel="icon">` del documento: un
# `data:` distinto no prueba nada, lo que prueba que la insignia esta es que
# aparezca rojo donde antes no habia y en su esquina.
#
# Y monta una App con el MISMO React que Next pinta en produccion para navegar
# con la insignia puesta: es lo que reventaba con «Cannot read properties of
# null (reading 'removeChild')» y dejaba /panel pegado en la misma pestaña.
#
# Tres modos:
#   (normal)    el codigo de hoy.
#   MODO=viejo  el <link> al final, sin apartar a los demas (antes del #838).
#   MODO=roto   el #838 tal cual: aparta SACANDO los <link> del <head>. Sale de
#               git en un commit PINCHADO, nunca de origin/main: en cuanto esto
#               se fusiona, origin/main pasa a ser el "ahora".
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
# Playwright va instalado en el sistema, no en el proyecto.
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"

ANTES_REF="${ANTES_REF:-5e03716}"
C=lib/__tests__/.compilado
mkdir -p "$C/antes"

npx tsc lib/insignia-del-favicon.ts --outDir "$C" \
  --module es2022 --target es2022 --lib es2022,dom \
  --moduleResolution bundler --skipLibCheck

git show "$ANTES_REF:lib/insignia-del-favicon.ts" > "$C/antes/insignia-del-favicon.ts"
npx tsc "$C/antes/insignia-del-favicon.ts" --outDir "$C/antes" \
  --module es2022 --target es2022 --lib es2022,dom \
  --moduleResolution bundler --skipLibCheck

# El React de Next, no el de package.json: el `unmountHoistable` que revienta
# solo existe en el canario que Next lleva dentro.
npx --yes esbuild lib/__tests__/fingido/app-de-iconos.tsx --bundle \
  --format=iife --jsx=automatic --define:process.env.NODE_ENV='"production"' \
  --alias:react=./node_modules/next/dist/compiled/react \
  --alias:react-dom=./node_modules/next/dist/compiled/react-dom \
  --outfile="$C/app-de-iconos.js" --log-level=warning

echo "=== MODO NUEVO ==="
node --test lib/__tests__/insignia-en-el-documento.test.mjs
echo
echo "=== MODO VIEJO (el <link> al final, sin apartar a los demas) ==="
MODO=viejo node --test lib/__tests__/insignia-en-el-documento.test.mjs
echo
echo "=== MODO ROTO (apartar SACANDO los <link> del <head>, el #838) ==="
MODO=roto node --test lib/__tests__/insignia-en-el-documento.test.mjs
