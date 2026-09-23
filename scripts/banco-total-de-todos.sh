#!/usr/bin/env bash
# El banco del contador de «Todos»: cuenta lo mismo que la lista enseña.
#
# Postgres de usar y tirar con el esquema REAL (`prisma db push`) y las
# funciones de PRODUCCION: el COUNT del servidor, resolver y reabrir, y la regla
# que corrige el numero en el navegador. Corre en DOS modos: el roto lleva la
# consulta y la cuenta de antes escritas en el test y AFIRMA el fallo (resolver
# no baja el numero, ni recontando).
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"

PGDIR=/tmp/pgtodos
PORT=55481

if [ ! -f "$PGDIR/PG_VERSION" ]; then
  rm -rf "$PGDIR"
  mkdir -p "$PGDIR"
  chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "/usr/lib/postgresql/16/bin/createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true

export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
# Relleno: el paquete arrastra la validacion de entorno del servidor.
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

OUT=lib/__tests__/.compilado/todos
mkdir -p "$OUT"
npx esbuild lib/__tests__/fingido/entrada-de-todos.ts --bundle \
  --platform=node --format=esm --outfile="$OUT/entrada-de-todos.js" \
  --alias:@="$(pwd)" \
  --external:@prisma/client --external:server-only --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-todos.js"

echo "=== MODO BUENO ==="
node --test lib/__tests__/total-de-todos-db.test.mjs
echo
echo "=== MODO ROTO (la consulta y la cuenta de antes: resolver no baja el numero) ==="
MODO=roto node --test lib/__tests__/total-de-todos-db.test.mjs
