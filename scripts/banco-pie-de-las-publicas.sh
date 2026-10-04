#!/usr/bin/env bash
# El pie de las tres pantallas públicas —la landing principal, la página de un
# plan y la propuesta— es UNO:
#
# 1. El mismo texto en las tres: «© <año> Agente IA. Todos los derechos
#    reservados.», con el año del sistema (nunca escrito a mano). La propuesta
#    añade encima «Propuesta preparada por <negocio>, Agente IA».
# 2. Una raya antes del pie en las tres, al ancho del CONTENIDO (no de lado a
#    lado de la pantalla).
# 3. Entre el último bloque y la raya, el mismo aire que entre dos bloques de
#    esa pantalla; y debajo de la raya, lo mismo en las tres.
# 4. En la propuesta, «Servicios:» o «Productos:» va DENTRO de cada tarjeta,
#    delante de su nombre, y no como título encima de la lista.
#
# Lo puro y un barrido sin navegador, y las tres pantallas REALES en Chromium
# sobre el CSS del build a 1440, 1024 y 390. `MODO=roto` pinta las mismas
# pantallas con el código de ANTES_REF —pinchado a un commit, nunca
# `origin/main`— y AFIRMA los fallos.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-20f8e50}"
export ANTES_REF

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

# El empaquetador de las acciones mudas busca esbuild en la caché de npx.
npx esbuild --version >/dev/null

RAIZ="$PWD"
OUT=lib/__tests__/.compilado/pie-de-las-publicas
rm -rf "$OUT"
mkdir -p "$OUT"

F=lib/__tests__/fingido
ALIAS_GUIA=(
  --alias:next/link=./$F/next-link-ssr.tsx
  --alias:next/navigation=./$F/guia-tema/next-navigation.ts
  --alias:@/lib/introduccion-publica.server=./$F/guia-tema/introduccion-publica.ts
  --alias:@/lib/contacto-de-la-guia.server=./$F/guia-tema/contacto-de-la-guia.ts
  --alias:@/actions/guia-publica-actions=./$F/guia-tema/guia-publica-actions.ts
)
NAVEGADOR=(
  --bundle --format=iife --jsx=automatic
  --define:process.env.NODE_ENV=\"production\" --define:process.env='{}'
  --log-level=error
)

empaquetar() {
  # $1: el árbol del que se empaqueta (el de hoy o el de antes).
  (cd "$1" && node "$RAIZ/scripts/empaquetar-con-acciones-mudas.mjs" \
    $F/landing-entera-harness.tsx "$RAIZ/$OUT/landing.js" \
    --alias:next/link=./$F/next-link-ssr.tsx \
    --alias:next/navigation=./$F/next-navigation-mudo.ts)
  (cd "$1" && npx esbuild $F/plan-acordeon-harness.tsx "${NAVEGADOR[@]}" \
    --outfile="$RAIZ/$OUT/plan.js" "${ALIAS_GUIA[@]}")
  (cd "$1" && npx esbuild $F/propuesta-con-plan-dentro-harness.tsx "${NAVEGADOR[@]}" \
    --outfile="$RAIZ/$OUT/propuesta.js" "${ALIAS_GUIA[@]}")
}

if [ "$MODO" = "roto" ]; then
  # El código de ANTES, en un árbol aparte: sus `@/…` resuelven a SUS ficheros.
  ANTES="$RAIZ/lib/__tests__/.antes/pie-de-las-publicas"
  git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
  git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
  ln -s "$RAIZ/node_modules" "$ANTES/node_modules"
  mkdir -p "$ANTES/$F/guia-tema"
  cp $F/landing-entera-harness.tsx $F/plan-acordeon-harness.tsx \
    $F/propuesta-con-plan-dentro-harness.tsx \
    $F/next-link-ssr.tsx $F/next-navigation-mudo.ts "$ANTES/$F/"
  cp $F/guia-tema/*.ts "$ANTES/$F/guia-tema/"
  empaquetar "$ANTES"
  git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
  git worktree prune
else
  # Lo puro, compilado aparte: el banco lo importa sin navegador.
  npx esbuild lib/pie-de-las-publicas.ts --format=esm --log-level=error \
    --outfile="$OUT/pie.mjs"
  empaquetar "$RAIZ"
fi

node --test --test-concurrency=1 lib/__tests__/pie-de-las-publicas.test.mjs "$@"
