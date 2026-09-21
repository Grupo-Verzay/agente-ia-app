"use client";

import { type ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";

import { cn } from "@/lib/utils";

/**
 * Los espacios que no están en ninguna carpeta.
 *
 * Es **una columna más** —por eso tiene su `useDroppable`, con el centinela
 * `SUELTOS`—, y sin ella no habría forma de sacar un espacio de una carpeta
 * arrastrándolo: solo se podría meter. Es la mitad del encargo que se olvida.
 *
 * # La zona vacía solo aparece MIENTRAS se arrastra
 *
 * Cuando hay carpetas pero ningún espacio suelto, esta zona es solo un sitio
 * donde soltar. Enseñarla siempre —con su «Sin carpeta · arrastra aquí para
 * sacar un espacio»— hace pensar que hay algo suelto ahí cuando no lo hay. Así
 * que el rótulo y el alto mínimo **solo salen mientras se arrastra un espacio**
 * (`arrastrando`); el resto del tiempo la zona no ocupa ni se ve.
 *
 * El nodo droppable, en cambio, **está siempre montado** (el `ref` no depende
 * de `arrastrando`): así está registrado desde el principio, y cuando el
 * arrastre empieza y le entra el alto, el `DndContext` —que mide en
 * `MeasuringStrategy.Always`— lo recoge como destino con su tamaño nuevo. Si
 * solo se montara al empezar a arrastrar, podría no llegar a medirse.
 *
 * Cuando SÍ hay espacios sueltos, el rótulo «Sin carpeta» los encabeza siempre:
 * ahí no es una pista de arrastre, es la etiqueta de un grupo que se ve. Y sin
 * ninguna carpeta creada no hay cabecera: el árbol es el de siempre y un rótulo
 * «Sin carpeta» sobre la lista entera sería ruido que nadie pidió.
 */
export function EspaciosSueltos({
    id,
    hayCarpetas,
    vacio,
    arrastrando,
    children,
}: {
    id: string;
    hayCarpetas: boolean;
    vacio: boolean;
    /** Si el usuario está arrastrando un espacio ahora mismo. */
    arrastrando: boolean;
    children: ReactNode;
}) {
    const { setNodeRef, isOver } = useDroppable({ id });

    // La zona vacía —el sitio donde soltar para sacar un espacio de su carpeta—
    // solo tiene sentido, y solo se ve, mientras se arrastra.
    const mostrarZonaVacia = hayCarpetas && vacio && arrastrando;
    // El rótulo que encabeza los espacios sueltos de verdad, siempre que los
    // haya y haya carpetas.
    const mostrarRotulo = hayCarpetas && !vacio;

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "rounded",
                // Alto mínimo (sitio donde soltar) SOLO mientras se arrastra y no
                // queda ningún suelto: sin él, sacar el último de una carpeta
                // sería imposible; con él fuera de un arrastre, sería una franja
                // vacía que parece tener algo.
                mostrarZonaVacia && "min-h-10",
                isOver && "bg-muted/60 ring-1 ring-primary/40",
            )}
        >
            {mostrarRotulo && (
                <p className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Sin carpeta
                </p>
            )}
            {mostrarZonaVacia && (
                <p className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Sin carpeta · arrastra aquí para sacar un espacio
                </p>
            )}
            {children}
        </div>
    );
}
