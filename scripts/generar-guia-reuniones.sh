#!/usr/bin/env bash
# Genera las CAPTURAS y el VÍDEO de la guía pública de Reuniones
# (`public/guia/reuniones/`), sobre `/reuniones` servida de verdad. El trabajo
# lo hace el lanzador común de las guías (`generar-guia.sh`); lo propio de
# Reuniones —las tres personas con su cámara de mentira, el servidor de los
# ficheros de las grabaciones— lo pone `capturar-guia-reuniones.mjs`.
#
# Uso:  npm run build && scripts/generar-guia-reuniones.sh
#       SIN_VIDEO=1 scripts/generar-guia-reuniones.sh        (solo capturas)
#       SOLO_VIDEO=1 scripts/generar-guia-reuniones.sh       (solo el vídeo: p. ej. al cambiar la narración)
#
# Después hay que volver a construir: `next start` solo sirve lo que había en
# `public/` al construir.
exec "$(dirname "$0")/generar-guia.sh" reuniones "$@"
