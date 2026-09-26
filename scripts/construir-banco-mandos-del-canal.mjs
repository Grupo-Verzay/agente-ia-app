/**
 * Construye el arnés de `mandos-del-canal-dom.test.mjs` con esbuild.
 *
 * Monta el `HiloDelEquipo` de VERDAD —no una maqueta de su cabecera— porque lo
 * que se mide es su fila de mandos: cuántos botones hay, si los tres miden lo
 * mismo, si sus tres dibujos son distintos y qué dispara cada clic. Una maqueta
 * daría por buenos los glifos que el banco escribiera, que es justo el fallo.
 *
 * Solo se finge lo que sale por la red: las acciones del chat de equipo y las
 * de las salas de video. En `MODO=roto` el componente se cambia por el de
 * ANTES_REF (lo deja `scripts/banco-mandos-del-canal.sh` en
 * `.banco-antes-mandos/`), que no tiene imports relativos, así que sus `@/`
 * resuelven igual.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const { build } = createRequire(import.meta.url)(process.env.ESBUILD_DIR || "esbuild");
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ROTO = process.env.MODO === "roto";
const ANTES = path.join(RAIZ, ".banco-antes-mandos");
const ENTRADA = path.join(RAIZ, ".banco-mandos-del-canal-entry.tsx");
const SALIDA = path.join(RAIZ, "lib/__tests__/.compilado/harness-mandos-del-canal.js");

const HILO = ROTO
    ? path.join(ANTES, "HiloDelEquipo.tsx")
    : path.join(RAIZ, "components/chat-equipo/HiloDelEquipo.tsx");

const sustituir = {
    name: "sustituir",
    setup(b) {
        b.onResolve({ filter: /^@\/actions\/chat-de-equipo-actions$/ }, () => ({
            path: path.join(RAIZ, "lib/__tests__/fingido/acciones-del-chat-de-equipo.ts"),
        }));
        b.onResolve({ filter: /^@\/actions\/salas-de-video-actions$/ }, () => ({
            path: path.join(RAIZ, "lib/__tests__/fingido/acciones-de-salas-mudas.ts"),
        }));
        b.onResolve({ filter: /^@\/actions\/orden-de-tablero-actions$/ }, () => ({
            path: path.join(RAIZ, "lib/__tests__/fingido/acciones-de-orden-mudas.ts"),
        }));
        b.onResolve({ filter: /^@\/elHilo$/ }, () => ({ path: HILO }));
        b.onResolve({ filter: /^@\// }, (args) =>
            b.resolve("./" + args.path.slice(2), { resolveDir: RAIZ, kind: args.kind }),
        );
    },
};

fs.writeFileSync(
    ENTRADA,
    `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { HiloDelEquipo } from "@/elHilo";

/** Lo que hace el oyente del layout: aquí solo se apunta lo que llegó. */
window.addEventListener("llamada:salir", (e: any) => {
    (window as any).__llamadas.push(e.detail);
});

function Maqueta() {
    const [canal, setCanal] = useState("directo-1");
    (window as any).canal = (id: string) => setCanal(id);
    return (
        <div className="flex h-screen">
            <div className="min-w-0 flex-1" />
            {/* El panel lateral de verdad: 22rem y la cabecera de 78 px, que es
                la que pinta \`filaDeArriba\`. */}
            <aside style={{ width: "22rem" }} className="flex min-h-0 shrink-0 flex-col border-l">
                <HiloDelEquipo
                    key={canal}
                    activo
                    canalInicial={canal}
                    cuentaId="cuenta-1"
                    personaId="p1"
                    filaDeArriba={<span className="min-w-0 flex-1 truncate text-sm font-medium">Chat del equipo</span>}
                />
            </aside>
            <Toaster />
        </div>
    );
}

createRoot(document.getElementById("app")!).render(<Maqueta />);
(window as any).listo = true;
`,
);

try {
    await build({
        entryPoints: [ENTRADA],
        bundle: true,
        format: "esm",
        outfile: SALIDA,
        jsx: "automatic",
        loader: { ".tsx": "tsx", ".ts": "ts" },
        define: { "process.env.NODE_ENV": '"production"' },
        plugins: [sustituir],
        logLevel: "error",
    });
} finally {
    fs.rmSync(ENTRADA, { force: true });
}
