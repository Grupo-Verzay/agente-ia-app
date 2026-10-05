#!/usr/bin/env bash
# El DDL que cada proceso corre al arrancar no puede bloquear la base.
# (Caída del 2026-10-05: un ALTER a pelo detrás de una lectura larga dejó
# toda la plataforma en «mantenimiento».) MODO=roto corre el ALTER de antes
# (557d7ea) y AFIRMA que las lecturas se quedaban en cola.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/usr/lib/postgresql/16/bin:$PATH"
PGDIR=/tmp/pgddlsinbloquear
PORT=55541
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
OUT=lib/__tests__/.compilado/ddl-sin-bloquear
mkdir -p "$OUT"
npx esbuild lib/__tests__/fingido/entrada-de-ddl-sin-bloquear.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" \
  --external:@prisma/client --external:server-only --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-ddl-sin-bloquear.js"
node --test lib/__tests__/ddl-sin-bloquear-db.test.mjs
echo; echo "── con el ALTER de antes: tiene que afirmar el bloqueo ──"
MODO=roto node --test lib/__tests__/ddl-sin-bloquear-db.test.mjs
