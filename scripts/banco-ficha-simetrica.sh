#!/usr/bin/env bash
# El banco de la ficha de contacto SIMÉTRICA (Chats › ficha › «Configurar
# campos de la ficha» y la ficha abierta):
#   1. la REGLA pura (`lib/contact-fields.ts`): la sección real de Nombre y
#      Teléfono, Notas siempre la última y fuera de la lista editable, el orden
#      de la ficha abierta y la columna de Notas en Google Sheets;
#   2. el diálogo y la ficha REALES en Chromium, sobre el Tailwind del repo, a
#      1440, 1024 y 390.
# Corre dos veces: la segunda con `MODO=roto`, contra `ANTES_REF` (pinchado a
# un commit, nunca origin/main), y AFIRMA el fallo.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
RAIZ="$(pwd)"
ANTES_REF="${ANTES_REF:-4834a9e}"
OUT="$RAIZ/lib/__tests__/.compilado/ficha-simetrica"
mkdir -p "$OUT"

# ── 1. La regla ──────────────────────────────────────────────────────────
npx esbuild lib/contact-fields.ts --bundle --platform=node --format=esm --outfile="$OUT/reglas.js" --log-level=error
git show "$ANTES_REF:lib/contact-fields.ts" > "$OUT/antes-reglas.ts"
npx esbuild "$OUT/antes-reglas.ts" --bundle --platform=node --format=esm --outfile="$OUT/antes-reglas.js" --log-level=error
node --test lib/__tests__/ficha-simetrica-reglas.test.mjs
MODO=roto node --test lib/__tests__/ficha-simetrica-reglas.test.mjs

# ── 2. El diálogo y la ficha, en Chromium ───────────────────────────────
npx tailwindcss -i app/globals.css -o "$OUT/app.css" >/dev/null 2>&1
ALIAS=(--alias:@/actions/contact-fields-actions=./lib/__tests__/ficha-simetrica/acciones-de-la-ficha.ts --alias:@/actions/encuesta-de-satisfaccion-actions=./lib/__tests__/ficha-simetrica/acciones-de-la-encuesta.ts)
node scripts/empaquetar-con-acciones-mudas.mjs lib/__tests__/ficha-simetrica/entrada.tsx "$OUT/harness.js" "${ALIAS[@]}"
ARBOL="$(mktemp -d)/antes"
git worktree add --detach "$ARBOL" "$ANTES_REF" >/dev/null
trap 'git worktree remove --force "$ARBOL" >/dev/null 2>&1 || true' EXIT
ln -s "$RAIZ/node_modules" "$ARBOL/node_modules"
mkdir -p "$ARBOL/lib/__tests__/ficha-simetrica"
cp lib/__tests__/ficha-simetrica/*.ts* "$ARBOL/lib/__tests__/ficha-simetrica/"
(cd "$ARBOL" && node "$RAIZ/scripts/empaquetar-con-acciones-mudas.mjs" \
    lib/__tests__/ficha-simetrica/entrada.tsx "$OUT/harness-antes.js" "${ALIAS[@]}")
node --test lib/__tests__/ficha-simetrica.test.mjs
MODO=roto node --test lib/__tests__/ficha-simetrica.test.mjs
