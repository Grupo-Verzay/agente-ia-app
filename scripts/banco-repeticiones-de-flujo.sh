#!/usr/bin/env bash
# El banco de las repeticiones controladas de un flujo (lado de la App).
#
#  - la regla pura y un barrido de la pantalla (`repeticiones-de-flujo.test.mjs`);
#  - las ACCIONES de verdad contra Postgres (`repeticiones-de-flujo-db.test.mjs`):
#    un flujo sin ajuste lee 1 vez y sin espera, el dueño guarda y se lee
#    igual, volver a lo de siempre borra la fila, un agente no escribe y otra
#    cuenta no alcanza el flujo.
#
# Quien APLICA la regla al disparar es el backend: su banco es
# `api-webhook/scripts/banco-repeticiones-de-flujo.sh`.
#
# Y corre además con la pantalla de ANTES (`MODO=roto`, `git show ANTES_REF`),
# donde se AFIRMA que no había forma de configurarlo.
set -euo pipefail
cd "$(dirname "$0")/.."

export ANTES_REF="${ANTES_REF:-e72e56d}"
export PATH="/usr/lib/postgresql/16/bin:$PATH"
PGDIR=/tmp/pgrepeticionesapp
PORT=55493

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

OUT=lib/__tests__/.compilado/repeticiones
mkdir -p "$OUT"

npx esbuild lib/repeticiones-de-flujo.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" --log-level=error

npx esbuild lib/__tests__/fingido/entrada-de-repeticiones-de-flujo.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-repeticiones-de-flujo.js"

node --test lib/__tests__/repeticiones-de-flujo.test.mjs \
            lib/__tests__/repeticiones-de-flujo-db.test.mjs "$@"

echo
echo "── con la pantalla de ANTES ($ANTES_REF): tiene que afirmar el fallo ──"
MODO=roto node --test lib/__tests__/repeticiones-de-flujo.test.mjs \
                      lib/__tests__/repeticiones-de-flujo-db.test.mjs
