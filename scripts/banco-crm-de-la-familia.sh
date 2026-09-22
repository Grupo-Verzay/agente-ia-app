#!/usr/bin/env bash
# El banco del CRM de la familia: la madre ve lo de sus hijas, unificado.
#
# Dos mitades, porque el cambio vive en dos capas:
#
#  - **La decisión**, pura y sin base (`crm-de-la-familia.test.mjs`): qué
#    cuentas quedan elegidas, cuándo la vista va unificada, qué fila es ajena y
#    cuánto crece el tope con las cuentas.
#  - **Las ACCIONES**, contra Postgres y con el esquema REAL (`db push`): las
#    cinco pestañas del CRM pasan por esa regla, y el alcance sale de FILAS
#    —`linked_accounts` sembrada antes— y no de un parámetro. Probar la función
#    pura a solas sería probar justo el lado que no tiene puerta.
#
# Y los dos corren además con la forma vieja puesta (`MODO=roto`), que es la
# que había: cada consulta acotada a la cuenta propia. Ahí se **afirma el
# fallo** —la madre no ve nada de sus hijas—; sin ese modo no se sabría si lo
# verde de al lado es que la regla se cumple o que el caso no se llega a
# ejercer.
set -euo pipefail
cd /home/user/agente-ia-app

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgcrmfamilia
PORT=55471

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
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

# Lo puro va aparte y sin fingir nada: no importa nada.
npx esbuild lib/crm-de-la-familia.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/crm \
  --external:@prisma/client --external:server-only --log-level=error

# `currentUser` y `revalidatePath` son lo ÚNICO que se finge: el primero pide
# next-auth entero y el segundo el almacén de una petición de Next. Las cinco
# acciones, la resolución de la familia y las consultas corren de verdad.
npx esbuild lib/__tests__/fingido/entrada-del-crm.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/crm \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' lib/__tests__/.compilado/crm/entrada-del-crm.js

node --test lib/__tests__/crm-de-la-familia.test.mjs \
            lib/__tests__/crm-de-la-familia-db.test.mjs "$@"

echo
echo "── el CRM, con la consulta VIEJA (tiene que afirmar el fallo) ──"
MODO=roto node --test lib/__tests__/crm-de-la-familia.test.mjs \
                      lib/__tests__/crm-de-la-familia-db.test.mjs
