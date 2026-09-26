#!/usr/bin/env bash
# Los BOTONES de la fila de arriba de la cabecera de la conversación, y las
# FILAS de los dos menús que se abren desde ellos.
#
# Dos mitades:
#   1. Las reglas y un barrido del código, sin navegador
#      (`botones-de-la-cabecera-reglas.test.mjs`): que el hueco entre controles
#      vive en UN sitio y su número y su clase dicen lo mismo, que la cabecera no
#      lo escribe a mano, que la etapa va antes de las etiquetas en las DOS filas,
#      que la fila de Etiquetas no abre con un `opacity-0` y que la marca de color
#      la escribe una sola constante.
#   2. La cabecera REAL pintada en Chromium sobre el CSS del build
#      (`botones-de-la-cabecera.test.mjs`), a 1440/1280/1024 y en un móvil: los
#      huecos entre TODOS los controles, el orden, y los dos menús abiertos —dónde
#      arranca lo que SE VE de cada fila y dónde su nombre—.
#
# La segunda mitad tiene que ser en navegador, y por dos motivos que leyendo el
# código no aparecen:
#
#   * el hueco de más entre el último control y su vecino era el `gap-3` de la
#     FILA asomando por el único sitio donde la fila separa dos controles: los dos
#     `gap` están escritos, pero cuál cae entre qué botones solo se ve midiendo;
#   * y la sangría de la fila de Etiquetas la metía un elemento INVISIBLE (un
#     `opacity-0` no libera sitio). El banco de las filas no la cazaba porque
#     medía el primer HIJO de la fila y no la primera cosa que se ve.
#
# `MODO=roto` empaqueta el MISMO arnés contra los componentes de `ANTES_REF` (un
# `git worktree` aparte) y AFIRMA los dos fallos: 12 px entre el último control y
# la ficha, las etiquetas antes de la etapa y la marca de una etiqueta 24 px más
# adentro que la de una etapa.
#
# El «antes» va PINCHADO a un commit, nunca a `origin/main`: en cuanto esto se
# fusione, `origin/main` sería el «ahora» y el modo roto pasaría sin reproducir
# nada, que es la peor forma de tener un banco.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
# b69b28a — antes de esto: el último control de la fila a 12 px de su vecino, las
#           etiquetas delante de la etapa, y la fila de Etiquetas abriendo con un
#           chulito invisible que le metía 24 px de sangría.
ANTES_REF="${ANTES_REF:-b69b28a}"
export MODO

RAIZ="$(pwd)"
mkdir -p lib/__tests__/.compilado

# Los módulos SIEMPRE se compilan del árbol de ahora: el hueco entre controles no
# existía en el «antes», así que no hay un «antes» suyo que afirmar. Lo que el
# modo roto lee del otro árbol son los COMPONENTES.
npx tsc lib/cabeceras-de-chats.ts lib/filas-de-los-menus.ts \
  --outDir lib/__tests__/.compilado \
  --module esnext --target es2022 --moduleResolution bundler --skipLibCheck

# En el modo roto el CSS se construye del OTRO árbol unas líneas más abajo, así
# que este aviso es solo para el modo bueno.
if [ "$MODO" != "roto" ] && [ ! -d ".next/static/css" ] && [ -z "${CSS_DEL_BANCO:-}" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes, o pasa CSS_DEL_BANCO" >&2
  exit 1
fi

# El paquete que queda en disco es el del ÚLTIMO modo que corrió: cada modo lo
# reconstruye antes de medir, así que el banco es correcto, pero mirar la
# cabecera a mano después de un `MODO=roto` enseña la de ANTES. Para eso se
# vuelve a empaquetar.
OUT="$RAIZ/lib/__tests__/.compilado/arnes-de-los-botones.js"
# El menú de Etapas pide su lista al abrirlo: con la acción muda genérica
# —`{ success: true, data: [] }`— el panel enseña «esta cuenta no tiene embudos»
# y no hay ninguna fila que medir.
ALIAS_EMBUDOS="--alias:@/actions/embudos-actions=./lib/__tests__/fingido/embudos-de-la-cabecera.ts"
# La maqueta es la misma que la del banco de las filas: la cabecera REAL, con una
# etiqueta puesta y una etapa puesta. Dos arneses para la misma cabecera serían
# dos semillas que el día que se afine una la otra se queda atrás.
ENTRADA="lib/__tests__/filas-de-los-menus/entrada.tsx"

if [ "$MODO" = "roto" ]; then
  W="$(mktemp -d)/antes"
  git worktree add -f "$W" "$ANTES_REF" -q
  ln -s "$RAIZ/node_modules" "$W/node_modules"
  mkdir -p "$W/lib/__tests__/filas-de-los-menus" "$W/lib/__tests__/fingido"
  cp lib/__tests__/filas-de-los-menus/* "$W/lib/__tests__/filas-de-los-menus/"
  cp lib/__tests__/fingido/embudos-de-la-cabecera.ts "$W/lib/__tests__/fingido/"
  (cd "$W" && node "$RAIZ/scripts/empaquetar-con-acciones-mudas.mjs" "$ENTRADA" "$OUT" "$ALIAS_EMBUDOS")
  # El CSS del «antes» sale de SU código: con el de ahora, las clases que aquel
  # no tenía existirían igual y se estaría midiendo otra cosa.
  (cd "$W" && npx tailwindcss -i app/globals.css -o "$W/antes.css" >/dev/null 2>&1)
  cp "$W/antes.css" "$RAIZ/lib/__tests__/.compilado/antes-de-los-botones.css"
  DIR_ANTES="$W" node --test lib/__tests__/botones-de-la-cabecera-reglas.test.mjs
  CSS_DEL_BANCO="$RAIZ/lib/__tests__/.compilado/antes-de-los-botones.css" \
    node --test lib/__tests__/botones-de-la-cabecera.test.mjs "$@"
  git worktree remove --force "$W" >/dev/null 2>&1 || true
else
  node --test lib/__tests__/botones-de-la-cabecera-reglas.test.mjs
  node scripts/empaquetar-con-acciones-mudas.mjs "$ENTRADA" "$OUT" "$ALIAS_EMBUDOS"
  node --test lib/__tests__/botones-de-la-cabecera.test.mjs "$@"
fi
