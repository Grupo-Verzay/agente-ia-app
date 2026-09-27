#!/usr/bin/env bash
# El banco de MENCIONAR A UN COMPAÑERO dentro de una conversación de Chats.
#
# Tres mitades:
#
#   1. La REGLA, pura (lib/acceso-por-mencion.ts): quién recibe acceso, quién
#      lo puede quitar, cuándo deja de valer y qué ve un agente.
#   2. Un BARRIDO del código: las dos campanitas usan el MISMO enlace, resolver
#      limpia los accesos, la pantalla pasa por el gate del invitado y la @ se
#      ofrece también escribiendo al cliente.
#   3. Las ACCIONES contra POSTGRES: mencionar avisa y abre la conversación al
#      agente sin cambiar su dueño ni tocar los participantes; el dueño se lo
#      quita; resolver se lo quita solo.
#
# `MODO=roto` corre `createInternalNoteAction` y `resolveSession` de ANTES_REF
# —sacados de git, pinchados a un commit y nunca a `origin/main`— y AFIRMA el
# fallo: mencionar no abría nada y se avisaba a gente de fuera del equipo.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-2017da3}"

OUT=lib/__tests__/.compilado/mencion
mkdir -p "$OUT"

# ── 1. La regla ─────────────────────────────────────────────────────────────
npx esbuild lib/acceso-por-mencion.ts --bundle --platform=node --format=esm \
  --outdir="$OUT" --log-level=error

# ── 3. Las acciones contra Postgres ────────────────────────────────────────
PGDIR=/tmp/pgmencion
PORT=55511
if [ ! -f "$PGDIR/PG_VERSION" ]; then
  rm -rf "$PGDIR"; mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
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

ENTRADA=entrada-de-la-mencion
ANTES_DIR=lib/__tests__/.antes/mencion
trap 'rm -rf "$ANTES_DIR"' EXIT
if [ "$MODO" = "roto" ]; then
  mkdir -p "$ANTES_DIR/actions"
  git show "$ANTES_REF:actions/internal-notes-actions.ts" > "$ANTES_DIR/actions/internal-notes-actions.ts"
  git show "$ANTES_REF:actions/advisor-assign-actions.ts" > "$ANTES_DIR/actions/advisor-assign-actions.ts"
  ENTRADA=entrada-de-la-mencion-antes
fi

npx esbuild "lib/__tests__/fingido/$ENTRADA.ts" --bundle \
  --platform=node --format=esm --outfile="$OUT/$ENTRADA.js" \
  --alias:@="$(pwd)" \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-finanzas.ts \
  --alias:@/actions/conversation-intelligence-actions=./lib/__tests__/fingido/intel-muda.ts \
  --alias:@/actions/google-sheets-actions=./lib/__tests__/fingido/intel-muda.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --external:@prisma/client --external:server-only \
  --loader:.tsx=tsx --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error
sed -i '/server-only/d' "$OUT/$ENTRADA.js"

node --test --test-concurrency=1 \
  lib/__tests__/acceso-por-mencion.test.mjs \
  lib/__tests__/acceso-por-mencion-db.test.mjs "$@"
