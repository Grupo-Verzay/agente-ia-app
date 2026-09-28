#!/usr/bin/env bash
# El banco de los RECORDATORIOS DE CITA y de la ZONA DE LA CUENTA.
#
#  - Las reglas puras (`recordatorios-de-la-cita.test.mjs`): cuánto antes sale
#    cada plantilla —una hora ISO ya no se lee como 2026 segundos—, el texto en
#    la zona de la cuenta y el reloj de un recordatorio manual.
#  - Las ACCIONES contra Postgres (`recordatorios-de-la-cita-db.test.mjs`): la
#    cita del chat programa sus recordatorios, la del agente no crea el de ~34
#    minutos y dice la hora de la cuenta, y «Recordatorios» y «Tareas» guardan
#    el instante en el reloj de su cuenta.
#
# Corre dos veces; la segunda (`MODO=roto`) empaqueta lo mismo contra el commit
# de ANTES (`ANTES_REF`, pinchado: nunca `origin/main`) y AFIRMA cada fallo.
set -euo pipefail
cd /home/user/agente-ia-app

export ANTES_REF="${ANTES_REF:-626a48c}"

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgrecordatoriocita
PORT=55491

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
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco \
       BACKEND_URL=http://backend.banco TZ=UTC

npx prisma db push --skip-generate --accept-data-loss >/dev/null

empaquetar() { # $1 = árbol, $2 = salida
  (cd "$1" && npx esbuild lib/__tests__/fingido/entrada-de-recordatorios-de-cita.ts --bundle \
    --platform=node --format=esm --outdir="$2" \
    --banner:js='import{createRequire as __cr}from "module";import{fileURLToPath as __fu}from "url";import{dirname as __dn}from "path";const require=__cr(import.meta.url);const __filename=__fu(import.meta.url);const __dirname=__dn(__filename);' \
    --external:@prisma/client --external:server-only \
    --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
    --alias:@/auth=./lib/__tests__/fingido/sesion-y-cookies.ts \
    --alias:next/headers=./lib/__tests__/fingido/sesion-y-cookies.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:react=./lib/__tests__/fingido/react-con-cache.ts \
    --log-level=error)
  sed -i '/server-only/d' "$2/entrada-de-recordatorios-de-cita.js"
}

SALIDA=$PWD/lib/__tests__/.compilado/recordatorios-de-la-cita
npx esbuild lib/recordatorios-de-la-cita.ts lib/zona-de-la-cuenta.ts --bundle --platform=node \
  --format=esm --outdir="$SALIDA" --log-level=error
empaquetar "$PWD" "$SALIDA"

ANTES=$PWD/lib/__tests__/.antes/recordatorios-de-la-cita
git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
ln -s "$PWD/node_modules" "$ANTES/node_modules"
cp lib/__tests__/fingido/auth-de-documentos.ts lib/__tests__/fingido/sesion-y-cookies.ts \
   lib/__tests__/fingido/next-cache.ts lib/__tests__/fingido/react-con-cache.ts \
   "$ANTES/lib/__tests__/fingido/"
# En el árbol de antes la página pública confirmaba desde `lib/cita-publica.server`
# también; la entrada es la misma.
cp lib/__tests__/fingido/entrada-de-recordatorios-de-cita.ts "$ANTES/lib/__tests__/fingido/"
empaquetar "$ANTES" "$PWD/lib/__tests__/.compilado/recordatorios-de-la-cita-antes"
git worktree remove --force "$ANTES"

node --test --test-concurrency=1 lib/__tests__/recordatorios-de-la-cita.test.mjs \
  lib/__tests__/recordatorios-de-la-cita-db.test.mjs "$@"

echo
echo "── con el código de ANTES ($ANTES_REF): tiene que afirmar cada fallo ──"
MODO=roto node --test --test-concurrency=1 lib/__tests__/recordatorios-de-la-cita.test.mjs \
  lib/__tests__/recordatorios-de-la-cita-db.test.mjs
