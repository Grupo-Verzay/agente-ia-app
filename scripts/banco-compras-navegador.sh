#!/usr/bin/env bash
# El acceso «Compras» de Finanzas sobre la página SERVIDA, en Chromium
# (`scripts/probar-compras-de-finanzas.mjs`). La regla y las acciones tienen su
# banco contra Postgres (`scripts/banco-compras-de-finanzas.sh`); esto es lo
# único que dice que la PANTALLA la cumple: que el acceso abre «Nueva compra»,
# que el proveedor sale de la lista, que se puede crear uno nuevo ahí mismo,
# que «Compras» vuelve a abrir al pulsarlo otra vez, y que «Nuevo gasto» sigue
# donde estaba.
#
# Uso:  scripts/banco-compras-navegador.sh      (hace falta `npx next build` antes)
#       MODO=roto BUILD_ANTES=<.next>           con un build del commit de antes;
#                                               la sonda exige entonces que FALLE.
#
# El «antes» va PINCHADO a un commit, nunca a `origin/main` (en cuanto esto se
# fusione, `origin/main` sería el «ahora»). Se construye así:
#
#   git worktree add -f /tmp/antes-compras fd21c8f
#   ln -s "$PWD/node_modules" /tmp/antes-compras/node_modules
#   (cd /tmp/antes-compras && npx next build)
#   MODO=roto BUILD_ANTES=/tmp/antes-compras/.next scripts/banco-compras-navegador.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO

if [ "$MODO" = "roto" ]; then
  if [ -z "${BUILD_ANTES:-}" ]; then
    echo "MODO=roto necesita BUILD_ANTES=<un .next construido desde el commit de antes>" >&2
    exit 1
  fi
  # Se MUEVE, no se enlaza: con un enlace simbólico el servidor no resuelve
  # `node_modules` y se cae antes de ejercer un solo caso.
  rm -rf .next.ahora && mv .next .next.ahora 2>/dev/null || true
  cp -r "$BUILD_ANTES" .next
fi

# El build de ahora se devuelve SOLO si el modo roto se lo llevó.
devolverElBuild() {
  if [ -d .next.ahora ]; then
    rm -rf .next
    mv .next.ahora .next
  fi
}

if [ ! -d .next/static/css ]; then
  echo "No hay build: esto se mide sobre el servidor del build ('npx next build')." >&2
  devolverElBuild
  exit 1
fi

PGDIR=/tmp/pgcomprasnav
PORT=55532
APP=3934

if [ ! -f "$PGDIR/PG_VERSION" ]; then
  rm -rf "$PGDIR"; mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2

# Lo que quedara escuchando en el puerto se mata ANTES del `dropdb`: su conexión
# dejaría el borrado sin efecto y el banco se caería sin ejercer un solo caso.
pkill -f "next start -p $APP" 2>/dev/null || true
fuser -k -n tcp "$APP" 2>/dev/null || true
for _ in $(seq 1 15); do
  curl -sf -o /dev/null "http://localhost:$APP/login" || break
  sleep 1
done
su postgres -c "dropdb -h $PGDIR -p $PORT -U postgres --force --if-exists banco" >/dev/null 2>&1 || true
su postgres -c "createdb -h $PGDIR -p $PORT -U postgres banco"

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
psql "$DATABASE_URL" -c \
  'ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);' >/dev/null 2>&1 || true

# La cuenta y su menú, y la contabilidad de la guía de Finanzas: cuatro
# proveedores (P-1 a P-4), tres cuentas de dinero con su predeterminada.
node scripts/sembrar-barra.mjs >/dev/null
node scripts/sembrar-guia-finanzas.mjs >/dev/null

setsid npx next start -p "$APP" >/tmp/banco-compras-next.log 2>&1 </dev/null &
SERVIDOR=$!
trap 'kill -- -$SERVIDOR 2>/dev/null || pkill -f "next start -p '"$APP"'" || true; devolverElBuild' EXIT
for _ in $(seq 1 90); do
  curl -sf -o /dev/null "http://localhost:$APP/login" && break
  sleep 1
done

export BASE="http://localhost:$APP"
node scripts/probar-compras-de-finanzas.mjs
