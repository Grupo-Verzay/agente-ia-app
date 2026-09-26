#!/usr/bin/env bash
# El banco de la mitad de la App: CRM › Reglas no promete una SOLICITUD que el
# servidor no va a archivar.
#
# La regla de verdad —«solo es SOLICITUD si están los tres datos concretos»— la
# añade al prompt y la comprueba el BACKEND (`api-webhook`,
# `lead-funnel/utils/solicitud-con-datos.ts`, con su propio banco). Aquí se
# prueba lo que esta App aporta: el texto por defecto del clasificador, que es
# el que se guarda en `agentPrompt` en cuanto alguien abre esa pantalla, y el
# aviso de la pantalla para las cuentas que lo guardaron hace meses.
#
#   ./scripts/banco-solicitud-en-las-reglas.sh            el arreglo
#   MODO=roto ./scripts/banco-solicitud-en-las-reglas.sh  lee los MISMOS
#     ficheros de un commit PINCHADO (ANTES_REF) y AFIRMA el fallo: SOLICITUD
#     definida como «pide información» y la pantalla sin decir nada.
set -euo pipefail
cd "$(dirname "$0")/.."

# El commit anterior a este cambio. Pinchado a propósito: `origin/main` pasa a
# ser el «después» en cuanto esto se fusione, y el modo roto se pondría verde
# sin ejercer nada.
export ANTES_REF="${ANTES_REF:-4e3bddf}"
export PATH="/opt/node22/bin:$PATH"

mkdir -p lib/__tests__/.compilado
npx esbuild lib/crm-ai-prompt-rules.ts --bundle --platform=node --format=esm \
  --outfile=lib/__tests__/.compilado/crm-ai-prompt-rules.js \
  --alias:@=. --log-level=warning

echo "== el arreglo =="
node --test --test-reporter=spec lib/__tests__/solicitud-en-las-reglas-del-crm.test.mjs "$@"

echo
echo "== MODO=roto: el codigo de $ANTES_REF, afirmando el fallo =="
MODO=roto node --test --test-reporter=spec lib/__tests__/solicitud-en-las-reglas-del-crm.test.mjs "$@"
