#!/usr/bin/env bash
# El banco de la mano levantada, contra Postgres de verdad.
#
# Reproduce lo que el latido le manda a cada cliente sobre los demás y
# comprueba que una mano levantada por A la ven B y C, y que al bajarla
# desaparece para todos. Cruza `sala_participantes` y la regla de caducidad,
# que son del esquema; se siembra con `prisma db push`.
set -euo pipefail
cd /home/user/agente-ia-app

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgmano
PORT=55446

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

npx esbuild lib/__tests__/fingido/entrada-de-mano.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/mano \
  --external:@prisma/client --external:server-only --external:minio \
  --log-level=error
sed -i '/server-only/d' lib/__tests__/.compilado/mano/entrada-de-mano.js

# El latido REAL (la acción entera), con la sesión y `next/headers` fingidos.
npx esbuild lib/__tests__/fingido/entrada-de-latido.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/latido \
  --alias:next/headers=./lib/__tests__/fingido/stub-headers.ts \
  --alias:@/lib/auth=./lib/__tests__/fingido/stub-auth-mano.ts \
  --external:@prisma/client --external:server-only --external:minio \
  --external:openai --external:web-push --external:sharp \
  --log-level=error
sed -i '/server-only/d' lib/__tests__/.compilado/latido/entrada-de-latido.js

# El recuadro REAL, para el banco de pintado (react-test-renderer).
npx esbuild components/video/RecuadrosDeLaSala.tsx --bundle \
  --platform=node --format=esm --jsx=automatic \
  --main-fields=module,main --conditions=module,import \
  --external:react --external:react-dom --external:react/jsx-runtime \
  --outfile=lib/__tests__/.compilado/mano/recuadros.mjs --log-level=error

node --test lib/__tests__/mano-levantada-db.test.mjs lib/__tests__/latido-mano-db.test.mjs "$@"
node --test lib/__tests__/mano-render.test.mjs
