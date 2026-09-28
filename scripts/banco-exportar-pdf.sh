#!/usr/bin/env bash
# Exportar una conversación de Chats en PDF (burbujas de chat, con el logo y el
# nombre del negocio) sin perder el texto plano de siempre.
#
# Tres mitades:
#   1. Las REGLAS y el PDF de verdad, en Node y sin base: se genera con una
#      conversación que trae TODOS los tipos y se lee con pdf.js.
#   2. En CHROMIUM: el PDF renderizado con pdf.js en un lienzo (el color de
#      cada burbuja, medido en píxeles) y el menú de formatos REAL de la barra
#      en lote, con su gemelo de Correo que sigue exportando directo.
#   3. Las ACCIONES contra Postgres: la marca sale de la cuenta DUEÑA, las
#      imágenes de nuestro almacenamiento se incrustan, las de fuera NO se
#      piden, y lo ajeno no se cuela.
#
# `MODO=roto` lee ANTES_REF —PINCHADO a un commit, nunca `origin/main`, que en
# cuanto esto se fusione sería el «ahora»— y AFIRMA que no había PDF.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:/usr/lib/postgresql/16/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO
# d76c6ff — antes de esto: la exportación solo sabía de texto plano.
export ANTES_REF="${ANTES_REF:-d76c6ff}"

COMP=lib/__tests__/.compilado/pdf
mkdir -p "$COMP/antes"

# ── 1. Reglas y PDF en Node ─────────────────────────────────────────────
if [ "$MODO" != "roto" ]; then
  npx esbuild lib/conversacion-en-pdf.ts lib/formatos-de-exportacion.ts lib/descargar-exportacion.ts \
    lib/conversacion-legible.ts --bundle --platform=node --format=esm --outdir="$COMP" --log-level=error
  git show "$ANTES_REF:lib/conversacion-legible.ts" > "$COMP/antes/conversacion-legible.ts"
  npx esbuild "$COMP/antes/conversacion-legible.ts" --bundle --platform=node --format=esm \
    --outdir="$COMP/antes" --log-level=error
fi
node --test lib/__tests__/conversacion-en-pdf.test.mjs

[ "$MODO" = "roto" ] && exit 0
[ "${SOLO_NODE:-}" = "1" ] && exit 0

# ── 2. En Chromium ──────────────────────────────────────────────────────
node lib/__tests__/conversacion-en-pdf/generar-muestra.mjs "$COMP/muestra.pdf"
node scripts/empaquetar-con-acciones-mudas.mjs lib/__tests__/conversacion-en-pdf/barra.tsx "$COMP/barra.js"
npx tailwindcss -i app/globals.css -o "$COMP/css.css" >/dev/null 2>&1
CSS_DEL_BANCO="$COMP/css.css" node --test lib/__tests__/conversacion-en-pdf-navegador.test.mjs

# ── 3. Las acciones contra Postgres ─────────────────────────────────────
PGDIR=/tmp/pgexportarpdf
PORT=55541
if [ ! -d "$PGDIR" ]; then
  mkdir -p "$PGDIR"
  chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "/usr/lib/postgresql/16/bin/createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true

export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

OUT=lib/__tests__/.compilado/calidad
mkdir -p "$OUT"
npx esbuild lib/__tests__/fingido/entrada-de-calidad.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" \
  --external:@prisma/client --external:server-only --external:openai --external:@google/genai --external:sharp \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-calidad.js"

node --test --test-concurrency=1 lib/__tests__/exportar-pdf-db.test.mjs "$@"
