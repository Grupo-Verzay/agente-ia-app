#!/usr/bin/env bash
# Genera el VÍDEO DE APERTURA DEL CANAL DE YOUTUBE
# (`public/demo/verzay-youtube.mp4`): «Mientras tú dormías, esto pasó con un
# cliente». Es la misma historia de Laura que el vídeo de ventas, contada de
# noche, con la llamada de la IA completa y el cierre con varias líneas y
# asesores a la vez. El arranque —Postgres, la App servida, la semilla y el
# estudio— es el del vídeo de ventas; lo único propio es el grabador.
#
# Uso:  npm run build && scripts/generar-video-de-youtube.sh
#       ENSAYO=1 scripts/generar-video-de-youtube.sh   (deja el vídeo en el directorio de trabajo)
#
# Después hay que volver a construir: `next start` solo sirve lo que había en
# `public/` al construir.
set -euo pipefail
cd "$(dirname "$0")/.."
export TRABAJO="${TRABAJO:-/tmp/video-de-youtube}"
export GRABADOR="${GRABADOR:-scripts/grabar-video-de-youtube.mjs}"
exec scripts/generar-video-de-ventas.sh "$@"
