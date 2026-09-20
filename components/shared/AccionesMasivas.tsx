"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Ellipsis, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * El `⋯` de la esquina: lo que se le hace a VARIAS filas a la vez.
 *
 * Va pegado al borde derecho de `BarraDeAcciones` en todas las pantallas, y
 * **sale siempre**, con o sin selección. Un botón que aparece y desaparece
 * según lo que haya marcado mueve de sitio al de al lado justo cuando se va a
 * pulsar; y con la barra vacía nadie descubre que la pantalla tiene acciones
 * masivas. Sin nada marcado, el menú lo dice en una línea.
 *
 * # Borrar es lo mínimo, y el permiso decide si EXISTE
 *
 * `puedeEliminar` no pinta la opción en gris: la **quita**. Una opción apagada
 * invita a preguntar por qué no se puede, y la respuesta —«tu rol no borra»—
 * no cabe en un menú. Cada pantalla resuelve ese permiso con la puerta que ya
 * tiene; este componente no inventa ninguna.
 *
 * # Lo que devuelve `onEliminar` se DICE
 *
 * Borrar en bloque es lo único de esta barra que no se deshace, así que el
 * resultado no puede ser un silencio: se cuenta cuántas se borraron y, si
 * alguna falló, cuántas. Un «listo» sobre veinte filas de las que se fueron
 * dieciocho es peor que un error.
 */
export type AccionExtra = {
    clave: string;
    etiqueta: string;
    icono?: ReactNode;
    onSelect: () => void;
    /** La pinta en rojo. Para lo que no se deshace. */
    destructiva?: boolean;
    /** Sale también sin selección (exportar, por ejemplo). */
    sinSeleccion?: boolean;
};

export function AccionesMasivas({
    seleccionados,
    queSon,
    onEliminar,
    puedeEliminar = true,
    extras,
    menu,
    onTerminar,
    className,
}: {
    /** Los ids marcados. */
    seleccionados: string[];
    /** Cómo se llaman en plural: «clientes», «módulos», «plantillas»… */
    queSon: string;
    /**
     * Borra las marcadas. Puede devolver cuántas fallaron; si no devuelve
     * nada, se da por hecho que fueron todas.
     */
    onEliminar?: (ids: string[]) => Promise<{ fallaron?: number } | void> | void;
    /** Con `false` la opción de borrar NO se pinta. */
    puedeEliminar?: boolean;
    /** Lo propio de cada pantalla: exportar, archivar, asignar… */
    extras?: AccionExtra[];
    /**
     * Mandos de la pantalla que no son una acción de una línea: «Buscar por»,
     * «Estado», «Columnas»…
     *
     * Existe porque son cosas que **no se usan a diario** y que en la barra le
     * comen el ancho al buscador y a las pastillas, que sí. La regla de la
     * barra ya decía dónde van —«un botón que gasta ancho y no se usa a diario
     * va dentro del `⋯`»—; lo que faltaba era el hueco donde meterlos. Cada
     * mando trae aquí su propio submenú, para que este menú no crezca con
     * listas que crecen solas (las columnas de una tabla, por ejemplo).
     */
    menu?: ReactNode;
    /** Se llama al acabar un borrado, para limpiar la selección y recargar. */
    onTerminar?: () => void;
    className?: string;
}) {
    const [confirmando, setConfirmando] = useState(false);
    const [borrando, setBorrando] = useState(false);

    const cuantas = seleccionados.length;
    const hayExtrasSinSeleccion = (extras ?? []).some((e) => e.sinSeleccion);
    const puedeBorrarAhora = puedeEliminar && !!onEliminar && cuantas > 0;

    const borrar = useCallback(async () => {
        if (!onEliminar || cuantas === 0) return;
        setBorrando(true);
        try {
            const resultado = await onEliminar(seleccionados);
            const fallaron = resultado?.fallaron ?? 0;
            if (fallaron > 0) {
                toast.warning(
                    `Se eliminaron ${cuantas - fallaron} de ${cuantas}. ${fallaron} no se pudieron eliminar.`,
                );
            } else {
                toast.success(`${cuantas} ${cuantas === 1 ? "elemento eliminado" : "elementos eliminados"}.`);
            }
            onTerminar?.();
        } catch (error) {
            // Una acción puede REVENTAR, no solo devolver que no pudo. Sin este
            // `catch` el diálogo se quedaba en «Eliminando…» para siempre, que
            // es la misma familia que el «Guardando…» colgado de Carpetas.
            console.error("[acciones] el borrado en bloque falló", error);
            toast.error("No se pudo completar el borrado.");
        } finally {
            setBorrando(false);
            setConfirmando(false);
        }
    }, [cuantas, onEliminar, onTerminar, seleccionados]);

    const items = useMemo(
        () => (extras ?? []).filter((e) => e.sinSeleccion || cuantas > 0),
        [cuantas, extras],
    );

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="outline"
                        size="icon"
                        className={cn("h-10 w-10 shrink-0", className)}
                        title="Acciones"
                        aria-label="Acciones"
                    >
                        <Ellipsis className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-[min(70vh,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto">
                    <DropdownMenuLabel>
                        {cuantas > 0 ? `${cuantas} seleccionado${cuantas === 1 ? "" : "s"}` : "Acciones"}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />

                    {menu ? (
                        <>
                            {menu}
                            <DropdownMenuSeparator />
                        </>
                    ) : null}

                    {items.map((accion) => (
                        <DropdownMenuItem
                            key={accion.clave}
                            onSelect={accion.onSelect}
                            className={accion.destructiva ? "text-destructive focus:text-destructive" : undefined}
                        >
                            {accion.icono}
                            {accion.etiqueta}
                        </DropdownMenuItem>
                    ))}

                    {puedeBorrarAhora && (
                        <DropdownMenuItem
                            onSelect={() => setConfirmando(true)}
                            className="text-destructive focus:text-destructive"
                        >
                            <Trash2 className="h-4 w-4" />
                            Eliminar {cuantas} {cuantas === 1 ? queSon.replace(/s$/, "") : queSon}
                        </DropdownMenuItem>
                    )}

                    {cuantas === 0 && !hayExtrasSinSeleccion && !menu && (
                        // Sin esto el menú se abre vacío y parece roto. Dice qué
                        // hay que hacer para que sirva, que es marcar filas.
                        // Con `menu` puesto el menú ya tiene contenido, así que
                        // esta línea sobraría y encima diría que no hay nada.
                        <DropdownMenuItem disabled>
                            Marca {queSon} para actuar sobre varios
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            <AlertDialog open={confirmando} onOpenChange={(abierto) => !borrando && setConfirmando(abierto)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            ¿Eliminar {cuantas} {cuantas === 1 ? queSon.replace(/s$/, "") : queSon}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no se puede deshacer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={borrando}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(evento) => {
                                // Sin esto Radix cierra el diálogo al pulsar y el
                                // «Eliminando…» no se llega a ver.
                                evento.preventDefault();
                                void borrar();
                            }}
                            disabled={borrando}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {borrando ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Eliminando…
                                </>
                            ) : (
                                "Eliminar"
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

/**
 * La selección de una lista que NO es una tabla de TanStack.
 *
 * Media plataforma pinta rejillas de tarjetas y listas a mano, y ahí no hay
 * `rowSelection` que aprovechar. Esto es lo mismo en pequeño: un conjunto de
 * ids, alternar uno, alternar todos los que se ven —los que se VEN, no los que
 * hay: marcar «todos» con un filtro puesto y que se borre lo que está
 * escondido es la peor sorpresa posible— y limpiar.
 */
export function useSeleccionMultiple(idsVisibles: string[]) {
    const [seleccionados, setSeleccionados] = useState<string[]>([]);

    const visibles = useMemo(() => new Set(idsVisibles), [idsVisibles]);

    // Lo que se marcó y ya no está en la lista —se borró, o lo escondió un
    // filtro— no puede seguir contando: el menú diría «eliminar 5» y se
    // llevaría por delante una fila que quien mira no tiene enfrente.
    const vivos = useMemo(
        () => seleccionados.filter((id) => visibles.has(id)),
        [seleccionados, visibles],
    );

    const alternar = useCallback((id: string) => {
        setSeleccionados((antes) =>
            antes.includes(id) ? antes.filter((x) => x !== id) : [...antes, id],
        );
    }, []);

    const estanTodos = idsVisibles.length > 0 && vivos.length === idsVisibles.length;

    const alternarTodos = useCallback(() => {
        setSeleccionados((antes) => {
            const todos = antes.filter((id) => visibles.has(id)).length === visibles.size && visibles.size > 0;
            return todos ? antes.filter((id) => !visibles.has(id)) : Array.from(new Set([...antes, ...visibles]));
        });
    }, [visibles]);

    const limpiar = useCallback(() => setSeleccionados([]), []);

    return { seleccionados: vivos, alternar, alternarTodos, estanTodos, limpiar };
}

/** La casilla de una fila. Para que las listas a mano no la dibujen cada una. */
export function CasillaDeFila({
    marcada,
    onCambiar,
    etiqueta,
    className,
}: {
    marcada: boolean;
    onCambiar: () => void;
    etiqueta?: string;
    className?: string;
}) {
    return (
        <Checkbox
            checked={marcada}
            onCheckedChange={onCambiar}
            aria-label={etiqueta ?? "Seleccionar"}
            // Se para aquí: en una tarjeta que se abre al pulsarla, marcar la
            // casilla abriría además la ficha.
            onClick={(evento) => evento.stopPropagation()}
            className={cn("shrink-0", className)}
        />
    );
}

/** «Marcar todo lo que se ve», para la cabecera de una lista o su barra. */
export function CasillaDeTodos({
    estanTodos,
    hayAlguno,
    onCambiar,
    className,
}: {
    estanTodos: boolean;
    hayAlguno: boolean;
    onCambiar: () => void;
    className?: string;
}) {
    return (
        <label className={cn("flex h-10 shrink-0 items-center gap-2 px-1 text-xs text-muted-foreground", className)}>
            <Checkbox
                checked={estanTodos ? true : hayAlguno ? "indeterminate" : false}
                onCheckedChange={onCambiar}
                aria-label="Seleccionar todo lo que se ve"
            />
            <span className="hidden sm:inline">Todo</span>
        </label>
    );
}
