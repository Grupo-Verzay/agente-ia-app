#!/usr/bin/env bash
# El «sin leer» de la lista de Chats, en dos mitades.
#
#   1. La REGLA y el corte, sin navegador
#      (`lib/__tests__/no-leido-de-la-fila.test.mjs`), con la condición de antes
#      escrita dentro y afirmando el fallo; más un barrido del código, que es
#      lo que dice si la bandeja PASA por la regla —el fallo no estaba en
#      ninguna función: estaba en que la pantalla preguntaba otra cosa—.
#
#   2. La bandeja de verdad, en Chromium y sobre la página SERVIDA
#      (`scripts/probar-no-leido.mjs`): línea `waha` con cuatro conversaciones,
#      un mensaje entrante escrito como lo escribe el webhook, y se lee lo que
#      la bandeja dice de sí misma. Esto es lo único que reproduce el reporte:
#      la regla se puede probar en frío, pero que la pantalla la use no.
#
# Uso:  scripts/banco-no-leido.sh          (hace falta `npx next build` antes)
#       SOLO=reglas                        (se salta la mitad del navegador)
#       MODO=roto BUILD_ANTES=<.next>      con un build del commit de antes;
#                                          la sonda exige entonces que FALLE.
#
# El «antes» va PINCHADO a un commit, nunca a `origin/main`: en cuanto esto se
# fusione, `origin/main` sería el «ahora» y el modo roto pasaría sin reproducir
# nada, que es la peor forma de tener un banco. Se construye así:
#
#   git worktree add -f /tmp/antes-noleido 121e369
#   ln -s "$PWD/node_modules" /tmp/antes-noleido/node_modules
#   (cd /tmp/antes-noleido && npx next build)
#   MODO=roto BUILD_ANTES=/tmp/antes-noleido/.next scripts/banco-no-leido.sh
#
# Con ese build reproduce CUATRO fallos, y dos son el reporte al pie de la letra:
# un contacto nuevo nace leído, y lo que sí salió en rojo se pierde al recargar.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO

# ── 1. La regla y el barrido ─────────────────────────────────────────────────
mkdir -p lib/__tests__/.compilado
npx esbuild lib/no-leido-de-la-fila.ts --bundle --platform=node --format=esm \
  --outdir=lib/__tests__/.compilado --log-level=error
node --test lib/__tests__/no-leido-de-la-fila.test.mjs

if [ "${SOLO:-}" = "reglas" ]; then
  echo "[banco] solo las reglas, como se pidió."
  exit 0
fi

# ── 2. La bandeja, sobre la página servida ───────────────────────────────────
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

# El build de ahora se devuelve SOLO si el modo roto se lo llevó. Sin ese `if`
# el trap borraba `.next` también en el modo bueno y dejaba el árbol sin build:
# la vuelta siguiente del banco se caía antes de ejercer un solo caso, y eso no
# se lee como un fallo — se lee como que no hay nada que probar.
devolverElBuild() {
  if [ -d .next.ahora ]; then
    rm -rf .next
    mv .next.ahora .next
  fi
}

if [ ! -d .next/static/css ]; then
  echo "No hay build: esto se mide sobre el servidor del build ('npx next build')." >&2
  exit 1
fi

PGDIR=/tmp/pgnoleido
PORT=55486
APP=3933

if [ ! -f "$PGDIR/PG_VERSION" ]; then
  rm -rf "$PGDIR"; mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2

# El servidor de la vuelta anterior se mata ANTES del `dropdb`: su conexión
# dejaría el borrado sin efecto, el `createdb` diría «ya existe» y el banco se
# caería sin ejercer un solo caso — en silencio y en verde.
# Lo que quedara escuchando en el puerto, sea de este banco o de una vuelta a
# medias: `next start` se cae con EADDRINUSE y el banco se queda sin ejercer un
# solo caso.
# Por el PUERTO y no solo por la línea de órdenes: `next start` se reexpone como
# `next-server`, así que un `pkill -f "next start -p …"` no alcanza al que quedó
# de una vuelta anterior.
pkill -f "next start -p $APP" 2>/dev/null || true
fuser -k -n tcp "$APP" 2>/dev/null || true
for _ in $(seq 1 15); do
  curl -sf -o /dev/null "http://localhost:$APP/login" || break
  sleep 1
done
if curl -sf -o /dev/null "http://localhost:$APP/login"; then
  echo "el puerto $APP sigue ocupado: mata lo que escuche ahí antes de correr el banco" >&2
  exit 1
fi
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
# Existe en producción por un ALTER en caliente y no en schema.prisma: sin ella
# la bandeja se cae con 42703 (ver la regla del sufijo de dispositivo).
psql "$DATABASE_URL" -c \
  'ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT;' >/dev/null

node scripts/sembrar-barra.mjs >/dev/null
node scripts/sembrar-no-leido.mjs >/dev/null

setsid npx next start -p "$APP" >/tmp/banco-no-leido-next.log 2>&1 </dev/null &
SERVIDOR=$!
trap 'kill -- -$SERVIDOR 2>/dev/null || pkill -f "next start -p '"$APP"'" || true; devolverElBuild' EXIT
for _ in $(seq 1 90); do
  curl -sf -o /dev/null "http://localhost:$APP/login" && break
  sleep 1
done

export BASE="http://localhost:$APP"
node scripts/probar-no-leido.mjs
