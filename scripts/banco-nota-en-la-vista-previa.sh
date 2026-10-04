#!/usr/bin/env bash
# La NOTA INTERNA en la vista previa de la fila de Chats.
#
# Cuando la nota es lo último que pasó en la conversación, la fila enseña
# «🔒 su texto» donde va el último mensaje; en cuanto llega o sale un mensaje,
# la vista previa vuelve a ser ese mensaje y la nota se queda solo en el
# candado de la fila de iconitos.
#
# Tres mitades:
#   1. La regla (`lib/nota-en-la-vista-previa.ts`) y un barrido del código: que
#      la lista PASA por ella y que el aviso de la conversación abierta trae el
#      texto, no solo «tiene notas».
#   2. Las acciones de verdad contra Postgres: la lista de la bandeja y la fila
#      de una sesión traen la última nota con su texto y su hora, y la puerta
#      no se afloja (la madre ve las de su hija, la hija no las de su madre).
#   3. La bandeja SERVIDA en Chromium (`scripts/probar-nota-en-la-vista-previa.mjs`):
#      lo que se ve en la fila al entrar, al escribir una nota desde la
#      conversación abierta, al recargar y al llegar un mensaje.
#
# Uso:  scripts/banco-nota-en-la-vista-previa.sh   (hace falta `npx next build`)
#       SOLO=reglas                               (solo las mitades 1 y 2)
#       MODO=roto BUILD_ANTES=<.next>             con un build del commit de
#                                                 antes; afirma el fallo.
#
# El «antes» va PINCHADO a un commit, nunca a `origin/main`: en cuanto esto se
# fusione, `origin/main` sería el «ahora» y el modo roto pasaría sin reproducir
# nada. El build del «antes» se hace así:
#
#   git worktree add -f /tmp/antes-nota 2fda6a3
#   ln -s "$PWD/node_modules" /tmp/antes-nota/node_modules
#   (cd /tmp/antes-nota && npx next build)
#   MODO=roto BUILD_ANTES=/tmp/antes-nota/.next scripts/banco-nota-en-la-vista-previa.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
# 2fda6a3 — antes de esto: la fila enseñaba el candado de la nota y nunca su texto.
ANTES_REF="${ANTES_REF:-2fda6a3}"
export MODO
mkdir -p lib/__tests__/.compilado

# ── 1. La regla y el barrido ─────────────────────────────────────────────────
if [ "$MODO" = "roto" ]; then
  W="$(mktemp -d)/antes"
  git worktree add -f "$W" "$ANTES_REF" -q
  DIR_ANTES="$W" node --test lib/__tests__/nota-en-la-vista-previa.test.mjs
  git worktree remove --force "$W" >/dev/null 2>&1 || true
else
  npx esbuild lib/nota-en-la-vista-previa.ts --bundle --platform=node --format=esm \
    --outdir=lib/__tests__/.compilado --log-level=error
  node --test lib/__tests__/nota-en-la-vista-previa.test.mjs
fi

# ── 2. Las acciones contra Postgres ──────────────────────────────────────────
PGDIR=/tmp/pgnotavistaprevia
PORT=55541
if [ ! -f "$PGDIR/PG_VERSION" ]; then
  rm -rf "$PGDIR"; mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true

(
  export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
  export DIRECT_URL="$DATABASE_URL"
  export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
    CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
    S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco
  npx prisma db push --skip-generate --accept-data-loss >/dev/null

  ENTRADA=entrada-de-la-nota-en-la-vista-previa
  if [ "$MODO" = "roto" ]; then
    # Las dos acciones tal cual estaban: se copian al lado y sus `./` relativos
    # se apuntan a las de hoy (solo cambia lo que se viene a probar).
    ANTES=lib/__tests__/.antes/nota-vista-previa/actions
    rm -rf lib/__tests__/.antes/nota-vista-previa
    mkdir -p "$ANTES"
    trap 'rm -rf lib/__tests__/.antes/nota-vista-previa' EXIT
    git show "$ANTES_REF:actions/internal-notes-actions.ts" >"$ANTES/internal-notes-actions.ts"
    git show "$ANTES_REF:actions/session-action.ts" >"$ANTES/session-action.ts"
    sed -i "s#from '\./#from '@/actions/#g; s#from \"\./#from \"@/actions/#g" "$ANTES"/*.ts
    ENTRADA="$ENTRADA-antes"
  fi

  OUT=lib/__tests__/.compilado/nota-vista-previa
  npx esbuild "lib/__tests__/fingido/$ENTRADA.ts" --bundle --platform=node --format=esm \
    --outdir="$OUT" --alias:@="$(pwd)" \
    --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-finanzas.ts \
    --alias:@/actions/conversation-intelligence-actions=./lib/__tests__/fingido/intel-muda.ts \
    --alias:@/actions/google-sheets-actions=./lib/__tests__/fingido/intel-muda.ts \
    --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
    --alias:react=./lib/__tests__/fingido/react-cache.ts \
    --external:@prisma/client --external:server-only \
    --loader:.tsx=tsx --jsx=automatic \
    --define:process.env.NODE_ENV='"production"' --log-level=error
  sed -i '/server-only/d' "$OUT/$ENTRADA.js"
  node --test lib/__tests__/nota-en-la-vista-previa-db.test.mjs
)

if [ "${SOLO:-}" = "reglas" ]; then
  echo "[banco] solo la regla y las acciones, como se pidió."
  exit 0
fi

# ── 3. La bandeja, sobre la página servida ───────────────────────────────────
if [ "$MODO" = "roto" ]; then
  if [ -z "${BUILD_ANTES:-}" ]; then
    echo "MODO=roto necesita BUILD_ANTES=<un .next construido desde $ANTES_REF>" >&2
    exit 1
  fi
  # Se MUEVE, no se enlaza: con un enlace simbólico el servidor no resuelve
  # `node_modules` y se cae antes de ejercer un solo caso.
  rm -rf .next.ahora && mv .next .next.ahora 2>/dev/null || true
  cp -r "$BUILD_ANTES" .next
fi

devolverElBuild() {
  if [ -d .next.ahora ]; then
    rm -rf .next
    mv .next.ahora .next
  fi
}

if [ ! -d .next/static/css ]; then
  devolverElBuild
  echo "No hay build: esto se mide sobre el servidor del build ('npx next build')." >&2
  exit 1
fi

PGWEB=/tmp/pgnotavistaprevia-web
PORTWEB=55542
APP=3941

if [ ! -f "$PGWEB/PG_VERSION" ]; then
  rm -rf "$PGWEB"; mkdir -p "$PGWEB"; chown postgres:postgres "$PGWEB"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGWEB -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGWEB -o '-p $PORTWEB -k $PGWEB' -l $PGWEB/log start" >/dev/null 2>&1 || true
sleep 2

# El servidor de la vuelta anterior se mata ANTES del `dropdb` (su conexión lo
# dejaría sin efecto), y por el PUERTO: `next start` se reexpone como
# `next-server` y un `pkill` por la línea de órdenes no lo alcanza.
pkill -f "next start -p $APP" 2>/dev/null || true
fuser -k -n tcp "$APP" 2>/dev/null || true
for _ in $(seq 1 15); do
  curl -sf -o /dev/null "http://localhost:$APP/login" || break
  sleep 1
done
if curl -sf -o /dev/null "http://localhost:$APP/login"; then
  devolverElBuild
  echo "el puerto $APP sigue ocupado: mata lo que escuche ahí antes de correr el banco" >&2
  exit 1
fi
su postgres -c "dropdb -h $PGWEB -p $PORTWEB -U postgres --force --if-exists banco" >/dev/null 2>&1 || true
su postgres -c "createdb -h $PGWEB -p $PORTWEB -U postgres banco"

export DATABASE_URL="postgresql://postgres@localhost:$PORTWEB/banco?host=$PGWEB"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APP" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco \
       S3_ACCESS_KEY=banco S3_SECRET_KEY=banco S3_ENDPOINT=localhost \
       S3_PUBLIC_URL=http://localhost:9000 GEMINI_API_KEY=banco \
       NEXT_TELEMETRY_DISABLED=1

npx prisma db push --skip-generate --accept-data-loss >/dev/null
# Existe en producción por un ALTER en caliente y no en schema.prisma: sin ella
# la bandeja se cae con 42703 (ver la regla del sufijo de dispositivo).
psql "$DATABASE_URL" -c \
  'ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT;' >/dev/null
# Las dos las crea el backend con sus migraciones y la App las lee en crudo (el
# sello de espera y la resolución): sin ellas la bandeja escribe un 42703 por
# vuelta y la fila no sabe si la conversación está resuelta.
psql "$DATABASE_URL" -c \
  'ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP(3), ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP(3);' >/dev/null

node scripts/sembrar-barra.mjs >/dev/null
node scripts/sembrar-no-leido.mjs >/dev/null
node scripts/sembrar-nota-en-la-vista-previa.mjs

setsid npx next start -p "$APP" >/tmp/banco-nota-en-la-vista-previa-next.log 2>&1 </dev/null &
SERVIDOR=$!
trap 'kill -- -$SERVIDOR 2>/dev/null || pkill -f "next start -p '"$APP"'" || true; devolverElBuild' EXIT
for _ in $(seq 1 90); do
  curl -sf -o /dev/null "http://localhost:$APP/login" && break
  sleep 1
done

export BASE="http://localhost:$APP"
node scripts/probar-nota-en-la-vista-previa.mjs
