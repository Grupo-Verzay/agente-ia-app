"use client";

import { useState } from "react";
import {
    ChevronDown,
    FileAudio,
    FileText,
    Image as ImageIcon,
    Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    COLORES_DE_ESTADO,
    ETIQUETAS_DE_ESTADO,
    type EstadoDeTicket,
} from "@/lib/tickets";
import type { TipoDeAdjunto } from "@/lib/adjuntos-de-tarea-tipos";
import type { TicketConAdjuntos } from "@/actions/tickets-actions";

const ICONOS: Record<TipoDeAdjunto, typeof FileText> = {
    image: ImageIcon,
    video: Video,
    audio: FileAudio,
    document: FileText,
};

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

function cuando(iso: string): string {
    const fecha = new Date(iso);
    const segundos = Math.max(0, Math.floor((Date.now() - fecha.getTime()) / 1000));
    if (segundos < 3600) return `hace ${Math.max(1, Math.floor(segundos / 60))} min`;
    if (segundos < 86400) return `hace ${Math.floor(segundos / 3600)} h`;
    const dias = Math.floor(segundos / 86400);
    if (dias === 1) return "ayer";
    if (dias < 30) return `hace ${dias} días`;
    return fecha.toLocaleDateString();
}

/**
 * Un ticket, el mismo en las dos pantallas.
 *
 * Lo que cambia entre la del cliente y la del administrador es lo que se puede
 * HACER con él, que entra por `acciones`. El cuerpo —título, estado, motivo,
 * adjuntos— se pinta igual en las dos a propósito: si fueran dos tarjetas, el
 * día que el motivo de descarte cambie de sitio el cliente dejaría de verlo sin
 * que nadie se entere.
 *
 * El texto largo va **recortado a dos líneas** y completo al desplegar, como las
 * tarjetas del tablero: pegar ahí media conversación es lo normal, y sin
 * recorte un ticket se come la pantalla entera.
 */
export function TarjetaDeTicket({
    ticket,
    deQuien,
    acciones,
}: {
    ticket: TicketConAdjuntos;
    /** En la lista del administrador, de quién es. */
    deQuien?: string | null;
    acciones?: React.ReactNode;
}) {
    const [abierta, setAbierta] = useState(false);

    return (
        <div className="rounded-xl border bg-card p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug break-words">{ticket.titulo}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {deQuien && <span className="font-medium text-foreground/70">{deQuien}</span>}
                        <span>{cuando(ticket.creadoEn)}</span>
                        {ticket.adjuntos.length > 0 && (
                            <span>
                                {ticket.adjuntos.length}{" "}
                                {ticket.adjuntos.length === 1 ? "archivo" : "archivos"}
                            </span>
                        )}
                    </div>
                </div>
                <SelloDeEstado estado={ticket.estado} />
            </div>

            <div className="mt-2">
                <p
                    className={cn(
                        "whitespace-pre-wrap text-sm text-muted-foreground",
                        !abierta && "line-clamp-2",
                    )}
                >
                    {ticket.descripcion}
                </p>
                {ticket.descripcion.length > 120 && (
                    <button
                        type="button"
                        onClick={() => setAbierta((v) => !v)}
                        className="mt-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                        <ChevronDown
                            className={cn("h-3 w-3 transition-transform", abierta && "rotate-180")}
                        />
                        {abierta ? "Ver menos" : "Ver todo"}
                    </button>
                )}
            </div>

            {/* El motivo del descarte lo lee el cliente: un ticket que se cierra
                sin decir por qué se lee como que nadie lo miró. */}
            {ticket.estado === "descartado" && ticket.motivoDescarte && (
                <p className="mt-2 rounded-lg border border-dashed bg-muted/40 px-2.5 py-2 text-xs">
                    <span className="font-medium">Por qué se descartó: </span>
                    <span className="text-muted-foreground">{ticket.motivoDescarte}</span>
                </p>
            )}

            {ticket.adjuntos.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                    {ticket.adjuntos.map((a) => {
                        const Icon = ICONOS[a.tipo] ?? FileText;
                        return (
                            <li key={a.id}>
                                <a
                                    href={a.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={a.nombre}
                                    className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent"
                                >
                                    <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                                    <span className="truncate">{a.nombre}</span>
                                </a>
                            </li>
                        );
                    })}
                </ul>
            )}

            {acciones && <div className="mt-3 border-t pt-2.5">{acciones}</div>}
        </div>
    );
}
