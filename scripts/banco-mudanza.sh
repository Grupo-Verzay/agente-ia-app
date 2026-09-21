#!/usr/bin/env bash
# El banco de la mudanza de una persona de una cuenta a otra.
#
# Postgres de usar y tirar + el esquema REAL de Prisma (`db push`). Lo que se
# prueba aquí son las ACCIONES: mover a alguien toca `User`, `advisor_clients` y
# `_UserModules`, y lo que hay que demostrar es lo que NO toca — que su firma
# sigue siendo suya y que nada queda apuntando a un sitio que ya no existe.
#
# Corre además la mitad pura sin base ninguna, en dos modos: con el recorte de
# módulos bien hecho y con el ingenuo, que vacía la lista y con ella el TOPE.
set -euo pipefail
cd /home/user/agente-ia-app

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgmudanza
PORT=55443

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

# `currentUser` y `revalidatePath` son lo ÚNICO que se finge: el primero pide
# next-auth entero y el segundo el almacén de una petición de Next. La puerta
# que este banco ejerce es `puedeMudar`, que corre de verdad.
npx esbuild lib/__tests__/fingido/entrada-de-mudanza.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/mudanza \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' lib/__tests__/.compilado/mudanza/entrada-de-mudanza.js

# Lo puro va aparte y sin fingir nada: no importa nada.
npx esbuild lib/mudanza-de-persona.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado \
  --external:@prisma/client --external:server-only --log-level=error

node --test lib/__tests__/mudanza-de-persona.test.mjs \
              lib/__tests__/mudanza-de-persona-db.test.mjs "$@"

# Y la mudanza con la forma INGENUA puesta. Corren LOS DOS ficheros: el puro
# afirma que vaciar la lista de módulos le quita el TOPE en vez de quitarle los
# módulos, y el de Postgres mueve solo la fila de la persona y afirma los dos
# restos —la cartera atascada bajo la cuenta de antes y el módulo de más—.
#
# El de Postgres tiene que estar aquí: su caso `MODO=roto` se salta solo en la
# vuelta normal, así que dejándolo fuera saldría en verde sin haberse ejecutado
# nunca, que es peor que no tenerlo.
echo
echo "── la mudanza, con la forma INGENUA (tiene que afirmar el fallo) ──"
MODO=roto node --test lib/__tests__/mudanza-de-persona.test.mjs \
                      lib/__tests__/mudanza-de-persona-db.test.mjs
