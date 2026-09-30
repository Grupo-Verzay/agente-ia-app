#!/usr/bin/env bash
# Genera las CAPTURAS y el VÍDEO de la guía pública de Respuestas Rápidas
# (`public/guia/respuestas-rapidas/`), sobre `/auto-replies` servida de verdad. El trabajo lo hace
# el lanzador común de las guías (`generar-guia.sh`).
#
# Uso:  npm run build && scripts/generar-guia-respuestas-rapidas.sh
#       SIN_VIDEO=1 scripts/generar-guia-respuestas-rapidas.sh        (solo capturas)
#       SOLO_VIDEO=1 scripts/generar-guia-respuestas-rapidas.sh       (solo el vídeo: p. ej. al cambiar la narración)
#       SOLO_MINIATURAS=1 scripts/generar-guia-respuestas-rapidas.sh  (solo las miniaturas del índice)
#
# Después hay que volver a construir: `next start` solo sirve lo que había en
# `public/` al construir.
exec "$(dirname "$0")/generar-guia.sh" respuestas-rapidas "$@"
