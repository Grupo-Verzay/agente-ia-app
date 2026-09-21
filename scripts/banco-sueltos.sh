#!/usr/bin/env bash
# El banco de la zona de «sin carpeta» del árbol de Documentos.
#
# Monta el componente REAL (`EspaciosSueltos`) con react-test-renderer y
# comprueba que la pista «arrastra aquí para sacar un espacio» solo se ve
# mientras se arrastra, y que el resto de casos no cambia.
set -euo pipefail
cd /home/user/agente-ia-app

export PATH="/opt/node22/bin:$PATH"

npx esbuild components/documentacion/EspaciosSueltos.tsx --bundle \
  --platform=node --format=esm --jsx=automatic \
  --main-fields=module,main --conditions=module,import \
  --external:react --external:react-dom --external:react/jsx-runtime \
  --outfile=lib/__tests__/.compilado/sueltos/sueltos.mjs --log-level=error

node --test lib/__tests__/sueltos-render.test.mjs "$@"
