#!/usr/bin/env bash
# El banco de las etiquetas por línea en Chats.
#
# Dos mitades:
#  - La decisión, pura (`etiquetas-de-la-linea.test.mjs`): qué etiquetas se le
#    ofrecen a una conversación, a un lote y al filtro.
#  - Las ACCIONES contra Postgres con el esquema real
#    (`etiquetas-de-la-linea-db.test.mjs`): lo que se ofrece a cada
#    conversación es lo de la cuenta de su línea, lo que el servidor deja
#    asignar, desde la madre, un asesor y un súper administrador de fuera.
#
# Y las dos otra vez con la forma vieja (`MODO=roto`): las etiquetas de la
# cuenta de quien mira, para cualquier conversación. Ahí se AFIRMA el fallo.
set -euo pipefail
cd /home/user/agente-ia-app

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgetiquetaslinea
PORT=55481

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
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

OUT=lib/__tests__/.compilado/etiquetas
npx esbuild lib/etiquetas-de-la-linea.ts --bundle \
  --platform=node --format=esm --outdir=$OUT --log-level=error

npx esbuild lib/__tests__/fingido/entrada-de-etiquetas.ts --bundle \
  --platform=node --format=esm --outdir=$OUT \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' $OUT/entrada-de-etiquetas.js

node --test lib/__tests__/etiquetas-de-la-linea.test.mjs \
            lib/__tests__/etiquetas-de-la-linea-db.test.mjs "$@"

echo
echo "── las etiquetas, con la forma VIEJA (tiene que afirmar el fallo) ──"
MODO=roto node --test lib/__tests__/etiquetas-de-la-linea.test.mjs \
                      lib/__tests__/etiquetas-de-la-linea-db.test.mjs
