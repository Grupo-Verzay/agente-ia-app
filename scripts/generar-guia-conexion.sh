#!/usr/bin/env bash
# Genera las CAPTURAS y el VÍDEO de la guía pública de Conexión y Ajustes
# (`public/guia/conexion/`), sobre `/profile` servida de verdad. El trabajo lo
# hace el lanzador común de las guías (`generar-guia.sh`).
#
# Uso:  npm run build && scripts/generar-guia-conexion.sh
#       SIN_VIDEO=1 scripts/generar-guia-conexion.sh        (solo capturas)
#       SOLO_VIDEO=1 scripts/generar-guia-conexion.sh       (solo el vídeo)
#       SOLO_MINIATURAS=1 scripts/generar-guia-conexion.sh  (solo las miniaturas del índice)
#
# Después hay que volver a construir: `next start` solo sirve lo que había en
# `public/` al construir.
exec "$(dirname "$0")/generar-guia.sh" conexion "$@"
