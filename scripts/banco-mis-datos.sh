#!/usr/bin/env bash
# El banco de MIS DATOS: la importación, la gestión de datos externos y la base
# de conocimiento se leen y se guardan con la CUENTA ACTIVA, como el resto de
# módulos, y no con la fila de la persona que entró.
#
# Las acciones de verdad contra Postgres (lo único fingido es `currentUser()`).
# Y no duplican a un cliente por la FORMA de su número
# (`mis-datos-sin-duplicados-db.test.mjs`).
#
# Corre dos veces: la segunda con `MODO=roto`, que le da a las acciones el id de
# antes (`user.id`), corre el código de ANTES_MIS_DATOS_REF y AFIRMA los fallos.
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

# Las mismas acciones con el código de ANTES_MIS_DATOS_REF —pinchado a un
# commit, nunca origin/main—, para que el modo roto de «sin duplicados» corra
# el código viejo de verdad. La entrada del banco es la de hoy: solo exporta.
ANTES_MIS_DATOS_REF="${ANTES_MIS_DATOS_REF:-ab6b110}"
ARBOL=/tmp/banco-mis-datos-antes
git worktree remove --force "$ARBOL" >/dev/null 2>&1 || rm -rf "$ARBOL"
git worktree add --detach "$ARBOL" "$ANTES_MIS_DATOS_REF" >/dev/null 2>&1
cp lib/__tests__/fingido/entrada-de-mis-datos.ts lib/__tests__/fingido/auth-de-documentos.ts \
   lib/__tests__/fingido/next-cache.ts lib/__tests__/fingido/react-cache.ts "$ARBOL/lib/__tests__/fingido/"
ln -s "$PWD/node_modules" "$ARBOL/node_modules"
OUT_ANTES="$PWD/lib/__tests__/.compilado/mis-datos-antes"
mkdir -p "$OUT_ANTES"
( cd "$ARBOL" && npx esbuild lib/__tests__/fingido/entrada-de-mis-datos.ts --bundle \
    --platform=node --format=esm --outdir="$OUT_ANTES" \
    --external:@prisma/client --external:server-only --external:openai \
    --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:react=./lib/__tests__/fingido/react-cache.ts \
    "--banner:js=import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" \
    --log-level=error )
sed -i '/server-only/d' "$OUT_ANTES/entrada-de-mis-datos.js"
git worktree remove --force "$ARBOL" >/dev/null 2>&1 || true

node --test lib/__tests__/mis-datos-cuenta-activa-db.test.mjs lib/__tests__/mis-datos-sin-duplicados-db.test.mjs "$@"

echo
echo "── con el código de ANTES: tiene que afirmar el fallo ──"
MODO=roto node --test lib/__tests__/mis-datos-cuenta-activa-db.test.mjs lib/__tests__/mis-datos-sin-duplicados-db.test.mjs
