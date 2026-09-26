#!/usr/bin/env bash
# El COPY del anuncio de AI imágenes: el texto del post que acompaña a la
# imagen ya generada, adaptado a la red que se ve en la vista previa.
#
# Dos mitades, y cada una contesta lo que la otra no puede:
#
#  1. La DECISIÓN pura y un barrido del código
#     (`copy-del-anuncio.test.mjs`): que la red sale del formato de la previa y
#     no de un mando nuevo, que en WhatsApp los hashtags se quitan al LEER
#     —pedirlo en el prompt no basta—, que la llave de la vista se escribe en
#     un solo sitio, y que el panel se pinta junto a la previa con sus dos
#     botones.
#
#  2. La ACCIÓN de verdad contra Postgres (`copy-del-anuncio-db.test.mjs`): que
#     usa **la misma clave de Gemini que esa pantalla ya guarda** —se guarda con
#     su propia acción y se comprueba que es la que llega a Google—, que la
#     imagen ya creada viaja dentro de la petición, y que un fallo vuelve con su
#     motivo en vez de lanzar. Eso último es lo que impide que el texto tumbe la
#     tanda de imágenes que lo disparó, y no se ve probando funciones puras.
#
# `MODO=roto` lee los ficheros del commit de ANTES y AFIRMA el fallo: no había
# módulo del copy, ni acción, ni panel — la pantalla generaba la imagen y el
# texto había que escribirlo a mano. La mitad de Postgres se salta ahí y lo
# dice: en el «antes» no hay ninguna acción que afirmar.
#
# El «antes» va PINCHADO a un commit, nunca a `origin/main`: en cuanto esto se
# fusione, `origin/main` sería el «ahora» y el modo roto pasaría sin reproducir
# nada, que es la peor forma de tener un banco.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:/usr/lib/postgresql/16/bin:$PATH"
export ANTES_REF="${ANTES_REF:-121e369}"

PGDIR=/tmp/pgcopydelanuncio
PORT=55493

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
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost
# `lib/env.ts` exige una clave global de Google. La del ENTORNO es la de la
# plataforma, NO la del cliente: se pone con un valor que canta para que, si la
# acción se cayera a ella, el banco lo vea — lo que tiene que llegar a Google es
# la que esa pantalla guardó en `userAiConfig`.
export GEMINI_API_KEY=clave-del-entorno-que-no-debe-usarse

npx prisma db push --skip-generate --accept-data-loss >/dev/null

OUT=lib/__tests__/.compilado/copy
mkdir -p "$OUT"

# El módulo puro se compila SIEMPRE del árbol de ahora: en el «antes» no
# existía, así que no hay un «antes» suyo que afirmar. Lo que el modo roto lee
# son los FICHEROS, con `git show`.
npx esbuild lib/copy-del-anuncio.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" --log-level=error

# El doble de `@google/genai` y el de `currentUser()` se inyectan con un alias,
# así que quedan DENTRO del paquete: importados aparte serían otra copia y
# `ponerLoQueDiceGemini` no movería el código que corre.
npx esbuild lib/__tests__/fingido/entrada-del-copy.ts --bundle \
  --platform=node --format=esm --outdir="$OUT" \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:@google/genai=./lib/__tests__/fingido/genai-de-mentira.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-del-copy.js"

node --test lib/__tests__/copy-del-anuncio.test.mjs \
            lib/__tests__/copy-del-anuncio-db.test.mjs "$@"

echo
echo "── con el código de ANTES ($ANTES_REF): tiene que afirmar el fallo ──"
MODO=roto node --test lib/__tests__/copy-del-anuncio.test.mjs \
                      lib/__tests__/copy-del-anuncio-db.test.mjs
