#!/usr/bin/env bash
# Todo lo que se abre flotando en Chats cabe entero y no queda tapado.
#
# Sobre la página SERVIDA (el build con `next start` contra un Postgres de usar
# y tirar, con sesión de verdad y una conversación de ochenta mensajes), a
# 1440/1280/1024 × zoom 100 % y 80 % × ficha cerrada y abierta, con el mensaje
# al borde de arriba, en medio y al borde de abajo del hilo. Ver
# `scripts/probar-flotantes-del-hilo.mjs`.
#
# Y la decisión, sin navegador: `scripts/banco-paneles-flotantes.sh` (sección
# «La regla común»).
#
# Uso:  scripts/banco-flotantes-del-hilo.sh     (hace falta `npx next build` antes)
#       MODO=roto: con un `.next` construido desde el commit de antes (093f071).
#                  Tiene que FALLAR: el menú del mensaje se recortaba arriba.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

PGDIR=/tmp/pgbarra
PORT=55481
APP=3931

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
# Existe en producción por un `ALTER TABLE` en caliente y no en el esquema: sin
# ella la bandeja cae con un 42703 y `/chats` abre en mantenimiento.
psql "$DATABASE_URL" -c \
  'ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT;' >/dev/null

node scripts/sembrar-barra.mjs >/dev/null
node scripts/sembrar-hilo-largo.mjs >/dev/null

# Un servidor PROPIO y fresco, siempre. Reutilizar uno que ya escuchaba en el
# puerto es medir el build que ESE servidor cargó al arrancar: pasó al rehacer
# el build, y los chunks nuevos daban 400 contra el servidor viejo. (El proceso
# se llama `next-server`, no `next start`: buscarlo por el comando no lo encuentra.)
for pid in $(ps -eo pid,args | awk '/next-server/ && !/awk/ {print $1}'); do kill "$pid" 2>/dev/null || true; done
sleep 1
setsid npx next start -p "$APP" >/tmp/banco-flotantes-next.log 2>&1 </dev/null &
trap 'for pid in $(ps -eo pid,args | awk "/next-server/ && !/awk/ {print \$1}"); do kill "$pid" 2>/dev/null || true; done' EXIT
for _ in $(seq 1 60); do
  curl -sf -o /dev/null "http://localhost:$APP/login" && break
  sleep 1
done

if [ "${MODO:-bueno}" = roto ]; then
  # Que FALLE no basta: tiene que fallar por lo medido. Una sonda que muere en
  # un timeout también sale con error, y eso no es reproducir nada.
  SALIDA=$(node scripts/probar-flotantes-del-hilo.mjs 2>&1) && {
    echo "$SALIDA"
    echo "MODO=roto: todo salió bien — este .next no es el de antes, o el caso no se ejerce" >&2
    exit 1
  }
  echo "$SALIDA"
  if ! grep -q "fallo(s):" <<<"$SALIDA" || ! grep -q "se sale del hilo" <<<"$SALIDA"; then
    echo "MODO=roto: la sonda falló, pero no por el recorte del menú del mensaje" >&2
    exit 1
  fi
  echo "MODO=roto: reproduce el fallo — el menú del mensaje se sale del hilo"
else
  node scripts/probar-flotantes-del-hilo.mjs
fi
