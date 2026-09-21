#!/usr/bin/env bash
# El banco de la caja de escribir de Chats.
#
# Dos mitades, y hacen falta las dos:
#
#   1. **La decisión**, sin navegador, en los dos modos —con la fórmula vieja
#      y con la nueva—. Lo puro se prueba puro.
#   2. **La caja de verdad**, en Chromium y sobre el CSS del build, con las
#      clases leídas del componente y pasadas por el mismo `tailwind-merge` que
#      usa `cn`: copiadas a mano se estaría midiendo una caja que React no
#      pinta.
#
# Uso:  scripts/banco-caja.sh            (las dos mitades)
#       scripts/banco-caja.sh --solo-puro
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
# Playwright va instalado en el sistema, no en el proyecto.
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"

npx tsc lib/alto-de-la-caja-de-escribir.ts --outDir lib/__tests__/.compilado \
  --module es2022 --target es2022 --lib es2022,dom \
  --moduleResolution bundler --skipLibCheck

# El hueco de la derecha de la caja sale de la lista de botones, que es
# compartida con la barra del chat de equipo: la medida la importa en vez de
# copiarla, así que hay que compilarla también.
npx tsc lib/barra-de-escribir.ts --outDir lib/__tests__/.compilado/barra \
  --module es2022 --target es2022 --lib es2022,dom \
  --moduleResolution bundler --skipLibCheck

echo "── la decisión, con la fórmula NUEVA ──"
node --test lib/__tests__/alto-de-la-caja-de-escribir.test.mjs

echo
echo "── la decisión, con la fórmula VIEJA (tiene que afirmar el fallo) ──"
MODO=roto node --test lib/__tests__/alto-de-la-caja-de-escribir.test.mjs

if [ "${1:-}" = "--solo-puro" ]; then exit 0; fi

if [ ! -d .next/static/css ]; then
  echo
  echo "No hay CSS del build: para la medida en Chromium hace falta 'npx next build'." >&2
  exit 1
fi

echo
echo "── la caja de verdad, en Chromium ──"
node scripts/medir-caja-de-escribir.mjs
