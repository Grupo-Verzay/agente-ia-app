#!/usr/bin/env bash
# El banco de los paneles laterales de Chats.
#
# Son DOS mitades, porque el cambio vive en dos capas:
#
#   1. Un BARRIDO sin navegador: que el contexto del lead, el recordatorio y la
#      tarea ya no monten un modal —ni `Dialog` ni `Sheet`, ni por tanto el velo
#      oscuro que impedía leer la conversación mientras se rellenan— y que los
#      CINCO paneles pasen por `usePanelLateral`, que es donde vive la exclusión
#      desde que se retiró la que estaba escrita a mano en `BotonesDelBorde`.
#   2. Los paneles de VERDAD en Chromium, con el `PanelLateral` real montado dos
#      veces: que abrir uno cierre el otro, que la franja se reserve —o sea que
#      la conversación se acomode en vez de quedar tapada— y que lo de dentro no
#      exista antes de la primera apertura ni se desmonte a media salida.
#
# El «antes» del barrido sale de `origin/main` con `git show`, no escrito aquí.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/node22/bin:$PATH"
export NODE_PATH="${NODE_PATH:-}:/opt/node22/lib/node_modules"
export CHROME_BIN="${CHROME_BIN:-$(ls /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"

MODO="${MODO:-bueno}"
export MODO

if [ ! -d ".next/static/css" ]; then
  echo "falta el CSS del build (.next/static/css): corre 'npm run build' antes" >&2
  exit 1
fi

mkdir -p lib/__tests__/.compilado

ENTRY=".banco-panel-lateral-entry.tsx"
OUT="lib/__tests__/.compilado/harness-panel-lateral.js"
trap 'rm -f "$ENTRY"' EXIT

# El arnés monta el `PanelLateral` REAL dos veces, con la misma forma que
# Chats: el contenedor de la bandeja con su `data-chat-view`, la conversación
# dentro, y los paneles colgando del layout —que es donde cuelgan de verdad—.
cat > "$ENTRY" <<'TSX'
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { PanelLateral } from "@/components/shared/PanelLateral";
import { PANEL_DEL_CONTEXTO, PANEL_DEL_RECORDATORIO } from "@/lib/panel-lateral";

function Maqueta() {
    const [uno, setUno] = useState(false);
    const [dos, setDos] = useState(false);
    // La SEGUNDA instancia del MISMO panel que `dos`, como la cabecera de
    // Chats monta el recordatorio: una por fila. Es el caso que destapó que el
    // registro no podía ir por el id del panel.
    const [gemelo, setGemelo] = useState(false);
    (window as any).abrir = (cual: string, v: boolean) =>
        cual === "uno" ? setUno(v) : cual === "dos" ? setDos(v) : setGemelo(v);

    return (
        <div className="flex h-screen">
            <div className="w-12 shrink-0 bg-muted" />
            <div data-chat-view className="flex min-w-0 flex-1">
                <div className="w-96 shrink-0 border-r" />
                <div id="conversacion" data-conversacion className="min-w-0 flex-1" />
                <div data-ficha-de-contacto id="ficha" className="w-80 shrink-0 border-l" />
            </div>

            <PanelLateral
                id={PANEL_DEL_CONTEXTO}
                abierto={uno}
                onCerrar={() => setUno(false)}
                titulo="Contexto del lead"
            >
                <div id="dentro-uno" className="p-4">uno</div>
            </PanelLateral>
            <PanelLateral
                id={PANEL_DEL_RECORDATORIO}
                abierto={dos}
                onCerrar={() => setDos(false)}
                titulo="Crear recordatorio"
            >
                <div id="dentro-dos" className="p-4">dos</div>
            </PanelLateral>
            <PanelLateral
                id={PANEL_DEL_RECORDATORIO}
                abierto={gemelo}
                onCerrar={() => setGemelo(false)}
                titulo="Crear recordatorio"
            >
                <div className="p-4">gemelo</div>
            </PanelLateral>
        </div>
    );
}

(window as any).maqueta = () => {
    const raiz = ((window as any).__raiz ??= createRoot(document.getElementById("app")!));
    raiz.render(React.createElement(Maqueta));
};

(window as any).listo = true;
TSX

npx esbuild "$ENTRY" --bundle --format=esm --outfile="$OUT" \
  --alias:@="$(pwd)" \
  --loader:.tsx=tsx --loader:.json=json --jsx=automatic \
  --define:process.env.NODE_ENV='"production"' --log-level=error

rm -f "$ENTRY"

node --test lib/__tests__/paneles-laterales.test.mjs "$@"
