#!/usr/bin/env bash
# Las capturas y el vídeo de la guía de Agente IA: el lanzador de todas las
# guías (`generar-guia.sh`) con su módulo.
#   npm run build && scripts/generar-guia-agente-ia.sh && npm run build
exec "$(dirname "$0")/generar-guia.sh" agente-ia "$@"
