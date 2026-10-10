#!/usr/bin/env bash
# Genera el VIDEO COMERCIAL DE UN PLAN (`public/videos-de-planes/<plan>.mp4`): el que sale
# arriba en «Ver todo lo que incluye» de ese plan en la landing. La fórmula y lo
# que dice cada plan viven en `scripts/video-de-ventas/planes.mjs`.
#
#   npm run build && scripts/generar-video-del-plan.sh esencial
#   ENSAYO=1 scripts/generar-video-del-plan.sh esencial   (todo en /tmp/video-de-ventas)
#   SOLO_MONTAJE=1 …                                       (reutiliza el caso ya grabado)
#
# 1. Graba el caso de uso con la App de verdad (`generar-video-de-ventas.sh` con
#    `PLAN=<plan>`: solo las escenas del plan).
# 2. Lo monta con los trozos de los videotutoriales, las tarjetas, el avatar,
#    la música y la voz (`montar-video-del-plan.mjs`).
#
# Las frases nuevas se sintetizan antes, desde el contenedor de la App:
#   node scripts/sintetizar-en-el-contenedor.mjs scripts/video-de-ventas/narracion-del-plan.mjs
#
# Después hay que volver a construir: `next start` solo sirve lo que había en
# `public/` al construir. El enlace (`/videos-de-planes/<plan>.mp4`) se pega en el panel
# de Planes, en el video del plan.
set -euo pipefail
cd "$(dirname "$0")/.."
PLAN="${1:-${PLAN:-}}"
[ -n "$PLAN" ] || { echo "Uso: scripts/generar-video-del-plan.sh <plan>" >&2; exit 1; }
export PLAN
export PATH="/opt/node22/bin:$PATH"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
export TRABAJO="${TRABAJO:-/tmp/video-de-ventas}"

if [ "${SOLO_MONTAJE:-}" != "1" ]; then
  # El caso de uso siempre se graba como ensayo de la App: lo que se publica es el montaje.
  scripts/generar-video-de-ventas.sh
fi
node scripts/video-de-ventas/montar-video-del-plan.mjs
