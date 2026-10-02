#!/usr/bin/env bash
# Genera las capturas y el vídeo de la guía pública de Llamadas
# (`public/guia/llamadas/`). Todo el trabajo lo hace el lanzador común.
#
# Uso:  npm run build && scripts/generar-guia-llamadas.sh && npm run build
exec "$(dirname "$0")/generar-guia.sh" llamadas "$@"
