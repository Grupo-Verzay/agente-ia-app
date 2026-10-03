#!/usr/bin/env bash
# Genera las CAPTURAS y el VÍDEO de la guía pública de Embudos
# (`public/guia/embudos/`), sobre `/embudos` servida de verdad. El
# trabajo lo hace el lanzador común de las guías (`generar-guia.sh`).
#
# Uso:  npm run build && scripts/generar-guia-embudos.sh
#       SIN_VIDEO=1 scripts/generar-guia-embudos.sh        (solo capturas)
#       SOLO_VIDEO=1 scripts/generar-guia-embudos.sh       (solo el vídeo)
#       SOLO_MINIATURAS=1 scripts/generar-guia-embudos.sh  (solo las miniaturas)
#
# Después hay que volver a construir: `next start` solo sirve lo que había en
# `public/` al construir.
exec "$(dirname "$0")/generar-guia.sh" embudos "$@"
