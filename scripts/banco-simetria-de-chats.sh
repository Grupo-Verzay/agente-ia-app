#!/usr/bin/env bash
# La simetría de Chats: la raya, las tres barras de escribir, los pies fijos de
# los paneles y los cuatro menús de la columna.
#
# Dos mitades, y las dos en dos modos:
#
# 1. Sin navegador (`lib/__tests__/simetria-de-chats.test.mjs`): los números de
#    la barra y del pie, el botón único del copiloto, y un barrido del código.
#    `MODO=roto` lee los mismos ficheros de `ANTES_REF` y AFIRMA el fallo.
# 2. En Chromium sobre la página SERVIDA (`scripts/probar-simetria-de-chats.mjs`),
#    a 1440, 1280 y 1024. `MODO=roto` necesita `BUILD_ANTES=<un .next de
#    ANTES_REF>`: lo pone en su sitio, mide, y exige que la MEDIDA falle
#    (salida 1; un 2 es que no se pudo medir y no reproduce nada).
#
# Uso:  scripts/banco-simetria-de-chats.sh              (hace falta `npx next build`)
#       MODO=roto BUILD_ANTES=/ruta/.next scripts/banco-simetria-de-chats.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export ANTES_REF="${ANTES_REF:-c0d2a50}"
MODO="${MODO:-bueno}"

# ── 1. Sin navegador ─────────────────────────────────────────────────────────
npx tsc lib/barra-de-escribir.ts --outDir lib/__tests__/.compilado/simetria \
  --module es2022 --target es2022 --lib es2022,dom --moduleResolution bundler --skipLibCheck
mkdir -p lib/__tests__/.antes/simetria
git show "$ANTES_REF:lib/barra-de-escribir.ts" > lib/__tests__/.antes/simetria/barra-de-escribir.ts
npx tsc lib/__tests__/.antes/simetria/barra-de-escribir.ts --outDir lib/__tests__/.compilado/simetria-antes \
  --module es2022 --target es2022 --lib es2022,dom --moduleResolution bundler --skipLibCheck
MODO="$MODO" node --test lib/__tests__/simetria-de-chats.test.mjs

# ── 2. En Chromium, sobre la página servida ──────────────────────────────────
PGDIR=/tmp/pgbarra
PORT=55481
APP=3931

# El servidor que escucha en el puerto se llama `next-server`, no `next start`:
# se apaga por el PUERTO, que es lo único que no cambia de nombre.
apagar() { fuser -k "$APP/tcp" >/dev/null 2>&1 || true; sleep 1; }

if [ "$MODO" = roto ]; then
  : "${BUILD_ANTES:?MODO=roto necesita BUILD_ANTES=<un .next construido desde $ANTES_REF>}"
  apagar
  rm -rf .next-ahora && mv .next .next-ahora
  cp -r "$BUILD_ANTES" .next
  trap 'fuser -k '"$APP"'/tcp >/dev/null 2>&1 || true; sleep 1; rm -rf .next; mv .next-ahora .next' EXIT
fi

if [ ! -d .next/static/css ]; then
  echo "No hay build: esto mide sobre el CSS y el servidor del build ('npx next build')." >&2
  exit 1
fi

if [ ! -d "$PGDIR" ]; then
  mkdir -p "$PGDIR"
  chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true

export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APP" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco \
       S3_ACCESS_KEY=banco S3_SECRET_KEY=banco S3_ENDPOINT=localhost \
       S3_PUBLIC_URL=http://localhost:9000 GEMINI_API_KEY=banco \
       NEXT_TELEMETRY_DISABLED=1

npx prisma db push --skip-generate --accept-data-loss >/dev/null
psql "$DATABASE_URL" -c \
  'ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT;' >/dev/null
node scripts/sembrar-barra.mjs >/dev/null
node scripts/sembrar-equipo-largo.mjs >/dev/null
# Una SEGUNDA línea: con una sola el selector de Canales no se pinta y uno de
# los cuatro menús de la columna no se mediría.
psql "$DATABASE_URL" -c "
  INSERT INTO \"Instancias\" (\"instanceName\", display_name, \"userId\", \"instanceId\", \"instanceType\")
  SELECT 'BANCO_ATENCION', 'Atencion', u.id, 'inst-banco-2', 'waha' FROM \"User\" u
  WHERE u.email = 'jefe@banco.test'
    AND NOT EXISTS (SELECT 1 FROM \"Instancias\" WHERE \"instanceName\" = 'BANCO_ATENCION');" >/dev/null

if ! curl -sf -o /dev/null "http://localhost:$APP/login"; then
  setsid npx next start -p "$APP" >/tmp/banco-simetria-next.log 2>&1 </dev/null &
  for _ in $(seq 1 60); do
    curl -sf -o /dev/null "http://localhost:$APP/login" && break
    sleep 1
  done
fi

if [ "$MODO" = roto ]; then
  set +e
  node scripts/probar-simetria-de-chats.mjs
  salida=$?
  set -e
  if [ "$salida" -ne 1 ]; then
    echo "MODO=roto: la sonda salió con $salida — o todo cuadra (este .next no es el de antes) o no se llegó a medir" >&2
    exit 1
  fi
  echo "MODO=roto: reproduce el fallo — barras y pies de distinto alto, rótulos repetidos y menús sobre la raya"
else
  node scripts/probar-simetria-de-chats.mjs
fi
