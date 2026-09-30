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
# El diálogo de Google Sheets enseña con QUÉ correo se comparte la hoja, y lo
# saca de la cuenta de servicio de la plataforma. Aquí va SOLO ese correo —el
# de producción, que la pantalla enseña a cualquier cliente: no es un
# secreto—, sin ninguna llave: la guía no escribe en ninguna hoja.
export GOOGLE_SERVICE_ACCOUNT_JSON='{"client_email":"agente-ia@ia-crm-496602.iam.gserviceaccount.com"}'
exec "$(dirname "$0")/generar-guia.sh" formularios "$@"
