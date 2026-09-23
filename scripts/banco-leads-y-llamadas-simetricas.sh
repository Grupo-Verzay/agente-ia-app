#!/usr/bin/env bash
# Leads y CRM › Llamadas, simétricas: las dos tablas PINTADAS lado a lado.
#
# Cuatro cosas, y las cuatro solo se ven con el navegador:
#   1. Nombre, Fecha y Detalle de Llamadas pesan EXACTAMENTE lo que pesa la
#      tabla de Leads (sin el `font-medium` que se les había añadido) y van en
#      su mismo color de texto.
#   2. Resultado: una llamada SIN resultado —también la de una cuenta hija—
#      pinta el desplegable «Marcar resultado» con sus siete opciones; la que ya
#      tiene resultado sigue con su pastilla.
#   3. Las flechas de Llamadas siguen donde estaban (seis columnas, Acciones no).
#   4. Leads lleva flecha en WhatsApp, Nombre y Etiquetas, con el MISMO estilo
#      que las que ya tenía, y al pulsarlas ordena (Etiquetas, por cantidad).
#
# El lado del servidor —que marcar una llamada de una hija se GUARDA— va contra
# Postgres en `scripts/banco-crm-de-la-familia.sh`.
#
# `MODO=roto` pinta las dos tablas de un commit PINCHADO (`ANTES_REF`, nunca
# `origin/main`) y AFIRMA los fallos.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
# El estado de las dos tablas ANTES de este cambio.
ANTES_REF="${ANTES_REF:-84babf8}"
export MODO ANTES_REF

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

mkdir -p lib/__tests__/.compilado
ENTRY=".banco-leads-y-llamadas-entry.tsx"
ANTES_LEADS="app/(root)/sessions/_banco_simetria_antes"
ANTES_LLAMADAS="app/(root)/crm/llamadas/_banco_simetria_antes"
trap 'rm -rf "$ENTRY" "$ANTES_LEADS" "$ANTES_LLAMADAS"' EXIT

copiar_antes() { # $1 = carpeta de _components, $2 = destino hermano
  mkdir -p "$2"
  for f in $(git ls-tree --name-only "$ANTES_REF" "$1/" | xargs -n1 basename); do
    git show "$ANTES_REF":"$1/$f" > "$2/$f" || { echo "no se pudo leer $1/$f de $ANTES_REF" >&2; exit 1; }
  done
}

if [ "$MODO" = "roto" ]; then
  copiar_antes "app/(root)/sessions/_components" "$ANTES_LEADS"
  copiar_antes "app/(root)/crm/llamadas/_components" "$ANTES_LLAMADAS"
  DESDE_LEADS="@/app/(root)/sessions/_banco_simetria_antes/Columns"
  DESDE_LLAMADAS="@/app/(root)/crm/llamadas/_banco_simetria_antes/CallsCrmClient"
else
  DESDE_LEADS="@/app/(root)/sessions/_components/Columns"
  DESDE_LLAMADAS="@/app/(root)/crm/llamadas/_components/CallsCrmClient"
fi

sed -e "s#\"DESDE_LEADS\"#\"$DESDE_LEADS\"#" -e "s#\"DESDE_LLAMADAS\"#\"$DESDE_LLAMADAS\"#" \
  lib/__tests__/fingido/entrada-de-leads-y-llamadas.tsx > "$ENTRY"

npx esbuild --version >/dev/null
node scripts/empaquetar-con-acciones-mudas.mjs "$ENTRY" lib/__tests__/.compilado/harness-leads-y-llamadas.js \
  --alias:@/actions/calls-crm-actions=./lib/__tests__/fingido/llamadas-del-crm.ts \
  --alias:@/actions/cuentas-para-llamar-actions=./lib/__tests__/fingido/cuentas-para-llamar-de-mentira.ts \
  --alias:@/components/chats/AnfitrionDeLlamada=./lib/__tests__/fingido/anfitrion-mudo.ts \
  --alias:next/navigation=./lib/__tests__/fingido/next-navigation-mudo.ts \
  --alias:sonner=./lib/__tests__/fingido/sonner-mudo.ts

echo "── Leads y Llamadas simétricas (MODO=$MODO) ──"
node --test --test-reporter=spec lib/__tests__/leads-y-llamadas-simetricas.test.mjs "$@"
