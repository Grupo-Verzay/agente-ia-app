#!/usr/bin/env bash
# El banco de «la llamada que colgó y de la que nadie avisó».
#
# Postgres de usar y tirar + el esquema REAL de Prisma (`db push`): lo que se
# prueba es el BARRIDO de verdad y su ruta, que escriben en `chat_messages` y
# descuentan de `ia_credits`. Probar la función pura sola sería probar el único
# trozo que no podía estar roto.
#
#   MODO=roto scripts/banco-rescate-de-llamadas.sh   <- afirma el fallo
set -euo pipefail
cd /home/user/agente-ia-app

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgrescate
PORT=55452

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
# La clave con la que el backend llama a `/api/calls/rescatar` y a
# `/api/calls/call-ended`. Es la MISMA a propósito: el banco lo comprueba.
export CRM_FOLLOW_UP_RUNNER_KEY=banco
# Sin esto `processCallRecordingForUser` se rinde en su primera línea y el
# barrido saldría verde sin haber bajado ni un WAV. El `fetch` lo intercepta el
# propio banco.
export ASTRACALLS_URL=http://localhost:1 ASTRACALLS_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

# El `--banner` define un `require` de verdad: el paquete arrastra librerías con
# `require` dinámicos dentro y el envoltorio de esbuild los tira con un
# «Dynamic require ... is not supported». Aquí eso se lo comería el `catch` de
# `summarize` y la llamada saldría con Transcripción y **sin Resumen**, o sea
# el mismo síntoma que este banco viene a probar.
npx esbuild lib/__tests__/fingido/entrada-de-rescate.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/rescate \
  --external:@prisma/client --external:server-only --external:minio \
  --banner:js='import{createRequire as __cr}from "module";const require=__cr(import.meta.url);' \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-llamadas.ts \
  --alias:openai=./lib/__tests__/fingido/openai-de-mentira.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:next/server=./lib/__tests__/fingido/next-server.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' lib/__tests__/.compilado/rescate/entrada-de-rescate.js

node --test lib/__tests__/rescate-de-llamadas.test.mjs "$@"
