"use client";

import { useState, type ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
    ArrowDown,
    ArrowUp,
    ChevronRight,
    Ellipsis,
    Folder,
    FolderOpen,
    Pencil,
    Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { BorrarCarpetaDialog, CarpetaDialog } from "./Dialogos";
import type { Carpeta } from "@/lib/carpetas-de-documentacion";

/**
 * Una carpeta del árbol: su cabecera y los espacios que tiene dentro.
 *
 * # Es una COLUMNA, no una tarjeta
 *
 * El arrastre de este árbol reutiliza `resolverElArrastre`, el mismo de los dos
 * tableros, y ahí las carpetas son **columnas** y los espacios **tarjetas**. Por
 * eso aquí hay un `useDroppable` con el id de la carpeta y no un `useSortable`:
 * soltar un espacio sobre la cabecera —o sobre el hueco de una carpeta vacía—
 * lo mete dentro.
 *
 * # Y por eso una carpeta NO se arrastra: se sube y se baja
 *
 * Es la decisión que conviene no deshacer sin pensarlo. En un solo `DndContext`
 * el id de una carpeta sería a la vez una columna donde se suelta y una tarjeta
 * que se arrastra, y soltar un espacio «sobre» una carpeta que a su vez se está
 * moviendo no tiene una respuesta correcta: dnd-kit resolvería una de las dos y
 * la otra se perdería en silencio, que es exactamente el fallo que ya costó los
 * dos tableros enteros.
 *
 * Subir y Bajar no son un premio de consolación: es lo que este árbol ya usa
 * para los espacios y **lo único que funciona en un táctil**, donde arrastrar
 * una fila de una lista que además se desplaza es justo lo que no se puede
 * hacer con el dedo. El primero no sube y el último no baja, y la opción se
 * QUITA en vez de pintarse en gris.
 *
 * # Plegar: el estado vive ARRIBA, aquí solo se pinta
 *
 * Igual que en `EspacioDelArbol`, y por el mismo motivo: el conjunto entero se
 * guarda bajo UNA llave de `localStorage`, así que con el estado dentro de cada
 * carpeta varias escribiendo esa llave a la vez se pisarían.
 */
export function CarpetaDelArbol({
    carpeta,
    cuantosEspacios,
    plegado,
    puedeMandar,
    esLaPrimera,
    esLaUltima,
    alAlternar,
    alSubir,
    alBajar,
    alRefrescar,
    children,
}: {
    carpeta: Carpeta;
    cuantosEspacios: number;
    plegado: boolean;
    puedeMandar: boolean;
    esLaPrimera: boolean;
    esLaUltima: boolean;
    alAlternar: () => void;
    alSubir: () => void;
    alBajar: () => void;
    alRefrescar: () => void | Promise<void>;
    children: ReactNode;
}) {
    const [renombrando, setRenombrando] = useState(false);
    const [borrando, setBorrando] = useState(false);

    // La carpeta ENTERA es el sitio donde se suelta, no solo su cabecera: con
    // una carpeta plegada la cabecera es lo único que hay, y con una desplegada
    // el hueco entre sus espacios también tiene que valer.
    const { setNodeRef, isOver } = useDroppable({ id: carpeta.id });

    // **Una carpeta vacía SÍ se pliega**, al revés que un espacio vacío. Ahí la
    // flecha tampoco tendría nada que esconder… pero sí tiene algo que decir:
    // una carpeta recién creada está vacía porque todavía no se le ha metido
    // nada, y sin flecha se leería como una fila muerta en vez de como un sitio
    // donde soltar espacios.
    const idDeLaLista = `carpeta-${carpeta.id}-espacios`;

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "mb-2 rounded",
                // Que se vea dónde va a caer. Sin esto, soltar sobre una
                // carpeta plegada es soltar a ciegas.
                isOver && "bg-muted/60 ring-1 ring-primary/40",
            )}
        >
            <div className="flex items-center gap-1 px-2 py-1">
                {/* El «⋯» es HERMANO de esto, no hijo: por eso pulsarlo no
                    dispara el plegado y no hace falta cortar ninguna
                    propagación. */}
                <button
                    type="button"
                    onClick={alAlternar}
                    aria-expanded={!plegado}
                    aria-controls={idDeLaLista}
                    title={carpeta.nombre}
                    className="-mx-1 flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-muted/60"
                >
                    <ChevronRight
                        className={cn(
                            "size-3.5 shrink-0 text-muted-foreground transition-transform",
                            !plegado && "rotate-90",
                        )}
                    />
                    {plegado ? (
                        <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                        <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {carpeta.nombre}
                    </span>
                    {/* El número, solo plegada: desplegada ya se ven, y ahí
                        repetirlo es ruido en la fila que menos ancho tiene. */}
                    {plegado && cuantosEspacios > 0 && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                            {cuantosEspacios}
                        </span>
                    )}
                </button>

                {puedeMandar && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="size-6 shrink-0"
                                title="Acciones de la carpeta"
                                aria-label="Acciones de la carpeta"
                            >
                                <Ellipsis className="size-3.5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {!esLaPrimera && (
                                <DropdownMenuItem onSelect={alSubir}>
                                    <ArrowUp className="size-4" />
                                    Subir
                                </DropdownMenuItem>
                            )}
                            {!esLaUltima && (
                                <DropdownMenuItem onSelect={alBajar}>
                                    <ArrowDown className="size-4" />
                                    Bajar
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onSelect={() => setRenombrando(true)}>
                                <Pencil className="size-4" />
                                Renombrar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={() => setBorrando(true)}
                                className="text-destructive focus:text-destructive"
                            >
                                <Trash2 className="size-4" />
                                Eliminar carpeta
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>

            {/* Los diálogos viven FUERA del menú: Radix desmonta el contenido de
                un `DropdownMenu` al cerrarse, así que dentro se irían con él en
                cuanto se pulsara la opción. */}
            <CarpetaDialog
                carpetaId={carpeta.id}
                nombreActual={carpeta.nombre}
                abierto={renombrando}
                onAbiertoChange={setRenombrando}
                alGuardar={alRefrescar}
            />
            <BorrarCarpetaDialog
                carpetaId={carpeta.id}
                nombre={carpeta.nombre}
                cuantosEspacios={cuantosEspacios}
                abierto={borrando}
                onAbiertoChange={setBorrando}
                alBorrar={alRefrescar}
            />

            {!plegado && (
                <div id={idDeLaLista} className="pl-3">
                    {cuantosEspacios === 0 ? (
                        // Una carpeta vacía **dice que se le pueden soltar
                        // espacios**. Sin esta línea es una fila con una flecha
                        // que al abrirse no enseña nada, y eso se lee como que
                        // la carpeta está rota.
                        <p className="px-3 py-1 text-xs text-muted-foreground">
                            Vacía: arrastra aquí un espacio.
                        </p>
                    ) : (
                        children
                    )}
                </div>
            )}
        </div>
    );
}
