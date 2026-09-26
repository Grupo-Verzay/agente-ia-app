#!/usr/bin/env bash
# La etapa del embudo en Chats: la pastilla de la fila y el icono de la
# cabecera.
#
# Tres mitades:
#   1. Las reglas, sin navegador: el recorte a 14 caracteres —los mismos que
#      «Sin clasificar»—, que el índice del color y el color del tablero son el
#      mismo dato, y un barrido del código (la fila pinta la pastilla entre el
#      estado y «Asignar»; el botón de la cabecera es solo un icono).
#   2. Las CONSULTAS contra Postgres: que las tres lecturas en bloque corren
#      —los `::text[]`, los `::int[]` y unas tablas que crea la App, no Prisma—
#      y que la fila y la cabecera dicen la MISMA etapa.
#   3. La fila (`ChatContactItem`) y la cabecera (`ChatHeader`) REALES, con sus
#      acciones de servidor mudas, en Chromium sobre el CSS del build (o
#      `CSS_DEL_BANCO`), a 1440/1280/1024.
#
# `MODO=roto` empaqueta el MISMO arnés contra los componentes de `ANTES_REF`
# (un `git worktree` aparte) y afirma su fallo: ninguna pastilla en la fila y un
# botón con el nombre escrito que se come el ancho de sus vecinos. La mitad de
# Postgres se salta ahí y se dice: el «antes» no tenía ninguna de esas consultas,
# así que no hay un «antes» suyo que afirmar.
#
# El «antes» va PINCHADO a un commit, nunca a `origin/main`: en cuanto esto se
# fusione, `origin/main` sería el «ahora» y el modo roto pasaría sin reproducir
# nada, que es la peor forma de tener un banco.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
# 3153ccf — antes de esto: el selector con el nombre de la etapa escrito al
#           lado y la fila sin ninguna pastilla de etapa.
ANTES_REF="${ANTES_REF:-3153ccf}"
export MODO

RAIZ="$(pwd)"
mkdir -p lib/__tests__/.compilado

# Las funciones puras SIEMPRE se compilan del árbol de ahora: en el «antes» no
# existían, así que no hay un «antes» suyo que afirmar. Lo que el modo roto lee
# del otro árbol son los COMPONENTES.
# Con esbuild y `--bundle`, no con `tsc` a secas: desde que el color es libre,
# `lib/embudos.ts` importa `@/lib/colores-rapidos`, y un `tsc` de la CLI sin
# tsconfig no sabe resolver ese alias — se cae con un TS2307 que no tiene nada
# que ver con lo que este banco prueba.
npx esbuild lib/embudos.ts --bundle --platform=node --format=esm \
  --outdir=lib/__tests__/.compilado --log-level=error

# ── 2. Las consultas contra Postgres ─────────────────────────────────────
if [ "$MODO" = "roto" ]; then
  echo "[banco] la mitad de Postgres se salta en modo roto: el «antes» no tenía estas consultas."
else
  export PATH="/usr/lib/postgresql/16/bin:$PATH"
  PGDIR=/tmp/pgetapasbandeja
  PORT=55497
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
  export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco          CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco          S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

  npx prisma db push --skip-generate --accept-data-loss >/dev/null

  # El `currentUser()` es lo ÚNICO fingido: las consultas, la decisión y la
  # acción de la cabecera son las de producción.
  npx esbuild lib/__tests__/fingido/entrada-de-etapas-de-la-bandeja.ts --bundle     --platform=node --format=esm --outdir=lib/__tests__/.compilado/bandeja     --external:@prisma/client --external:server-only     --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts     --alias:next/cache=./lib/__tests__/fingido/next-cache.ts     --alias:react=./lib/__tests__/fingido/react-cache.ts     --log-level=error
  sed -i '/server-only/d' lib/__tests__/.compilado/bandeja/entrada-de-etapas-de-la-bandeja.js
  node --test lib/__tests__/etapas-de-la-bandeja-db.test.mjs
fi

# ── 3. La fila y la cabecera, en Chromium ────────────────────────────────
if [ ! -d ".next/static/css" ] && [ -z "${CSS_DEL_BANCO:-}" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes, o pasa CSS_DEL_BANCO" >&2
  exit 1
fi

OUT="$RAIZ/lib/__tests__/.compilado/pastilla-de-etapa.js"

if [ "$MODO" = "roto" ]; then
  W="$(mktemp -d)/antes"
  git worktree add -f "$W" "$ANTES_REF" -q
  ln -s "$RAIZ/node_modules" "$W/node_modules"
  mkdir -p "$W/lib/__tests__/pastilla-de-etapa"
  cp lib/__tests__/pastilla-de-etapa/* "$W/lib/__tests__/pastilla-de-etapa/"
  (cd "$W" && node "$RAIZ/scripts/empaquetar-con-acciones-mudas.mjs" \
      lib/__tests__/pastilla-de-etapa/entrada.tsx "$OUT")
  # El CSS del «antes» sale de SU código: con el de ahora, las clases que aquel
  # no tenía existirían igual y se estaría midiendo otra cosa.
  (cd "$W" && npx tailwindcss -i app/globals.css -o "$W/antes.css" >/dev/null 2>&1)
  cp "$W/antes.css" "$RAIZ/lib/__tests__/.compilado/antes.css"
  DIR_ANTES="$W" node --test lib/__tests__/pastilla-de-etapa-reglas.test.mjs
  CSS_DEL_BANCO="$RAIZ/lib/__tests__/.compilado/antes.css" node --test lib/__tests__/pastilla-de-etapa.test.mjs "$@"
  git worktree remove --force "$W" >/dev/null 2>&1 || true
else
  node --test lib/__tests__/pastilla-de-etapa-reglas.test.mjs
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/pastilla-de-etapa/entrada.tsx "$OUT"
  node --test lib/__tests__/pastilla-de-etapa.test.mjs "$@"
fi
