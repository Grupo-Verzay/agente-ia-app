#!/usr/bin/env bash
# Banco de la plantilla maestra de funciones de los planes.
#
# Siembra en un Postgres de usar y tirar los 24 planes de producción (sin
# precios ni enlaces: lib/__tests__/planes-de-produccion.json) con sus listas
# guardadas, y comprueba con las ACCIONES de verdad que:
#   - al abrir el panel se arma UNA plantilla por audiencia (clientes y
#     resellers) con el inventario completo, sin duplicar ninguna función;
#   - cada plan activo queda exactamente como estaba (mismas encendidas, mismo
#     orden, mismas destacadas, misma página pública) y lo que no tenía entra
#     APAGADO y sin destacar;
#   - crear, renombrar o borrar en la plantilla llega a los planes de su
#     audiencia, y una función nueva escrita en un plan entra apagada en los
#     demás;
#   - una versión vieja no pisa nada.
#
#   scripts/banco-plantilla-de-funciones.sh            # modo bueno
#   MODO=roto scripts/banco-plantilla-de-funciones.sh  # el código de ANTES_REF
#
# El modo roto empaqueta las mismas acciones de un commit PINCHADO (nunca
# origin/main) y afirma el fallo: no había plantilla, y una función creada en
# un plan no llegaba a ningún otro.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export MODO="${MODO:-bueno}"
export ANTES_REF="${ANTES_REF:-94fcc3c}"
RAIZ="$PWD"
OUT="lib/__tests__/.compilado/plantilla-de-funciones"
rm -rf "$OUT" && mkdir -p "$OUT/puro"

PGDIR=/tmp/pgplantilla
PORT=55561
if [ ! -f "$PGDIR/PG_VERSION" ]; then
  mkdir -p "$PGDIR" && chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "createdb -h $PGDIR -p $PORT banco" 2>/dev/null || true
export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco
export S3_ACCESS_KEY=banco S3_SECRET_KEY=banco S3_ENDPOINT=http://localhost S3_PUBLIC_URL=https://s3.test
export S3_BUCKET_NAME=verzay-media NEXT_PUBLIC_APP_URL=https://app.test GEMINI_API_KEY=banco
npx prisma db push --skip-generate --accept-data-loss >/dev/null

ALIAS_NODO=(
  --external:@prisma/client --external:server-only --external:next/headers
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts
  --alias:react=./lib/__tests__/fingido/react-cache.ts
  --alias:@/lib/minio=./lib/__tests__/fingido/minio-de-video.ts
  --alias:next/server=./lib/__tests__/fingido/next-server.ts
  --log-level=error
)
BANNER_ESM='import{createRequire as __cr}from "module";import{fileURLToPath as __fu}from "url";import{dirname as __dn}from "path";const require=__cr(import.meta.url);const __filename=__fu(import.meta.url);const __dirname=__dn(__filename);'

# Las reglas puras, siempre del árbol de hoy (en el modo roto no se ejercen).
npx --yes esbuild lib/plantilla-de-funciones.ts lib/pagina-de-plan.ts --bundle --platform=node \
  --format=esm --outdir="$OUT/puro" --external:@prisma/client --log-level=error

if [ "$MODO" = "roto" ]; then
  ANTES="lib/__tests__/.antes/plantilla-de-funciones"
  git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
  git worktree add --detach "$ANTES" "$ANTES_REF" >/dev/null 2>&1
  ln -s "$RAIZ/node_modules" "$ANTES/node_modules"
  cp lib/__tests__/fingido/entrada-de-plantilla-de-funciones-antes.ts \
     "$ANTES/lib/__tests__/fingido/entrada-de-plantilla-de-funciones.ts"
  (cd "$ANTES" && npx --yes esbuild lib/__tests__/fingido/entrada-de-plantilla-de-funciones.ts \
     --bundle --platform=node --format=esm --outdir="$RAIZ/$OUT" --banner:js="$BANNER_ESM" "${ALIAS_NODO[@]}")
  git worktree remove --force "$ANTES" 2>/dev/null || rm -rf "$ANTES"
else
  npx --yes esbuild lib/__tests__/fingido/entrada-de-plantilla-de-funciones.ts --bundle --platform=node \
    --format=esm --outdir="$OUT" --banner:js="$BANNER_ESM" "${ALIAS_NODO[@]}"
fi
sed -i '/server-only/d' "$OUT/entrada-de-plantilla-de-funciones.js"

node --test --test-concurrency=1 lib/__tests__/plantilla-de-funciones.test.mjs
