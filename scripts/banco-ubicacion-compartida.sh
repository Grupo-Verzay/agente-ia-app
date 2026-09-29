#!/usr/bin/env bash
# La ubicación que comparte un contacto por WhatsApp: tarjeta con mapa en la
# conversación, igual que un documento.
#
# Dos mitades:
#   1. Las REGLAS (`lib/ubicacion-de-whatsapp.ts`, `lib/mapa-de-la-ubicacion.ts`)
#      y un barrido: cómo se lee venga del proveedor que venga, el mapa, y que
#      reenviar, copiar, exportar, el historial de Waha y la lista pasan por ellas.
#      Si el repositorio del backend está al lado, compara las dos copias del
#      módulo compartido.
#   2. Las burbujas REALES en Chromium, sobre el CSS de Tailwind.
#
# `MODO=roto` apunta a `ANTES_REF` —PINCHADO a un commit, nunca `origin/main`,
# que en cuanto esto se fusione sería el «ahora»— y AFIRMA el fallo: la
# ubicación salía como «[Mensaje locationMessage]», sin mapa.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO
# 4a5502b — antes de esto: ni tarjeta, ni mapa; el tipo crudo en la burbuja.
ANTES_REF="${ANTES_REF:-4a5502b}"
export ANTES_REF

RAIZ="$(pwd)"
COMP="$RAIZ/lib/__tests__/.compilado/ubicacion-compartida"
mkdir -p "$COMP"
ARBOL=""
limpiar() { if [ -n "$ARBOL" ]; then git worktree remove --force "$ARBOL" >/dev/null 2>&1 || true; fi; }
trap limpiar EXIT

# ── 1. Las reglas y el barrido ──────────────────────────────────────────
if [ "$MODO" != "roto" ]; then
  npx esbuild \
    lib/ubicacion-de-whatsapp.ts lib/mapa-de-la-ubicacion.ts lib/reenviar-mensaje.ts \
    lib/conversacion-legible.ts lib/waha-historial.ts \
    "app/(root)/chats/_components/chat-message-utils.ts" \
    "app/(root)/chats/_components/chat-sidebar.utils.ts" \
    --bundle --format=esm --platform=node --entry-names="[name]" --outdir="$COMP" --log-level=error
  node --test lib/__tests__/ubicacion-compartida.test.mjs
fi

# ── 2. En Chromium ──────────────────────────────────────────────────────
if [ "$MODO" = "roto" ]; then
  ARBOL="$(mktemp -d)/antes"
  git worktree add --detach "$ARBOL" "$ANTES_REF" >/dev/null
  ln -s "$RAIZ/node_modules" "$ARBOL/node_modules"
  mkdir -p "$ARBOL/lib/__tests__/ubicacion-compartida"
  cp lib/__tests__/ubicacion-compartida/burbujas.tsx "$ARBOL/lib/__tests__/ubicacion-compartida/"
  (cd "$ARBOL" && node "$RAIZ/scripts/empaquetar-con-acciones-mudas.mjs" lib/__tests__/ubicacion-compartida/burbujas.tsx "$COMP/burbujas.js")
  (cd "$ARBOL" && npx tailwindcss -i app/globals.css -o "$ARBOL/css.css" >/dev/null 2>&1)
  CSS_DEL_BANCO="$ARBOL/css.css" node --test lib/__tests__/ubicacion-compartida-navegador.test.mjs
else
  node scripts/empaquetar-con-acciones-mudas.mjs lib/__tests__/ubicacion-compartida/burbujas.tsx "$COMP/burbujas.js"
  npx tailwindcss -i app/globals.css -o "$COMP/css.css" >/dev/null 2>&1
  CSS_DEL_BANCO="$COMP/css.css" node --test lib/__tests__/ubicacion-compartida-navegador.test.mjs
fi
