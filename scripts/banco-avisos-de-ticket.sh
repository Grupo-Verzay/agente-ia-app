#!/usr/bin/env bash
# El banco del aviso de un ticket: a quién le salta la ventana que interrumpe.
#
# Dos mitades, porque el cambio vive en dos capas:
#
#  - **La decisión**, pura y sin base: si el ticket tiene responsable el aviso
#    es suyo, y si no es de todo el que alcance el módulo.
#  - **Las ACCIONES**, contra Postgres y con el esquema REAL (`db push`): los
#    dos caminos por los que entra un ticket escriben el aviso, y la lista sale
#    de quién alcanza el módulo de verdad —sus `_UserModules`, su rol y las
#    cuentas vinculadas—, que son filas y no un parámetro. Probar la función de
#    avisar a solas sería probar justo el lado que no tiene puerta.
#
# Y los dos corren además con la forma INGENUA puesta (`MODO=roto`), que es la
# que se escribe sola: avisar a todo el equipo sin mirar el módulo ni el
# responsable. Sin ese modo no se sabría si lo verde de al lado es que la regla
# se cumple o que el caso no se llega a ejercer.
set -euo pipefail
cd /home/user/agente-ia-app

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgticketaviso
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
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

# Lo puro va aparte y sin fingir nada: no importa nada.
npx esbuild lib/aviso-de-ticket.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado \
  --external:@prisma/client --external:server-only --log-level=error

# `currentUser` y `revalidatePath` son lo ÚNICO que se finge: el primero pide
# next-auth entero y el segundo el almacén de una petición de Next. Las dos
# acciones, la consulta del módulo y la escritura del aviso corren de verdad.
npx esbuild lib/__tests__/fingido/entrada-de-ticket.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/ticket \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' lib/__tests__/.compilado/ticket/entrada-de-ticket.js

node --test lib/__tests__/aviso-de-ticket.test.mjs \
              lib/__tests__/aviso-de-ticket-db.test.mjs "$@"

echo
echo "── el reparto, con la forma INGENUA (tiene que afirmar los dos fallos) ──"
MODO=roto node --test lib/__tests__/aviso-de-ticket.test.mjs \
                      lib/__tests__/aviso-de-ticket-db.test.mjs
