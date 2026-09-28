#!/usr/bin/env bash
# El panel de la campana mide LO MISMO que los paneles laterales (chat del
# equipo, copiloto, notas, ficha de contacto): `--ancho-lateral`.
#
# En Chromium sobre el CSS del build, con la campana real y la franja real de
# `PanelLateral` en la misma página (`campana-ancho-navegador.test.mjs`), a
# 1440/1280/1024/800/700 y en un teléfono; y la rejilla de nueve pastillas
# (`campana-navegador.test.mjs`) sigue simétrica y sin recortes también ahí.
#
# `MODO=roto` monta la campana de `ANTES_REF` —pinchado a un commit, nunca a
# `origin/main`— y AFIRMA el fallo: 420 px, más ancha que los paneles.
#
# Necesita el build (`npm run build`) para el CSS.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
MODO="${MODO:-bueno}"
export MODO
# a62250d — antes de esto: la campana en `min(96vw,420px)`.
ANTES_REF="${ANTES_REF:-a62250d}"

npx -y esbuild --version >/dev/null
OUT=lib/__tests__/.compilado/campana
ANTES=lib/__tests__/.antes/campana-ancho
mkdir -p "$OUT" "$ANTES"
NAV=(
  --alias:@/actions/notification-center-actions=./lib/__tests__/fingido/campana/notificaciones.ts
  --alias:@/actions/collab-actions=./lib/__tests__/fingido/campana/colaboracion.ts
  --alias:@/actions/correo-actions=./lib/__tests__/fingido/campana/correos.ts
)
if [ "$MODO" = "roto" ]; then
  git show "$ANTES_REF:components/shared/NotificationCenter.tsx" > "$ANTES/NotificationCenter.tsx"
  git show "$ANTES_REF:lib/campana.ts" > "$ANTES/campana.ts"
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/fingido/campana/entrada.tsx $OUT/ancho-antes.js "${NAV[@]}" \
    "--alias:@/components/shared/NotificationCenter=./$ANTES/NotificationCenter.tsx" \
    "--alias:@/lib/campana=./$ANTES/campana.ts"
  node --test --test-concurrency=1 lib/__tests__/campana-ancho-navegador.test.mjs
else
  node scripts/empaquetar-con-acciones-mudas.mjs \
    lib/__tests__/fingido/campana/entrada.tsx $OUT/navegador.js "${NAV[@]}"
  node --test --test-concurrency=1 \
    lib/__tests__/campana-ancho-navegador.test.mjs lib/__tests__/campana-navegador.test.mjs
fi
