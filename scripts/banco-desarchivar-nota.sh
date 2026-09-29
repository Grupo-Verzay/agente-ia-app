#!/usr/bin/env bash
# DESARCHIVAR una nota en Mis notas.
#
# El fallo: archivar vivía en la barra del editor y `unarchiveNote` existía,
# importada en la pantalla, pero no la llamaba nadie. Una nota archivada no
# tenía ninguna forma de volver a la lista activa.
#
# Tres mitades:
#   1. La REGLA (`lib/archivo-de-notas.ts`) y un BARRIDO del código.
#   2. Las ACCIONES contra POSTGRES: el viaje de ida y vuelta y la puerta.
#   3. La barra REAL en CHROMIUM: qué pide el botón con cada tipo de nota.
#
# `MODO=roto` lee y monta el código de `ANTES_REF` —pinchado a un commit, nunca
# `origin/main`, que en cuanto esto se fusione sería el «ahora»— y AFIRMA el
# fallo. La mitad de Postgres corre igual en los dos modos: la acción ya existía.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
# 16e81b7 — antes de esto: la barra solo sabía archivar y nadie llamaba a unarchiveNote.
ANTES_REF="${ANTES_REF:-16e81b7}"
export ANTES_REF

RAIZ="$(pwd)"
OUT="$RAIZ/lib/__tests__/.compilado/desarchivar-nota"
mkdir -p "$OUT"

ARBOL=""
limpiar() {
  if [ -n "$ARBOL" ]; then git worktree remove --force "$ARBOL" >/dev/null 2>&1 || true; fi
}
trap limpiar EXIT

# ── 1. La regla y el barrido ─────────────────────────────────────────────
npx esbuild lib/archivo-de-notas.ts --bundle --platform=node --format=esm \
  --outdir="$OUT" --log-level=error
node --test lib/__tests__/desarchivar-nota-reglas.test.mjs

# ── 2. Las acciones contra Postgres ──────────────────────────────────────
PGDIR=/tmp/pgdesarchivar
PORT=55531
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

npx esbuild lib/__tests__/fingido/entrada-de-desarchivar-nota.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-desarchivar-nota.js"
node --test lib/__tests__/desarchivar-nota-db.test.mjs

# ── 3. La barra real, en Chromium ────────────────────────────────────────
if [ "$MODO" = "roto" ]; then
  ARBOL="$(mktemp -d)/antes"
  git worktree add --detach "$ARBOL" "$ANTES_REF" >/dev/null
  ln -s "$RAIZ/node_modules" "$ARBOL/node_modules"
  mkdir -p "$ARBOL/lib/__tests__/desarchivar-nota"
  cp lib/__tests__/desarchivar-nota/entrada.tsx "$ARBOL/lib/__tests__/desarchivar-nota/"
  (cd "$ARBOL" && node "$RAIZ/scripts/empaquetar-con-acciones-mudas.mjs" \
      lib/__tests__/desarchivar-nota/entrada.tsx "$OUT/harness.js")
else
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/desarchivar-nota/entrada.tsx "$OUT/harness.js"
fi
node --test lib/__tests__/desarchivar-nota.test.mjs "$@"
