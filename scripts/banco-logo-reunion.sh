#!/usr/bin/env bash
# El banco del logo de la puerta de una reunión.
#
# Dos mitades: contra Postgres, que el logo sale de la cuenta DUEÑA de la sala
# (misma fuente que agendar) y que sin logo se devuelve null; y con
# react-test-renderer, que la puerta pinta el logo cuando lo hay y cae al icono
# de cámara cuando no —o cuando la imagen no carga—.
set -euo pipefail
cd /home/user/agente-ia-app

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pglogo
PORT=55447

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
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

# La regla pura + el lector contra la base (misma fuente que agendar).
npx esbuild lib/__tests__/fingido/entrada-logo.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/logo \
  --external:@prisma/client --external:server-only --external:minio \
  --log-level=error
sed -i '/server-only/d' lib/__tests__/.compilado/logo/entrada-logo.js

# El emblema REAL, para el banco de pintado (react-test-renderer).
npx esbuild components/video/EmblemaDeLaReunion.tsx --bundle \
  --platform=node --format=esm --jsx=automatic \
  --main-fields=module,main --conditions=module,import \
  --external:react --external:react-dom --external:react/jsx-runtime \
  --outfile=lib/__tests__/.compilado/logo/emblema.mjs --log-level=error

node --test lib/__tests__/logo-reunion-db.test.mjs "$@"
node --test lib/__tests__/logo-reunion-render.test.mjs
