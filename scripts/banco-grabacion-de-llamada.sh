#!/usr/bin/env bash
# El banco de «la llamada con IA deja Transcripción y Resumen».
#
# Postgres de usar y tirar + el esquema REAL de Prisma (`db push`): lo que se
# prueba son las acciones, y esas escriben en `chat_messages` y descuentan de
# `ia_credits` — dos tablas de verdad, con una familia de `linked_accounts`
# sembrada dentro para poder afirmar a QUIÉN se le cobra.
#
#   MODO=roto scripts/banco-grabacion-de-llamada.sh   <- afirma el fallo
set -euo pipefail
cd /home/user/agente-ia-app

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pggrabacion
PORT=55451

if [ ! -d "$PGDIR" ]; then
  rm -rf "$PGDIR"
  mkdir -p "$PGDIR"
  chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "/usr/lib/postgresql/16/bin/createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true

export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
# Relleno: el paquete arrastra la validación de entorno del servidor, que no
# decide nada de lo que este banco prueba.
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco
# La clave con la que el backend llama a `/api/calls/process-bot-recording`.
# Sin ella la ruta contesta 401 y el camino del flujo no se ejercería.
export CRM_FOLLOW_UP_RUNNER_KEY=banco
# Y sin esto `startBotCallAction` y `fetchRecordingBase64` se rinden en su
# primera línea: el caso no se ejercería y el banco saldría verde sin haber
# probado nada. El `fetch` lo intercepta el propio banco.
export ASTRACALLS_URL=http://localhost:1 ASTRACALLS_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

# El `--banner` define un `require` de verdad: el paquete arrastra librerías
# con `require` dinámicos dentro (`@google/genai` pide `child_process`,
# `xml2js` pide `events`) y el envoltorio de esbuild los tira con un
# «Dynamic require ... is not supported». Eso no es un fallo de producción
# —ahí corre Node, no un paquete— pero aquí se lo comía el `catch` de
# `summarize` y la llamada salía con Transcripción y **sin Resumen**, o sea
# el mismo síntoma que este banco viene a probar. Con el banner, el
# envoltorio de esbuild usa ese `require` y las carga de verdad.
#
# Se fingen DOS cosas y ninguna más:
#   · `currentUser()`, que pide next-auth entero y no decide nada de esto;
#   · el paquete `openai`, porque transcribir y resumir salen de la red.
# Todo lo demás —las dos acciones, la ruta, la espera, el cobro y la familia—
# es el código de producción.
npx esbuild lib/__tests__/fingido/entrada-de-grabacion.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/grabacion \
  --external:@prisma/client --external:server-only --external:minio \
  --banner:js='import{createRequire as __cr}from "module";const require=__cr(import.meta.url);' \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-llamadas.ts \
  --alias:openai=./lib/__tests__/fingido/openai-de-mentira.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:next/server=./lib/__tests__/fingido/next-server.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' lib/__tests__/.compilado/grabacion/entrada-de-grabacion.js

node --test lib/__tests__/grabacion-de-llamada.test.mjs "$@"
