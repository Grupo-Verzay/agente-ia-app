#!/usr/bin/env bash
# Banco del interruptor «Ver número» por agente (Equipo).
#   - la regla pura y un barrido del código (ver-numero-completo.test.mjs)
#   - las acciones de verdad contra Postgres (ver-numero-completo-db.test.mjs)
# MODO=roto lee el código de ANTES_REF y afirma que no existía nada de esto.
set -euo pipefail
cd "$(dirname "$0")/.."
export ANTES_REF="${ANTES_REF:-4c84c02}"
export PATH="/usr/lib/postgresql/16/bin:$PATH"

PGDIR=/tmp/pgvernumero
PORT=55497
if [ ! -d "$PGDIR" ]; then
  mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null || true
sleep 2
su postgres -c "/usr/lib/postgresql/16/bin/createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true
export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

OUT=lib/__tests__/.compilado/ver-numero
mkdir -p "$OUT"
npx esbuild lib/telefono-visible.ts --bundle --platform=node --format=esm --outdir="$OUT" --log-level=error
npx esbuild lib/__tests__/fingido/entrada-del-ver-numero.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" --packages=external \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-del-ver-numero.js"

node --test lib/__tests__/ver-numero-completo.test.mjs lib/__tests__/ver-numero-completo-db.test.mjs "$@"

echo
echo "── con el código de ANTES ($ANTES_REF): tiene que afirmar el fallo ──"
MODO=roto node --test lib/__tests__/ver-numero-completo.test.mjs lib/__tests__/ver-numero-completo-db.test.mjs "$@"
