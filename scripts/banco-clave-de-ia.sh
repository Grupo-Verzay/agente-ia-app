#!/usr/bin/env bash
# El banco de la clave de IA: lo que viaja al navegador no la lleva.
#
# Tres mitades:
#  - la decisión pura y un barrido del código (`clave-de-ia-para-el-navegador.test.mjs`);
#  - las ACCIONES de verdad contra Postgres (`clave-de-ia-db.test.mjs`): Perfil
#    recibe «hay clave y termina en …» y nunca la clave; guardar vacío la
#    conserva; `resolveUserAiClient` sigue funcionando en el servidor.
#
# Y las dos corren además con el código de antes (`MODO=roto`, sacado con
# `git show` de `ANTES_REF`), donde se AFIRMA el fallo: la clave en claro en la
# respuesta. Sin ese modo no se sabría si lo verde es que se arregló o que el
# caso no se ejerce.
set -euo pipefail
cd "$(dirname "$0")/.."

export ANTES_REF="${ANTES_REF:-5e03716a}"
export PATH="/usr/lib/postgresql/16/bin:$PATH"
PGDIR=/tmp/pgclavedeia
PORT=55481

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

OUT=lib/__tests__/.compilado/clave-de-ia
ANTES=lib/__tests__/.antes/clave-de-ia
mkdir -p "$OUT" "$ANTES"
git show "$ANTES_REF:actions/userAiconfig-actions.ts" > "$ANTES/userAiconfig-actions.ts"

npx esbuild lib/clave-de-ia-para-el-navegador.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" --log-level=error

for entrada in entrada-de-la-clave-de-ia entrada-de-la-clave-de-ia-antes; do
  npx esbuild "lib/__tests__/fingido/$entrada.ts" --bundle \
    --platform=node --format=esm --outdir="$OUT" \
    --external:@prisma/client --external:server-only \
    --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:react=./lib/__tests__/fingido/react-cache.ts \
    --log-level=error
  sed -i '/server-only/d' "$OUT/$entrada.js"
done

node --test lib/__tests__/clave-de-ia-para-el-navegador.test.mjs \
            lib/__tests__/clave-de-ia-db.test.mjs "$@"

echo
echo "── con el código de ANTES ($ANTES_REF): tiene que afirmar el fallo ──"
MODO=roto node --test lib/__tests__/clave-de-ia-para-el-navegador.test.mjs \
                      lib/__tests__/clave-de-ia-db.test.mjs
