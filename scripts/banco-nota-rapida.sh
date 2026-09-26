#!/usr/bin/env bash
# El banco de la NOTA RÁPIDA y de los TRES botones del borde derecho.
#
# Tres mitades, porque el cambio vive en tres capas y cada una contesta algo
# que las otras no pueden:
#
#   1. Las REGLAS, puras y sin nada montado: dónde cae cada botón —y sobre todo
#      que el copiloto quede clavado en la mitad de la ventana con los otros dos
#      a la misma distancia— y qué se guarda, qué se recorta y cómo sale de aquí
#      una nota formal.
#   2. Un BARRIDO del código: que los tres botones compartan forma y ninguno
#      traiga su posición, que la columna no vuelva a centrarse a sí misma, que
#      el panel pase por `PanelLateral` —o sea por la exclusión— y que ni la
#      acción ni la ruta acepten un id del navegador.
#   3. Las ACCIONES contra POSTGRES y los TRES BOTONES en CHROMIUM. Lo primero
#      es lo único que puede decir que la tabla se crea sola, que es una nota
#      por persona y que mandarla a Notas la guarda ANTES de vaciar el papel.
#      Lo segundo, lo único que puede decir dónde cae cada botón de verdad: la
#      columna se coloca con un `style` calculado, así que leer el código no
#      contesta si el eje quedó centrado.
#
# `MODO=roto` reproduce el «antes» y AFIRMA el fallo:
#   · los botones, construidos con los de ANTES_REF — dos, sin nota, y el
#     copiloto 20 px por encima del centro;
#   · y el envío a Notas, con el orden INGENUO escrito literal dentro del banco
#     (vaciar primero y crear después), que ante un fallo de Notas pierde lo
#     apuntado.
#
# El «antes» va PINCHADO a un commit, nunca a `origin/main`: en cuanto esto se
# fusione, `origin/main` pasa a ser el «ahora» y el modo roto se pondría verde
# sin ejercer nada.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-6c83fbe}"
export ANTES_REF

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

mkdir -p lib/__tests__/.compilado

# ─────────────────────────────────────────────────────────────────────────────
# 1 y 2. Las reglas puras (el barrido lee los ficheros con `fs`, sin compilar)
# ─────────────────────────────────────────────────────────────────────────────
npx esbuild lib/botones-del-borde.ts lib/nota-rapida.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/nota-rapida \
  --log-level=error

# ─────────────────────────────────────────────────────────────────────────────
# 3a. Las acciones contra Postgres
# ─────────────────────────────────────────────────────────────────────────────
PGDIR=/tmp/pgnotarapida
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
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=http://localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx prisma db push --skip-generate --accept-data-loss >/dev/null

OUT=lib/__tests__/.compilado/nota-rapida
npx esbuild lib/__tests__/fingido/entrada-de-la-nota-rapida.ts --bundle \
  --platform=node --format=esm --outdir=$OUT \
  --external:@prisma/client --external:server-only \
  --alias:@/lib/auth=./lib/__tests__/fingido/auth-de-documentos.ts \
  --alias:next/cache=./lib/__tests__/fingido/next-cache.ts \
  --alias:react=./lib/__tests__/fingido/react-cache.ts \
  --log-level=error
sed -i '/server-only/d' "$OUT/entrada-de-la-nota-rapida.js"

# ─────────────────────────────────────────────────────────────────────────────
# 3b. Los tres botones, con el componente REAL
# ─────────────────────────────────────────────────────────────────────────────
ENTRY=".banco-botones-del-borde-entry.tsx"
HARNESS="lib/__tests__/.compilado/harness-botones-del-borde.js"
BOTONES_ANTES="components/chat-equipo/.BotonesDelBorde-antes.tsx"
LAUNCHER_ANTES="app/(root)/ai-chat/components/.ChatLauncher-antes.tsx"
trap 'rm -f "$ENTRY" "$BOTONES_ANTES" "$LAUNCHER_ANTES"' EXIT

BOTONES="@/components/chat-equipo/BotonesDelBorde"
if [ "$MODO" = "roto" ]; then
  # Cada fichero del «antes» junto a sus vecinos de hoy, para que sus rutas
  # relativas resuelvan; lo único que se reescribe es el import entre ellos.
  # Sin ese alias, el `BotonesDelBorde` viejo cargaría el `ChatLauncher` de
  # HOY —que ya no trae su posición— y el modo roto no reproduciría nada.
  git show "$ANTES_REF:app/(root)/ai-chat/components/ChatLauncher.tsx" > "$LAUNCHER_ANTES"
  git show "$ANTES_REF:components/chat-equipo/BotonesDelBorde.tsx" \
    | sed 's#@/app/(root)/ai-chat/components/ChatLauncher#@/app/(root)/ai-chat/components/.ChatLauncher-antes#' \
    > "$BOTONES_ANTES"
  BOTONES="@/components/chat-equipo/.BotonesDelBorde-antes"
fi

cat > "$ENTRY" <<'TSX'
import React from "react";
import { createRoot } from "react-dom/client";
import { BotonesDelBorde } from "__BOTONES__";

(window as any).maqueta = () => {
    const raiz = ((window as any).__raiz ??= createRoot(document.getElementById("app")!));
    raiz.render(<BotonesDelBorde cuentaId="cuenta" personaId="persona" />);
};
(window as any).listo = true;
TSX
sed -i "s#__BOTONES__#${BOTONES}#" "$ENTRY"

# Las de la nota van con un doble que APUNTA lo que se le pide: el empaquetador
# genérico contesta lo mismo a todo, y con eso no se puede afirmar que la nota
# se guarda sola ni con qué texto.
node scripts/empaquetar-con-acciones-mudas.mjs "$ENTRY" "$HARNESS" \
  --alias:next/navigation=./lib/__tests__/fingido/next-navigation-mudo.ts \
  --alias:@/actions/nota-rapida-actions=./lib/__tests__/fingido/acciones-de-la-nota-rapida.ts

rm -f "$ENTRY" "$BOTONES_ANTES" "$LAUNCHER_ANTES"

node --test lib/__tests__/nota-rapida.test.mjs "$@"
