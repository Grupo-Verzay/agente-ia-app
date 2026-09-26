#!/usr/bin/env bash
# El RENGLÓN de pastillas de la fila de la lista de Chats.
#
# Los tres fallos del 2026-09-26, con sus números:
#   - el tope era `MAX_BADGES = 6`, un número escrito a mano, y se equivocaba
#     por los DOS lados: escondía pastillas con sitio de sobra y dejaba que la
#     fila se partiera en dos líneas igual —medido, 360,8 px en una columna de
#     348 CON el tope aplicado—;
#   - las cinco contadoras medían cinco anchos distintos (24 / 31,7 / 32,1 /
#     34 / 34,9) con tres anatomías, y la de etiquetas era de las más estrechas;
#   - «Asignar» llevaba un icono de persona delante de la palabra.
#
# Dos mitades, y cada una contesta lo que la otra no puede:
#   1. La DECISIÓN, sin navegador: cuántas caben con medidas de verdad, qué
#      pasa sin medidas y que el renglón no puede envolver.
#   2. La fila REAL (`ChatContactItem`) en Chromium sobre el CSS del build (o
#      `CSS_DEL_BANCO`), dentro de `.app-module-content` —donde un `.text-xs`
#      vale 14 y no 12—, a 1440/1280/1024/390 y con seis filas. Que la decisión
#      sea correcta no prueba que la fila la use: eso solo se ve midiendo.
#
# `MODO=roto` empaqueta la MISMA maqueta contra los componentes de `ANTES_REF`
# —un `git worktree` aparte— y AFIRMA los tres fallos. El «antes» va PINCHADO a
# un commit y nunca a `origin/main`: en cuanto esto se fusione, `origin/main`
# sería el «ahora» y el modo roto pasaría sin reproducir nada, que es la peor
# forma de tener un banco.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
# 3b1b3ea — antes de esto: el tope de 6, el renglón con `flex-wrap`, las cinco
#           contadoras con tres anatomías y «Asignar» con su icono.
ANTES_REF="${ANTES_REF:-3b1b3ea}"

RAIZ="$(pwd)"
OUT="$RAIZ/lib/__tests__/.compilado/renglon-de-pastillas.js"
mkdir -p "$(dirname "$OUT")"

ARBOL=""
limpiar() {
  if [ -n "$ARBOL" ]; then git worktree remove --force "$ARBOL" >/dev/null 2>&1 || true; fi
}
trap limpiar EXIT

# ── 1. La decisión, sin navegador ────────────────────────────────────────
# La función pura SIEMPRE se compila del árbol de ahora: en el «antes» no
# existía, así que no hay un «antes» suyo que afirmar. Lo que el modo roto lee
# del otro árbol son los COMPONENTES. Y en su propia carpeta: el paquete del
# arnés se llama igual, y el segundo pisaría al primero.
npx esbuild lib/renglon-de-pastillas.ts --bundle --platform=node --format=esm \
  --outdir=lib/__tests__/.compilado/reglas --log-level=error
node --test lib/__tests__/renglon-de-pastillas-reglas.test.mjs

# ── 2. La fila de verdad, en Chromium ────────────────────────────────────
# El modo roto no pasa por aquí: su CSS sale del propio árbol del «antes».
if [ "$MODO" != "roto" ] && [ ! -d ".next/static/css" ] && [ -z "${CSS_DEL_BANCO:-}" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes, o pasa CSS_DEL_BANCO" >&2
  exit 1
fi

if [ "$MODO" = "roto" ]; then
  ARBOL="$(mktemp -d)/antes"
  git worktree add --detach "$ARBOL" "$ANTES_REF" >/dev/null
  ln -s "$RAIZ/node_modules" "$ARBOL/node_modules"
  # La maqueta es la de HOY —es lo que hace comparables las dos medidas—; lo que
  # se saca del otro árbol son los COMPONENTES.
  mkdir -p "$ARBOL/lib/__tests__/renglon-de-pastillas"
  cp lib/__tests__/renglon-de-pastillas/entrada.tsx "$ARBOL/lib/__tests__/renglon-de-pastillas/"
  (cd "$ARBOL" && node "$RAIZ/scripts/empaquetar-con-acciones-mudas.mjs" \
      lib/__tests__/renglon-de-pastillas/entrada.tsx "$OUT")
  # El CSS del «antes» sale de SU código: con el de ahora, las clases que aquel
  # no tenía —`min-w-9`, el `flex-nowrap` del renglón— existirían igual y se
  # estaría midiendo otra cosa.
  (cd "$ARBOL" && npx tailwindcss -i app/globals.css -o "$ARBOL/antes.css" >/dev/null 2>&1)
  CSS_DEL_BANCO="$ARBOL/antes.css" node --test lib/__tests__/renglon-de-pastillas.test.mjs "$@"
else
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/renglon-de-pastillas/entrada.tsx "$OUT"
  node --test lib/__tests__/renglon-de-pastillas.test.mjs "$@"
fi
