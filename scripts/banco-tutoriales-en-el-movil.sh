#!/usr/bin/env bash
# «Ver tutoriales» NO sale en el teléfono, y en escritorio no cambia nada.
#
# En un celular la barra de arriba son ocho iconos —menú, Chats y Correos,
# tutoriales, buscar, ayuda, soporte y campana— en 360 px, y no caben: el
# selector Chats ⇄ Correos acababa ENCIMA del botón rojo de tutoriales. Por
# debajo de `sm` (640 px) ese botón se esconde: «Ayuda», al lado, ya lleva a
# todas las guías.
#
# Dos mitades:
#  1. La regla y un barrido del código, sin navegador.
#  2. En Chromium, sobre el CSS del build, la `Breadcrumbs` de VERDAD —con
#     «Soporte» pintado, como la ve un cliente— a 320/360/390/412/600 (teléfono)
#     y 640/768/1024/1280/1440. En el teléfono: el botón no ocupa sitio, nada se
#     monta y la barra queda IGUAL que una pantalla sin tutoriales. Desde 640:
#     cada caja de la barra en el MISMO píxel que antes, rojo y con su palabra.
#
# `MODO=roto` monta la barra de un commit PINCHADO (`ANTES_REF`, nunca
# `origin/main`) y afirma el fallo: el botón visible en el teléfono y el
# selector encima de él.
#
# Necesita el build (`npm run build`) para el CSS.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-4af691d}"

C=lib/__tests__/.compilado/tutoriales-en-el-movil
A=lib/__tests__/.antes/tutoriales-en-el-movil
mkdir -p "$C" "$A"
npx -y esbuild lib/tutoriales-del-modulo.ts --bundle --platform=node --format=esm --outfile="$C/tutoriales-del-modulo.mjs" --log-level=warning

COMUNES=(
  --alias:next/navigation=./lib/__tests__/fingido/next-navigation-con-ruta.ts
  --alias:@/actions/guide-actions=./lib/__tests__/fingido/bandejas/guias.ts
  --alias:@/actions/notification-center-actions=./lib/__tests__/fingido/barra-de-arriba/campana.ts
  --alias:@/actions/tickets-actions=./lib/__tests__/fingido/barra-de-arriba/tickets.ts
)

# La barra de ANTES (sus imports relativos, al alias de la casa). Se construye
# en los dos modos: el bueno la usa para comprobar que en escritorio no se movió
# ni un píxel, y el roto para afirmar el fallo.
git show "$ANTES_REF:components/custom/Breadcrumbs.tsx" \
  | sed "s#from '\.\./ui/#from '@/components/ui/#; s#from '\./ThemeSwitcher'#from '@/components/custom/ThemeSwitcher'#" > "$A/Breadcrumbs.tsx"
node scripts/empaquetar-con-acciones-mudas.mjs \
  lib/__tests__/fingido/barra-de-arriba/entrada.tsx "$C/antes.js" \
  "${COMUNES[@]}" \
  "--alias:@/components/custom/Breadcrumbs=./$A/Breadcrumbs.tsx"
node scripts/empaquetar-con-acciones-mudas.mjs \
  lib/__tests__/fingido/barra-de-arriba/entrada.tsx "$C/hoy.js" \
  "${COMUNES[@]}"

node --test lib/__tests__/tutoriales-en-el-movil.test.mjs
