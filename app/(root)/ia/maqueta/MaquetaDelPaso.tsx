"use client";

import { useState } from "react";
import { nanoid } from "nanoid";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronDown, Eye, GripVertical, Zap } from "lucide-react";
import type { Workflow } from "@prisma/client";
import { StepTemplatePicker } from "@/app/(root)/ai/_components/StepTemplatePicker";
import { STEP_TEMPLATES } from "@/app/(root)/ai/_components/helpers/stepTemplates";
import {
    CasoCard,
    EjecutarFlujoCard,
    NotaInternaCard,
    TextRuleCard,
    TransicionCard,
} from "@/app/(root)/ai/_components/action-steeps";
import {
    esUnica,
    insertarEnSuPuesto,
    MENU_DE_LA_MAQUETA,
    ORDEN_DE_LA_MAQUETA,
    pasosParaLaTransicion,
    puestoDe,
    quitaAlAgregar,
    type ElementoDeLaMaqueta,
} from "@/lib/maqueta-del-paso";

/**
 * La maqueta: cuatro pasos de ejemplo, con el 2 y el 3 abiertos.
 *
 * - Paso 2 usa «Agregar respuesta» (un texto fijo), como hoy.
 * - Paso 3 usa «Agregar caso», repetido, porque responde distinto según pase.
 *
 * Las tarjetas de Ejecutar flujo, Respuesta y Nota interna son las de verdad;
 * Caso y Transición son las nuevas. Todo vive en este estado: recargar vuelve
 * al ejemplo.
 */

type El = {
    id: string;
    tipo: ElementoDeLaMaqueta;
    texto?: string;
    escenario?: string;
    respuesta?: string;
    destino?: string | null;
    flujo?: string | null;
};

type Paso = { id: string; titulo: string; plantilla: string; elementos: El[] };

const FLUJOS = [
    { id: "f1", name: "Enviar catálogo", isPro: true },
    { id: "f2", name: "Datos de envío", isPro: true },
] as unknown as Workflow[];

const PASOS_DE_EJEMPLO: Paso[] = [
    { id: "p1", titulo: "Bienvenida", plantilla: "", elementos: [] },
    {
        id: "p2",
        titulo: "Pedir datos de envío",
        plantilla: "paso_secuencial",
        elementos: [
            { id: "a", tipo: "ejecutar_flujo", flujo: "Datos de envío" },
            { id: "b", tipo: "respuesta", texto: "Para despachar tu pedido necesito tu nombre, dirección y ciudad." },
            { id: "c", tipo: "transicion", destino: "p3" },
            { id: "d", tipo: "nota_interna", texto: "No confirmes fecha de entrega hasta tener la ciudad." },
        ],
    },
    {
        id: "p3",
        titulo: "Confirmar pedido",
        plantilla: "paso_secuencial",
        elementos: [
            { id: "e", tipo: "ejecutar_flujo", flujo: "Enviar catálogo" },
            { id: "f", tipo: "caso", escenario: "El cliente confirma el pedido", respuesta: "¡Listo! Tu pedido quedó confirmado. Te aviso cuando salga." },
            { id: "g", tipo: "caso", escenario: "El cliente quiere cambiar un producto", respuesta: "Claro, dime qué producto quieres cambiar y por cuál." },
            { id: "h", tipo: "caso", escenario: "", respuesta: "" },
            { id: "i", tipo: "transicion", destino: "p4" },
            { id: "j", tipo: "nota_interna", texto: "" },
        ],
    },
    { id: "p4", titulo: "Cierre", plantilla: "", elementos: [] },
];

export function MaquetaDelPaso() {
    const [pasos, setPasos] = useState<Paso[]>(PASOS_DE_EJEMPLO);
    const [abiertos, setAbiertos] = useState<Set<string>>(new Set(["p2", "p3"]));

    const cambiarPaso = (id: string, fn: (p: Paso) => Paso) =>
        setPasos((prev) => prev.map((p) => (p.id === id ? fn(p) : p)));
    const cambiarEl = (pasoId: string, elId: string, cambio: Partial<El>) =>
        cambiarPaso(pasoId, (p) => ({ ...p, elementos: p.elementos.map((e) => (e.id === elId ? { ...e, ...cambio } : e)) }));
    const quitarEl = (pasoId: string, elId: string) =>
        cambiarPaso(pasoId, (p) => ({ ...p, elementos: p.elementos.filter((e) => e.id !== elId) }));
    const agregar = (pasoId: string, tipo: ElementoDeLaMaqueta) =>
        cambiarPaso(pasoId, (p) => {
            const otra = quitaAlAgregar(tipo);
            let lista = otra ? p.elementos.filter((e) => e.tipo !== otra) : p.elementos;
            if (esUnica(tipo) && lista.some((e) => e.tipo === tipo)) return { ...p, elementos: lista };
            lista = insertarEnSuPuesto(lista, { id: nanoid(), tipo, destino: null, texto: "", escenario: "", respuesta: "" });
            return { ...p, elementos: lista };
        });

    return (
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4" data-maqueta-del-paso>
            <div className="mx-auto max-w-3xl space-y-4">
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                    <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <p>
                        <strong>Maqueta para revisar el orden y los campos.</strong> Nada de esta pantalla se guarda ni
                        cambia tu agente. Las acciones nuevas —<em>Agregar caso</em> y <em>Transición</em>— todavía
                        no tienen lógica.
                    </p>
                </div>

                <ol className="flex flex-wrap gap-1.5 text-xs" aria-label="Orden de un paso">
                    {ORDEN_DE_LA_MAQUETA.map((s) => (
                        <li key={s.puesto} className="flex items-center gap-1 rounded-full border bg-muted/30 px-2 py-0.5">
                            <span className="font-semibold">{s.puesto}.</span> {s.rotulo}
                            {s.nueva && <Badge className="h-4 px-1 text-[10px]">Nuevo</Badge>}
                        </li>
                    ))}
                </ol>

                {pasos.map((paso, idx) => {
                    const abierto = abiertos.has(paso.id);
                    const plantilla = STEP_TEMPLATES.find((t) => t.id === paso.plantilla);
                    const destinos = pasosParaLaTransicion(pasos.map((p) => ({ id: p.id, titulo: p.titulo })), paso.id);
                    let numCaso = 0;
                    return (
                        <Card key={paso.id} className="overflow-hidden border-muted/60 bg-muted/20" data-bloque={paso.id}>
                            <div className="flex items-center justify-between gap-1 px-3 py-3">
                                <div className="flex min-w-0 flex-1 items-center gap-1">
                                    <div className="flex h-8 w-6 shrink-0 items-center justify-center text-muted-foreground">
                                        <GripVertical className="h-4 w-4" />
                                    </div>
                                    <span className="shrink-0 text-sm font-semibold">Paso {idx + 1}</span>
                                    <span className="min-w-0 flex-1 truncate pl-1 text-sm font-medium uppercase">{paso.titulo}</span>
                                    {!abierto && paso.elementos.length > 0 && (
                                        <Badge variant="secondary" className="shrink-0 text-xs">
                                            {paso.elementos.length} elementos
                                        </Badge>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                    title={abierto ? "Colapsar" : "Expandir"}
                                    onClick={() =>
                                        setAbiertos((prev) => {
                                            const n = new Set(prev);
                                            if (n.has(paso.id)) n.delete(paso.id);
                                            else n.add(paso.id);
                                            return n;
                                        })
                                    }
                                >
                                    <ChevronDown className="h-4 w-4 transition-transform" style={{ transform: abierto ? "rotate(180deg)" : "none" }} />
                                </button>
                            </div>

                            {abierto && (
                                <CardContent className="space-y-2 px-0 pb-3 pt-1">
                                    {/* 1. Plantilla del paso, ya seleccionada */}
                                    <div className="space-y-2 pl-10 pr-3" data-elemento="plantilla">
                                        <StepTemplatePicker
                                            label={`Objetivo/respuesta principal del paso ${idx + 1}`}
                                            onApply={(t) => cambiarPaso(paso.id, (p) => ({ ...p, plantilla: t.id }))}
                                        />
                                        {plantilla ? (
                                            <details className="group">
                                                <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground select-none hover:text-foreground">
                                                    <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                                                    Plantilla «{plantilla.name}» aplicada · ver instrucciones del sistema
                                                </summary>
                                                <Textarea readOnly value={plantilla.content} className="mt-2 min-h-[120px] resize-none bg-muted/30 font-mono text-xs text-muted-foreground" />
                                            </details>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">Sin plantilla.</p>
                                        )}
                                    </div>

                                    <Separator />

                                    <div className="space-y-3 pr-3">
                                        {paso.elementos.length === 0 && (
                                            <p className="py-2 text-center text-sm text-muted-foreground">No hay elementos en este paso.</p>
                                        )}
                                        {paso.elementos.map((el) => {
                                            if (el.tipo === "caso") numCaso += 1;
                                            return (
                                                <div key={el.id} className="flex items-start gap-2" data-elemento={el.tipo}>
                                                    <div
                                                        className="mt-2 flex h-8 w-8 shrink-0 items-center justify-center rounded text-xs font-semibold text-muted-foreground"
                                                        title={`Puesto ${puestoDe(el.tipo)} del paso`}
                                                    >
                                                        {puestoDe(el.tipo)}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        {el.tipo === "ejecutar_flujo" && (
                                                            <EjecutarFlujoCard
                                                                el={{ id: el.id, kind: "function", fn: "ejecutar_flujo", flowId: null, flowName: el.flujo ?? null } as never}
                                                                flows={FLUJOS}
                                                                onRemove={() => quitarEl(paso.id, el.id)}
                                                                onSelectFlow={(f) => cambiarEl(paso.id, el.id, { flujo: f.name })}
                                                            />
                                                        )}
                                                        {el.tipo === "respuesta" && (
                                                            <TextRuleCard
                                                                el={{ id: el.id, kind: "text", text: el.texto ?? "" }}
                                                                onRemove={() => quitarEl(paso.id, el.id)}
                                                                onChange={(v) => cambiarEl(paso.id, el.id, { texto: v })}
                                                            />
                                                        )}
                                                        {el.tipo === "caso" && (
                                                            <CasoCard
                                                                numero={numCaso}
                                                                escenario={el.escenario ?? ""}
                                                                respuesta={el.respuesta ?? ""}
                                                                onChange={(c) => cambiarEl(paso.id, el.id, c)}
                                                                onRemove={() => quitarEl(paso.id, el.id)}
                                                            />
                                                        )}
                                                        {el.tipo === "transicion" && (
                                                            <TransicionCard
                                                                pasos={destinos}
                                                                destino={el.destino ?? null}
                                                                onChange={(id) => cambiarEl(paso.id, el.id, { destino: id })}
                                                                onRemove={() => quitarEl(paso.id, el.id)}
                                                            />
                                                        )}
                                                        {el.tipo === "nota_interna" && (
                                                            <NotaInternaCard
                                                                el={{ id: el.id, kind: "function", fn: "nota_interna", nota: el.texto ?? "" }}
                                                                onRemove={() => quitarEl(paso.id, el.id)}
                                                                onChangeNota={(nota) => cambiarEl(paso.id, el.id, { texto: nota })}
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="flex flex-wrap items-center justify-between gap-2 pl-10 pr-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold">Elementos del paso</span>
                                            <Badge variant="secondary" data-cuantos-elementos>
                                                {paso.elementos.length}
                                            </Badge>
                                        </div>
                                        <MenuDeAcciones onElegir={(t) => agregar(paso.id, t)} />
                                    </div>
                                </CardContent>
                            )}
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}

/** El «Agregar acción» de hoy, con las dos nuevas marcadas. */
function MenuDeAcciones({ onElegir }: { onElegir: (t: ElementoDeLaMaqueta) => void }) {
    const [abierto, setAbierto] = useState(false);
    const elegibles: ReadonlyArray<string> = ["ejecutar_flujo", "respuesta", "caso", "transicion", "nota_interna"];
    return (
        <Popover open={abierto} onOpenChange={setAbierto}>
            <PopoverTrigger asChild>
                <Button type="button" size="sm" className="gap-2" data-agregar-accion>
                    <Zap className="h-4 w-4" />
                    Agregar acción
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[240px] p-0" align="end" side="bottom">
                <Command>
                    <CommandList>
                        {MENU_DE_LA_MAQUETA.map((g) => (
                            <CommandGroup key={g.grupo} heading={g.grupo}>
                                {g.opciones.map((o) => (
                                    <CommandItem
                                        key={o.tipo}
                                        data-opcion={o.tipo}
                                        disabled={!elegibles.includes(o.tipo)}
                                        onSelect={() => {
                                            if (!elegibles.includes(o.tipo)) return;
                                            onElegir(o.tipo as ElementoDeLaMaqueta);
                                            setAbierto(false);
                                        }}
                                    >
                                        <span className="flex flex-1 items-center gap-2">
                                            {o.icono} {o.rotulo}
                                        </span>
                                        {o.nueva && <Badge className="h-4 px-1 text-[10px]">Nuevo</Badge>}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
