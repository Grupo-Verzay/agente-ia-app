#!/usr/bin/env bash
# El «No autorizado» del Contexto del lead, con las ACCIONES de verdad contra
# Postgres (`lib/__tests__/contexto-del-lead-db.test.mjs`).
#
# Corre dos veces: con el código de hoy y con el de `ANTES_REF` (sacado con
# `git show`), donde se AFIRMA el fallo — sin ese modo no se sabría si lo verde
# es que se arregló la causa o que el caso no se ejerce.
set -euo pipefail
cd "$(dirname "$0")/.."

export ANTES_REF="${ANTES_REF:-c0d2a50}"
export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgcontexto
PORT=55482

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

OUT=lib/__tests__/.compilado/contexto
ANTES=lib/__tests__/.antes/contexto
mkdir -p "$OUT" "$ANTES"
git show "$ANTES_REF:actions/sales-playbook-actions.ts" > "$ANTES/sales-playbook-actions.ts"
git show "$ANTES_REF:actions/lead-score-action.ts" > "$ANTES/lead-score-action.ts"

for entrada in entrada-del-contexto-del-lead entrada-del-contexto-del-lead-antes; do
  npx esbuild "lib/__tests__/fingido/$entrada.ts" --bundle \
    --platform=node --format=esm --outdir="$OUT" \
    --external:@prisma/client --external:server-only --external:openai \
    --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:react=./lib/__tests__/fingido/react-cache.ts \
    --banner:js="import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" \
    --log-level=error
  sed -i '/server-only/d' "$OUT/$entrada.js"
done

node --test lib/__tests__/contexto-del-lead-db.test.mjs "$@"

echo
echo "── con el código de ANTES ($ANTES_REF): tiene que afirmar el fallo ──"
MODO=roto node --test lib/__tests__/contexto-del-lead-db.test.mjs
