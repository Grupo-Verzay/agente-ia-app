#!/usr/bin/env bash
# El banco de los cuatro menús del 2026-09-23: el estado de la cita, la ✕ de
# Registros, el «+ Nuevo» de Registros y la campanita.
#
# Monta los componentes REALES (`ChatAppointmentStatusButton`,
# `ChatRegistrosSheet`, `NotificationCenter`) con sus acciones de servidor
# mudas y los mide en Chromium sobre el CSS del build, a 1440/1280/1024/390.
#
# `MODO=roto` empaqueta el MISMO arnés contra el código de `ANTES_REF` (un
# `git worktree` aparte) y afirma los cuatro fallos: las primeras opciones del
# estado tapadas por la ficha, dos ✕ en Registros, el «+ Nuevo» con hueco bajo
# su botón y la campanita sin llegar al filo derecho de la barra.
#
# El «antes» va PINCHADO a un commit, nunca a `origin/main`: en cuanto este
# cambio se fusione, `origin/main` sería el «ahora» y el modo roto pasaría sin
# reproducir nada.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
ANTES_REF="${ANTES_REF:-5288fa2}"
export MODO

# La decisión, sin navegador.
mkdir -p lib/__tests__/.compilado
npx tsc lib/paneles-flotantes.ts --outDir lib/__tests__/.compilado \
  --module esnext --target es2022 --moduleResolution bundler --skipLibCheck
node --test lib/__tests__/menus-de-registros-geometria.test.mjs

if [ ! -d ".next/static/css" ] && [ -z "${CSS_DEL_BANCO:-}" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

npx esbuild --version >/dev/null 2>&1 || true
RAIZ="$(pwd)"
OUT="$RAIZ/lib/__tests__/.compilado/menus-de-registros.js"
ALIAS=(
  "--alias:@/actions/appointments-actions=./lib/__tests__/menus-de-registros/acciones-fingidas.ts"
  "--alias:@/actions/notification-center-actions=./lib/__tests__/menus-de-registros/acciones-fingidas.ts"
)

if [ "$MODO" = "roto" ]; then
  W="$(mktemp -d)/antes"
  trap 'git worktree remove --force "$W" >/dev/null 2>&1 || true' EXIT
  git worktree add -f "$W" "$ANTES_REF" -q
  ln -s "$RAIZ/node_modules" "$W/node_modules"
  mkdir -p "$W/lib/__tests__/menus-de-registros"
  cp lib/__tests__/menus-de-registros/* "$W/lib/__tests__/menus-de-registros/"
  (cd "$W" && node "$RAIZ/scripts/empaquetar-con-acciones-mudas.mjs" \
      lib/__tests__/menus-de-registros/entrada.tsx "$OUT" "${ALIAS[@]}")
else
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/menus-de-registros/entrada.tsx "$OUT" "${ALIAS[@]}"
fi

node --test lib/__tests__/menus-de-registros.test.mjs "$@"
