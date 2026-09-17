"use client";

import { Kanban, List } from "lucide-react";
import { ModuleToolbar } from "@/components/shared/ModuleToolbar";

type Vista = "tablero" | "lista";

/**
 * La franja de arriba de Tickets: **la misma de Etiquetas**, no una parecida.
 *
 * Las clases están copiadas de `TagsPageClient` una a una —el `ModuleToolbar`,
 * el grupo `flex min-w-0 flex-1 flex-wrap items-center gap-2`, la caja del
 * conmutador `flex gap-1 rounded-lg border border-border/60 bg-muted/30 p-1` y
 * los botones `px-3 py-1.5 text-sm font-medium`—, así que las dos pantallas
 * miden lo mismo: mismo alto de franja, mismos márgenes y misma tipografía.
 * Escribir algo «parecido a ojo» es como acaban dos pantallas hermanas
 * separándose cuatro píxeles, que se ve en cuanto se ponen lado a lado.
 *
 * Aquí **no hay título ni subtítulo**: la miga de pan ya dice que esto es
 * Tickets, y esa fila se llevaba una franja entera que el tablero necesita.
 *
 * Lo que en Etiquetas es el menú de acciones globales, aquí es el contador, el
 * botón de actualizar y el de nuevo ticket: el mismo hueco, a la derecha y en
 * la misma línea.
 */
export function CabeceraDeTickets({
    vista,
    onVista,
    /** Lo que va pegado al conmutador. En Etiquetas son las píldoras de score. */
    filtros,
    /** Lo que va a la derecha del todo. */
    acciones,
}: {
    vista: Vista;
    onVista: (v: Vista) => void;
    filtros?: React.ReactNode;
    acciones?: React.ReactNode;
}) {
    return (
        <ModuleToolbar>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
                    <BotonDeVista
                        activo={vista === "tablero"}
                        onClick={() => onVista("tablero")}
                        icono={<Kanban className="h-3.5 w-3.5" />}
                    >
                        Tablero
                    </BotonDeVista>
                    <BotonDeVista
                        activo={vista === "lista"}
                        onClick={() => onVista("lista")}
                        icono={<List className="h-3.5 w-3.5" />}
                    >
                        Lista
                    </BotonDeVista>
                </div>

                {filtros}
            </div>

            {acciones}
        </ModuleToolbar>
    );
}

function BotonDeVista({
    activo,
    onClick,
    icono,
    children,
}: {
    activo: boolean;
    onClick: () => void;
    icono: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                activo
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
        >
            {icono}
            {children}
        </button>
    );
}
