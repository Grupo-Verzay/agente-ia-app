#!/usr/bin/env bash
# El banco del RESUMEN ANUAL POR MES de Finanzas en MODO OSCURO.
#
# El mes seleccionado se pintaba con `bg-sky-50` —un celeste claro FIJO— y su
# número heredaba el color del texto del tema: en oscuro, casi blanco sobre casi
# blanco. Y un mes en pérdidas usaba `text-destructive`, que en oscuro es un
# rojo OSCURO sobre la tarjeta oscura. En claro las dos cosas se veían bien.
#
# Monta la casilla de VERDAD (`MesDelResumenAnual`) y la de ANTES —el JSX de la
# rejilla sacado con `git show` de ANTES_REF, pinchado a un commit y nunca a
# `origin/main`, que deja de servir en cuanto esto se fusione— sobre el CSS del
# build, en Chromium, en claro y en oscuro, y mide el CONTRASTE del número contra
# el fondo que de verdad tiene detrás (componiendo las capas con alfa).
#
#   modo bueno: en oscuro todo número se lee (≥ 4,5) y el mes elegido sigue
#               marcado; en claro NO cambia ni un color respecto a antes.
#   MODO=roto:  afirma el fallo de antes —el valor del mes elegido en blanco
#               sobre blanco y el mes en pérdidas ilegible—.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
export MODO="${MODO:-bueno}"
ANTES_REF="${ANTES_REF:-fd21c8f}"

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

OUT=lib/__tests__/.compilado/resumen-anual-oscuro
ANTES=lib/__tests__/.antes/resumen-anual-oscuro
mkdir -p "$OUT" "$ANTES"

# El «antes»: la casilla vivía escrita dentro de page.tsx. Se saca su JSX tal
# cual y se envuelve en un componente con la misma firma que el de hoy. Si la
# marca no aparece exactamente una vez, se cae con estruendo: un «antes» vacío
# daría un modo roto que no mide nada.
git show "$ANTES_REF:app/(root)/(protected)/dashboard/finance/page.tsx" > "$ANTES/page.tsx"
python3 - "$ANTES" <<'PY'
import sys, pathlib
d = pathlib.Path(sys.argv[1])
s = (d / "page.tsx").read_text()
marca = "{annualRows.map((row) => ("
if s.count(marca) != 1:
    sys.exit(f"la marca de la rejilla aparece {s.count(marca)} veces en el page.tsx de antes")
ini = s.index("<Link", s.index(marca))
fin = s.index("</Link>", ini) + len("</Link>")
jsx = s[ini:fin]
if "bg-sky-50" not in jsx:
    sys.exit("el JSX de antes no trae el fondo del mes elegido: no es la casilla que se busca")
(d / "MesDelResumenAnual.tsx").write_text(
    "import Link from 'next/link';\n"
    "export function MesDelResumenAnual({ mes: row, formato: formatPreferred }: any) {\n"
    "  const cuentasEnElEnlace = '';\n"
    f"  return (\n{jsx}\n  );\n}}\n"
)
PY

empaquetar() { # $1 = nombre de salida, $2 = ruta del componente
  npx esbuild lib/__tests__/fingido/entrada-resumen-anual.tsx --bundle --format=iife \
    --outfile="$OUT/$1.js" --jsx=automatic --define:process.env.NODE_ENV=\"production\" \
    --alias:next/link=./lib/__tests__/fingido/next-link-ssr.tsx \
    --alias:@mes-del-resumen="$2" --log-level=error
}
empaquetar ahora "./app/(root)/(protected)/dashboard/finance/_components/MesDelResumenAnual.tsx"
empaquetar antes "./$ANTES/MesDelResumenAnual.tsx"

node --test lib/__tests__/resumen-anual-oscuro.test.mjs "$@"
