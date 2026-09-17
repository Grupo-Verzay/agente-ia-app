"use client";

import { useMemo, useState } from "react";
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { TarjetaDeTicket } from "@/components/tickets/TarjetaDeTicket";
import { cn } from "@/lib/utils";
import {
    COLOR_DE_COLUMNA,
    ESTADOS_DE_TICKET,
    ETIQUETAS_DE_ESTADO,
    comoEstadoDeTicket,
    type EstadoDeTicket,
} from "@/lib/tickets";
import type { TicketConAdjuntos } from "@/actions/tickets-actions";

/**
 * El tablero: una columna por estado y arrastrar para cambiarlo.
 *
 * Es el mismo patrón del tablero de Proyectos —dnd-kit, `useDraggable` por
 * tarjeta y `useDroppable` por columna— y por los mismos motivos:
 *
 * - **El sensor exige mover 6 px** antes de considerar que se está arrastrando.
 *   Sin esa holgura no se puede pulsar una tarjeta para abrirla: cualquier clic
 *   con un temblor de un píxel se interpreta como arrastre y el ticket no se
 *   abre nunca.
 * - **Soltar en «descartado» NO mueve la tarjeta todavía**: pide el motivo
 *   primero (lo decide quien recibe `onSoltar`). Pintarla en la columna y
 *   devolverla si se cancela el diálogo la haría saltar a la vista.
 *
 * Quien decide qué pasa al soltar es el padre, no esto: aquí solo se sabe qué
 * tarjeta cayó en qué columna.
 */
export function TableroDeTickets({
    tickets,
    porEstado,
    moviendo,
    ahora,
    onSoltar,
    onAbrir,
}: {
    tickets: TicketConAdjuntos[];
    /** Cuántos hay de verdad en cada estado, del `COUNT` del servidor. */
    porEstado: Record<string, number>;
    moviendo: string | null;
    ahora: number;
    onSoltar: (ticket: TicketConAdjuntos, estado: EstadoDeTicket) => void;
    onAbrir: (ticket: TicketConAdjuntos) => void;
}) {
    const [arrastrando, setArrastrando] = useState<TicketConAdjuntos | null>(null);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

    const porColumna = useMemo(() => {
        const mapa: Record<EstadoDeTicket, TicketConAdjuntos[]> = {
            recibido: [],
            en_proceso: [],
            en_revision: [],
            resuelto: [],
            descartado: [],
        };
        for (const t of tickets) mapa[t.estado].push(t);
        return mapa;
    }, [tickets]);

    return (
        <DndContext
            sensors={sensors}
            onDragStart={(e: DragStartEvent) =>
                setArrastrando(
                    (e.active.data.current as { ticket?: TicketConAdjuntos } | undefined)?.ticket ?? null,
                )
            }
            onDragEnd={(e: DragEndEvent) => {
                setArrastrando(null);
                const { active, over } = e;
                if (!over) return;
                const ticket = (active.data.current as { ticket?: TicketConAdjuntos } | undefined)?.ticket;
                // Lo que llega del arrastre pasa por la lista, igual que lo que
                // llega del navegador en la acción: `over.id` es una cadena
                // cualquiera hasta que alguien lo comprueba.
                const destino = comoEstadoDeTicket(String(over.id));
                if (!ticket || !destino || ticket.estado === destino) return;
                onSoltar(ticket, destino);
            }}
        >
            <div className="min-h-0 flex-1 overflow-x-auto pb-2">
                <div className="flex h-full gap-3" style={{ width: "max-content", minWidth: "100%" }}>
                    {ESTADOS_DE_TICKET.map((estado) => (
                        <Columna
                            key={estado}
                            estado={estado}
                            tickets={porColumna[estado]}
                            deVerdad={porEstado[estado] ?? porColumna[estado].length}
                            moviendo={moviendo}
                            ahora={ahora}
                            onAbrir={onAbrir}
                        />
                    ))}
                </div>
            </div>

            <DragOverlay>
                {arrastrando && (
                    <div className="w-[264px]">
                        <TarjetaDeTicket
                            ticket={arrastrando}
                            deQuien={arrastrando.clienteNombre ?? arrastrando.clienteId}
                            ahora={ahora}
                            arrastrando
                        />
                    </div>
                )}
            </DragOverlay>
        </DndContext>
    );
}

function Columna({
    estado,
    tickets,
    deVerdad,
    moviendo,
    ahora,
    onAbrir,
}: {
    estado: EstadoDeTicket;
    tickets: TicketConAdjuntos[];
    deVerdad: number;
    moviendo: string | null;
    ahora: number;
    onAbrir: (ticket: TicketConAdjuntos) => void;
}) {
    const { setNodeRef, isOver } = useDroppable({ id: estado });
    const color = COLOR_DE_COLUMNA[estado];

    return (
        <div
            className="flex h-full w-[280px] shrink-0 flex-col overflow-hidden rounded-xl border-2 shadow-sm"
            style={{ borderColor: `${color}52`, backgroundColor: `${color}0A` }}
        >
            <div
                className="flex shrink-0 items-center justify-between gap-2 px-3 py-2"
                style={{ backgroundColor: color }}
            >
                <span className="truncate text-sm font-semibold uppercase text-white">
                    {ETIQUETAS_DE_ESTADO[estado]}
                </span>
                {/* El número es el `COUNT` del servidor, no el `length` de lo
                    que se pudo cargar: con el tope de la lista puesto, contar
                    las tarjetas diría de menos justo en la columna más llena. */}
                <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium tabular-nums text-white">
                    {deVerdad}
                </span>
            </div>

            <div
                ref={setNodeRef}
                className={cn(
                    "min-h-0 flex-1 space-y-2 overflow-y-auto p-2 transition-colors",
                    isOver && "bg-primary/5 ring-2 ring-inset ring-primary/30",
                )}
            >
                {tickets.map((t) => (
                    <TarjetaArrastrable
                        key={t.id}
                        ticket={t}
                        moviendo={moviendo === t.id}
                        ahora={ahora}
                        onAbrir={onAbrir}
                    />
                ))}

                {tickets.length === 0 && (
                    <div className="flex h-20 items-center justify-center text-xs text-muted-foreground/40">
                        Ninguno
                    </div>
                )}

                {/* Un número que promete más de lo que la columna enseña no
                    puede quedarse sin explicar: es lo que hizo que el filtro de
                    Chats ofreciera «574» y la lista tuviera 300 filas. */}
                {deVerdad > tickets.length && (
                    <p className="pt-1 text-center text-[11px] text-muted-foreground">
                        Se ven los {tickets.length} más recientes de {deVerdad}
                    </p>
                )}
            </div>
        </div>
    );
}

function TarjetaArrastrable({
    ticket,
    moviendo,
    ahora,
    onAbrir,
}: {
    ticket: TicketConAdjuntos;
    moviendo: boolean;
    ahora: number;
    onAbrir: (ticket: TicketConAdjuntos) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: ticket.id,
        data: { ticket },
    });

    const style = transform
        ? {
              transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
              zIndex: 50,
              position: "relative" as const,
          }
        : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className={cn("cursor-grab active:cursor-grabbing", moviendo && "opacity-60")}
        >
            <TarjetaDeTicket
                ticket={ticket}
                deQuien={ticket.clienteNombre ?? ticket.clienteId}
                ahora={ahora}
                arrastrando={isDragging}
                // El sensor exige 6 px, así que un clic limpio llega aquí y abre
                // el ticket; soltarlo después de arrastrar, no.
                onAbrir={() => {
                    if (!isDragging) onAbrir(ticket);
                }}
            />
        </div>
    );
}
