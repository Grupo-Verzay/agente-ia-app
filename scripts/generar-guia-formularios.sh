#!/usr/bin/env bash
# Genera las CAPTURAS y el VÍDEO de la guía pública de Mis formularios
# (`public/guia/formularios/`), sobre `/mis-formularios` servida de verdad. El
# trabajo lo hace el lanzador común de las guías (`generar-guia.sh`).
#
# Uso:  npm run build && scripts/generar-guia-formularios.sh
#       SIN_VIDEO=1 scripts/generar-guia-formularios.sh        (solo capturas)
#       SOLO_VIDEO=1 scripts/generar-guia-formularios.sh       (solo el vídeo: p. ej. al cambiar la narración)
#       SOLO_MINIATURAS=1 scripts/generar-guia-formularios.sh  (solo las miniaturas del índice)
#
# Después hay que volver a construir: `next start` solo sirve lo que había en
# `public/` al construir.
#
# El diálogo de Google Sheets enseña con qué correo se comparte la hoja. Lo pone
# el lanzador común, y es uno de EJEMPLO, el mismo de la guía de Google Sheets:
# la guía es pública y el de verdad no se publica.
exec "$(dirname "$0")/generar-guia.sh" formularios "$@"
