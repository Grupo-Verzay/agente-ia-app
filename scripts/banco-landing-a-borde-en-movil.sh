#!/usr/bin/env bash
# Las páginas públicas en el TELÉFONO: la landing principal, las dos de
# resellers, la página de un plan y la propuesta llenan el ancho de la pantalla.
#
# El contenedor de todas (`ANCHO_DE_LA_LANDING`) dejaba 32 px en blanco a cada
# lado en el móvil; en la bandeja de Chats, dentro de la App, el contenido llena
# el ancho. Ahora, por debajo de 640 px:
#
# 1. los bloques y las tarjetas llegan de borde a borde, sin esquinas ni raya
#    lateral que la pantalla corte;
# 2. ningún texto, mando o icono queda a menos de 12 px del borde, y la página
#    no se desplaza hacia los lados;
# 3. una tarjeta DENTRO de otra (el plan dentro de un servicio de la propuesta)
#    se queda con su aire;
# 4. desde 640 px (tableta y computador) NADA cambia: cada texto y cada caja, en
#    el mismo sitio y del mismo tamaño que con el código de ANTES_REF.
#
# Pinta las pantallas REALES en Chromium, sobre el CSS del build si existe
# (`npm run build`) y, si no, sobre el que Tailwind saca del código: las mismas
# clases. `MODO=roto` pinta las mismas pantallas con el código de ANTES_REF
# —pinchado a un commit, nunca `origin/main`— y AFIRMA el fallo: 32 px de margen
# a cada lado y ni un bloque que llegue al borde.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-fb40429}"
export ANTES_REF

# El empaquetador de las acciones mudas busca esbuild en la caché de npx.
npx esbuild --version >/dev/null

RAIZ="$PWD"
OUT=lib/__tests__/.compilado/landing-a-borde
rm -rf "$OUT"
mkdir -p "$OUT"

# El CSS: el del build, y si no hay build, el que Tailwind saca del código.
if ls .next/static/css/*.css >/dev/null 2>&1; then
  cat .next/static/css/*.css > "$OUT/estilos.css"
else
  npx tailwindcss -i app/globals.css -o "$OUT/estilos.css" >/dev/null 2>&1
fi
export CSS_FILE="$RAIZ/$OUT/estilos.css"

F=lib/__tests__/fingido
ALIAS=(
  --alias:next/link=./$F/next-link-ssr.tsx
  --alias:next/navigation=./$F/next-navigation-mudo.ts
  --alias:@/lib/introduccion-publica.server=./$F/guia-tema/introduccion-publica.ts
  --alias:@/lib/contacto-de-la-guia.server=./$F/guia-tema/contacto-de-la-guia.ts
  --alias:@/actions/guia-publica-actions=./$F/guia-tema/guia-publica-actions.ts
  --alias:@/actions/subscription-plan-actions=./$F/acciones-de-planes-de-la-landing.ts
  --alias:@/components/custom/AnimatedChat=./$F/animated-chat-quieto.tsx
)

empaquetar() {
  # $1: el árbol del que se empaqueta (el de hoy o el de antes); $2: la salida.
  (cd "$1" && node "$RAIZ/scripts/empaquetar-con-acciones-mudas.mjs" \
    $F/landings-a-borde-harness.tsx "$2" "${ALIAS[@]}")
}

empaquetar "$RAIZ" "$RAIZ/$OUT/ahora.js"

# El código de ANTES, en un árbol aparte: sus `@/…` resuelven a SUS ficheros.
ANTES="$RAIZ/lib/__tests__/.antes/landing-a-borde"
git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
ln -s "$RAIZ/node_modules" "$ANTES/node_modules"
mkdir -p "$ANTES/$F/guia-tema"
cp $F/landings-a-borde-harness.tsx $F/acciones-de-planes-de-la-landing.ts $F/animated-chat-quieto.tsx \
  $F/next-link-ssr.tsx $F/next-navigation-mudo.ts "$ANTES/$F/"
cp $F/guia-tema/*.ts "$ANTES/$F/guia-tema/"
empaquetar "$ANTES" "$RAIZ/$OUT/antes.js"
git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
git worktree prune

node --test --test-concurrency=1 lib/__tests__/landing-a-borde-en-movil.test.mjs "$@"
