#!/usr/bin/env bash
# Registra (o actualiza) la plantilla "WordPress (un sitio)" en Portainer →
# Custom templates. Después, cada sitio nuevo es: Custom templates → WordPress
# (un sitio) → rellenar dominio y nombre corto → Deploy.
#
#   PORTAINER_URL=https://... PORTAINER_TOKEN=ptr_... ./registrar-plantilla.sh
set -euo pipefail
: "${PORTAINER_URL:?falta PORTAINER_URL}"
: "${PORTAINER_TOKEN:?falta PORTAINER_TOKEN}"
AQUI="$(cd "$(dirname "$0")" && pwd)"
TITULO="WordPress (un sitio)"
api() { curl -sS -H "X-API-Key: $PORTAINER_TOKEN" "$@"; }

CUERPO="$(python3 - "$AQUI/plantilla-portainer.yml" "$TITULO" <<'PY'
import json, sys
ruta, titulo = sys.argv[1:]
print(json.dumps({
  "title": titulo,
  "description": "Un WordPress con su MariaDB detrás de Traefik, sin límites de subida. Uno por dominio.",
  "note": "Apunta los registros A de @ y www al servidor para que salga el certificado. Las contraseñas: solo letras y números (openssl rand -hex 16).",
  "platform": 1,
  "type": 1,
  "logo": "https://s.w.org/style/images/about/WordPress-logotype-wmark.png",
  "fileContent": open(ruta).read(),
  "variables": [
    {"name": "DOMINIO", "label": "Dominio", "description": "Sin www, p. ej. verzay.com. El stack atiende dominio y www.dominio.", "defaultValue": ""},
    {"name": "SLUG", "label": "Nombre corto", "description": "Solo letras, números y guiones, p. ej. verzay-com. Nombra el router de Traefik.", "defaultValue": ""},
    {"name": "DB_PASSWORD", "label": "Contraseña de la base", "description": "Usuario wordpress de MariaDB.", "defaultValue": ""},
    {"name": "DB_ROOT_PASSWORD", "label": "Contraseña root de la base", "description": "", "defaultValue": ""},
    {"name": "TABLE_PREFIX", "label": "Prefijo de tablas", "description": "El del backup que se va a restaurar.", "defaultValue": "wp_"},
  ],
}))
PY
)"

EXISTENTE="$(api "$PORTAINER_URL/api/custom_templates" | python3 -c "
import json,sys
ids=[t['Id'] for t in json.load(sys.stdin) if t['Title']=='$TITULO']
print(ids[0] if ids else '')")"

if [ -n "$EXISTENTE" ]; then
  api -X PUT -H 'Content-Type: application/json' "$PORTAINER_URL/api/custom_templates/$EXISTENTE" --data-binary "$CUERPO" >/dev/null
  echo "Plantilla '$TITULO' actualizada (id $EXISTENTE)."
else
  api -X POST -H 'Content-Type: application/json' "$PORTAINER_URL/api/custom_templates/create/string" --data-binary "$CUERPO" \
    | python3 -c 'import json,sys; r=json.load(sys.stdin); print("Plantilla creada (id %s)." % r["Id"] if "Id" in r else ("Error: %s" % r))'
fi
