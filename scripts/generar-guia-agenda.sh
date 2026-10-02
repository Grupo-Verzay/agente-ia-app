#!/usr/bin/env bash
# Genera las CAPTURAS y el VÍDEO de la guía pública de Agenda
# (`public/guia/agenda/`), sobre `/schedule` servida de verdad. El trabajo lo
# hace el lanzador común de las guías (`generar-guia.sh`).
#
# Uso:  npm run build && scripts/generar-guia-agenda.sh
#       SIN_VIDEO=1 scripts/generar-guia-agenda.sh        (solo capturas)
#       SOLO_VIDEO=1 scripts/generar-guia-agenda.sh       (solo el vídeo)
#       SOLO_MINIATURAS=1 scripts/generar-guia-agenda.sh  (solo las miniaturas del índice)
#
# Después hay que volver a construir: `next start` solo sirve lo que había en
# `public/` al construir.
exec "$(dirname "$0")/generar-guia.sh" agenda "$@"
