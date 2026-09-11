#!/usr/bin/env bash
# Crea (o muestra) un stack de WordPress en Portainer para UN dominio.
#
#   PORTAINER_URL=https://... PORTAINER_TOKEN=ptr_... ./crear-stack.sh midominio.com [prefijo_de_tablas]
#
# - El stack se llama wp-<slug> (midominio.com → wp-midominio-com).
# - Genera las dos contraseñas de MariaDB y las deja como variables del stack en
#   Portainer (Stacks → wp-<slug> → Editor → Environment variables), que es donde
#   hay que ir a leerlas.
# - Si el stack ya existe, no hace nada y lo dice.
set -euo pipefail

DOMINIO="${1:?uso: crear-stack.sh <dominio> [prefijo_de_tablas]}"
TABLE_PREFIX="${2:-wp_}"
: "${PORTAINER_URL:?falta PORTAINER_URL}"
: "${PORTAINER_TOKEN:?falta PORTAINER_TOKEN}"
ENDPOINT_ID="${ENDPOINT_ID:-1}"

AQUI="$(cd "$(dirname "$0")" && pwd)"
SLUG="$(echo "$DOMINIO" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9\n' '-')"
NOMBRE="wp-${SLUG}"

api() { curl -sS -H "X-API-Key: $PORTAINER_TOKEN" "$@"; }

if api "$PORTAINER_URL/api/stacks" | python3 -c "import json,sys; sys.exit(0 if any(s['Name']=='$NOMBRE' for s in json.load(sys.stdin)) else 1)"; then
  echo "El stack $NOMBRE ya existe; no se toca."
  exit 0
fi

SWARM_ID="$(api "$PORTAINER_URL/api/endpoints/$ENDPOINT_ID/docker/swarm" | python3 -c 'import json,sys; print(json.load(sys.stdin)["ID"])')"
DB_PASSWORD="$(openssl rand -hex 16)"
DB_ROOT_PASSWORD="$(openssl rand -hex 16)"

CUERPO="$(python3 - "$NOMBRE" "$SWARM_ID" "$AQUI/docker-compose.yml" "$DOMINIO" "$SLUG" "$TABLE_PREFIX" "$DB_PASSWORD" "$DB_ROOT_PASSWORD" <<'PY'
import json, sys
nombre, swarm, ruta, dominio, slug, prefijo, pw, rootpw = sys.argv[1:]
print(json.dumps({
    "name": nombre,
    "swarmID": swarm,
    "stackFileContent": open(ruta).read(),
    "env": [
        {"name": "DOMINIO", "value": dominio},
        {"name": "SLUG", "value": slug},
        {"name": "TABLE_PREFIX", "value": prefijo},
        {"name": "DB_PASSWORD", "value": pw},
        {"name": "DB_ROOT_PASSWORD", "value": rootpw},
    ],
}))
PY
)"

RESPUESTA="$(api -X POST -H 'Content-Type: application/json' \
  "$PORTAINER_URL/api/stacks/create/swarm/string?endpointId=$ENDPOINT_ID" \
  --data-binary "$CUERPO")"

echo "$RESPUESTA" | python3 -c '
import json, sys
r = json.load(sys.stdin)
if "Id" in r:
    print(f"Stack {r[\"Name\"]} creado (id {r[\"Id\"]}).")
else:
    print("Portainer contestó con error:", r); sys.exit(1)'
echo "Dominio: https://$DOMINIO  (y www.$DOMINIO). Apunta los dos registros A al servidor antes de abrirlo."
