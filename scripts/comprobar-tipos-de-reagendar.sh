#!/usr/bin/env bash
# El despliegue de #999 y #1000 se cayó en `next build` —no en ningún banco—:
# #998 (Reagendar) importaba `losRecordatoriosDeLaCita` de `lib/cita-publica`
# y #999 la había movido a `lib/recordatorios-de-la-cita`. Cada PR compilaba
# solo; juntos, no. Un banco que empaqueta con esbuild no lo ve (esbuild no
# comprueba tipos), así que esto pasa `tsc` por los ficheros de esa colisión
# y todo lo que importan.
#
#   scripts/comprobar-tipos-de-reagendar.sh            → tiene que compilar
#   MODO=roto scripts/comprobar-tipos-de-reagendar.sh  → contra COLISION_REF
#       (el main que no desplegó) y AFIRMA el error de producción.
set -euo pipefail
cd "$(dirname "$0")/.."
COLISION_REF="${COLISION_REF:-0583de4}"
RAIZ="$(pwd)"

comprobar() {
  local dir="$1"
  cat > "$dir/tsconfig.banco-reagendar.json" <<JSON
{
  "extends": "./tsconfig.json",
  "include": ["next-env.d.ts", "global.d.ts", "types/**/*.d.ts"],
  "files": ["lib/reagendar-cita.server.ts", "lib/recordatorios-de-la-cita.server.ts", "actions/appointments-actions.ts"]
}
JSON
  (cd "$dir" && "$RAIZ/node_modules/.bin/tsc" --noEmit -p tsconfig.banco-reagendar.json) 2>&1
  local r=$?
  rm -f "$dir/tsconfig.banco-reagendar.json"
  return $r
}

if [ "${MODO:-}" = "roto" ]; then
  WT="$(mktemp -d)"
  trap 'git worktree remove --force "$WT" >/dev/null 2>&1 || rm -rf "$WT"' EXIT
  git worktree add --detach "$WT" "$COLISION_REF" >/dev/null 2>&1
  ln -s "$RAIZ/node_modules" "$WT/node_modules"
  set +e; SALIDA="$(comprobar "$WT")"; R=$?; set -e
  if [ $R -ne 0 ] && grep -q "has no exported member 'losRecordatoriosDeLaCita'" <<<"$SALIDA"; then
    echo "ok — ANTES ($COLISION_REF): no compila, con el mismo error que tumbó el despliegue"
  else
    echo "MAL — el modo roto no reproduce el fallo de $COLISION_REF"; echo "$SALIDA" | head -20; exit 1
  fi
else
  set +e; SALIDA="$(comprobar "$RAIZ")"; R=$?; set -e
  if [ $R -eq 0 ]; then echo "ok — los ficheros de Reagendar y los recordatorios compilan"
  else echo "MAL — no compila:"; echo "$SALIDA" | head -20; exit 1; fi
fi
