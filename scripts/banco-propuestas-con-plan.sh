#!/usr/bin/env bash
# El banco de las PROPUESTAS que llevan un plan del panel de Planes.
#
# Tres mitades: la REGLA pura (la fila que sale de un plan, el rótulo y el texto
# del enlace, qué planes se pintan); las ACCIONES contra Postgres (una plantilla
# enlazada carga el plan EN VIVO —precio, créditos, catálogo, asistencia, «Qué
# incluye», video y enlace—, editar el plan en el panel se ve en la siguiente
# propuesta y no en la que ya se hizo, un plan apagado no lleva enlace, y solo
# la casa enlaza); y la PÁGINA pública de la propuesta pintada con React (el
# video del plan y el enlace a su página, al final).
#
# `MODO=roto` lee el código de ANTES_REF —pinchado a un commit, nunca
# `origin/main`— y afirma que no existía nada de esto.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-0764700}"
export ANTES_REF

if [ "$MODO" = "roto" ]; then
  node --test lib/__tests__/propuestas-con-plan.test.mjs "$@"
  exit $?
fi

OUT=lib/__tests__/.compilado/propuestas-con-plan
mkdir -p "$OUT"

# 1. La regla pura.
npx esbuild lib/plan-de-la-propuesta.ts --bundle --platform=node --format=esm \
  --outdir="$OUT" --log-level=error

# 2. Las acciones contra Postgres.
PGDIR=/tmp/pgpropplan
PORT=55671
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
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=https://s3.test S3_BUCKET_NAME=verzay-media \
       NEXT_PUBLIC_APP_URL=https://app.test GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

npx esbuild lib/__tests__/fingido/entrada-de-propuestas-con-plan.ts --bundle \
  --platform=node --format=esm --outdir=$OUT \
  --external:@prisma/client --external:server-only --external:next/headers \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:@/actions/whatsapp-dispatcher=./lib/__tests__/fingido/despacho-de-propuestas.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --banner:js='import{createRequire as __cr}from "module";import{fileURLToPath as __fu}from "url";import{dirname as __dn}from "path";const require=__cr(import.meta.url);const __filename=__fu(import.meta.url);const __dirname=__dn(__filename);' \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-propuestas-con-plan.js"

# 3. La página pública, con el React de verdad (sin el `cache` fingido).
npx esbuild lib/__tests__/fingido/entrada-de-la-propuesta-publica.tsx --bundle \
  --platform=node --format=esm --outdir=$OUT --jsx=automatic \
  --define:process.env.NODE_ENV=\"production\" --log-level=error \
  --banner:js='import{createRequire as __cr}from "module";import{fileURLToPath as __fu}from "url";import{dirname as __dn}from "path";const require=__cr(import.meta.url);const __filename=__fu(import.meta.url);const __dirname=__dn(__filename);'

node --test lib/__tests__/propuestas-con-plan.test.mjs "$@"
