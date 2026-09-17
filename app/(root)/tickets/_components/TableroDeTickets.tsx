"use client";

import { useEffect, useMemo, useState } from "react";
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    PointerSensor,
    closestCenter,
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
    exigeMotivo,
    type EstadoDeTicket,
} from "@/lib/tickets";
import {
    ColumnaOrdenable,
    TarjetaDelTablero,
    useOrdenDeColumna,
} from "@/components/shared/OrdenDeColumna";
import { ordenarLaColumna, resolverElArrastre } from "@/lib/orden-del-tablero";
import type { TicketConAdjuntos } from "@/actions/tickets-actions";

/**
 * El tablero: una columna por estado, arrastrar entre columnas para cambiarlo y
 * arrastrar dentro de una para reordenarla.
 *
 * Es el mismo patrón del tablero de Proyectos —dnd-kit, `useSortable` por
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
 * Quién decide qué pasa al CAMBIAR de columna es el padre, no esto. El orden
 * dentro de una columna sí se resuelve aquí, con las mismas piezas que
 * Proyectos: `resolverElArrastre` y `useOrdenDeColumna`.
 */
export function TableroDeTickets({
    tickets,
    porEstado,
    destino,
    cargadoEn,
    moviendo,
    ahora,
    onSoltar,
    onAbrir,
}: {
    tickets: TicketConAdjuntos[];
    /** Cuántos hay de verdad en cada estado, del `COUNT` del servidor. */
    porEstado: Record<string, number>;
    /** La cuenta que los recibe: ES el tablero cuyo orden se guarda. */
    destino: string;
    /** Sube con cada carga del servidor. Ver `useEffect` de abajo. */
    cargadoEn: number;
    moviendo: string | null;
    ahora: number;
    onSoltar: (ticket: TicketConAdjuntos, estado: EstadoDeTicket) => void;
    onAbrir: (ticket: TicketConAdjuntos) => void;
}) {
    const [arrastrando, setArrastrando] = useState<TicketConAdjuntos | null>(null);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

    // Quien llega a este tablero ya pasó la puerta de la cuenta que los recibe:
    // un `agente` no ve ninguno. La de verdad está en la acción, como siempre.
    const orden = useOrdenDeColumna("tickets", destino, Boolean(destino));

    // Una carga del servidor trae las posiciones dentro de cada ticket, así que
    // lo que se movió en pantalla sobra: dejarlo encima taparía para siempre lo
    // que reordenó otra persona.
    const { olvidarLoDeEncima } = orden;
    useEffect(() => {
        olvidarLoDeEncima();
    }, [cargadoEn, destino, olvidarLoDeEncima]);

    const porColumna = useMemo(() => {
        const mapa: Record<EstadoDeTicket, TicketConAdjuntos[]> = {
            recibido: [],
            en_proceso: [],
            en_revision: [],
            resuelto: [],
            descartado: [],
        };
        for (const t of tickets) mapa[t.estado].push(t);
        // Cada columna se coloca por separado: el número solo se compara con el
        // de las tarjetas de su misma columna.
        for (const estado of ESTADOS_DE_TICKET) {
            mapa[estado] = ordenarLaColumna(
                mapa[estado],
                Object.fromEntries(
                    mapa[estado]
                        .map((t) => [t.id, orden.posicionDe(t.id, t.posicion)] as const)
                        .filter(([, p]) => p !== null) as Array<[string, number]>,
                ),
                (t) => t.id,
            );
        }
        return mapa;
    }, [tickets, orden]);

    const idsPorColumna = useMemo(() => {
        const mapa: Record<string, string[]> = {};
        for (const estado of ESTADOS_DE_TICKET) mapa[estado] = porColumna[estado].map((t) => t.id);
        return mapa;
    }, [porColumna]);

    return (
        <DndContext
            sensors={sensors}
            // Con tarjetas que también son destino, el rectángulo más cercano
            // es lo que decide entre qué dos se soltó. Sin esto, dnd-kit se
            // queda con la columna y el reorden no llega a calcularse nunca.
            collisionDetection={closestCenter}
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
                if (!ticket) return;

                // Qué significa haberla soltado lo decide una función pura, la
                // misma que usa el tablero de Proyectos: o nada, o cambio de
                // columna, o reordenar dentro de la suya.
                const que = resolverElArrastre({
                    arrastrada: ticket.id,
                    soltadaSobre: String(over.id),
                    columnaDeLaArrastrada: ticket.estado,
                    columnas: ESTADOS_DE_TICKET,
                    idsPorColumna,
                });

                if (que.que === "reordenar") {
                    void orden.reordenar(que.ids);
                    return;
                }
                if (que.que !== "otra-columna") return;

                // Lo que llega del arrastre pasa por la lista, igual que lo que
                // llega del navegador en la acción: `over.id` es una cadena
                // cualquiera hasta que alguien lo comprueba.
                const estado = comoEstadoDeTicket(que.columna);
                if (!estado || ticket.estado === estado) return;

                // Entra al final de la columna nueva, igual que hace el
                // servidor. Sin esto se quedaría con el número de su columna
                // anterior y aparecería en mitad de la nueva.
                //
                // Salvo cuando va a pedir un motivo: ahí la tarjeta **no se
                // mueve todavía** —el padre abre el diálogo primero— y darle ya
                // el sitio de la otra columna la haría saltar al fondo de la
                // suya si se cancela. Es la misma razón por la que tampoco se
                // repinta el estado.
                if (!exigeMotivo(estado)) {
                    orden.ponerAlFinal(
                        ticket.id,
                        (porColumna[estado] ?? []).map((t) => orden.posicionDe(t.id, t.posicion)),
                    );
                }
                onSoltar(ticket, estado);
            }}
        >
            <div className="min-h-0 flex-1 overflow-x-auto pb-2">
                <div className="flex h-full gap-3" style={{ width: "max-content", minWidth: "100%" }}>
                    {ESTADOS_DE_TICKET.map((estado) => (
                        <Columna
                            key={estado}
                            estado={estado}
                            tickets={porColumna[estado]}
                            ids={idsPorColumna[estado]}
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
    ids,
    deVerdad,
    moviendo,
    ahora,
    onAbrir,
}: {
    estado: EstadoDeTicket;
    tickets: TicketConAdjuntos[];
    /** Los mismos tickets, solo sus ids: es lo que `SortableContext` necesita. */
    ids: string[];
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
                <ColumnaOrdenable ids={ids}>
                    {tickets.map((t) => (
                        <TarjetaArrastrable
                            key={t.id}
                            ticket={t}
                            moviendo={moviendo === t.id}
                            ahora={ahora}
                            onAbrir={onAbrir}
                        />
                    ))}
                </ColumnaOrdenable>

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
    return (
        <TarjetaDelTablero
            id={ticket.id}
            puedeArrastrar
            className={cn("cursor-grab active:cursor-grabbing", moviendo && "opacity-60")}
        >
            {(arrastrando) => (
                <TarjetaDeTicket
                    ticket={ticket}
                    deQuien={ticket.clienteNombre ?? ticket.clienteId}
                    ahora={ahora}
                    arrastrando={arrastrando}
                    // Se queda en la tarjeta y no en el envoltorio: es lo que le
                    // da el cursor y el resaltado al pasar por encima. El sensor
                    // exige 6 px, así que un clic limpio llega aquí y abre el
                    // ticket; soltarlo después de arrastrar, no.
                    onAbrir={() => {
                        if (!arrastrando) onAbrir(ticket);
                    }}
                />
            )}
        </TarjetaDelTablero>
    );
}
