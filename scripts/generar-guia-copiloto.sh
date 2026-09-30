#!/usr/bin/env bash
# Genera las CAPTURAS y el VÍDEO de la guía pública de Copiloto
# (`public/guia/copiloto/`), sobre `/copiloto` servida de verdad. El trabajo lo
# hace el lanzador común de las guías (`generar-guia.sh`); lo propio de Copiloto
# es que dentro de la pantalla va el copiloto de IA, y ese corre en LOCAL
# (`copiloto-de-la-guia.sh`: el mismo LibreChat de producción, con una IA de
# ejemplo). Si no está corriendo, se arranca aquí.
#
# Uso:  npm run build && scripts/generar-guia-copiloto.sh
#       SIN_VIDEO=1 scripts/generar-guia-copiloto.sh   (solo capturas)
#       SOLO_VIDEO=1 scripts/generar-guia-copiloto.sh  (solo el vídeo)
#
# Después hay que volver a construir: `next start` solo sirve lo que había en
# `public/` al construir.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! curl -sf -o /dev/null "${COPILOTO_LOCAL:-http://localhost:3080}/login"; then
  scripts/copiloto-de-la-guia.sh
fi

exec scripts/generar-guia.sh copiloto "$@"
