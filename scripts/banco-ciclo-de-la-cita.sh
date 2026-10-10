#!/usr/bin/env bash
# El banco del CICLO AUTOMÁTICO DE LA CITA (Agenda › Ajustes › Flujo automático).
#
#  - Las reglas puras (`ciclo-de-la-cita.test.mjs`): los cuatro recordatorios,
#    qué cuenta como «Sí»/«No», qué es un rechazo literal y qué hace la espera
#    minuto a minuto (llamada al 5, No asistida al 10, la prórroga).
#  - Contra Postgres (`ciclo-de-la-cita-db.test.mjs`), con el código de verdad
#    y la red fingida: los recordatorios al agendar y al reagendar, el reloj de
#    la espera, Atendida al entrar, el «Sí»/«No», Descartado y que NINGÚN
#    automático pisa un estado que puso una persona.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgciclodelacita
PORT=55531

if [ ! -f "$PGDIR/PG_VERSION" ]; then
  rm -rf "$PGDIR"; mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "/usr/lib/postgresql/16/bin/createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true

export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco \
       BACKEND_URL=http://backend.banco NEXT_PUBLIC_APP_URL=https://app.banco TZ=UTC

npx prisma db push --skip-generate --accept-data-loss >/dev/null

SALIDA=lib/__tests__/.compilado/ciclo-de-la-cita
mkdir -p "$SALIDA"
npx esbuild lib/ciclo-de-la-cita.ts --bundle --platform=node --format=esm --outdir="$SALIDA" --log-level=error
npx esbuild lib/__tests__/fingido/entrada-del-ciclo-de-la-cita.ts --bundle \
  --platform=node --format=esm --outdir="$SALIDA" \
  --banner:js='import{createRequire as __cr}from "module";import{fileURLToPath as __fu}from "url";import{dirname as __dn}from "path";const require=__cr(import.meta.url);const __filename=__fu(import.meta.url);const __dirname=__dn(__filename);' \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:@/auth=./lib/__tests__/fingido/sesion-y-cookies.ts \
  --alias:next/headers=./lib/__tests__/fingido/sesion-y-cookies.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-con-cache.ts \
  --log-level=error
sed -i '/server-only/d' "$SALIDA/entrada-del-ciclo-de-la-cita.js"

node --test --test-concurrency=1 lib/__tests__/ciclo-de-la-cita.test.mjs \
  lib/__tests__/ciclo-de-la-cita-db.test.mjs "$@"
