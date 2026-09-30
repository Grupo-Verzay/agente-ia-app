#!/usr/bin/env bash
# Genera las CAPTURAS y el VÍDEO de la guía pública de Mis macros
# (`public/guia/macros/`), sobre `/macros` servida de verdad. El trabajo lo hace
# el lanzador común de las guías (`generar-guia.sh`).
#
# Uso:  npm run build && scripts/generar-guia-macros.sh
#       SIN_VIDEO=1 scripts/generar-guia-macros.sh        (solo capturas)
#       SOLO_VIDEO=1 scripts/generar-guia-macros.sh       (solo el vídeo: p. ej. al cambiar la narración)
#       SOLO_MINIATURAS=1 scripts/generar-guia-macros.sh  (solo las miniaturas del índice)
#
# Después hay que volver a construir: `next start` solo sirve lo que había en
# `public/` al construir.
exec "$(dirname "$0")/generar-guia.sh" macros "$@"
