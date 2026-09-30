#!/usr/bin/env bash
# Genera las CAPTURAS y el VÍDEO de la guía pública de Usuarios
# (`public/guia/usuarios/`), sobre `/equipo` servida de verdad. El trabajo lo
# hace el lanzador común de las guías (`generar-guia.sh`).
#
# Uso:  npm run build && scripts/generar-guia-usuarios.sh
#       SIN_VIDEO=1 scripts/generar-guia-usuarios.sh        (solo capturas)
#       SOLO_VIDEO=1 scripts/generar-guia-usuarios.sh       (solo el vídeo: p. ej. al cambiar la narración)
#       SOLO_MINIATURAS=1 scripts/generar-guia-usuarios.sh  (solo las miniaturas del índice)
#
# Después hay que volver a construir: `next start` solo sirve lo que había en
# `public/` al construir.
exec "$(dirname "$0")/generar-guia.sh" usuarios "$@"
