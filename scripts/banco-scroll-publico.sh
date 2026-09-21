#!/usr/bin/env bash
# El banco de «una pantalla pública se puede desplazar».
#
# El `<body>` va con `overflow-hidden` y eso se PROPAGA al viewport, así que
# toda pantalla de fuera de `(root)` nace sin poder desplazarse salvo que
# declare su propio contenedor. En `/t/` —la ficha de soporte que abre un
# cliente final por el enlace compartido— eso dejaba el botón de enviar fuera
# de alcance.
#
# Dos mitades, y hacen falta las dos:
#
#   1. **El barrido**, sin navegador y en los dos modos. Recorre todo lo que
#      vive fuera de `(root)` y falla si alguna pantalla no declara su
#      contenedor ni está exenta con su motivo escrito. El modo roto finge que
#      el arreglo no está y **exige que el barrido las cace**: sin eso, lo verde
#      del modo normal no probaría que el barrido mira.
#   2. **La página SERVIDA**, en Chromium: se levanta una base de usar y tirar,
#      se siembra un enlace público y se abre `/t/<codigo>` de verdad. No vale
#      una maqueta — el primer intento lo era y salió más corta que la ficha
#      real, así que cabía entera y la medida no ejercía nada.
#      Se desplaza con la RUEDA, que es lo único que el `overflow:hidden` frena:
#      con `scrollTop` sale «llega» también en la versión rota.
#
# Uso:  scripts/banco-scroll-publico.sh            (las dos mitades)
#       scripts/banco-scroll-publico.sh --solo-puro
set -euo pipefail
cd "$(dirname "$0")/.."

B=/usr/lib/postgresql/16/bin
export PATH="$B:/opt/node22/bin:$PATH"
# Playwright va instalado en el sistema, no en el proyecto.
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"

echo "── el barrido, con el arreglo puesto ──"
node --test lib/__tests__/pantallas-publicas-se-desplazan.test.mjs

echo
echo "── el barrido, fingiendo que NO está (tiene que cazarlas) ──"
MODO=roto node --test lib/__tests__/pantallas-publicas-se-desplazan.test.mjs

if [ "${1:-}" = "--solo-puro" ]; then exit 0; fi

if [ ! -d .next/static/css ]; then
  echo
  echo "No hay build: para la medida en Chromium hace falta 'npm run build'." >&2
  exit 1
fi

PGDIR=/tmp/pgscroll
PGPORT=55471
APPPORT=3921
CODIGO=CODIGO-DEL-BANCO

if [ ! -d "$PGDIR/base" ]; then
  rm -rf "$PGDIR"; mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
  su postgres -c "$B/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "$B/pg_ctl -D $PGDIR -o '-p $PGPORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "$B/createdb -h $PGDIR -p $PGPORT -U postgres banco" 2>/dev/null || true

export DATABASE_URL="postgresql://postgres@localhost:$PGPORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
npx prisma db push --skip-generate --accept-data-loss >/dev/null

# El enlace público lo crea el propio módulo con `CREATE TABLE IF NOT EXISTS`;
# aquí se escribe igual para poder sembrarlo sin pasar por una sesión.
su postgres -c "$B/psql -q -h $PGDIR -p $PGPORT -U postgres -d banco -v ON_ERROR_STOP=1" <<SQL
CREATE TABLE IF NOT EXISTS "tickets_enlace_publico" (
  "cuentaId" TEXT PRIMARY KEY,
  "codigo" TEXT NOT NULL UNIQUE,
  "activo" BOOLEAN NOT NULL DEFAULT TRUE,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "User" ("id","email","name","company","password","updatedAt")
VALUES ('cuenta-del-banco','banco@ejemplo.com','Cuenta del banco','Soporte del banco','x',NOW())
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "tickets_enlace_publico" ("cuentaId","codigo")
VALUES ('cuenta-del-banco','$CODIGO') ON CONFLICT DO NOTHING;
SQL

# Relleno: el paquete arrastra la validación de entorno del servidor, que no
# decide nada de lo que este banco mide.
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APPPORT" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco \
       S3_ACCESS_KEY=banco S3_SECRET_KEY=banco S3_ENDPOINT=http://localhost \
       S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco

npx next start -p "$APPPORT" > /tmp/banco-scroll-next.log 2>&1 &
SERVIDOR=$!
trap 'kill $SERVIDOR 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
  if curl -fs -o /dev/null "http://localhost:$APPPORT/t/$CODIGO"; then break; fi
  sleep 1
done

echo
echo "── la ficha SERVIDA, en Chromium ──"
BASE="http://localhost:$APPPORT" CODIGO="$CODIGO" node scripts/medir-scroll-publico.mjs
