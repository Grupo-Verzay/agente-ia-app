#!/usr/bin/env bash
# El banco de la X de cerrar de los diálogos.
#
# La regla (`lib/cerrar-del-dialogo.ts`) sin navegador, y los diálogos REALES
# —el visor de adjuntos de Chats, uno `p-6`, uno `px-0`, uno `p-0 gap-0` y uno
# que desplaza— en Chromium sobre el CSS de la App (Tailwind con la config del
# repo, o sea las mismas declaraciones que el build), a 1440/1280/1024/390.
#
# `MODO=roto` empaqueta el MISMO arnés contra `ANTES_REF` (un `git worktree`
# aparte, pinchado a un commit: `origin/main` sería el «ahora» en cuanto esto
# se fusione) y afirma el fallo: la X medio afuera y la cabecera cortada.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
ANTES_REF="${ANTES_REF:-0d4d3d9}"
export MODO
RAIZ="$(pwd)"
mkdir -p lib/__tests__/.compilado
OUT="$RAIZ/lib/__tests__/.compilado/cerrar-del-dialogo.js"

# La regla, compilada aparte (su propio nombre: no pisa el paquete del arnés).
npx esbuild lib/cerrar-del-dialogo.ts --format=esm --log-level=warning \
  --outfile="$OUT.regla.mjs"

if [ "$MODO" = "roto" ]; then
  W="$(mktemp -d)/antes"
  trap 'git worktree remove --force "$W" >/dev/null 2>&1 || true' EXIT
  git worktree add -f "$W" "$ANTES_REF" -q
  ln -s "$RAIZ/node_modules" "$W/node_modules"
  mkdir -p "$W/lib/__tests__/cerrar-del-dialogo"
  cp lib/__tests__/cerrar-del-dialogo/* "$W/lib/__tests__/cerrar-del-dialogo/"
  BASE="$W"
else
  BASE="$RAIZ"
fi

# El CSS: el de la App, generado con la config del repo sobre el árbol que se
# mide (en modo roto, el de antes).
CSS="$RAIZ/lib/__tests__/.compilado/cerrar-del-dialogo.css"
(cd "$BASE" && npx tailwindcss -i app/globals.css -o "$CSS" 2>&1 | tail -2)
export CSS_DEL_BANCO="$CSS"

(cd "$BASE" && node "$RAIZ/scripts/empaquetar-con-acciones-mudas.mjs" \
    lib/__tests__/cerrar-del-dialogo/entrada.tsx "$OUT")

node --test lib/__tests__/cerrar-del-dialogo.test.mjs "$@"
