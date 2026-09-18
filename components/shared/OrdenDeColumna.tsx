"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { guardarElOrdenDeLaColumnaAction } from "@/actions/orden-de-tablero-actions";
import {
    posicionesDeLaColumna,
    type PosicionesDelTablero,
    type TipoDeTablero,
} from "@/lib/orden-del-tablero";

/**
 * Reordenar tarjetas dentro de una columna, en los dos tableros que lo tienen:
 * el de un proyecto y el de tickets.
 *
 * Vive aquí y no copiado en cada uno **porque son dos**: con dos copias, el día
 * que se afine el arrastre o el guardado se afina en una y la otra se queda
 * atrás, y eso no se ve como un error sino como «en tickets a veces no
 * funciona». Lo que cambia entre los dos tableros es la tarjeta que se pinta,
 * y eso entra por `children`.
 */

/**
 * Ninguna llamada puede dejar la pantalla a medias.
 *
 * Una acción de servidor no solo devuelve `success: false`: puede **reventar**
 * —un 500, la red— y entonces el `await` se rompe y la tarjeta se queda movida
 * en pantalla y en su sitio de antes en la base. Esa es la peor de las dos:
 * parece guardado y no lo está.
 */
async function pedir(llamada: () => Promise<{ success: boolean; message?: string }>) {
    try {
        return await llamada();
    } catch (error) {
        console.warn("[tablero] el orden no llegó al servidor", error);
        return { success: false, message: "No se pudo guardar el orden. Revisa la conexión." };
    }
}

/**
 * El estado del orden de un tablero, con su guardado optimista.
 *
 * Las posiciones llegan **dentro de cada tarjeta** desde el servidor; esto solo
 * guarda las que se cambian a mano mientras la pantalla está abierta, para que
 * arrastrar se vea al momento y no dependa de una vuelta de red — la misma
 * regla que mover a una carpeta o borrar un chat.
 */
export function useOrdenDeColumna(tipo: TipoDeTablero, tableroId: string, puedeOrdenar: boolean) {
    const [encima, setEncima] = useState<PosicionesDelTablero>({});

    /**
     * La posición que manda: la que se acaba de mover, si la hay, y si no la
     * que trajo el servidor.
     */
    const posicionDe = useCallback(
        (id: string, delServidor: number | null | undefined): number | null => {
            const propia = encima[id];
            if (typeof propia === "number") return propia;
            return typeof delServidor === "number" ? delServidor : null;
        },
        [encima],
    );

    /**
     * Mueve al momento y avisa después; si el servidor dice que no, se devuelve
     * tal cual estaba.
     *
     * Se guarda la columna ENTERA. Guardando solo la tarjeta movida habría que
     * hacerle sitio corriendo a las demás, y dos administradores a la vez
     * dejarían la columna con dos tarjetas en el mismo hueco. Con la columna
     * entera cada escritura es una foto completa: gana la última, pero gana
     * entera, así que el resultado siempre es el orden que vio una persona.
     */
    const reordenar = useCallback(
        async (ids: string[]) => {
            if (!puedeOrdenar) {
                toast.error("Solo un administrador puede reordenar el tablero.");
                return;
            }

            const antes = encima;
            const nuevas: PosicionesDelTablero = { ...encima };
            for (const { id, orden } of posicionesDeLaColumna(ids)) nuevas[id] = orden;
            setEncima(nuevas);

            const res = await pedir(() =>
                guardarElOrdenDeLaColumnaAction({ tipo, tableroId, ids }),
            );
            if (!res.success) {
                setEncima(antes);
                toast.error(res.message ?? "No se pudo guardar el orden.");
            }
        },
        [encima, puedeOrdenar, tableroId, tipo],
    );

    /**
     * Ponerla al final de la columna a la que acaba de llegar, **en pantalla**.
     *
     * El servidor ya le da ese sitio al mover (`alFinalDelTablero`), pero el
     * tablero no se recarga después de arrastrar: sin esto la tarjeta se
     * quedaría con el número de su columna ANTERIOR, que pertenece a otra
     * banda, y aparecería en mitad de la nueva hasta que alguien recargara. Que
     * es justo «no se queda donde la dejo».
     */
    const ponerAlFinal = useCallback((id: string, posicionesDeEsaColumna: Array<number | null>) => {
        const numeros = posicionesDeEsaColumna.filter((p): p is number => typeof p === "number");
        const siguiente = numeros.length === 0 ? 0 : Math.max(...numeros) + 1;
        setEncima((prev) => ({ ...prev, [id]: siguiente }));
    }, []);

    /** Al recargar el tablero, lo de encima sobra: ya viene en las tarjetas. */
    const olvidarLoDeEncima = useCallback(() => setEncima({}), []);

    // Memorizado: los dos tableros lo meten en las dependencias del `useMemo`
    // que coloca las columnas, así que un objeto nuevo en cada render las
    // recalcularía todas por nada.
    return useMemo(
        () => ({ posicionDe, reordenar, ponerAlFinal, olvidarLoDeEncima, puedeOrdenar }),
        [posicionDe, reordenar, ponerAlFinal, olvidarLoDeEncima, puedeOrdenar],
    );
}

/**
 * La columna que admite reordenar dentro.
 *
 * `verticalListSortingStrategy` y no la `rectSortingStrategy` de la rejilla de
 * Proyectos: una columna es **una sola columna de tarjetas apiladas**, que es
 * exactamente lo que aquella sabe medir. La de rejilla colocaría las vecinas
 * como si hubiera varias columnas y la animación iría a otro sitio.
 *
 * El `DndContext` **no se monta aquí**: ya lo pone el tablero, y es el mismo que
 * mueve una tarjeta de una columna a otra. Dos contextos anidados se roban los
 * eventos y el cambio de columna dejaría de funcionar.
 */
export function ColumnaOrdenable({ ids, children }: { ids: string[]; children: ReactNode }) {
    return (
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {children}
        </SortableContext>
    );
}

/**
 * Una tarjeta del tablero, arrastrable y a la vez sitio donde soltar otra.
 *
 * Se arrastra **por la tarjeta entera**, no por un asa: es como ya funcionaba
 * para cambiar de columna, que es lo que más se hace aquí, y añadir un asa
 * obligaría a apuntar a un punto concreto para algo que hoy se hace en
 * cualquier sitio. El clic sigue siendo un clic porque el sensor del tablero
 * exige mover 6 px antes de empezar a arrastrar.
 *
 * `useSortable` en vez de `useDraggable` es todo el cambio: la tarjeta pasa a
 * ser también un destino, y sin eso no hay forma de saber **entre qué dos**
 * tarjetas se soltó — solo en qué columna.
 *
 * # Y lo único que viaja es el `id`. No se le cuelga un `data`.
 *
 * Al cambiar de `useDraggable` a `useSortable` se perdió el `data: { task }`
 * que la tarjeta llevaba, y los dos tableros seguían leyéndolo al soltar. El
 * resultado fue que **dejaron de moverse las tarjetas, en los dos, y sin un
 * solo error**: el manejador se iba por su `if (!task) return` antes de decidir
 * nada, así que cambiar de columna y reordenar —que salen de la misma función—
 * cayeron a la vez. Y la tarjeta seguía levantándose, porque el `transform` se
 * aplica aquí y no depende de ese dato.
 *
 * Ahora quien recibe el arrastre busca la tarjeta **por su id** en la lista que
 * ya tiene. El `id` no se puede perder: sin él dnd-kit no arrastra nada. Un
 * segundo canal que solo sirve para transportar es justo lo que un refactor se
 * deja, y su pérdida no la nota nadie hasta que un cliente lo prueba.
 */
export function TarjetaDelTablero({
    id,
    puedeArrastrar,
    className,
    onClick,
    children,
}: {
    id: string;
    puedeArrastrar: boolean;
    className?: string;
    onClick?: () => void;
    children: (arrastrando: boolean) => ReactNode;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id,
        disabled: !puedeArrastrar,
    });

    return (
        <div
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                ...(isDragging ? { zIndex: 50, position: "relative" as const } : {}),
            }}
            {...(puedeArrastrar ? listeners : {})}
            {...(puedeArrastrar ? attributes : {})}
            onClick={() => {
                // El sensor exige 6 px, así que un clic limpio llega aquí y abre
                // la tarjeta; soltarla tras arrastrar, no.
                if (!isDragging) onClick?.();
            }}
            className={className}
        >
            {children(isDragging)}
        </div>
    );
}
