#!/usr/bin/env bash
# El banco de los mandos de la cabecera de un canal del chat de equipo.
#
# El fallo: el teléfono abría un MENÚ con «Llamada de voz» y «Videollamada» y al
# lado había un botón de cámara que en realidad abría la REUNIÓN —otra cosa: una
# sala con enlace público—. Y las dos cámaras eran el MISMO icono de lucide
# (`Video` en la opción del menú, `Video as VideoCamara` en el botón), así que
# desde fuera la fila decía «un teléfono que despliega una cámara, y una cámara
# al lado»: indistinguibles, y un clic de más para algo de todos los días.
#
# Dos mitades, porque el cambio vive en dos capas:
#
#   1. `mandos-del-canal.test.mjs` — la REGLA y un BARRIDO del código, sin
#      navegador: quién sale en qué canal, que NINGÚN par de mandos comparte
#      glifo (el fallo, escrito como invariante), que las dos llamadas comparten
#      color y la reunión no, y que la cabecera pasa por el módulo en vez de
#      llevar su propia lista.
#   2. `mandos-del-canal-dom.test.mjs` — el `HiloDelEquipo` de VERDAD en
#      Chromium sobre el CSS del build, dentro de un panel de 22 rem. Es la
#      única mitad que puede decir si los TRES dibujos se ven distintos, si un
#      clic despacha la llamada correcta SIN abrir ningún menú y si los tres
#      miden lo mismo que el resto de los controles de la fila. Una maqueta
#      daría por buenos los glifos que el propio banco escribiera.
#
# `MODO=roto` monta el `HiloDelEquipo` de ANTES_REF —pinchado a un commit, nunca
# `origin/main`, que pasa a ser el «ahora» en cuanto esto se fusione— y AFIRMA
# el fallo: dos mandos con el mismo SVG y un menú intermedio con dos opciones.
#
# Uso:  scripts/banco-mandos-del-canal.sh          (hace falta `npm run build`)
#       MODO=roto scripts/banco-mandos-del-canal.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
# El commit de ANTES de este arreglo.
ANTES_REF="${ANTES_REF:-0c5326d}"
export ANTES_REF

# ── 1. La regla y el barrido ────────────────────────────────────────────────
mkdir -p lib/__tests__/.compilado
# Con esbuild y no `tsc`: el módulo importa por `@/` y `tsc` a pelo no resuelve
# el alias del `tsconfig`.
npx esbuild lib/mandos-del-canal.ts --bundle --platform=node --format=esm \
  --outdir=lib/__tests__/.compilado --log-level=error

node --test lib/__tests__/mandos-del-canal.test.mjs "$@"

# ── 2. La cabecera pintada ──────────────────────────────────────────────────
if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

ANTES_DIR=".banco-antes-mandos"
trap 'rm -rf "$ANTES_DIR"' EXIT
rm -rf "$ANTES_DIR"
if [ "$MODO" = "roto" ]; then
  mkdir -p "$ANTES_DIR"
  # El componente de antes no tiene imports relativos: todos van por `@/`, así
  # que se puede sacar a cualquier sitio y sus vecinos resuelven igual.
  git show "$ANTES_REF:components/chat-equipo/HiloDelEquipo.tsx" > "$ANTES_DIR/HiloDelEquipo.tsx"
fi

# esbuild no es dependencia de la App: se trae con npx, como los demás bancos.
ESBUILD_DIR="$(npx -y -p esbuild -c 'dirname "$(dirname "$(readlink -f "$(which esbuild)")")"')"
export ESBUILD_DIR
node scripts/construir-banco-mandos-del-canal.mjs
node --test --test-concurrency=1 lib/__tests__/mandos-del-canal-dom.test.mjs "$@"
