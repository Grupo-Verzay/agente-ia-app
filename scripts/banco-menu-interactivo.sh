#!/usr/bin/env bash
# El banco del «Menú con botones» en la App, en dos modos.
#
# Compila la regla de la App y, si el backend está al lado (../api-webhook), la
# suya, para comprobar que dicen lo mismo. MODO=roto lee los ficheros de
# ANTES_REF (sin el paso) y AFIRMA que no existía.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/node22/bin:$PATH"

MAYOR="$(npx tsc --version | sed -E 's/^Version ([0-9]+).*/\1/')"
SIN_CONFIG=""
if [ "${MAYOR:-0}" -ge 6 ]; then SIN_CONFIG="--ignoreConfig"; fi
compilar() {
  npx tsc "$1" --outDir "$2" --module es2022 --target es2022 --lib es2022,dom \
    --moduleResolution bundler --skipLibCheck $SIN_CONFIG
}
compilar lib/workflow-menu.ts lib/__tests__/.compilado/menu
BACK="../api-webhook/src/modules/workflow/menu-de-opciones.ts"
if [ -f "$BACK" ]; then compilar "$BACK" lib/__tests__/.compilado/menu-backend; fi

echo "── lo que corre ──"
node --test lib/__tests__/menu-interactivo.test.mjs
echo
echo "── ANTES_REF (afirma que no había paso con botones) ──"
MODO=roto node --test lib/__tests__/menu-interactivo.test.mjs
