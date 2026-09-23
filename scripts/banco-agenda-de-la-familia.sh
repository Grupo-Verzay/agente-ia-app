#!/usr/bin/env bash
# El banco de la Agenda de la familia: el tablero de la madre enseña sus citas
# y las de las cuentas que cuelgan de ella, en una sola lista.
#
# Dos mitades:
#
#  - **La decisión y un barrido del código** (`agenda-de-la-familia.test.mjs`),
#    sin base: la regla de la insignia es la MISMA función en Agenda y en CRM ›
#    Llamadas, el filtro es el mismo `SelectorDeCuentas` con las mismas props,
#    y el aviso ya no sale del navegador con la línea de quien mira.
#  - **Las ACCIONES contra Postgres** (`agenda-de-la-familia-db.test.mjs`), con
#    el esquema real y `linked_accounts` sembrada: una madre con dos hijas, una
#    hija que no ve ni a su madre ni a su hermana, el filtro que reduce, el
#    cambio de estado que se ve en las dos cuentas y el aviso que sale por la
#    línea de la cuenta DUEÑA de la cita.
#
# Y las dos corren además en `MODO=roto`, que AFIRMA el fallo de antes: cada
# cuenta solo veía lo suyo y el calendario avisaba por la línea de quien mira.
set -euo pipefail
cd /home/user/agente-ia-app

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgagendafamilia
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

OUT=lib/__tests__/.compilado/agenda
npx esbuild lib/agenda-de-la-familia.ts --bundle \
  --platform=node --format=esm --outdir=$OUT --log-level=error

npx esbuild lib/__tests__/fingido/entrada-de-la-agenda.ts --bundle \
  --platform=node --format=esm --outdir=$OUT \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --banner:js="import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" \
  --log-level=error
sed -i '/server-only/d' $OUT/entrada-de-la-agenda.js

node --test --test-concurrency=1 lib/__tests__/agenda-de-la-familia.test.mjs \
            lib/__tests__/agenda-de-la-familia-db.test.mjs "$@"

echo
echo "── la Agenda, con la forma VIEJA (tiene que afirmar el fallo) ──"
MODO=roto node --test --test-concurrency=1 lib/__tests__/agenda-de-la-familia.test.mjs \
                      lib/__tests__/agenda-de-la-familia-db.test.mjs
