#!/usr/bin/env bash
# Mis notas (`/notas`): los arreglos de la pantalla. Tres mitades:
#
#   1. Las REGLAS (`lib/pantalla-de-notas.ts`) y un BARRIDO del código
#      (`lib/__tests__/pantalla-de-notas.test.mjs`).
#   2. Las ACCIONES y la ruta de contactos contra POSTGRES
#      (`lib/__tests__/notas-db.test.mjs`): el buscador del cuerpo, el Archivo y
#      Compartidas, el número de una carpeta y «Vincular contacto».
#   3. La pantalla SERVIDA la recorre la guía (`scripts/generar-guia-notas.sh`),
#      con sesión y datos: cada receta de `capturar-guia-notas.mjs` pulsa los
#      mandos de verdad y se cae si alguno no está o no hace lo que dice.
#
# `MODO=roto` lee y empaqueta el código de `ANTES_REF` —pinchado a un commit,
# nunca `origin/main`, que en cuanto esto se fusione sería el «ahora»— y
# AFIRMA los fallos.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
MODO="${MODO:-bueno}"
# 24ba0b2 — antes de esto: buscar no miraba el cuerpo, la carpeta se plegaba al
# abrirla, se borraba de un clic desde la lista y «Vincular contacto» salía vacío
# para el equipo.
ANTES_REF="${ANTES_REF:-24ba0b2}"
export MODO ANTES_REF

RAIZ="$(pwd)"
OUT="$RAIZ/lib/__tests__/.compilado"
mkdir -p "$OUT/pantalla-de-notas" "$OUT/notas-db"
ARBOL=""
limpiar() { if [ -n "$ARBOL" ]; then git worktree remove --force "$ARBOL" >/dev/null 2>&1 || true; fi; }
trap limpiar EXIT

# ── 1. Las reglas y el barrido ───────────────────────────────────────────
if [ "$MODO" != "roto" ]; then
  npx esbuild lib/pantalla-de-notas.ts --bundle --platform=node --format=esm \
    --outdir="$OUT/pantalla-de-notas" --log-level=error
fi
node --test lib/__tests__/pantalla-de-notas.test.mjs

# ── 2. Las acciones contra Postgres ──────────────────────────────────────
PGDIR=/tmp/pgnotas
PORT=55543
if [ ! -d "$PGDIR" ]; then
  mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
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

DESDE="$RAIZ"
if [ "$MODO" = "roto" ]; then
  ARBOL="$(mktemp -d)/antes"
  git worktree add --detach "$ARBOL" "$ANTES_REF" >/dev/null
  ln -s "$RAIZ/node_modules" "$ARBOL/node_modules"
  mkdir -p "$ARBOL/lib/__tests__/fingido"
  cp lib/__tests__/fingido/entrada-de-notas.ts lib/__tests__/fingido/auth-de-documentos.ts \
     lib/__tests__/fingido/next-server.ts lib/__tests__/fingido/next-cache.ts lib/__tests__/fingido/react-cache.ts \
     "$ARBOL/lib/__tests__/fingido/"
  DESDE="$ARBOL"
fi
(cd "$DESDE" && npx esbuild lib/__tests__/fingido/entrada-de-notas.ts --bundle \
  --platform=node --format=esm --outdir="$OUT/notas-db" \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/server=./lib/__tests__/fingido/next-server.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error)
sed -i '/server-only/d' "$OUT/notas-db/entrada-de-notas.js"
node --test lib/__tests__/notas-db.test.mjs
