#!/usr/bin/env bash
# La SIMETRÍA de la fila de la lista de Chats: el orden de las pastillas, la de
# etiquetas y el círculo del asesor.
#
# Los tres fallos del 2026-09-26, con sus números:
#   - la etapa del embudo iba DETRÁS de la calificación, al revés que el menú;
#   - la pastilla de etiquetas caía dentro del «+N», así que con dos etiquetas
#     la fila enseñaba «+1» en una caja de 18 × 24 casi blanca;
#   - el círculo del asesor salía de 20,9 × 24, o sea un óvalo de pie.
#
# Se mide con `ChatContactItem` REAL sobre el CSS del build (o `CSS_DEL_BANCO`),
# dentro de `.app-module-content` —donde un `.text-xs` vale 14 y no 12—, a
# 1440/1280/1024 y con cinco filas: el caso normal, el tope justo de seis
# pastillas, una que desborda, una con UNA etiqueta y otra sin nada.
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
# ANTES_DE_LA_SIMETRIA — la fila con la calificación delante de la etapa, las
# etiquetas cayendo en el «+N» y el asesor sin ancho.
ANTES_REF="${ANTES_REF:-b69b28a}"

RAIZ="$(pwd)"
OUT="$RAIZ/lib/__tests__/.compilado/simetria-de-la-fila.js"
mkdir -p "$(dirname "$OUT")"

ARBOL=""
limpiar() {
  if [ -n "$ARBOL" ]; then git worktree remove --force "$ARBOL" >/dev/null 2>&1 || true; fi
}
trap limpiar EXIT

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
  mkdir -p "$ARBOL/lib/__tests__/simetria-de-la-fila"
  cp lib/__tests__/simetria-de-la-fila/entrada.tsx "$ARBOL/lib/__tests__/simetria-de-la-fila/"
  (cd "$ARBOL" && node "$RAIZ/scripts/empaquetar-con-acciones-mudas.mjs" \
      lib/__tests__/simetria-de-la-fila/entrada.tsx "$OUT")
  # El CSS del «antes» sale de SU código: con el de ahora, las clases que aquel
  # no tenía —`min-w-6`, el tono del «+N»— existirían igual y se estaría
  # midiendo otra cosa.
  (cd "$ARBOL" && npx tailwindcss -i app/globals.css -o "$ARBOL/antes.css" >/dev/null 2>&1)
  CSS_DEL_BANCO="$ARBOL/antes.css" node --test lib/__tests__/simetria-de-la-fila.test.mjs "$@"
else
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/simetria-de-la-fila/entrada.tsx "$OUT"
  node --test lib/__tests__/simetria-de-la-fila.test.mjs "$@"
fi
