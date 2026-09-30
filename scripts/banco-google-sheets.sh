#!/usr/bin/env bash
# La PANTALLA de Google Sheets (`/google-sheets`), arreglada al documentarla.
#
# Los fallos, que no daban ningún error:
#   - se guardaba CUALQUIER texto como hoja (un documento, una carpeta de
#     Drive, el enlace de «Publicar en la web»): el campo se escondía y la
#     pantalla se quedaba en blanco para siempre, sin forma de corregirlo;
#   - no decía con qué correo compartir la hoja, así que la plataforma no podía
#     escribir en ella las respuestas de las citas, y ese fallo era MUDO;
#   - los mandos flotaban al 40 % encima de la hoja, el de cambiar sin rótulo,
#     y copiar sin permiso de portapapeles reventaba;
#   - no había forma de QUITAR una hoja vinculada;
#   - la regla del id de la hoja estaba copiada en dos acciones.
#
# Tres mitades:
#   1. La REGLA del enlace y un BARRIDO del código (sin base ni navegador).
#   2. La ACCIÓN contra POSTGRES: qué queda escrito y la puerta.
#   3. La pantalla REAL en CHROMIUM, con la acción fingida que apunta lo que se
#      le pide.
#
# `MODO=roto` lee y monta el código de `ANTES_REF` —pinchado a un commit, nunca
# `origin/main`— y AFIRMA los fallos de antes.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
# ab6b110 — antes de esto: la pantalla guardaba cualquier texto y no dejaba quitar la hoja.
ANTES_REF="${ANTES_REF:-ab6b110}"
export ANTES_REF

RAIZ="$(pwd)"
OUT="$RAIZ/lib/__tests__/.compilado"
mkdir -p "$OUT/guia-google-sheets" "$OUT/google-sheets-db" "$OUT/pantalla-de-google-sheets"

ARBOL=""
limpiar() {
  if [ -n "$ARBOL" ]; then git worktree remove --force "$ARBOL" >/dev/null 2>&1 || true; fi
}
trap limpiar EXIT
if [ "$MODO" = "roto" ]; then
  ARBOL="$(mktemp -d)/antes"
  git worktree add --detach "$ARBOL" "$ANTES_REF" >/dev/null
  ln -s "$RAIZ/node_modules" "$ARBOL/node_modules"
fi

# ── 1. La regla y el barrido ─────────────────────────────────────────────
npx esbuild lib/url-de-google-sheets.ts --bundle --platform=node --format=esm \
  --outfile="$OUT/guia-google-sheets/url-de-google-sheets.mjs" --log-level=error
node --test lib/__tests__/google-sheets-reglas.test.mjs

# ── 2. La acción contra Postgres ─────────────────────────────────────────
PGDIR=/tmp/pghojas
PORT=55533
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

DE="$RAIZ"
if [ "$MODO" = "roto" ]; then
  DE="$ARBOL"
  cp lib/__tests__/fingido/entrada-de-google-sheets.ts "$ARBOL/lib/__tests__/fingido/"
fi
(cd "$DE" && npx esbuild lib/__tests__/fingido/entrada-de-google-sheets.ts --bundle \
  --platform=node --format=esm --outdir="$OUT/google-sheets-db" \
  --external:@prisma/client --external:server-only --external:googleapis \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error)
sed -i '/server-only/d' "$OUT/google-sheets-db/entrada-de-google-sheets.js"
node --test lib/__tests__/google-sheets-db.test.mjs

# ── 3. La pantalla real, en Chromium ─────────────────────────────────────
if [ "$MODO" = "roto" ]; then
  mkdir -p "$ARBOL/lib/__tests__/pantalla-de-google-sheets"
  cp lib/__tests__/pantalla-de-google-sheets/entrada.tsx "$ARBOL/lib/__tests__/pantalla-de-google-sheets/"
  cp lib/__tests__/fingido/acciones-de-google-sheets.ts "$ARBOL/lib/__tests__/fingido/"
fi
(cd "$DE" && node "$RAIZ/scripts/empaquetar-con-acciones-mudas.mjs" \
    lib/__tests__/pantalla-de-google-sheets/entrada.tsx "$OUT/pantalla-de-google-sheets/harness.js" \
    --alias:@/actions/google-sheets-actions=./lib/__tests__/fingido/acciones-de-google-sheets.ts)
node --test lib/__tests__/pantalla-de-google-sheets.test.mjs "$@"
