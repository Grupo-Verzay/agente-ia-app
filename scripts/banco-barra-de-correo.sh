#!/usr/bin/env bash
# La barra de arriba de CORREO es la de CHATS, pieza por pieza.
#
# Pinta las dos cabeceras en Chromium sobre el CSS del build y las compara
# entre sí (`lib/__tests__/barra-de-correo.test.mjs`).
#
# `MODO=roto` pinta la barra de Correo de un commit PINCHADO (`ANTES_REF`,
# nunca `origin/main`, que pasa a ser el «después» en cuanto esto se fusiona) y
# afirma el fallo: la barra fuera de la columna, el buscador estirado y el
# filtro metido dentro de él con otro tamaño.
#
# Necesita el build (`npm run build`) para el CSS.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-50a1213}"

npx -y esbuild --version >/dev/null
mkdir -p lib/__tests__/.compilado/correo
if [ "$MODO" = "roto" ]; then
  ANTES=lib/__tests__/.antes/barra-de-correo
  rm -rf "$ANTES" && mkdir -p "$ANTES"
  # El CorreoClient de ANTES, con sus vecinos resueltos a los de hoy (esos no
  # son parte de la barra): así lo único que cambia entre los modos es la barra.
  git show "$ANTES_REF:app/(root)/correo/_components/CorreoClient.tsx" \
    | sed 's#from "\./#from "@/app/(root)/correo/_components/#' > "$ANTES/CorreoClient.tsx"
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/fingido/correo/entrada-pantalla.tsx lib/__tests__/.compilado/correo/barra-antes.js \
    --alias:@/actions/correo-actions=./lib/__tests__/fingido/correo/acciones-de-la-pantalla.ts \
    "--alias:@/app/(root)/correo/_components/CorreoClient=./$ANTES/CorreoClient.tsx"
else
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/fingido/correo/entrada-pantalla.tsx lib/__tests__/.compilado/correo/pantalla.js \
    --alias:@/actions/correo-actions=./lib/__tests__/fingido/correo/acciones-de-la-pantalla.ts
fi

node --test lib/__tests__/barra-de-correo.test.mjs
