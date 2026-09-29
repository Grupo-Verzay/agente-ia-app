#!/usr/bin/env bash
# El banco de MIS DATOS: la importación, la gestión de datos externos y la base
# de conocimiento se leen y se guardan con la CUENTA ACTIVA, como el resto de
# módulos, y no con la fila de la persona que entró.
#
# Las acciones de verdad contra Postgres (lo único fingido es `currentUser()`).
# Corre dos veces: la segunda con `MODO=roto`, que le da a las acciones el id de
# antes (`user.id`) y AFIRMA el fallo.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:$PATH"
PGDIR=/tmp/pgmisdatos
PORT=55541
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

OUT=lib/__tests__/.compilado/mis-datos
mkdir -p "$OUT"
npx esbuild lib/__tests__/fingido/entrada-de-mis-datos.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" \
  --external:@prisma/client --external:server-only --external:openai \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  "--banner:js=import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-mis-datos.js"

node --test lib/__tests__/mis-datos-cuenta-activa-db.test.mjs "$@"

echo
echo "── con el id de ANTES (user.id): tiene que afirmar el fallo ──"
MODO=roto node --test lib/__tests__/mis-datos-cuenta-activa-db.test.mjs
