#!/usr/bin/env bash
# El banco de las archivadas y resueltas que vuelven a la bandeja.
#
# Solo un mensaje DEL CONTACTO posterior a la marca la levanta: un saliente
# (seguimiento, recordatorio, IA) ya no reabre una resuelta, y el contacto que
# escribe saca su conversacion del archivo. Postgres de usar y tirar con el
# esquema real y el barrido de produccion. Corre en DOS modos: el roto lleva la
# regla de 9c0e76d (se comprueba aqui que es la de ese commit) y AFIRMA los dos
# fallos.
set -euo pipefail
cd "$(dirname "$0")/.."

ANTES_REF="${ANTES_REF:-9c0e76d}"
export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"

# El «antes» que se escribe literal en el test tiene que ser el de ese commit.
git show "$ANTES_REF:lib/total-de-todos.ts" | grep -q 'return ultimoMensajeMs <= resueltaEnMs;' \
  || { echo "la regla de antes ya no es la de $ANTES_REF" >&2; exit 1; }
if git show "$ANTES_REF:actions/chat-conversation-actions.ts" | grep -q '"archivedAt" = NULL'; then
  echo "en $ANTES_REF ya habia barrido del archivo: el modo roto no reproduce nada" >&2; exit 1
fi

PGDIR=/tmp/pgreapertura
PORT=55493
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

OUT=lib/__tests__/.compilado/reapertura
mkdir -p "$OUT"
npx esbuild lib/__tests__/fingido/entrada-de-reapertura.ts --bundle \
  --platform=node --format=esm --outfile="$OUT/entrada-de-reapertura.js" \
  --alias:@="$(pwd)" \
  --external:@prisma/client --external:server-only --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-reapertura.js"

echo "=== MODO BUENO ==="
node --test lib/__tests__/reapertura-db.test.mjs
echo
echo "=== MODO ROTO ($ANTES_REF) ==="
MODO=roto node --test lib/__tests__/reapertura-db.test.mjs
