#!/usr/bin/env bash
# Genera las CAPTURAS y el VÍDEO de la guía pública de AI Imágenes
# (`public/guia/ai-imagenes/`), sobre `/ai-image` servida de verdad. El trabajo
# lo hace el lanzador común de las guías (`generar-guia.sh`), que además carga
# el Gemini fingido (`fingido-guia-ai-imagenes.mjs`) dentro de `next start`.
#
# Uso:  npm run build && scripts/generar-guia-ai-imagenes.sh
#       SIN_VIDEO=1 scripts/generar-guia-ai-imagenes.sh   (solo capturas y miniaturas)
#       SOLO_VIDEO=1 scripts/generar-guia-ai-imagenes.sh  (solo el vídeo: p. ej. al cambiar la narración)
#
# Las miniaturas del índice se toman junto a sus capturas —hacen falta una
# tanda generada y el kit—, así que aquí no hay SOLO_MINIATURAS.
#
# Después hay que volver a construir: `next start` solo sirve lo que había en
# `public/` al construir.
exec "$(dirname "$0")/generar-guia.sh" ai-imagenes "$@"
