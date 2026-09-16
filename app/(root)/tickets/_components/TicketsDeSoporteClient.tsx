"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Inbox, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { TarjetaDeTicket } from "@/components/tickets/TarjetaDeTicket";
import {
    ESTADOS_DE_TICKET,
    ETIQUETAS_DE_ESTADO,
    exigeMotivo,
    TOPE_DEL_MOTIVO,
    type EstadoDeTicket,
} from "@/lib/tickets";
import {
    moverTicketAction,
    ticketsDeSoporteAction,
    type TicketConAdjuntos,
} from "@/actions/tickets-actions";

export function TicketsDeSoporteClient() {
    const [tickets, setTickets] = useState<TicketConAdjuntos[]>([]);
    const [porEstado, setPorEstado] = useState<Record<string, number>>({});
    const [filtro, setFiltro] = useState<EstadoDeTicket | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [moviendo, setMoviendo] = useState<string | null>(null);
    /** El ticket que se está descartando, mientras se escribe el motivo. */
    const [descartando, setDescartando] = useState<TicketConAdjuntos | null>(null);
    const [motivo, setMotivo] = useState("");

    const cargar = useCallback(async () => {
        setCargando(true);
        setError(null);
        try {
            const res = await ticketsDeSoporteAction(filtro);
            if (!res.success) {
                setError(res.message);
                setTickets([]);
            } else {
                setTickets(res.data?.tickets ?? []);
                setPorEstado(res.data?.porEstado ?? {});
            }
        } catch (e) {
            console.warn("[tickets] no se pudo cargar el tablero", e);
            setError("No se pudieron cargar los tickets.");
            setTickets([]);
        } finally {
            setCargando(false);
        }
    }, [filtro]);

    useEffect(() => {
        void cargar();
    }, [cargar]);

    const mover = async (
        ticket: TicketConAdjuntos,
        estado: EstadoDeTicket,
        motivoEscrito?: string,
    ) => {
        setMoviendo(ticket.id);
        try {
            const res = await moverTicketAction({ id: ticket.id, estado, motivo: motivoEscrito });
            if (!res.success) {
                toast.error(res.message);
                return false;
            }
            // El aviso se dice: así se distingue «resuelto y avisado» de
            // «resuelto y el WhatsApp no salió», que desde fuera son lo mismo.
            toast.success(
                res.data?.avisado ? "Resuelto. Ya le avisamos por WhatsApp." : res.message,
            );
            await cargar();
            return true;
        } catch (e) {
            console.warn("[tickets] no se pudo mover el ticket", e);
            toast.error("No se pudo cambiar el estado.");
            return false;
        } finally {
            setMoviendo(null);
        }
    };

    const total = Object.values(porEstado).reduce((n, v) => n + v, 0);

    return (
        <div className="flex h-full flex-col gap-4 overflow-y-auto py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                    <h1 className="text-lg font-semibold">Tickets de soporte</h1>
                    <p className="text-xs text-muted-foreground">
                        {cargando ? "Cargando…" : `${total} en total`}
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void cargar()}
                    disabled={cargando}
                    className="h-9 w-9 px-0"
                    title="Actualizar"
                >
                    <RefreshCw className={cn("h-4 w-4", cargando && "animate-spin")} />
                </Button>
            </div>

            {/* Los contadores salen de un `COUNT` del servidor, no del `length`
                de lo que se pudo cargar: con el filtro puesto, la lista trae
                solo un estado y contarla daría cero en los demás. */}
            <div className="flex flex-wrap gap-1.5">
                <Chip activo={filtro === null} onClick={() => setFiltro(null)} n={total}>
                    Todos
                </Chip>
                {ESTADOS_DE_TICKET.map((e) => (
                    <Chip
                        key={e}
                        activo={filtro === e}
                        onClick={() => setFiltro(e)}
                        n={porEstado[e] ?? 0}
                    >
                        {ETIQUETAS_DE_ESTADO[e]}
                    </Chip>
                ))}
            </div>

            {cargando ? (
                <div className="flex h-40 items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            ) : error ? (
                <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-center">
                    <p className="text-sm text-muted-foreground">{error}</p>
                    <Button variant="outline" size="sm" onClick={() => void cargar()}>
                        Reintentar
                    </Button>
                </div>
            ) : tickets.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 text-center">
                    <Inbox className="h-7 w-7 text-muted-foreground/40" />
                    <p className="text-sm font-medium">
                        {filtro ? "Ninguno en este estado" : "Sin tickets"}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {tickets.map((t) => (
                        <TarjetaDeTicket
                            key={t.id}
                            ticket={t}
                            deQuien={t.clienteNombre ?? t.clienteId}
                            acciones={
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {ESTADOS_DE_TICKET.map((e) => (
                                        <Button
                                            key={e}
                                            type="button"
                                            size="sm"
                                            variant={t.estado === e ? "default" : "outline"}
                                            disabled={moviendo === t.id || t.estado === e}
                                            className="h-8 px-2.5 text-xs"
                                            onClick={() => {
                                                // Descartar no se hace de un clic: pide el
                                                // motivo antes, porque el cliente lo va a leer.
                                                if (exigeMotivo(e)) {
                                                    setMotivo("");
                                                    setDescartando(t);
                                                    return;
                                                }
                                                void mover(t, e);
                                            }}
                                        >
                                            {moviendo === t.id && (
                                                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                            )}
                                            {ETIQUETAS_DE_ESTADO[e]}
                                        </Button>
                                    ))}
                                    {t.estado === "resuelto" && (
                                        <span className="text-xs text-muted-foreground">
                                            {t.avisadoEn ? "Avisado por WhatsApp" : "Sin avisar"}
                                        </span>
                                    )}
                                </div>
                            }
                        />
                    ))}
                </div>
            )}

            <Dialog
                open={!!descartando}
                onOpenChange={(v) => {
                    if (!v) setDescartando(null);
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Descartar el ticket</DialogTitle>
                        <DialogDescription>
                            Escribe por qué: el cliente lo va a leer en «Mis tickets».
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-1.5">
                        <Label htmlFor="motivo-descarte">Motivo</Label>
                        <Textarea
                            id="motivo-descarte"
                            value={motivo}
                            maxLength={TOPE_DEL_MOTIVO}
                            onChange={(e) => setMotivo(e.target.value)}
                            rows={4}
                            placeholder="Ej.: ya está resuelto en otro ticket; o no depende de la plataforma."
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setDescartando(null)}>
                            Cancelar
                        </Button>
                        <Button
                            disabled={!motivo.trim() || moviendo === descartando?.id}
                            onClick={async () => {
                                if (!descartando) return;
                                const ok = await mover(descartando, "descartado", motivo.trim());
                                if (ok) setDescartando(null);
                            }}
                        >
                            {moviendo === descartando?.id && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Descartar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function Chip({
    activo,
    onClick,
    n,
    children,
}: {
    activo: boolean;
    onClick: () => void;
    n: number;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                activo
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "hover:bg-accent",
            )}
        >
            {children}
            <span className="tabular-nums text-muted-foreground">{n}</span>
        </button>
    );
}
