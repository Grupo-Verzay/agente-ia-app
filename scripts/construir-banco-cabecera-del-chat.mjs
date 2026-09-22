/**
 * Construye el arnés de `cabecera-del-chat-dom.test.mjs` con esbuild.
 *
 * Es un script y no una línea de `esbuild` porque hacen falta dos cosas que la
 * línea no da: fingir las tres acciones de servidor de `LeadContextSheet` (un
 * `onResolve` que las lleva a `lib/__tests__/fingido/acciones-del-contexto.ts`)
 * y, en `MODO=roto`, cambiar el hook, el módulo de colocación y el propio panel
 * por los de ANTES_REF (los deja `banco-cabecera-del-chat.sh` en
 * `.banco-antes-cabecera/`).
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const { build } = createRequire(import.meta.url)(process.env.ESBUILD_DIR || "esbuild");
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ROTO = process.env.MODO === "roto";
const ANTES = path.join(RAIZ, ".banco-antes-cabecera");
const FINGIDO = path.join(RAIZ, "lib/__tests__/fingido/acciones-del-contexto.ts");
const ENTRADA = path.join(RAIZ, ".banco-cabecera-del-chat-entry.tsx");
const SALIDA = path.join(RAIZ, "lib/__tests__/.compilado/harness-cabecera-del-chat.js");

const ACCIONES = /^@\/actions\/(crm-follow-up-actions|lead-score-action|sales-playbook-actions)$/;

const sustituir = {
    name: "sustituir",
    setup(b) {
        b.onResolve({ filter: ACCIONES }, () => ({ path: FINGIDO }));
        if (ROTO) {
            b.onResolve({ filter: /^@\/hooks\/usePanelFlotante$/ }, () => ({
                path: path.join(ANTES, "hooks/usePanelFlotante.ts"),
            }));
            b.onResolve({ filter: /^@\/chats\/LeadContextSheet$/ }, () => ({
                path: path.join(ANTES, "chats/LeadContextSheet.tsx"),
            }));
        }
        b.onResolve({ filter: /^@\/chats\/LeadContextSheet$/ }, () => ({
            path: path.join(RAIZ, "app/(root)/chats/_components/LeadContextSheet.tsx"),
        }));
        b.onResolve({ filter: /^@\// }, async (args) => {
            const r = await b.resolve("./" + args.path.slice(2), { resolveDir: RAIZ, kind: args.kind });
            return r;
        });
    },
};

fs.writeFileSync(
    ENTRADA,
    `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { usePanelFlotante, MARCA_DE_LA_CABECERA, MARCA_DE_MACROS } from "@/hooks/usePanelFlotante";
import { PestanasDelChat } from "@/app/(root)/chats/_components/PestanasDelChat";
import { LeadContextSheet } from "@/chats/LeadContextSheet";

const ROTO = ${ROTO ? "true" : "false"};
const PESTANAS = [
    { id: "messages", nombre: "Mensajes" },
    { id: "notes", nombre: "Notas" },
    { id: "sheets", nombre: "Sheets" },
    { id: "copiloto", nombre: "Copiloto" },
    { id: "web", nombre: "Web" },
];

function Menu({ id, primitiva, marca, etiqueta }: { id: string; primitiva: "menu" | "popover"; marca?: boolean; etiqueta?: string }) {
    const panel = usePanelFlotante("cabecera", primitiva);
    const extra = marca ? { [MARCA_DE_MACROS]: "" } : {};
    const disparador = (
        <button id={id} ref={panel.disparador} {...extra} className="h-8 shrink-0 gap-1.5 rounded border px-2.5 text-sm">
            {etiqueta ?? id}
        </button>
    );
    const dentro = <div className="p-2 text-sm">Cita agendada · Sin cita</div>;
    if (primitiva === "popover") {
        return (
            <Popover onOpenChange={panel.alAbrir}>
                <PopoverTrigger asChild>{disparador}</PopoverTrigger>
                <PopoverContent data-panel-del-banco={id} className="w-64" {...panel.props}>{dentro}</PopoverContent>
            </Popover>
        );
    }
    return (
        <DropdownMenu onOpenChange={panel.alAbrir}>
            <DropdownMenuTrigger asChild>{disparador}</DropdownMenuTrigger>
            <DropdownMenuContent data-panel-del-banco={id} className="w-56" {...panel.props}>{dentro}</DropdownMenuContent>
        </DropdownMenu>
    );
}

/** La fila de abajo: la de hoy (dos cajas) o la de antes (una con scroll). */
function Fila({ activa, cambiar }: { activa: string; cambiar: (id: string) => void }) {
    const mandos = (
        <>
            <button className="h-7 w-7 shrink-0 rounded-md">s</button>
            <Menu id="macros" primitiva="menu" marca etiqueta="Macros" />
            <Menu id="acciones" primitiva="menu" etiqueta="Acciones" />
        </>
    );
    if (ROTO) {
        return (
            <div data-fila className="flex items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {PESTANAS.map((p) => (
                    <button key={p.id} data-pestana-del-chat={p.id} onClick={() => cambiar(p.id)}
                        className="px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors">{p.nombre}</button>
                ))}
                <div className="ml-auto flex items-center gap-1 pr-4">{mandos}</div>
            </div>
        );
    }
    return (
        <div data-fila className="flex items-center">
            <PestanasDelChat pestanas={PESTANAS} activa={activa} onCambiar={cambiar} clasePestana="px-4 py-2" />
            <div className="flex shrink-0 items-center gap-1 pl-1 pr-4">{mandos}</div>
        </div>
    );
}

const SESION: any = {
    id: 77,
    pushName: "Yair Silvera",
    leadScore: null,
    leadStatus: "CALIENTE",
    leadStatusReason: "PARRAFO_EXPLICATIVO_DEL_ESTADO",
    leadStatusUpdatedAt: new Date().toISOString(),
    tags: [{ id: 1, name: "VIP", color: "#EF4444" }],
    crmFollowUpSummary: { pending: 3 },
};

function Maqueta() {
    const [ancho, setAncho] = useState(1056);
    const [activa, setActiva] = useState("messages");
    const [izquierda, setIzquierda] = useState(false);
    (window as any).ancho = setAncho;
    (window as any).citaALaIzquierda = setIzquierda;
    (window as any).activa = () => activa;
    return (
        <div className="flex h-screen flex-col">
            <div className="h-16 shrink-0 border-b" />
            <div className="flex min-h-0 flex-1">
                <section id="conversacion" style={{ width: ancho }} className="flex shrink-0 flex-col border-r">
                    <div {...{ [MARCA_DE_LA_CABECERA]: "" }} className="shrink-0 border-b backdrop-blur-sm">
                        <div className="flex items-center gap-1.5 px-4 py-2">
                            <span className="min-w-0 flex-1 truncate text-sm">YAIR ENRRIQUE SILVERA VEGA</span>
                            {/* Con \`izquierda\` la tira de iconos se pinta tras el
                                avatar y el nombre (~300 px), en la mitad
                                IZQUIERDA de la cabecera: es lo que pasa con la
                                ficha de contacto o un panel lateral abierto. */}
                            <div className="flex items-center gap-1.5" style={izquierda ? { marginRight: "auto", order: -1, marginLeft: 300 } : undefined}>
                                <button className="h-7 w-7 rounded border">a</button>
                                <Menu id="cita" primitiva="popover" etiqueta="C" />
                                <LeadContextSheet session={SESION} />
                            </div>
                        </div>
                        <Fila activa={activa} cambiar={setActiva} />
                    </div>
                </section>
                <div className="min-w-0 flex-1" />
            </div>
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
