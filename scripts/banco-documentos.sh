#!/usr/bin/env bash
# El banco de compartir/ordenar/fijar/archivar de Documentación.
#
# Postgres de usar y tirar + el esquema REAL de Prisma (`db push`): lo que se
# prueba aquí son las acciones, y esas leen `User` y `linked_accounts`, que son
# tablas del esquema. Las de Documentación las crea el propio módulo con sus
# `CREATE TABLE IF NOT EXISTS`, como en producción.
set -euo pipefail
cd /home/user/agente-ia-app

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgdocs
PORT=55441

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
# next-auth entero y el segundo el almacén de una petición de Next. Ninguno
# decide nada de lo que se prueba aquí — la puerta es `accesoAEsteEspacio`.
npx esbuild lib/__tests__/fingido/entrada-de-documentos.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/documentos \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' lib/__tests__/.compilado/documentos/entrada-de-documentos.js

# Lo puro va aparte y sin fingir nada: son módulos sin dependencias.
npx esbuild lib/exportar-documento.ts lib/documentacion.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/documentos \
  --external:@prisma/client --external:server-only --log-level=error

# Y los dos que prueban los bancos puros del árbol, que salen a `.compilado/`
# porque sus ficheros de prueba los importan de ahí.
npx esbuild lib/carpetas-de-documentacion.ts lib/plegado-del-arbol.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado \
  --external:@prisma/client --external:server-only --log-level=error

node --test lib/__tests__/documentacion-compartir.test.mjs \
              lib/__tests__/documentacion-carpetas.test.mjs \
              lib/__tests__/exportar-documento.test.mjs \
              lib/__tests__/carpetas-de-documentacion.test.mjs \
              lib/__tests__/plegado-del-arbol.test.mjs "$@"

# Y el reparto del árbol, con la forma INGENUA puesta: tiene que afirmar que un
# espacio cuya carpeta no está se esfuma. Sin este modo no se sabría si lo verde
# de arriba es que se arregló algo o que el caso no se ejerce.
echo
echo "── el reparto, con la forma INGENUA (tiene que afirmar el fallo) ──"
MODO=roto node --test lib/__tests__/carpetas-de-documentacion.test.mjs
