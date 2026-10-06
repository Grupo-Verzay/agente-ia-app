#!/usr/bin/env bash
# Videollamada con IA de Verzay (Tavus) en Agenda › Ajustes: las reglas puras.
# `MODO=roto` lee los ajustes de un commit PINCHADO (nunca origin/main) y
# afirma que allí solo existía el enlace fijo.
set -euo pipefail
cd "$(dirname "$0")/.."
MODO="${MODO:-bueno}"; export MODO
# fc9e014 — antes de esto: no había modo Tavus.
ANTES_REF="${ANTES_REF:-fc9e014}"
if [ "$MODO" = roto ]; then
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  git show "$ANTES_REF:app/(root)/schedule/_components/settings/UpdateMeetingDuration.tsx" > "$TMP/ajustes.tsx"
  export AJUSTES_DE_LA_REUNION="$TMP/ajustes.tsx"
  if git cat-file -e "$ANTES_REF:lib/videollamada-ia.ts" 2>/dev/null; then export HAY_MODULO_ANTES=si; else export HAY_MODULO_ANTES=no; fi
else
  mkdir -p lib/__tests__/.compilado
  npx esbuild lib/videollamada-ia.ts --bundle --format=esm --platform=node \
    --outfile=lib/__tests__/.compilado/videollamada-ia.js --log-level=warning
  npx esbuild lib/pantalla-del-avatar.ts --bundle --format=esm --platform=node \
    --outfile=lib/__tests__/.compilado/pantalla-del-avatar.js --log-level=warning
  npx esbuild lib/videollamada-en-vivo.ts --bundle --format=esm --platform=node \
    --outfile=lib/__tests__/.compilado/videollamada-en-vivo.js --log-level=warning
  npx esbuild lib/pantalla-de-verzy.ts --bundle --format=esm --platform=node \
    --outfile=lib/__tests__/.compilado/pantalla-de-verzy.js --log-level=warning
  npx esbuild lib/videollamada-crm.ts --bundle --format=esm --platform=node \
    --outfile=lib/__tests__/.compilado/videollamada-crm.js --log-level=warning
fi
node --test lib/__tests__/videollamada-ia.test.mjs

# La persona con ediciones del editor de Tavus: copia, nunca force (solo modo bueno).
if [ "$MODO" != roto ]; then
  npx esbuild lib/persona-de-tavus.server.ts --bundle --format=esm --platform=node \
    --alias:server-only=./lib/__tests__/fingido/server-only-vacio.ts \
    --alias:@/lib/videollamada-ia-db=./lib/__tests__/fingido/videollamada-ia-db-de-mentira.ts \
    --alias:@=. --outfile=lib/__tests__/.compilado/persona-de-tavus.js --log-level=warning
  node --test lib/__tests__/persona-derivada.test.mjs
fi

# La sala montada en Chromium con un Daily de mentira: el saludo de respaldo.
# En modo roto se monta la sala de 9c0e76d (con su iframe y sin respaldo).
ANTES_SALA_REF="${ANTES_SALA_REF:-9c0e76d}"
if [ "$MODO" = roto ]; then
  ARBOL="$(mktemp -d)/sala"
  git worktree add --detach -q "$ARBOL" "$ANTES_SALA_REF"
  trap 'git worktree remove --force "$ARBOL" 2>/dev/null || true; rm -rf "${TMP:-}"' EXIT
  ln -s "$PWD/node_modules" "$ARBOL/node_modules"
  export RAIZ_DE_LA_SALA="$ARBOL"
fi
NODE_PATH="${NODE_PATH:-$(npm root -g)}" node --test lib/__tests__/sala-de-videollamada.test.mjs

# La raíz vacía y la pantalla vieja al reabrir. En modo roto se compilan las
# reglas de 665af12 y se afirma el fallo: «/» pasaba y lo inválido se callaba.
ANTES_RUTA_REF="${ANTES_RUTA_REF:-665af12}"
RAIZ_RUTA="$PWD"
if [ "$MODO" = roto ]; then
  ARBOL_RUTA="$(mktemp -d)/ruta"
  git worktree add --detach -q "$ARBOL_RUTA" "$ANTES_RUTA_REF"
  trap 'git worktree remove --force "$ARBOL_RUTA" 2>/dev/null || true; git worktree remove --force "${ARBOL:-/nada}" 2>/dev/null || true; rm -rf "${TMP:-}"' EXIT
  RAIZ_RUTA="$ARBOL_RUTA"
fi
mkdir -p lib/__tests__/.compilado/ruta
npx esbuild "$RAIZ_RUTA/lib/pantalla-del-avatar.ts" --bundle --format=esm --platform=node \
  --outfile=lib/__tests__/.compilado/ruta/pantalla-del-avatar.js --log-level=warning
npx esbuild "$RAIZ_RUTA/lib/pantalla-de-verzy.ts" --bundle --format=esm --platform=node \
  --outfile=lib/__tests__/.compilado/ruta/pantalla-de-verzy.js --log-level=warning
RAIZ_RUTA="$RAIZ_RUTA" node --test lib/__tests__/ruta-de-verzy.test.mjs
