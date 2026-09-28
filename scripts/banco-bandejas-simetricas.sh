#!/usr/bin/env bash
# Chats y Correos, simétricas: el panel de «nada abierto» y la barrita de arriba
# que alterna entre las dos.
#
# Dos mitades:
#  1. La regla de la barrita (`lib/alternar-bandejas.ts`) y un barrido del
#     código, sin navegador.
#  2. En Chromium, sobre el CSS del build: el panel de Chats de HOY contra el de
#     ANTES (sacado de git), el de Correo —con su componente de verdad— contra
#     el de Chats, las tarjetas que filtran, y la barra de arriba de verdad en
#     /chats y /correo a 1440/1280/1024/390.
#
# `MODO=roto` empaqueta Correo y la barra de un commit PINCHADO (`ANTES_REF`,
# nunca `origin/main`) y afirma el fallo: «Elige un correo para leerlo» sin
# icono ni tarjetas, y ninguna barrita arriba.
#
# Necesita el build (`npm run build`) para el CSS.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-9a5656b}"

npx -y esbuild --version >/dev/null
mkdir -p lib/__tests__/.compilado/bandejas lib/__tests__/.antes/bandejas
ANTES=lib/__tests__/.antes/bandejas
git show "$ANTES_REF:app/(root)/chats/_components/chats-client.tsx" \
  | python3 scripts/sacar-panel-de-chats-de-antes.py > "$ANTES/PanelDeChatsDeAntes.tsx"

npx -y esbuild lib/alternar-bandejas.ts --format=esm --outfile=lib/__tests__/.compilado/bandejas/alternar-bandejas.mjs --log-level=warning

COMUNES=(
  --alias:next/navigation=./lib/__tests__/fingido/next-navigation-con-ruta.ts
  --alias:@/actions/guide-actions=./lib/__tests__/fingido/bandejas/guias.ts
  --alias:@/actions/correo-actions=./lib/__tests__/fingido/correo/acciones-de-la-pantalla.ts
)
if [ "$MODO" = "roto" ]; then
  git show "$ANTES_REF:app/(root)/correo/_components/CorreoClient.tsx" \
    | sed 's#from "\./#from "@/app/(root)/correo/_components/#' > "$ANTES/CorreoClient.tsx"
  git show "$ANTES_REF:components/custom/Breadcrumbs.tsx" \
    | sed "s#from '\.\./ui/#from '@/components/ui/#; s#from '\./ThemeSwitcher'#from '@/components/custom/ThemeSwitcher'#" > "$ANTES/Breadcrumbs.tsx"
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/fingido/bandejas/entrada.tsx lib/__tests__/.compilado/bandejas/antes.js \
    "${COMUNES[@]}" \
    "--alias:@/app/(root)/correo/_components/CorreoClient=./$ANTES/CorreoClient.tsx" \
    "--alias:@/components/custom/Breadcrumbs=./$ANTES/Breadcrumbs.tsx"
else
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/fingido/bandejas/entrada.tsx lib/__tests__/.compilado/bandejas/hoy.js \
    "${COMUNES[@]}"
fi

node --test lib/__tests__/bandejas-simetricas.test.mjs lib/__tests__/bandejas-simetricas-navegador.test.mjs
