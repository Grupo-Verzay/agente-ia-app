"use client";

import { Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    COLORES_DE_ESTADO,
    ETIQUETAS_DE_ESTADO,
    laEspera,
    type EstadoDeTicket,
} from "@/lib/tickets";
import type { TicketConAdjuntos } from "@/actions/tickets-actions";

export function SelloDeEstado({ estado }: { estado: EstadoDeTicket }) {
    return (
        <span
            className={cn(
                "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
                COLORES_DE_ESTADO[estado],
            )}
        >
            {ETIQUETAS_DE_ESTADO[estado]}
        </span>
    );
}

/**
 * Un ticket en una tarjeta, la misma en las tres vistas —el tablero, la lista y
 * «Mis tickets»—.
 *
 * ## Compacta a propósito: cuatro datos y ninguno más
 *
 * Título, de qué cuenta viene, cuánto lleva esperando y su estado. **La
 * descripción NO se pinta aquí**, y esa es la regla que sostiene el tablero: en
 * un ticket se pega media conversación —eso es lo normal, no el caso raro— y una
 * tarjeta que la enseñe mide lo que mida ese texto. Con columnas de 280 px,
 * tres tickets largos y ya no se ve el tablero: hay que desplazarse DENTRO de
 * cada tarjeta, que es justo lo contrario de para lo que sirve un tablero. Es la
 * misma regla que la tarjeta de Proyectos.
 *
 * El texto entero se lee **al abrir el ticket** (`DetalleDelTicket`), que es
 * donde además están los archivos y el número de WhatsApp.
 *
 * Y el título va a **dos líneas con «…», reservando sitio para las dos aunque
 * use una** (`min-h-[2.75em]`, que son 2 × 1.375em de `leading-snug`): es lo que
 * iguala las alturas sin recortar los títulos largos. El completo va en el
 * `title`.
 *
 * ## Lo único que se salva del recorte es el motivo del descarte
 *
 * Porque el cliente tiene que leerlo sin abrir nada: un ticket que se cierra sin
 * decir por qué se lee como que nadie lo miró. Va recortado a dos líneas —no
 * puede crecer sin tope— y entero al abrirlo.
 *
 * `acciones` entra **arriba, al lado del sello**, nunca en una fila propia: seis
 * botones debajo de cada tarjeta eran los que se comían el tablero.
 */
export function TarjetaDeTicket({
    ticket,
    deQuien,
    acciones,
    onAbrir,
    arrastrando = false,
    ahora,
}: {
    ticket: TicketConAdjuntos;
    /** En las vistas del administrador, de qué cuenta viene. */
    deQuien?: string | null;
    acciones?: React.ReactNode;
    onAbrir?: () => void;
    arrastrando?: boolean;
    /**
     * La hora con la que se calcula la espera. Llega de fuera para que todas las
     * tarjetas de un repintado digan lo mismo, y para poder probarlo.
     */
    ahora: number;
}) {
    const espera = laEspera(ticket, ahora);

    return (
        <div
            className={cn(
                "flex flex-col gap-2 rounded-xl border bg-card p-3 text-left",
                onAbrir && "cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/40",
                arrastrando && "rotate-1 opacity-80 shadow-lg",
            )}
            onClick={onAbrir}
        >
            <div className="flex items-start justify-between gap-2">
                <p
                    className="min-h-[2.75em] min-w-0 flex-1 text-sm font-medium leading-snug line-clamp-2"
                    title={ticket.titulo}
                >
                    {ticket.titulo}
                </p>
                <div className="flex shrink-0 items-center gap-1.5">
                    <SelloDeEstado estado={ticket.estado} />
                    {/* Lo de dentro son botones: sin esto, pulsarlos abriría
                        además el ticket. */}
                    {acciones && (
                        <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                            {acciones}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                {deQuien && (
                    <span className="max-w-[12rem] truncate font-medium text-foreground/70" title={deQuien}>
                        {deQuien}
                    </span>
                )}
                {espera && <span>{espera}</span>}
                {ticket.adjuntos.length > 0 && (
                    <span className="inline-flex items-center gap-0.5">
                        <Paperclip className="h-3 w-3" />
                        {ticket.adjuntos.length}
                    </span>
                )}
            </div>

            {ticket.estado === "descartado" && ticket.motivoDescarte && (
                /* `line-clamp` va en el bloque, no en el `span` de dentro: es
                   `display:-webkit-box` sobre el contenedor lo que recorta, y
                   puesto en un `span` en línea no hace nada. */
                <p className="line-clamp-2 rounded-lg border border-dashed bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Por qué: </span>
                    {ticket.motivoDescarte}
                </p>
            )}
        </div>
    );
}
