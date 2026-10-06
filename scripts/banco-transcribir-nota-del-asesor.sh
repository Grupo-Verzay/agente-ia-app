#!/usr/bin/env bash
# El banco de «se puede transcribir también la nota de voz del ASESOR».
#
# Tres mitades:
#   1. la regla pura (`esNotaDeVozTranscribible`): las dos puntas, y un audio
#      adjunto (`ptt: false`) sigue fuera;
#   2. un barrido: la burbuja no esconde el botón en los mensajes propios, y
#      la consulta no filtra por `fromMe`;
#   3. `laNotaDeVoz` contra Postgres con el esquema REAL: encuentra la nota
#      del asesor (fromMe = true) y la del cliente, y guardar escribe una vez.
#
#   MODO=roto scripts/banco-transcribir-nota-del-asesor.sh   <- afirma el fallo
#   (lee los ficheros de ANTES_REF y afirma que la nota del asesor no se
#   ofrecía ni se encontraba)
set -euo pipefail
cd /home/user/agente-ia-app

export PATH="/usr/lib/postgresql/16/bin:/opt/node22/bin:$PATH"
export ANTES_REF="${ANTES_REF:-7c1db1f}"
SALIDA=lib/__tests__/.compilado/nota-del-asesor
rm -rf "$SALIDA" && mkdir -p "$SALIDA"

if [ "${MODO:-}" = "roto" ]; then
  git show "$ANTES_REF:lib/transcripcion-de-voz.ts" > "$SALIDA/regla.ts"
  git show "$ANTES_REF:lib/transcribir-nota-de-chat.ts" > $SALIDA/nota-antes.ts
  git show "$ANTES_REF:app/(root)/chats/_components/MessageBubble.tsx" > "$SALIDA/MessageBubble.tsx"
  git show "$ANTES_REF:app/(root)/chats/_components/TranscribirNota.tsx" > "$SALIDA/TranscribirNota.tsx"
  NOTA=./$SALIDA/nota-antes.ts
else
  cp lib/transcripcion-de-voz.ts "$SALIDA/regla.ts"
  cp "app/(root)/chats/_components/MessageBubble.tsx" "$SALIDA/MessageBubble.tsx"
  cp "app/(root)/chats/_components/TranscribirNota.tsx" "$SALIDA/TranscribirNota.tsx"
  cp lib/transcribir-nota-de-chat.ts "$SALIDA/transcribir-nota-de-chat.ts"
  NOTA=./lib/transcribir-nota-de-chat.ts
fi
[ "${MODO:-}" = "roto" ] && cp $SALIDA/nota-antes.ts "$SALIDA/transcribir-nota-de-chat.ts"

npx esbuild "$SALIDA/regla.ts" --bundle --platform=node --format=esm \
  --outfile="$SALIDA/regla.mjs" --log-level=error

PGDIR=/tmp/pgnotaasesor
PORT=55463
if [ ! -d "$PGDIR" ]; then
  mkdir -p "$PGDIR" && chown postgres:postgres "$PGDIR"
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDIR -U postgres -A trust" >/dev/null
fi
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR -o '-p $PORT -k $PGDIR' -l $PGDIR/log start" >/dev/null 2>&1 || true
sleep 2
su postgres -c "/usr/lib/postgresql/16/bin/createdb -h $PGDIR -p $PORT -U postgres banco" 2>/dev/null || true

export DATABASE_URL="postgresql://postgres@localhost:$PORT/banco?host=$PGDIR"
export DIRECT_URL="$DATABASE_URL"
export AUTH_SECRET=banco NEXTAUTH_URL=http://localhost AUTH_RESEND_KEY=banco \
       S3_ACCESS_KEY=banco S3_SECRET_KEY=banco \
       S3_ENDPOINT=localhost S3_PUBLIC_URL=http://localhost GEMINI_API_KEY=banco \
       CRM_FOLLOW_UP_RUNNER_KEY=banco
npx prisma db push --skip-generate --accept-data-loss >/dev/null

npx esbuild lib/__tests__/fingido/entrada-nota-del-asesor.ts --bundle \
  --platform=node --format=esm --outfile="$SALIDA/entrada.mjs" \
  --external:@prisma/client --external:server-only \
  --banner:js='import{createRequire as __cr}from "module";const require=__cr(import.meta.url);' \
  --alias:NOTA_DE_VOZ="$NOTA" --log-level=error
sed -i '/server-only/d' "$SALIDA/entrada.mjs"

node --test lib/__tests__/transcribir-nota-del-asesor.test.mjs "$@"
