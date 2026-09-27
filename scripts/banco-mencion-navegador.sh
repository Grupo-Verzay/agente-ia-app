#!/usr/bin/env bash
# Mencionar a un compañero en Chats, sobre la página SERVIDA
# (ver scripts/probar-mencion-en-chats.mjs). Hace falta `npx next build` antes.
# La regla y las acciones contra Postgres están en `banco-mencion-en-chats.sh`.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"

PGDIR=/tmp/pgmencionnav
PORT=55512
APP=3932

[ -d .next/static/css ] || { echo "No hay build ('npx next build')." >&2; exit 1; }

if [ ! -d "$PGDIR" ]; then
  mkdir -p "$PGDIR"; chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true

export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET=banco AUTH_TRUST_HOST=true NEXTAUTH_URL="http://localhost:$APP" \
       AUTH_RESEND_KEY=banco CRM_FOLLOW_UP_RUNNER_KEY=banco \
       S3_ACCESS_KEY=banco S3_SECRET_KEY=banco S3_ENDPOINT=localhost \
       S3_PUBLIC_URL=http://localhost:9000 GEMINI_API_KEY=banco \
       NEXT_TELEMETRY_DISABLED=1 BASE="http://localhost:$APP"

npx prisma db push --skip-generate --accept-data-loss >/dev/null
# Columnas que en PRODUCCIÓN existen por un ALTER en caliente y no están en el
# esquema de Prisma: `db push` las quita en cada vuelta, y un servidor que siga
# vivo de la vuelta anterior ya no las vuelve a crear.
psql "$DATABASE_URL" -c 'ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "profilePicUrl" TEXT;' \
  -c 'ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP(3);' \
  -c 'ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP(3);' >/dev/null
node scripts/sembrar-barra.mjs >/dev/null

# Ana: AGENTE del equipo, sin permiso de tomar de la bolsa. La conversación es
# de Sofía (administradora), así que a Ana no le sale en la lista.
node -e '
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const db = new PrismaClient();
(async () => {
  const jefe = await db.user.findUnique({ where: { email: "jefe@banco.test" } });
  const sofia = await db.user.findUnique({ where: { email: "sofia@banco.test" } });
  await db.user.upsert({
    where: { email: "ana@banco.test" }, update: {},
    create: { email: "ana@banco.test", name: "Ana Agente", password: await bcrypt.hash("banco1234", 10),
              role: "user", status: true, ownerId: jefe.id, advisorRole: "agente", canTakeUnassigned: false },
  });
  await db.session.updateMany({ where: { userId: jefe.id }, data: { assignedAdvisorId: sofia.id } });
  await db.$disconnect();
})();
'

# Un servidor FRESCO en cada vuelta: uno que siguiera vivo de la anterior
# serviría otro build y recordaría columnas que `db push` acaba de quitar.
# (`[n]ext`: sin los corchetes, pkill se encuentra a sí mismo y se mata.)
pkill -f "[n]ext start -p $APP" 2>/dev/null || true
sleep 1
setsid npx next start -p "$APP" >/tmp/banco-mencion-next.log 2>&1 </dev/null &
for _ in $(seq 1 60); do curl -sf -o /dev/null "http://localhost:$APP/login" && break; sleep 1; done
trap 'pkill -f "[n]ext start -p $APP" 2>/dev/null || true' EXIT

node scripts/probar-mencion-en-chats.mjs
