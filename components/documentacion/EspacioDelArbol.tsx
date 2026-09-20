"use client";

import { useMemo, useState } from "react";
import {
    DndContext,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    Ellipsis,
    FileText,
    Layers,
    ListChecks,
    Pencil,
    Plus,
    Shield,
    Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { moverEnLaColumna, ordenarLaColumna } from "@/lib/orden-del-tablero";
import { ColumnaOrdenable, useOrdenDeColumna } from "@/components/shared/OrdenDeColumna";
import { BorrarEspacioDialog, EditarEspacioDialog, NuevoDocumentoDialog } from "./Dialogos";
import type { ArbolDeDocumentacion } from "@/actions/documentacion-actions";
import type { DocumentoEnLista } from "@/lib/documentacion-db";

/**
 * Un espacio del árbol lateral: su cabecera con el menú y sus documentos,
 * arrastrables para ordenarlos.
 *
 * # El orden es del ESPACIO, no de quien mira
 *
 * Va por el tablero compartido (`orden_en_tablero`, tipo `espacio`), que es el
 * mismo mecanismo de Proyectos, Tickets y la vista de tablero de una lista. Dos
 * formas de guardar la misma posición son una que se afina y otra que se queda
 * atrás; y además su llave **ya es el tablero**, que es literalmente lo pedido:
 * «el mismo para todos los que ven ese espacio, no por persona».
 *
 * Lo que no tiene posición sale primero, en el orden que trajo la base —por
 * `creadoEn`, del más viejo al más nuevo—, así que un espacio que nadie ha
 * arrastrado se ve exactamente igual que antes. Y un documento nuevo **sí**
 * trae posición, así que cae al final.
 *
 * # Por qué el `<button>` lleva aquí su propio `useSortable`
 *
 * `TarjetaDelTablero` —la pieza compartida— pinta un `div` con el `onClick`
 * encima, que es lo correcto para una tarjeta de tablero. Aquí la fila es la
 * navegación de la pantalla y tiene que seguir siendo un `<button>`: con un
 * `div` se pierde el foco por teclado, o sea la única forma de recorrer el
 * árbol sin ratón. Lo que **no** se copia es nada de la lógica del orden
 * —`useOrdenDeColumna`, `ColumnaOrdenable`, `ordenarLaColumna` y el guardado
 * son los de siempre—: lo que cambia es el nodo que se pinta.
 */
export function EspacioDelArbol({
    entrada,
    plantillas,
    abiertoId,
    alAbrir,
    alRefrescar,
}: {
    entrada: ArbolDeDocumentacion["espacios"][number];
    plantillas: DocumentoEnLista[];
    abiertoId: string | null;
    alAbrir: (id: string) => void;
    alRefrescar: () => void | Promise<void>;
}) {
    const { espacio, documentos, puedeEditar, puedeMandar, recibido } = entrada;
    const [renombrando, setRenombrando] = useState(false);
    const [borrando, setBorrando] = useState(false);

    const orden = useOrdenDeColumna("espacio", espacio.id, puedeEditar);

    const sensores = useSensors(
        // 6 px antes de arrastrar: sin eso, un clic para abrir un documento
        // empieza un arrastre y el documento no se abre nunca.
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    );

    /**
     * Los documentos ya colocados, con lo que se acaba de arrastrar encima.
     *
     * Las posiciones del servidor **no viajan dentro de cada documento**
     * —`DocumentoEnLista` es lo que el árbol pinta y no tiene ese campo—, así
     * que el servidor ya devuelve la lista ordenada y aquí solo se vuelve a
     * colocar cuando hay algo movido en local. Sin lo de encima, arrastrar no
     * se vería hasta la vuelta siguiente del servidor.
     */
    const colocados = useMemo(() => {
        const encima: Record<string, number> = {};
        let hayAlgo = false;
        documentos.forEach((d, i) => {
            const suya = orden.posicionDe(d.id, null);
            if (typeof suya === "number") {
                encima[d.id] = suya;
                hayAlgo = true;
            } else {
                // Los que no se han tocado conservan el sitio que traían, para
                // que moverse uno no reordene a los demás.
                encima[d.id] = i;
            }
        });
        return hayAlgo ? ordenarLaColumna(documentos, encima, (d) => d.id) : documentos;
    }, [documentos, orden]);

    const alSoltar = (evento: DragEndEvent) => {
        const { active, over } = evento;
        if (!over) return;

        // **Se busca por el `id`**, el único canal que no se puede perder: sin
        // él dnd-kit no arrastra nada. No se le cuelga un `data` al nodo — ese
        // segundo canal es justo lo que un refactor se deja, y su pérdida rompió
        // los dos tableros en silencio.
        const ids = colocados.map((d) => d.id);
        const arrastrado = String(active.id);
        const sobre = String(over.id);
        if (!ids.includes(arrastrado) || !ids.includes(sobre)) {
            console.warn("[documentacion] se solto un documento que no esta en el espacio", {
                arrastrado,
                sobre,
                espacio: espacio.id,
            });
            return;
        }

        const nuevos = moverEnLaColumna(ids, arrastrado, sobre);
        if (nuevos === ids) return;
        void orden.reordenar(nuevos);
    };

    return (
        <div className="mb-3">
            <div className="flex items-center gap-1 px-2 py-1">
                <Layers className="size-3.5 shrink-0 text-muted-foreground" />
                <p className="min-w-0 flex-1 truncate text-sm font-medium" title={espacio.nombre}>
                    {espacio.icono ? `${espacio.icono} ` : ""}
                    {espacio.nombre}
                </p>
                {recibido && (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                        De otra cuenta
                    </Badge>
                )}
                {puedeEditar && (
                    <NuevoDocumentoDialog
                        espacioId={espacio.id}
                        plantillas={plantillas}
                        alCrear={async (id) => {
                            await alRefrescar();
                            alAbrir(id);
                        }}
                        disparador={
                            <Button
                                size="icon"
                                variant="ghost"
                                className="size-6 shrink-0"
                                title="Nuevo documento"
                            >
                                <Plus className="size-3.5" />
                            </Button>
                        }
                    />
                )}
                {/* El menú del espacio. **No se pinta en gris cuando no se
                    puede**: se quita entero, que es la regla de la casa —una
                    opción apagada invita a preguntar por qué no se puede, y la
                    respuesta no cabe en un menú—. */}
                {puedeMandar && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="size-6 shrink-0"
                                title="Acciones del espacio"
                                aria-label="Acciones del espacio"
                            >
                                <Ellipsis className="size-3.5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setRenombrando(true)}>
                                <Pencil className="size-4" />
                                Renombrar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={() => setBorrando(true)}
                                className="text-destructive focus:text-destructive"
                            >
                                <Trash2 className="size-4" />
                                Eliminar espacio
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>

            {/* Los diálogos viven FUERA del menú: Radix desmonta el contenido de
                un `DropdownMenu` al cerrarse, así que dentro se irían con él en
                cuanto se pulsara la opción. */}
            <EditarEspacioDialog
                espacioId={espacio.id}
                nombreActual={espacio.nombre}
                iconoActual={espacio.icono}
                abierto={renombrando}
                onAbiertoChange={setRenombrando}
                alGuardar={alRefrescar}
            />
            <BorrarEspacioDialog
                espacioId={espacio.id}
                nombre={espacio.nombre}
                abierto={borrando}
                onAbiertoChange={setBorrando}
                alBorrar={alRefrescar}
            />

            <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={alSoltar}>
                <ul>
                    {colocados.length === 0 && (
                        <li className="px-3 py-1 text-xs text-muted-foreground">Vacío</li>
                    )}
                    <ColumnaOrdenable ids={colocados.map((d) => d.id)}>
                        {colocados.map((doc) => (
                            <DocumentoDelArbol
                                key={doc.id}
                                doc={doc}
                                abierto={abiertoId === doc.id}
                                puedeArrastrar={puedeEditar}
                                alAbrir={() => alAbrir(doc.id)}
                            />
                        ))}
                    </ColumnaOrdenable>
                </ul>
            </DndContext>
        </div>
    );
}

/** Una fila del árbol: se pulsa para abrir y se arrastra para colocar. */
function DocumentoDelArbol({
    doc,
    abierto,
    puedeArrastrar,
    alAbrir,
}: {
    doc: DocumentoEnLista;
    abierto: boolean;
    puedeArrastrar: boolean;
    alAbrir: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: doc.id,
        disabled: !puedeArrastrar,
    });

    return (
        <li
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                ...(isDragging ? { zIndex: 50, position: "relative" as const } : {}),
            }}
        >
            <button
                type="button"
                // El sensor exige 6 px, así que un clic limpio llega aquí y abre
                // el documento; soltarlo tras arrastrar, no.
                onClick={() => {
                    if (!isDragging) alAbrir();
                }}
                {...(puedeArrastrar ? listeners : {})}
                {...(puedeArrastrar ? attributes : {})}
                className={cn(
                    "flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm",
                    abierto ? "bg-muted" : "hover:bg-muted/60",
                    isDragging && "opacity-60",
                    puedeArrastrar && "cursor-grab active:cursor-grabbing",
                )}
            >
                {doc.tipo === "lista" ? (
                    <ListChecks className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate" title={doc.titulo}>
                    {doc.titulo}
                </span>
                {doc.restringido && <Shield className="size-3 shrink-0 text-amber-600" />}
            </button>
        </li>
    );
}
