#!/usr/bin/env bash
# La ventana «Tutoriales del módulo» (el botón «Ver tutoriales» de la barra).
#
# Dos mitades:
#  1. Sin navegador: toda guía de app/guia/<modulo> tiene su tarjeta registrada
#     en lib/tutoriales-del-modulo.ts (así publicar una guía registra su
#     tarjeta, sin paso manual), se juntan sin repetir con las de la base, y el
#     botón es «Ver tutorial» en el azul de crear, estilo secundario.
#  2. En Chromium, sobre el CSS del build, la `Breadcrumbs` de VERDAD con la
#     ventana abierta y tres tarjetas (YouTube, una guía, una sin descripción) a
#     1440/1024/390: título, descripción y el botón al final, todas iguales.
#
# `MODO=roto` lee y monta la barra de ANTES_REF (pinchado a un commit, nunca
# `origin/main`) y afirma el fallo: el botón rojo «Ver en YouTube»; y lee
# ANTES_DESCRIPCION_REF para afirmar la descripción de antes (el subtítulo de
# la guía, y el «Recorrido completo…» genérico de las semillas).
#
# Y la regla de la descripción de una tarjeta: «Aprende a … en la plataforma»,
# 75 caracteres como mucho, medida en Chromium con Poppins: cabe en una línea.
#
# Necesita el build (`npm run build`) para el CSS.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-7bdc404}"
export ANTES_REF

C=lib/__tests__/.compilado/tutoriales
A=lib/__tests__/.antes/tutoriales
mkdir -p "$C" "$A"
trap 'rm -rf "$A"' EXIT
npx -y esbuild lib/tutoriales-del-modulo.ts --bundle --platform=node --format=esm --outfile="$C/tutoriales-del-modulo.mjs" --log-level=warning
npx -y esbuild lib/navigation-routes.ts --format=esm --outfile="$C/navigation-routes.mjs" --log-level=warning

COMUNES=(
  --alias:next/navigation=./lib/__tests__/fingido/next-navigation-con-ruta.ts
  --alias:@/actions/guide-actions=./lib/__tests__/fingido/tutoriales/guias.ts
  --alias:@/actions/notification-center-actions=./lib/__tests__/fingido/barra-de-arriba/campana.ts
)
if [ "$MODO" = "roto" ]; then
  git show "$ANTES_REF:components/custom/Breadcrumbs.tsx" \
    | sed "s#from '\.\./ui/#from '@/components/ui/#; s#from '\./ThemeSwitcher'#from '@/components/custom/ThemeSwitcher'#" > "$A/Breadcrumbs.tsx"
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/fingido/barra-de-arriba/entrada.tsx "$C/antes.js" \
    "${COMUNES[@]}" "--alias:@/components/custom/Breadcrumbs=./$A/Breadcrumbs.tsx"
else
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/fingido/barra-de-arriba/entrada.tsx "$C/hoy.js" "${COMUNES[@]}"
fi

node --test lib/__tests__/tutoriales-del-modulo.test.mjs lib/__tests__/tutoriales-del-modulo-navegador.test.mjs
