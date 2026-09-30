#!/usr/bin/env bash
# Las capturas y el vídeo de la guía de Google Sheets: el lanzador común con su módulo.
exec "$(dirname "$0")/generar-guia.sh" google-sheets "$@"
