#!/usr/bin/env bash
# Comprueba, SOLO LEYENDO, que el entorno de Claude Code de los agentes está
# montado como dice docs/entorno-claude-code-agentes.md.
#
# Se corre dentro de una sesión de Claude Code:
#     scripts/comprobar-entorno-de-agentes.sh
#
# Qué NO hace, a propósito:
#   - no imprime ningún token ni ninguna clave (solo si existen);
#   - no crea, cambia ni borra nada en Portainer ni en GitHub: todo son GET;
#   - no lista webhooks ni registros de Portainer, que llevan credenciales.
#
# Sale con 0 si lo imprescindible está (las cuatro variables y los dos
# Portainer contestan) y con 1 si falta algo. Lo que es solo aviso
# (un dominio que la red no deja ver, un servicio desplegado a mano) no tumba
# la salida: se dice.
set -uo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
MODULO="$AQUI/entorno-de-agentes.mjs"
fallos=0
ok()    { printf '  ok     %s\n' "$*"; }
aviso() { printf '  AVISO  %s\n' "$*"; }
mal()   { printf '  MAL    %s\n' "$*"; fallos=$((fallos + 1)); }

echo "1. Variables del entorno (solo los nombres)"
faltan=$(env | cut -d= -f1 | node --input-type=module -e "
  import { lasQueFaltan } from '$MODULO';
  const nombres = (await new Promise(r => { let s=''; process.stdin.on('data', d => s += d); process.stdin.on('end', () => r(s)); })).split('\n');
  console.log(lasQueFaltan(nombres).join(' '));")
if [ -z "$faltan" ]; then ok "están las cuatro"; else mal "faltan: $faltan"; fi

portainer() { # $1 = prefijo (PORTAINER o PORTAINER_EVO), $2 = ruta
  local url_var="$1_URL" tok_var="$1_TOKEN"
  curl -sS -m 20 -H "X-API-Key: ${!tok_var:-}" "${!url_var:-}$2"
}

echo "2. Los dos Portainer"
for P in PORTAINER PORTAINER_EVO; do
  url_var="${P}_URL"
  if [ -z "${!url_var:-}" ]; then mal "$P: sin URL"; continue; fi
  codigo=$(curl -sS -m 20 -o /dev/null -w '%{http_code}' -H "X-API-Key: $(v=${P}_TOKEN; echo "${!v:-}")" "${!url_var}/api/users/me" 2>/dev/null)
  if [ "$codigo" != "200" ]; then
    mal "$P (${!url_var}): contesta HTTP $codigo. ¿Token caducado, o el dominio no está en la lista de la red?"
    continue
  fi
  rol=$(portainer "$P" /api/users/me | node --input-type=module -e "
    import { elRolDelToken } from '$MODULO';
    let s=''; process.stdin.on('data', d => s += d);
    process.stdin.on('end', () => console.log(elRolDelToken(JSON.parse(s).Role)));")
  ok "$P (${!url_var}) contesta; el token es de un $rol"
  if [ "$rol" = "administrador" ]; then
    aviso "$P: el token es de ADMINISTRADOR: puede borrar cualquier stack. Ver «Hallazgos» en la guía."
  fi
done

echo "3. Lo que corre frente a lo último fusionado"
node --input-type=module -e "
  import { REPOSITORIOS } from '$MODULO';
  for (const r of REPOSITORIOS) console.log([r.repo, r.rama, r.panel, r.servicio, r.despliegue].join('|'));
" | while IFS='|' read -r repo rama panel servicio despliegue; do
  dir="/home/user/$repo"
  [ "$repo" = "agente-ia-app" ] && dir="$(cd "$AQUI/.." && pwd)"
  if ! git -C "$dir" rev-parse HEAD >/dev/null 2>&1; then
    aviso "$repo: no está clonado en esta sesión; no se compara"
    continue
  fi
  git -C "$dir" fetch -q --depth=5 origin "$rama" 2>/dev/null
  ultimo=$(git -C "$dir" rev-parse "origin/$rama" 2>/dev/null)
  fusion=$(git -C "$dir" log -1 --format=%cI "origin/$rama" 2>/dev/null)
  datos=$(portainer "$panel" /api/endpoints/1/docker/services 2>/dev/null)
  estado=$(printf '%s' "$datos" | node --input-type=module -e "
    import { estadoDelDespliegue } from '$MODULO';
    let s=''; process.stdin.on('data', d => s += d);
    process.stdin.on('end', () => {
      let lista = []; try { lista = JSON.parse(s); } catch {}
      const sv = Array.isArray(lista) ? lista.find(x => x.Spec?.Name === '$servicio') : null;
      if (!sv) { console.log('sin_servicio'); return; }
      console.log(estadoDelDespliegue({
        imagen: sv.Spec.TaskTemplate.ContainerSpec.Image,
        ultimoCommit: '$ultimo', servicioActualizado: sv.UpdatedAt, ultimaFusion: '$fusion' }));
    });")
  case "$estado" in
    al_dia) ok "$repo: $servicio corre ${ultimo:0:7}, lo último de $rama" ;;
    probablemente_al_dia) ok "$repo: $servicio (latest) se actualizó después de la última fusión" ;;
    sin_servicio) mal "$repo: no se encuentra el servicio $servicio en $panel" ;;
    *) aviso "$repo: $servicio → $estado (despliegue $despliegue)" ;;
  esac
done

echo "4. La red de la sesión"
for h in panel-n8n.ia-app.com panel-evo.ia-app.com github.com agente.ia-app.com; do
  c=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "https://$h/" 2>/dev/null)
  if [ "$c" = "000" ]; then
    case "$h" in
      agente.ia-app.com) aviso "$h: la red no lo deja ver (el agente no puede abrir la App para comprobarla)";;
      *) mal "$h: la red no lo deja ver";;
    esac
  else ok "$h alcanzable (HTTP $c)"; fi
done

echo
if [ "$fallos" -eq 0 ]; then echo "Entorno de agentes: bien."; exit 0; fi
echo "Entorno de agentes: $fallos cosa(s) por arreglar. Ver docs/entorno-claude-code-agentes.md"
exit 1
