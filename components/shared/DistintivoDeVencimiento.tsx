"use client";

import { CalendarClock } from "lucide-react";

import { cn } from "@/lib/utils";
import {
    estadoDelVencimiento,
    etiquetaDelVencimiento,
    type EstadoDelVencimiento,
} from "@/lib/vencimiento";

/**
 * El distintivo de vencimiento de una tarjeta, el mismo en Proyectos y en
 * Tickets.
 *
 * Dos tableros con dos distintivos es lo que ya costó una vuelta con los pies de
 * diálogo y con las barras de escribir: el día que se afine un color o el texto
 * se afina en uno y el otro se queda atrás, y eso no se lee como un error — se
 * lee como dos pantallas de la misma plataforma que no se parecen, sin que nadie
 * sepa cuál es la buena.
 *
 * **Quien decide el color es `lib/vencimiento.ts`**, que es puro y lo comparte
 * con los filtros y con el trabajo que manda los avisos. Aquí solo se pinta: si
 * esto tuviera su propia cuenta, una tarjeta podría salir en rojo sin que
 * hubiera salido ningún aviso.
 */

/** Cada estado con su color. `apagado` no llega aquí: no se pinta nada. */
const COLORES: Record<Exclude<EstadoDelVencimiento, "apagado">, string> = {
    // Neutro de verdad: mientras falte tiempo, la fecha es un dato más de la
    // fila y no puede competir con el título.
    lejos: "border-border bg-muted/60 text-muted-foreground",
    pronto: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300",
    vencida: "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300",
};

const QUE_DICE: Record<Exclude<EstadoDelVencimiento, "apagado">, string> = {
    lejos: "Vence el",
    pronto: "Vence pronto:",
    vencida: "Vencida:",
};

export function DistintivoDeVencimiento({
    vence,
    ahora,
    terminada,
    className,
}: {
    /** La fecha en ISO. Nula = sin vencimiento, y entonces no se pinta nada. */
    vence: string | null | undefined;
    /**
     * El reloj, por parámetro.
     *
     * Leyendo `Date.now()` aquí dentro, dos tarjetas del mismo repintado podrían
     * caer a lados distintos de la medianoche; y sobre todo no habría forma de
     * probarlo sin esperar a que pase un día.
     */
    ahora: number;
    /** Hecha, resuelta o descartada: lo que cierre esa tarjeta. */
    terminada: boolean;
    className?: string;
}) {
    const estado = estadoDelVencimiento({ vence, ahora, terminada });
    // Terminada o sin fecha: ni un hueco. Es lo que pedía el encargo —«al marcar
    // la tarea como terminada el distintivo se apaga y deja de avisar»— y lo que
    // impide que la columna «Hecho» salga entera en rojo.
    if (estado === "apagado") return null;

    const etiqueta = etiquetaDelVencimiento(vence, ahora);
    if (!etiqueta) return null;

    return (
        <span
            className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
                COLORES[estado],
                className,
            )}
            // El título dice la fecha entera: «Hoy» y «Mañana» se leen de un
            // vistazo pero no dicen qué día son, y eso es lo que hace falta para
            // escribirle al cliente.
            title={`${QUE_DICE[estado]} ${fechaLarga(vence)}`}
        >
            <CalendarClock className="h-2.5 w-2.5 shrink-0" aria-hidden />
            {etiqueta}
        </span>
    );
}

function fechaLarga(vence: string | null | undefined): string {
    if (!vence) return "";
    const d = new Date(vence);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("es-CO", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}
