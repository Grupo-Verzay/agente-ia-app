#!/usr/bin/env bash
# Genera las capturas y el vídeo de la guía pública de Chats
# (`public/guia/chats/`). Todo el trabajo lo hace el lanzador común.
#
# Uso:  npm run build && scripts/generar-guia-chats.sh && npm run build
exec "$(dirname "$0")/generar-guia.sh" chats "$@"
