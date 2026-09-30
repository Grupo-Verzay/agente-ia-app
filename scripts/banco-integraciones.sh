#!/usr/bin/env bash
# Integrar URLs (`/integraciones`): los arreglos de la pantalla. Tres mitades:
#
#   1. Las REGLAS (`lib/integraciones.ts`) y un BARRIDO del código
#      (`lib/__tests__/integraciones.test.mjs`): guardar, pintar, abrir en
#      Chats, el <iframe> común y el menú pasan por ellas.
#   2. Las CINCO ACCIONES contra POSTGRES (`lib/__tests__/integraciones-db.test.mjs`):
#      lo que llega del navegador no se guarda tal cual, el tope existe, la
#      posición no choca, una fila que ya no está no revienta y nada toca las
#      apps de otra cuenta.
#   3. La pantalla SERVIDA la recorre la guía (`scripts/generar-guia-integraciones.sh`),
#      con sesión y datos: cada receta de `capturar-guia-integraciones.mjs`
#      pulsa los mandos de verdad —agregar, editar, ordenar, buscar, eliminar,
#      la pestaña en Chats— y se cae si alguno no está o no hace lo que dice.
#
# `MODO=roto` lee y empaqueta el código de `ANTES_REF` —pinchado a un commit,
# nunca `origin/main`, que en cuanto esto se fusione sería el «ahora»— y
# AFIRMA los fallos.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
MODO="${MODO:-bueno}"
# ab6b110 — antes de esto: una dirección javascript: se guardaba y se ejecutaba
# en la pestaña de Chats, una sin https:// abría la propia App, el máximo de 10
# no existía y borrar era de un clic.
ANTES_REF="${ANTES_REF:-ab6b110}"
export MODO ANTES_REF

RAIZ="$(pwd)"
OUT="$RAIZ/lib/__tests__/.compilado"
mkdir -p "$OUT/integraciones" "$OUT/integraciones-db"
ARBOL=""
limpiar() { if [ -n "$ARBOL" ]; then git worktree remove --force "$ARBOL" >/dev/null 2>&1 || true; fi; }
trap limpiar EXIT

# ── 1. Las reglas y el barrido ───────────────────────────────────────────
if [ "$MODO" != "roto" ]; then
  npx esbuild lib/integraciones.ts --bundle --platform=node --format=esm \
    --outdir="$OUT/integraciones" --log-level=error
fi
node --test lib/__tests__/integraciones.test.mjs

# ── 2. Las acciones contra Postgres ──────────────────────────────────────
PGDIR=/tmp/pgintegraciones
PORT=55547
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
  cp lib/__tests__/fingido/entrada-de-integraciones.ts lib/__tests__/fingido/auth-de-documentos.ts \
     lib/__tests__/fingido/next-cache.ts "$ARBOL/lib/__tests__/fingido/"
  DESDE="$ARBOL"
fi
(cd "$DESDE" && npx esbuild lib/__tests__/fingido/entrada-de-integraciones.ts --bundle \
  --platform=node --format=esm --outdir="$OUT/integraciones-db" \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --log-level=error)
sed -i '/server-only/d' "$OUT/integraciones-db/entrada-de-integraciones.js"
node --test lib/__tests__/integraciones-db.test.mjs
