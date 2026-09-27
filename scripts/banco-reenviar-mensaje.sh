#!/usr/bin/env bash
# Reenviar un mensaje de Chats a otras conversaciones, como en WhatsApp.
#
# Dos mitades:
#   1. La DECISIÓN (`lib/reenviar-mensaje.ts`) y un barrido del código, sin
#      navegador: que la pantalla la usa y que cada destino sale por el
#      `sendText` de SU línea.
#   2. La burbuja y el panel REALES en Chromium, sobre el CSS de Tailwind.
#
# `MODO=roto` apunta a `ANTES_REF` —PINCHADO a un commit, nunca `origin/main`,
# que en cuanto esto se fusione sería el «ahora»— y AFIRMA el fallo: no había
# ninguna forma de reenviar.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO
# 2017da3 — antes de esto: ni botón, ni menú, ni panel de reenviar.
ANTES_REF="${ANTES_REF:-2017da3}"
export ANTES_REF

RAIZ="$(pwd)"
COMP="$RAIZ/lib/__tests__/.compilado/reenviar-mensaje"
mkdir -p "$COMP"
ARBOL=""
limpiar() { if [ -n "$ARBOL" ]; then git worktree remove --force "$ARBOL" >/dev/null 2>&1 || true; fi; }
trap limpiar EXIT

# ── 1. La decisión y el barrido ─────────────────────────────────────────
npx esbuild lib/reenviar-mensaje.ts --bundle --format=esm --outdir="$COMP" --log-level=error
node --test lib/__tests__/reenviar-mensaje.test.mjs

# ── 2. En Chromium ──────────────────────────────────────────────────────
if [ "$MODO" = "roto" ]; then
  ARBOL="$(mktemp -d)/antes"
  git worktree add --detach "$ARBOL" "$ANTES_REF" >/dev/null
  ln -s "$RAIZ/node_modules" "$ARBOL/node_modules"
  mkdir -p "$ARBOL/lib/__tests__/reenviar-mensaje"
  cp lib/__tests__/reenviar-mensaje/burbuja.tsx "$ARBOL/lib/__tests__/reenviar-mensaje/"
  (cd "$ARBOL" && node "$RAIZ/scripts/empaquetar-con-acciones-mudas.mjs" lib/__tests__/reenviar-mensaje/burbuja.tsx "$COMP/burbuja.js")
  (cd "$ARBOL" && npx tailwindcss -i app/globals.css -o "$ARBOL/css.css" >/dev/null 2>&1)
  CSS_DEL_BANCO="$ARBOL/css.css" node --test lib/__tests__/reenviar-mensaje-navegador.test.mjs
else
  node scripts/empaquetar-con-acciones-mudas.mjs lib/__tests__/reenviar-mensaje/burbuja.tsx "$COMP/burbuja.js"
  node scripts/empaquetar-con-acciones-mudas.mjs lib/__tests__/reenviar-mensaje/panel.tsx "$COMP/panel.js"
  npx tailwindcss -i app/globals.css -o "$COMP/css.css" >/dev/null 2>&1
  CSS_DEL_BANCO="$COMP/css.css" node --test lib/__tests__/reenviar-mensaje-navegador.test.mjs
fi
