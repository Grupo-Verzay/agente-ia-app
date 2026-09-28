#!/usr/bin/env bash
# La barra de arriba de la plataforma: la casita siempre primera y en el mismo
# píxel, sin ruta de texto, el selector Chats ⇄ Correos en todas las pantallas
# y centrado en la columna de la lista, y todos los botones con la misma forma
# (rectángulo de esquinas redondeadas).
#
# Dos mitades:
#  1. La regla del selector (`lib/alternar-bandejas.ts`), sin navegador: está en
#     `banco-bandejas-simetricas.sh` y en el caso puro de abajo.
#  2. En Chromium, sobre el CSS del build, la `Breadcrumbs` de VERDAD en /chats,
#     /correo, /sessions y /schedule a 1440/1280/1024/390, con y sin tutoriales.
#
# Y los tres de la izquierda van SIMÉTRICOS: casita → menú → selector con el
# mismo hueco, y el selector mide lo que Soporte (h-9).
#
# `MODO=roto` monta la barra de un commit PINCHADO (`ANTES_REF`, nunca
# `origin/main`) y afirma los fallos: huecos dispares y el selector más bajo.
#
# Necesita el build (`npm run build`) para el CSS.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-51664e1}"

C=lib/__tests__/.compilado/barra-de-arriba
A=lib/__tests__/.antes/barra-de-arriba
mkdir -p "$C" "$A"
npx -y esbuild lib/alternar-bandejas.ts --format=esm --outfile="$C/alternar-bandejas.mjs" --log-level=warning

COMUNES=(
  --alias:next/navigation=./lib/__tests__/fingido/next-navigation-con-ruta.ts
  --alias:@/actions/guide-actions=./lib/__tests__/fingido/bandejas/guias.ts
  --alias:@/actions/notification-center-actions=./lib/__tests__/fingido/barra-de-arriba/campana.ts
)
if [ "$MODO" = "roto" ]; then
  git show "$ANTES_REF:components/custom/Breadcrumbs.tsx" \
    | sed "s#from '\.\./ui/#from '@/components/ui/#; s#from '\./ThemeSwitcher'#from '@/components/custom/ThemeSwitcher'#; s#from \"@/components/shared/AlternarBandeja\"#from \"@/lib/__tests__/.antes/barra-de-arriba/AlternarBandeja\"#" > "$A/Breadcrumbs.tsx"
  git show "$ANTES_REF:components/shared/AlternarBandeja.tsx" \
    | sed 's#from "@/lib/alternar-bandejas"#from "@/lib/__tests__/.antes/barra-de-arriba/alternar-bandejas"#' > "$A/AlternarBandeja.tsx"
  git show "$ANTES_REF:lib/alternar-bandejas.ts" > "$A/alternar-bandejas.ts"
  git show "$ANTES_REF:components/shared/NotificationCenter.tsx" > "$A/NotificationCenter.tsx"
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/fingido/barra-de-arriba/entrada.tsx "$C/antes.js" \
    "${COMUNES[@]}" \
    "--alias:@/components/custom/Breadcrumbs=./$A/Breadcrumbs.tsx" \
    "--alias:@/components/shared/NotificationCenter=./$A/NotificationCenter.tsx"
else
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/fingido/barra-de-arriba/entrada.tsx "$C/hoy.js" \
    "${COMUNES[@]}"
fi

node --test lib/__tests__/barra-de-arriba.test.mjs lib/__tests__/barra-de-arriba-navegador.test.mjs
