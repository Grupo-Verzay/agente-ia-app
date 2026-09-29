#!/usr/bin/env bash
# La barra de arriba de la guía pública: una sola fila simétrica con
# «Guía de la plataforma», «▶ Demostración en 1 minuto» y «Módulo Leads», y el
# vídeo justo debajo sin título aparte. Hace falta el build (`.next/static/css`).
#
# `MODO=roto` pinta la barra y la página de ANTES_CABECERA_REF (9e38996) y
# afirma el fallo: la demostración como título aparte encima del vídeo.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
[ -d .next/static/css ] || { echo "falta el build: npm run build"; exit 1; }
node scripts/probar-cabecera-de-la-guia.mjs
