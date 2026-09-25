#!/usr/bin/env bash
# Embudos en Chromium, sobre la página SERVIDA (`next start` del build) contra
# un Postgres de usar y tirar, con sesión de verdad para el dueño, la
# administradora y dos agentes. Ver `scripts/probar-embudos.mjs`.
#
# No tiene modo roto, y se dice: el «antes» es que la pantalla no existía.
# Lo que sí prueba de verdad un modo roto —que el compañero veía lo personal
# del otro— está en `scripts/banco-embudos.sh`, contra las acciones de antes.
#
# Uso:  scripts/banco-embudos-navegador.sh      (hace falta `npx next build` antes)
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"

PGDIR=/tmp/pgembudosnav
PORT=55494
APP=3947

if [ ! -d .next/static/css ]; then
  echo "No hay build ('npx next build')." >&2
  exit 1
fi

if [ ! -f "$PGDIR/PG_VERSION" ]; then
  mkdir -p "$PGDIR"
  chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
# Base nueva en cada vuelta: la sonda crea el embudo por la pantalla y
# necesita empezar sin ninguno.
su postgres -c "/usr/lib/postgresql/16/bin/dropdb -h $PGDIR -p $PORT -U postgres --if-exists banco" >/dev/null 2>&1 || true
su postgres -c "/usr/lib/postgresql/16/bin/createdb -h $PGDIR -p $PORT -U postgres banco"

export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APP" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco \
       S3_ACCESS_KEY=banco S3_SECRET_KEY=banco S3_ENDPOINT=localhost \
       S3_PUBLIC_URL=http://localhost:9000 GEMINI_API_KEY=banco \
       NEXT_TELEMETRY_DISABLED=1

npx prisma db push --skip-generate --accept-data-loss >/dev/null
node scripts/sembrar-embudos.mjs >/dev/null

# El `next start` de una vuelta anterior: se mata por su línea de comandos
# entera. Un `pkill -f "next start -p $APP"` no lo alcanza cuando arrancó con
# `setsid` y ya se renombró a `next-server`, y entonces la vuelta siguiente se
# cae con EADDRINUSE **contra el build viejo y la base vieja**: el síntoma es
# «no se pudo entrar», que no se parece a su causa.
for pid in $(ps -eo pid,args | grep -E "next start -p $APP|next-server" | grep -v grep | awk '{print $1}'); do
  kill -9 "$pid" 2>/dev/null || true
done
sleep 2
setsid npx next start -p "$APP" >/tmp/banco-embudos-next.log 2>&1 </dev/null &
for _ in $(seq 1 60); do
  curl -sf -o /dev/null "http://localhost:$APP/login" && break
  sleep 1
done

BASE="http://localhost:$APP" node scripts/probar-embudos.mjs
