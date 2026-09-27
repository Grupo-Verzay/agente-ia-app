#!/usr/bin/env bash
# El banco de CORREO.
#
# Dos mitades:
#
#   1. Las REGLAS puras y un BARRIDO del código (`correo.test.mjs`): que ningún
#      fichero de Correo toque un camino de Chats, que toda consulta de
#      `correo_cuentas` lleve la persona en el WHERE, que ninguna acción acepte
#      un `userId`, y que el HTML de un correo se pinte sin scripts.
#   2. Las ACCIONES y las RUTAS contra POSTGRES (`correo-db.test.mjs`), con
#      Gmail y Outlook fingidos en el `fetch` e IMAP/SMTP en el socket: que el
#      correo es de quien lo conectó y de nadie más —el súper administrador
#      incluido—, que los tres proveedores leen, bajan adjuntos y responden
#      igual, que el viaje de autorización no cuelga buzones ajenos, y que
#      `Session`, `chat_messages` y `chat_conversations` no cambian ni una fila.
#
#   3. La PANTALLA en Chromium (`correo-pantalla.test.mjs`): la lista mide la
#      columna lateral de la plataforma, la barra de responder mide la de Chats,
#      el correo no ejecuta scripts, y en un teléfono se ve una cosa a la vez.
#
# `MODO=roto` afirma el fallo del diseño INGENUO: un buzón buscado por su id a
# secas se lo entrega a cualquiera, y un correo guardado por el camino de Chats
# lo caza el barrido.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO

mkdir -p lib/__tests__/.compilado/correo-puro
npx esbuild lib/correo.ts --bundle --platform=node --format=esm \
  --outdir=lib/__tests__/.compilado/correo-puro --log-level=error

PGDIR=/tmp/pgcorreo
PORT=55531
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
export AUTH_SECRET=banco-correo NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco \
       GOOGLE_OAUTH_CLIENT_ID=id-google GOOGLE_OAUTH_CLIENT_SECRET=secreto-google \
       MICROSOFT_OAUTH_CLIENT_ID=id-ms MICROSOFT_OAUTH_CLIENT_SECRET=secreto-ms

npx prisma db push --skip-generate --accept-data-loss >/dev/null
node scripts/empaquetar-correo.mjs

# 3. La PANTALLA, en Chromium y sobre el CSS del build (sin build, se salta y
#    lo dice el resumen). Las acciones se fingen apuntando lo que se les pide.
node scripts/empaquetar-con-acciones-mudas.mjs \
  lib/__tests__/fingido/correo/entrada-pantalla.tsx lib/__tests__/.compilado/correo/pantalla.js \
  --alias:@/actions/correo-actions=./lib/__tests__/fingido/correo/acciones-de-la-pantalla.ts

TESTS="lib/__tests__/correo.test.mjs lib/__tests__/correo-db.test.mjs"
# La pantalla es de hoy: no tiene «antes» que afirmar, así que solo corre en el modo bueno.
[ "$MODO" = "roto" ] || TESTS="$TESTS lib/__tests__/correo-pantalla.test.mjs"
if [ "$#" -gt 0 ]; then node --test "$@"; else node --test $TESTS; fi
