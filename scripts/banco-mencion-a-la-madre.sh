#!/usr/bin/env bash
# El banco de MENCIONAR, desde la nota interna de una conversación, a los
# ADMINISTRADORES DE LA CUENTA MADRE.
#
# Tres mitades:
#
#   1. La REGLA, pura (lib/menciones-de-la-madre.ts): quién es la madre en la
#      malla de linked_accounts, qué ofrece el selector y cómo se reparten los
#      ids que llegan del navegador.
#   2. Un BARRIDO del código: la pantalla ofrece a los de la madre con la MISMA
#      fila que a los del equipo, y la ventana que interrumpe enseña ENTERA una
#      mención.
#   3. Las ACCIONES contra POSTGRES: la hija ve a los administradores de su
#      madre por su nombre; mencionarlos les saca la ventana con la nota entera;
#      y no se abre nada —ni acceso por mención, ni la madre a la hija, ni la
#      hija a la madre—.
#
# `MODO=roto` corre `createInternalNoteAction` de ANTES_REF —pinchado a un
# commit, nunca `origin/main`— y AFIRMA el fallo: la mención a un administrador
# de la madre se descartaba y no le saltaba nada.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-f3f296c}"
export ANTES_REF

OUT=lib/__tests__/.compilado/mencion-madre
mkdir -p "$OUT"

# ── 1. La regla ─────────────────────────────────────────────────────────────
npx esbuild lib/menciones-de-la-madre.ts --bundle --platform=node --format=esm \
  --outdir="$OUT" --log-level=error

# ── 3. Las acciones contra Postgres ────────────────────────────────────────
PGDIR=/tmp/pgmencionmadre
PORT=55512
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

ENTRADA=entrada-de-la-mencion-a-la-madre
ANTES_DIR=lib/__tests__/.antes/mencion-madre
trap 'rm -rf "$ANTES_DIR"' EXIT
if [ "$MODO" = "roto" ]; then
  mkdir -p "$ANTES_DIR/actions"
  git show "$ANTES_REF:actions/internal-notes-actions.ts" > "$ANTES_DIR/actions/internal-notes-actions.ts"
  ENTRADA=entrada-de-la-mencion-a-la-madre-antes
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
  lib/__tests__/mencion-a-la-madre.test.mjs \
  lib/__tests__/mencion-a-la-madre-db.test.mjs "$@"
