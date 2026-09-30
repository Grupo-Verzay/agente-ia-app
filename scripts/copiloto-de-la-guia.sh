#!/usr/bin/env bash
# Levanta el COPILOTO de las capturas de la guía de Copiloto: el mismo LibreChat
# que corre en producción (`copiloto.ia-app.com`), en local, con su base y su
# buscador, y con la IA de ejemplo (`copiloto-de-la-guia/ia-de-ejemplo.mjs`) en
# lugar de OpenAI y DeepSeek.
#
# Por qué no se capturan las pantallas contra producción:
#   - desde este entorno no se llega a `copiloto.ia-app.com` (la política de red
#     no lo deja), y aunque se llegara, las capturas escribirían conversaciones
#     en la cuenta de alguien;
#   - cada respuesta del copiloto de verdad cuesta dinero, y la guía es
#     pública: no puede enseñar la conversación de un cliente.
#
# Lo que SÍ es igual a producción, y es lo que hace que las capturas no mientan:
#   - la imagen, fijada por su huella (la v0.8.7 que corre allí);
#   - la configuración: `librechat.yaml` de producción, con el `baseURL` de
#     DeepSeek apuntando a la IA de ejemplo;
#   - el acceso: registro abierto y entrada por correo, como allí
#     (`ALLOW_REGISTRATION=true`, `ALLOW_EMAIL_LOGIN=true`, leídos del servicio
#     de producción).
# Lo único que falta es el servicio de búsqueda en documentos (`rag_api`), que
# no se publica en Docker Hub; ninguna captura lo usa.
#
# Y lo único que se AFLOJA a propósito es el tope de entradas: el copiloto
# deja 7 por cada 5 minutos y castiga al que se pasa, y las capturas entran
# una vez por anchura y por contexto (su sesión no se puede reutilizar: el
# token de refresco rota). Con el tope de producción, la décima entrada se
# quedaba esperando un formulario que ya no llega, sin ningún error a la vista.
#
# La base del copiloto nace VACÍA en cada arranque (sin volumen): así las
# capturas salen siempre del mismo punto de partida. Crea la cuenta de las
# capturas (la misma persona que entra a la plataforma: «Mi Negocio»).
#
# Uso:  scripts/copiloto-de-la-guia.sh          (arranca y deja todo corriendo)
#       scripts/copiloto-de-la-guia.sh parar     (lo apaga)
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
DIR=scripts/copiloto-de-la-guia
PUERTO=3080
LOG=/tmp/copiloto-de-la-guia
mkdir -p "$LOG"

# Las imágenes, fijadas por su huella: la de LibreChat es la de producción.
IMAGEN_LIBRECHAT="librechat/librechat:v0.8.7"
IMAGEN_MONGO="mongo@sha256:340c1c56fb10e95cf79ff547f8664b96bc6ead9909bc355238cbf865a9695a6f"
IMAGEN_MEILI="getmeili/meilisearch@sha256:c9fac23131cca4db95173d41cc50fd5639121ee381795528fdd7522d7978a7b8"

parar() {
  docker rm -f cop-guia-app cop-guia-mongo cop-guia-meili >/dev/null 2>&1 || true
  pkill -f "copiloto-de-la-guia/[i]a-de-ejemplo.mjs" 2>/dev/null || true
}

if [ "${1:-}" = "parar" ]; then
  parar
  echo "[copiloto] parado"
  exit 0
fi

# Docker: en este entorno el demonio no arranca solo.
if ! docker info >/dev/null 2>&1; then
  (setsid dockerd >"$LOG/dockerd.log" 2>&1 </dev/null &)
  for _ in $(seq 1 40); do docker info >/dev/null 2>&1 && break; sleep 1; done
  docker info >/dev/null 2>&1 || { echo "[copiloto] no arrancó Docker (ver $LOG/dockerd.log)" >&2; exit 1; }
fi

parar

# La IA de ejemplo, en el puerto que la configuración espera.
(setsid node "$DIR/ia-de-ejemplo.mjs" >"$LOG/ia-de-ejemplo.log" 2>&1 </dev/null &)

docker run -d --name cop-guia-mongo --network host "$IMAGEN_MONGO" \
  mongod --noauth --port 27117 --bind_ip 127.0.0.1 >/dev/null
docker run -d --name cop-guia-meili --network host \
  -e MEILI_NO_ANALYTICS=true -e MEILI_MASTER_KEY=clave-local-de-ejemplo -e MEILI_HTTP_ADDR=127.0.0.1:7717 \
  "$IMAGEN_MEILI" >/dev/null

# Secretos de usar y tirar: nada de esto sale de este equipo.
SECRETO=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
docker run -d --name cop-guia-app --network host \
  -v "$PWD/$DIR/librechat.yaml:/app/librechat.yaml:ro" \
  -e HOST=127.0.0.1 -e PORT=$PUERTO \
  -e MONGO_URI=mongodb://127.0.0.1:27117/LibreChat \
  -e MEILI_HOST=http://127.0.0.1:7717 -e MEILI_MASTER_KEY=clave-local-de-ejemplo \
  -e OPENAI_API_KEY=sk-local-de-ejemplo -e OPENAI_REVERSE_PROXY=http://127.0.0.1:4010/v1 \
  -e DEEPSEEK_API_KEY=local-de-ejemplo \
  -e JWT_SECRET="$SECRETO" -e JWT_REFRESH_SECRET="${SECRETO}r" \
  -e CREDS_KEY="$SECRETO" -e CREDS_IV="${SECRETO:0:32}" \
  -e ALLOW_REGISTRATION=true -e ALLOW_EMAIL_LOGIN=true \
  -e LOGIN_MAX=500 -e LOGIN_WINDOW=1 -e BAN_VIOLATIONS=false \
  -e DOMAIN_CLIENT=http://localhost:$PUERTO -e DOMAIN_SERVER=http://localhost:$PUERTO \
  -e TRUST_PROXY=1 -e CONFIG_PATH=/app/librechat.yaml \
  "$IMAGEN_LIBRECHAT" >/dev/null

for _ in $(seq 1 120); do
  curl -sf -o /dev/null "http://localhost:$PUERTO/api/config" && break
  sleep 1
done
curl -sf -o /dev/null "http://localhost:$PUERTO/api/config" || { echo "[copiloto] no contesta en :$PUERTO (docker logs cop-guia-app)" >&2; exit 1; }

# La cuenta de las capturas, la misma persona que entra a la plataforma.
curl -s -o /dev/null -X POST "http://localhost:$PUERTO/api/auth/register" \
  -H 'content-type: application/json' \
  -d '{"name":"Mi Negocio","username":"minegocio","email":"jefe@banco.test","password":"banco1234","confirm_password":"banco1234"}'

echo "[copiloto] listo en http://localhost:$PUERTO (v0.8.7, IA de ejemplo)"
