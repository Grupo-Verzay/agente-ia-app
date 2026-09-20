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
    Archive,
    ArrowDown,
    ArrowUp,
    Building2,
    ChevronRight,
    Ellipsis,
    FileText,
    GripVertical,
    Layers,
    ListChecks,
    Pencil,
    Pin,
    Plus,
    Shield,
    Trash2,
    Users,
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
import { CompartirConCuentas } from "./CompartirConCuentas";
import { PermisosDelObjeto } from "./PermisosDelObjeto";
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
 *
 * # Plegar: el estado vive ARRIBA, aquí solo se pinta
 *
 * `plegado` y `alAlternar` llegan como props porque el conjunto entero se
 * guarda bajo **una** llave de `localStorage`. Con el estado dentro de cada
 * espacio, varios escribiendo esa misma llave a la vez se pisarían y la
 * preferencia se perdería sin que nadie se entere. Quien lo guarda es el único
 * que ve el conjunto completo.
 *
 * # Y el ESPACIO también se coloca, con un `DndContext` que no es este
 *
 * El asa de la cabecera cuelga del `DndContext` del ÁRBOL, que monta la
 * pantalla; el de aquí dentro solo mueve los documentos de este espacio. No se
 * pisan porque **ningún nodo pertenece a los dos**: la cabecera está fuera del
 * contexto de dentro, que solo envuelve la lista. Lo que sí se roban dos
 * contextos es un nodo compartido, que es lo que dice la regla de los dos
 * tableros.
 *
 * Y va **por un asa**, no arrastrando la fila entera: la cabecera es un botón
 * que pliega, con el «+» y el «⋯» al lado, así que sin asa cada pulsación
 * competiría con un arrastre. Es la misma decisión que en la rejilla de
 * Proyectos.
 */
export function EspacioDelArbol({
    entrada,
    plantillas,
    abiertoId,
    plegado,
    puedeOrdenarElArbol,
    esElPrimero,
    esElUltimo,
    alAlternar,
    alSubir,
    alBajar,
    alAbrir,
    alRefrescar,
}: {
    entrada: ArbolDeDocumentacion["espacios"][number];
    plantillas: DocumentoEnLista[];
    abiertoId: string | null;
    plegado: boolean;
    puedeOrdenarElArbol: boolean;
    esElPrimero: boolean;
    esElUltimo: boolean;
    alAlternar: () => void;
    alSubir: () => void;
    alBajar: () => void;
    alAbrir: (id: string) => void;
    alRefrescar: () => void | Promise<void>;
}) {
    const { espacio, documentos, puedeEditar, puedeGestionar, puedeMandar, recibido } = entrada;
    const [renombrando, setRenombrando] = useState(false);
    const [borrando, setBorrando] = useState(false);
    const [compartiendoConElEquipo, setCompartiendoConElEquipo] = useState(false);
    const [compartiendoConCuentas, setCompartiendoConCuentas] = useState(false);

    const orden = useOrdenDeColumna("espacio", espacio.id, puedeEditar);

    // El asa del espacio. Se registra en el `DndContext` del árbol, que es el
    // de la pantalla: este nodo está fuera del de aquí dentro.
    const arrastre = useSortable({ id: espacio.id, disabled: !puedeOrdenarElArbol });

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

    // Un espacio **vacío no enseña flecha y no se pliega**: no hay nada que
    // esconder, así que una flecha ahí sería un mando que no hace nada. Y por
    // eso `desplegado` no es `!plegado` a secas — un espacio del que se
    // borraron todos sus documentos podría tener su pliegue guardado de antes,
    // y sin esta condición se quedaría enseñando una flecha muerta.
    const vacio = colocados.length === 0;
    const desplegado = vacio || !plegado;
    const idDeLaLista = `espacio-${espacio.id}-documentos`;

    /* Lo de dentro del nombre, una sola vez: lo pintan las dos formas de la
       cabecera —el botón que alterna y el `<p>` de un espacio vacío—. */
    const elNombre = (
        <>
            {vacio ? (
                // El hueco de la flecha se conserva para que el icono de un
                // espacio vacío no salga 18 px a la izquierda del de al lado,
                // que se lee como otro nivel del árbol.
                <span className="size-3.5 shrink-0" aria-hidden />
            ) : (
                <ChevronRight
                    className={cn(
                        "size-3.5 shrink-0 text-muted-foreground transition-transform",
                        desplegado && "rotate-90",
                    )}
                />
            )}
            <Layers className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {espacio.icono ? `${espacio.icono} ` : ""}
                {espacio.nombre}
            </span>
        </>
    );

    return (
        <div
            className="mb-3"
            ref={arrastre.setNodeRef}
            style={{
                transform: CSS.Transform.toString(arrastre.transform),
                transition: arrastre.transition,
                ...(arrastre.isDragging
                    ? { zIndex: 50, position: "relative" as const, opacity: 0.6 }
                    : {}),
            }}
        >
            <div className="flex items-center gap-1 px-2 py-1">
                {puedeOrdenarElArbol && (
                    <span
                        {...arrastre.listeners}
                        {...arrastre.attributes}
                        title="Mover el espacio"
                        aria-label="Mover el espacio"
                        className="shrink-0 cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
                    >
                        <GripVertical className="size-3.5" />
                    </span>
                )}
                {/* El «+» y el «⋯» son HERMANOS de esto, no hijos: por eso
                    pulsarlos no dispara el plegado y no hace falta cortar
                    ninguna propagación. Si algún día uno de los dos se metiera
                    dentro del botón, volvería a hacer falta. */}
                {vacio ? (
                    <p
                        className="-mx-1 flex min-w-0 flex-1 items-center gap-1 px-1"
                        title={espacio.nombre}
                    >
                        {elNombre}
                    </p>
                ) : (
                    <button
                        type="button"
                        onClick={alAlternar}
                        aria-expanded={desplegado}
                        aria-controls={idDeLaLista}
                        title={espacio.nombre}
                        className="-mx-1 flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-muted/60"
                    >
                        {elNombre}
                    </button>
                )}
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
                    respuesta no cabe en un menú—. Por eso el menú entero sale
                    en cuanto hay ALGO que ofrecer, y cada grupo mira lo suyo:
                    compartir es `puedeGestionar`, renombrar y borrar son
                    `puedeMandar`, y colocar es del árbol. */}
                {(puedeMandar || puedeGestionar || puedeOrdenarElArbol) && (
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
                            {puedeGestionar && (
                                <>
                                    <DropdownMenuItem
                                        onSelect={() => setCompartiendoConElEquipo(true)}
                                    >
                                        <Users className="size-4" />
                                        Compartir con el equipo
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onSelect={() => setCompartiendoConCuentas(true)}
                                    >
                                        <Building2 className="size-4" />
                                        Compartir con otra cuenta
                                    </DropdownMenuItem>
                                </>
                            )}
                            {puedeOrdenarElArbol && (
                                <>
                                    {/* Subir y bajar no son un adorno del
                                        arrastre: en un táctil arrastrar una fila
                                        de un árbol que además se desplaza es
                                        justo lo que no se puede hacer con el
                                        dedo. El primero no sube y el último no
                                        baja — y la opción se QUITA, no se pinta
                                        en gris. */}
                                    {!esElPrimero && (
                                        <DropdownMenuItem onSelect={alSubir}>
                                            <ArrowUp className="size-4" />
                                            Subir
                                        </DropdownMenuItem>
                                    )}
                                    {!esElUltimo && (
                                        <DropdownMenuItem onSelect={alBajar}>
                                            <ArrowDown className="size-4" />
                                            Bajar
                                        </DropdownMenuItem>
                                    )}
                                </>
                            )}
                            {puedeMandar && (
                                <>
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
                                </>
                            )}
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
            {compartiendoConElEquipo && (
                <PermisosDelObjeto
                    objetoTipo="espacio"
                    objetoId={espacio.id}
                    nombre={espacio.nombre}
                    alCerrar={() => {
                        setCompartiendoConElEquipo(false);
                        // El árbol se refresca al cerrar: quitarse a uno mismo
                        // el acceso a un espacio restringido tiene que
                        // notarse, y si no, la fila se queda ahí hasta recargar.
                        void alRefrescar();
                    }}
                />
            )}
            <CompartirConCuentas
                abierto={compartiendoConCuentas}
                setAbierto={setCompartiendoConCuentas}
                objetoTipo="espacio"
                objetoId={espacio.id}
                nombre={espacio.nombre}
                alGuardar={alRefrescar}
            />

            {/* Plegado se DESMONTA, no se esconde. Aquí no hay nada vivo que
                preservar —ni un `<audio>` sonando, como en la reunión—, y un
                árbol con veinte espacios cerrados no tiene por qué seguir
                pintando sus filas ni montando su `DndContext`. */}
            {desplegado && (
                <DndContext
                    sensors={sensores}
                    collisionDetection={closestCenter}
                    onDragEnd={alSoltar}
                >
                    <ul id={idDeLaLista}>
                        {vacio && (
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
            )}
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
                <span
                    className={cn(
                        "min-w-0 flex-1 truncate",
                        // Un archivado que se vea igual que los demás convierte
                        // el interruptor en un mando sin efecto visible.
                        doc.archivadoEn && "text-muted-foreground line-through",
                    )}
                    title={doc.titulo}
                >
                    {doc.titulo}
                </span>
                {doc.fijado && (
                    <Pin className="size-3 shrink-0 text-amber-500" aria-label="Fijado" />
                )}
                {doc.archivadoEn && (
                    <Archive
                        className="size-3 shrink-0 text-muted-foreground"
                        aria-label="Archivado"
                    />
                )}
                {doc.restringido && <Shield className="size-3 shrink-0 text-amber-600" />}
            </button>
        </li>
    );
}
