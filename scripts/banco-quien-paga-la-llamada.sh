#!/usr/bin/env bash
# El banco de «la transcripción la paga la misma cuenta que pagó la llamada».
#
# El reporte: en CRM › Llamadas la llamada sale bien y queda con su duración, y
# la transcripción falla con «No hay créditos suficientes: hacen falta 14 y
# quedan 0» aunque la cuenta desde la que salió sí tiene créditos.
#
# Postgres de usar y tirar + el esquema REAL de Prisma (`db push`): lo que se
# prueba no es la regla pura, es que las funciones de producción PASAN por ella
# y que el alcance sale de FILAS —el `astra_calls_sid`, la familia de
# `linked_accounts`, las claves de `user_ai_configs` y las bolsas de
# `ia_credits`—.
#
#   scripts/banco-quien-paga-la-llamada.sh
#   MODO=roto scripts/banco-quien-paga-la-llamada.sh   <- afirma el fallo
#
# El «antes» va PINCHADO a un commit (`ANTES_REF`), nunca a `origin/main`: en
# cuanto esto se fusione, `origin/main` pasa a ser el «después» y el modo roto
# dejaría de reproducir nada — se pondría verde sin ejercer el fallo, que es la
# peor forma de tener un banco.
set -euo pipefail
cd /home/user/agente-ia-app

# El commit de ANTES de este arreglo. Se pincha a propósito; ver arriba.
ANTES_REF="${ANTES_REF:-4e3bddf}"

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
PGDIR=/tmp/pgquienpaga
PORT=55499

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
       S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco
# Sin esto `bajarLaGrabacion` se rinde en su primera línea y el caso no se
# ejercería: el banco saldría verde sin haber pedido ni un audio. El `fetch` lo
# intercepta el propio banco.
export ASTRACALLS_URL=http://localhost:1 ASTRACALLS_API_KEY=banco
# La clave interna del servidor: la validación de entorno la exige aunque este
# banco no llame a ninguna ruta.
export CRM_FOLLOW_UP_RUNNER_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

ALIAS_DEL_ANTES=()
if [ "${MODO:-}" = "roto" ]; then
  # El «antes» de los TRES ficheros que este arreglo toca, sacado del commit
  # pinchado. Se traen los tres porque se importan entre ellos: con solo el
  # primero, sus `@/lib/...` resolverían a los de HOY —que ya llevan el
  # arreglo— y el modo roto pasaría sin ejercer nada.
  ANTES=lib/__tests__/.antes/quien-paga
  rm -rf "$ANTES"; mkdir -p "$ANTES"
  for f in grabacion-de-llamada.server.ts transcripcion-de-la-llamada.ts wav-en-trozos.ts; do
    git show "$ANTES_REF:lib/$f" > "$ANTES/$f" 2>/dev/null \
      || { echo "MAL: no se pudo sacar lib/$f de $ANTES_REF"; exit 1; }
  done
  ALIAS_DEL_ANTES=(
    "--alias:@/lib/grabacion-de-llamada.server=./$ANTES/grabacion-de-llamada.server.ts"
    "--alias:@/lib/transcripcion-de-la-llamada=./$ANTES/transcripcion-de-la-llamada.ts"
    "--alias:@/lib/wav-en-trozos=./$ANTES/wav-en-trozos.ts"
    # La pregunta «quién paga» no existía: era el dueño de la fila, y ya. El
    # «antes» va escrito literal en este fingido.
    "--alias:@/lib/cuenta-que-paga-la-llamada.server=./lib/__tests__/fingido/quien-paga-de-antes.ts"
  )
fi

# El `--banner` define un `require` de verdad: el paquete arrastra librerías con
# `require` dinámicos dentro (`@google/genai` pide `child_process`, `xml2js`
# pide `events`) y el envoltorio de esbuild los tira con un «Dynamic require …
# is not supported». Eso no es un fallo de producción —ahí corre Node— pero
# aquí se lo comía el `catch` de `summarize` y la llamada salía con
# Transcripción y SIN Resumen, o sea uno de los síntomas que este banco prueba.
npx esbuild lib/__tests__/fingido/entrada-de-quien-paga.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/quien-paga \
  --external:@prisma/client --external:server-only --external:minio \
  --banner:js='import{createRequire as __cr}from "module";const require=__cr(import.meta.url);' \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-llamadas.ts \
  --alias:openai=./lib/__tests__/fingido/openai-de-mentira.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:next/server=./lib/__tests__/fingido/next-server.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  "${ALIAS_DEL_ANTES[@]+"${ALIAS_DEL_ANTES[@]}"}" \
  --log-level=error
sed -i '/server-only/d' lib/__tests__/.compilado/quien-paga/entrada-de-quien-paga.js

node --test lib/__tests__/quien-paga-la-llamada.test.mjs "$@"
