#!/usr/bin/env bash
# El banco de la PANTALLA de Copiloto (`/copiloto`): lo que se arregló al
# documentarla.
#
# Tres mitades, porque el cambio vive en tres capas:
#
#   1. Las REGLAS, puras (`lib/copiloto.ts`, y lo que usa de
#      `lib/integraciones.ts`): qué dirección se abre —la MISMA regla que las
#      apps de Integrar URLs—, dónde van los dos botones según el ancho del
#      copiloto y cuándo se ofrece la pantalla completa.
#   2. Un BARRIDO del código: que la pantalla y el marco común pasen por esas
#      reglas, y que no haya una segunda regla de direcciones.
#   3. La pantalla REAL en CHROMIUM con el copiloto de verdad dentro del marco
#      (el LibreChat local de `scripts/copiloto-de-la-guia.sh`, la misma
#      versión que producción): lo único que dice si los botones tapan alguno
#      del copiloto, porque su cabecera no es nuestra y cambia con su ancho.
#
# Guardar una integración (lo que «Fijar en Chats» escribe) lo prueba
# `scripts/banco-integraciones.sh`.
#
# `MODO=roto` monta el «antes» y AFIRMA los fallos: `?u=javascript:` llegando
# al marco y corriendo en la plataforma, y los botones encima de los del
# copiloto.
#
# El «antes» va PINCHADO a un commit, nunca a `origin/main`: en cuanto esto se
# fusione, `origin/main` pasa a ser el «ahora» y el modo roto se pondría verde
# sin ejercer nada.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO
ANTES_REF="${ANTES_REF:-ab6b110}"
export ANTES_REF

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

# El copiloto de verdad, dentro del marco. Sin él el banco no mide los botones
# (lo dice y se salta ese caso): se levanta aquí si no está.
if ! curl -s -o /dev/null -f "${COPILOTO_LOCAL:-http://localhost:3080}/login"; then
  scripts/copiloto-de-la-guia.sh
fi

mkdir -p lib/__tests__/.compilado

# ─────────────────────────────────────────────────────────────────────────────
# 1 y 2. Las reglas puras (el barrido lee los ficheros con `fs`, sin compilar)
# ─────────────────────────────────────────────────────────────────────────────
npx esbuild lib/copiloto.ts lib/integraciones.ts --bundle \
  --platform=node --format=esm --outdir=lib/__tests__/.compilado/copiloto \
  --alias:@/lib/integraciones=./lib/integraciones.ts \
  --log-level=error

MAIN_ANTES="app/(root)/copiloto/_components/.MainCopiloto-antes.tsx"
MARCO_ANTES="components/custom/.IframeRenderer-antes.tsx"
ENTRY=".banco-copiloto-entry.tsx"
trap 'rm -f "$MAIN_ANTES" "$MARCO_ANTES" "$ENTRY"' EXIT

# ─────────────────────────────────────────────────────────────────────────────
# 3. La pantalla REAL, con `?u=` leído de la dirección de la página
# ─────────────────────────────────────────────────────────────────────────────
PANTALLA="@/app/(root)/copiloto/_components/MainCopiloto"
if [ "$MODO" = "roto" ]; then
  # Cada fichero del «antes» junto a sus vecinos de hoy, para que sus rutas
  # resuelvan; lo único que se reescribe es el import del marco. Sin ese
  # alias, la pantalla vieja cargaría el marco de HOY —que ya sanea la
  # dirección— y el modo roto no reproduciría nada.
  git show "$ANTES_REF:components/custom/IframeRenderer.tsx" > "$MARCO_ANTES"
  git show "$ANTES_REF:app/(root)/copiloto/_components/MainCopiloto.tsx" \
    | sed 's#@/components/custom/IframeRenderer#@/components/custom/.IframeRenderer-antes#' \
    > "$MAIN_ANTES"
  PANTALLA="@/app/(root)/copiloto/_components/.MainCopiloto-antes"
fi

cat > "$ENTRY" <<'TSX'
import React from "react";
import { createRoot } from "react-dom/client";
import { MainCopiloto } from "__PANTALLA__";

(window as any).maqueta = () => {
    const raiz = ((window as any).__raiz ??= createRoot(document.getElementById("app")!));
    raiz.render(<MainCopiloto />);
};
(window as any).listo = true;
TSX
sed -i "s#__PANTALLA__#${PANTALLA}#" "$ENTRY"

node scripts/empaquetar-con-acciones-mudas.mjs "$ENTRY" lib/__tests__/.compilado/harness-copiloto.js \
  --alias:next/navigation=./lib/__tests__/fingido/next-navigation-de-la-url.ts

rm -f "$MAIN_ANTES" "$MARCO_ANTES" "$ENTRY"

node --test lib/__tests__/copiloto.test.mjs "$@"
