#!/usr/bin/env bash
# El banco del prompt maestro por cuenta (lado de la App: quién lo ESCRIBE).
#
#  - la regla pura y un barrido de la pantalla (`prompt-maestro-de-cuenta.test.mjs`);
#  - las ACCIONES de verdad contra Postgres (`prompt-maestro-de-cuenta-db.test.mjs`):
#    una cuenta sin prompt propio lee vacío, el dueño de la plataforma guarda y
#    se lee igual, vaciarlo borra la fila, y ni el cliente, ni un admin, ni un
#    super admin metido por «Ingresar» pueden.
#
# Quien lo RECIBE es el agente, en el backend: su banco es
# `api-webhook/scripts/banco-prompt-maestro.sh`, y es el que prueba los dos
# casos del encargo (vacío → global; lleno → el suyo) contra Postgres.
#
# Y corre además con la pantalla de ANTES (`MODO=roto`, `git show ANTES_REF`),
# donde se AFIRMA que no había forma de configurarlo.
set -euo pipefail
cd "$(dirname "$0")/.."

export ANTES_REF="${ANTES_REF:-5f3fd2e}"
export PATH="/usr/lib/postgresql/16/bin:$PATH"
PGDIR=/tmp/pgpromptmaestroapp
PORT=55497

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

OUT=lib/__tests__/.compilado/prompt-maestro
mkdir -p "$OUT"

npx esbuild lib/prompt-maestro-de-cuenta.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" --log-level=error

npx esbuild lib/__tests__/fingido/entrada-del-prompt-maestro.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-del-prompt-maestro.js"

node --test lib/__tests__/prompt-maestro-de-cuenta.test.mjs \
            lib/__tests__/prompt-maestro-de-cuenta-db.test.mjs "$@"

echo
echo "── con la pantalla de ANTES ($ANTES_REF): tiene que afirmar el fallo ──"
MODO=roto node --test lib/__tests__/prompt-maestro-de-cuenta.test.mjs \
                      lib/__tests__/prompt-maestro-de-cuenta-db.test.mjs
