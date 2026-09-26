#!/usr/bin/env bash
# La CALIFICACIÓN del lead en la fila de la lista de Chats.
#
# El fallo: la pastilla se pintaba SIEMPRE, y sin calificación decía «Sin
# clasificar» dentro de un borde punteado. O sea que toda conversación que
# nadie ha calificado —que es como nacen todas— gastaba una pastilla entera del
# renglón, que es lo único que escasea en esa fila, para enseñar un hueco: y lo
# que empujaba al «+N» era la etapa, los recordatorios o las etiquetas, que sí
# llevan un dato.
#
# Y la otra punta, que es la que no se ve leyendo el encargo: esa pastilla era
# **el único mando de Chats para calificar**. Esconderla a secas dejaba sin
# calificar justo la conversación que hay que calificar, así que calificar se
# mudó al menú «⋯» de la fila.
#
# Dos mitades, y cada una contesta lo que la otra no puede:
#   1. La DECISIÓN, sin navegador: cuándo se pinta, qué se puede guardar, y el
#      invariante que las junta —lo que pinta una pastilla es EXACTAMENTE lo
#      que el menú ofrece—. Comprobar cada lado por separado no lo cazaría.
#   2. La fila REAL (`ChatContactItem`) en Chromium sobre el CSS del build (o
#      `CSS_DEL_BANCO`), dentro de `.app-module-content` y en la columna de
#      producción con sus barras a la vista, a 1440/1280/1024/390. Dos cosas
#      solo se contestan ahí: cuánto ancho devuelve quitar la pastilla, y que
#      el menú «⋯» —que Radix pinta en un portal y solo al abrirlo— sigue
#      teniendo con qué calificar.
#
# `MODO=roto` empaqueta la MISMA maqueta contra los componentes de `ANTES_REF`
# —un `git worktree` aparte— y AFIRMA los dos fallos. El «antes» va PINCHADO a
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
# 5aaa50a — antes de esto: la pastilla se pintaba siempre, también sin
#           calificación, y el menú «⋯» de la fila no ofrecía calificar.
ANTES_REF="${ANTES_REF:-5aaa50a}"

RAIZ="$(pwd)"
OUT="$RAIZ/lib/__tests__/.compilado/calificacion-del-lead.js"
mkdir -p "$(dirname "$OUT")"

ARBOL=""
limpiar() {
  if [ -n "$ARBOL" ]; then git worktree remove --force "$ARBOL" >/dev/null 2>&1 || true; fi
}
trap limpiar EXIT

# ── 1. La decisión, sin navegador ────────────────────────────────────────
# Las funciones puras SIEMPRE se compilan del árbol de ahora: en el «antes» no
# existían, así que no hay un «antes» suyo que afirmar. Lo que el modo roto lee
# del otro árbol son los COMPONENTES. Y en su propia carpeta: el paquete del
# arnés se llama igual, y el segundo pisaría al primero.
npx esbuild lib/__tests__/calificacion-del-lead/reglas.ts --bundle --format=esm \
  --alias:@=. --outdir=lib/__tests__/.compilado/calificacion-del-lead --log-level=error
node --test lib/__tests__/calificacion-del-lead-reglas.test.mjs

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
  # La maqueta es la de HOY —es lo que hace comparables las dos medidas—; lo
  # que se saca del otro árbol son los COMPONENTES.
  mkdir -p "$ARBOL/lib/__tests__/calificacion-del-lead"
  cp lib/__tests__/calificacion-del-lead/entrada.tsx "$ARBOL/lib/__tests__/calificacion-del-lead/"
  (cd "$ARBOL" && node "$RAIZ/scripts/empaquetar-con-acciones-mudas.mjs" \
      lib/__tests__/calificacion-del-lead/entrada.tsx "$OUT")
  # El CSS del «antes» sale de SU código: con el de ahora, las clases que aquel
  # no tenía existirían igual y se estaría midiendo otra cosa.
  (cd "$ARBOL" && npx tailwindcss -i app/globals.css -o "$ARBOL/antes.css" >/dev/null 2>&1)
  CSS_DEL_BANCO="$ARBOL/antes.css" node --test lib/__tests__/calificacion-del-lead.test.mjs "$@"
else
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/calificacion-del-lead/entrada.tsx "$OUT"
  node --test lib/__tests__/calificacion-del-lead.test.mjs "$@"
fi
