#!/usr/bin/env bash
# Las FILAS de los dos desplegables que se abren desde la cabecera de la
# conversación: el de Etiquetas y el de Etapas.
#
# Dos mitades:
#   1. Las reglas y un barrido del código, sin navegador: que las clases de una
#      fila salen de UN sitio (`lib/filas-de-los-menus.ts`), que no hay dos
#      números para el mismo sangrado, que el chulito se fue del menú de Etapas
#      y que las píldoras de la LISTA de chats siguen con su capitalización.
#   2. Los dos menús ABIERTOS de verdad en Chromium, pintados por la `ChatHeader`
#      real sobre el CSS del build (o `CSS_DEL_BANCO`), a 1440/1280/1024/390:
#      que la fila y el rótulo arrancan en el mismo píxel en los dos, que los
#      nombres van en mayúscula sin tocar el guardado, y que la etapa puesta se
#      marca con un gris que no se pierde al apuntarlo.
#
# La segunda mitad tiene que ser en navegador y no un barrido: la sangría de más
# del menú de Etiquetas **no estaba escrita en ninguna parte** —la metía el `p-1`
# que `CommandGroup` lleva dentro—, así que leyendo los dos componentes no
# aparece. Solo se caza midiendo.
#
# `MODO=roto` empaqueta el MISMO arnés contra los componentes de `ANTES_REF` (un
# `git worktree` aparte) y afirma su fallo: 4 px de más en Etiquetas, el chulito
# en su sitio y ningún nombre en mayúscula.
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
# 13a228f — antes de esto: el menú de Etiquetas con la sangría de su grupo, el de
#           Etapas con su chulito, y ningún nombre en mayúscula.
ANTES_REF="${ANTES_REF:-13a228f}"
export MODO

RAIZ="$(pwd)"
mkdir -p lib/__tests__/.compilado

# El módulo SIEMPRE se compila del árbol de ahora: en el «antes» no existía, así
# que no hay un «antes» suyo que afirmar. Lo que el modo roto lee del otro árbol
# son los COMPONENTES.
npx tsc lib/filas-de-los-menus.ts --outDir lib/__tests__/.compilado \
  --module esnext --target es2022 --moduleResolution bundler --skipLibCheck

if [ ! -d ".next/static/css" ] && [ -z "${CSS_DEL_BANCO:-}" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes, o pasa CSS_DEL_BANCO" >&2
  exit 1
fi

# Un nombre DISTINTO del que deja `tsc` para el módulo: con el mismo, el
# paquete del arnés lo pisa y el banco de reglas importa una maqueta de
# navegador («document is not defined»).
OUT="$RAIZ/lib/__tests__/.compilado/arnes-de-las-filas.js"
# El menú de Etapas pide su lista al abrirlo: con la acción muda genérica
# —`{ success: true, data: [] }`— el panel enseña «esta cuenta no tiene embudos»
# y no hay ninguna fila que medir.
ALIAS_EMBUDOS="--alias:@/actions/embudos-actions=./lib/__tests__/fingido/embudos-de-la-cabecera.ts"

if [ "$MODO" = "roto" ]; then
  W="$(mktemp -d)/antes"
  git worktree add -f "$W" "$ANTES_REF" -q
  ln -s "$RAIZ/node_modules" "$W/node_modules"
  mkdir -p "$W/lib/__tests__/filas-de-los-menus" "$W/lib/__tests__/fingido"
  cp lib/__tests__/filas-de-los-menus/* "$W/lib/__tests__/filas-de-los-menus/"
  cp lib/__tests__/fingido/embudos-de-la-cabecera.ts "$W/lib/__tests__/fingido/"
  (cd "$W" && node "$RAIZ/scripts/empaquetar-con-acciones-mudas.mjs" \
      lib/__tests__/filas-de-los-menus/entrada.tsx "$OUT" "$ALIAS_EMBUDOS")
  # El CSS del «antes» sale de SU código: con el de ahora, las clases que aquel
  # no tenía existirían igual y se estaría midiendo otra cosa.
  (cd "$W" && npx tailwindcss -i app/globals.css -o "$W/antes.css" >/dev/null 2>&1)
  cp "$W/antes.css" "$RAIZ/lib/__tests__/.compilado/antes-de-las-filas.css"
  DIR_ANTES="$W" node --test lib/__tests__/filas-de-los-menus-reglas.test.mjs
  CSS_DEL_BANCO="$RAIZ/lib/__tests__/.compilado/antes-de-las-filas.css" \
    node --test lib/__tests__/filas-de-los-menus.test.mjs "$@"
  git worktree remove --force "$W" >/dev/null 2>&1 || true
else
  node --test lib/__tests__/filas-de-los-menus-reglas.test.mjs
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/filas-de-los-menus/entrada.tsx "$OUT" "$ALIAS_EMBUDOS"
  node --test lib/__tests__/filas-de-los-menus.test.mjs "$@"
fi
