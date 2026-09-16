"use client";

import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FormularioDeTicket } from "@/components/tickets/FormularioDeTicket";
import { TarjetaDeTicket } from "@/components/tickets/TarjetaDeTicket";
import { misTicketsAction, type TicketConAdjuntos } from "@/actions/tickets-actions";

export function MisTicketsClient({
    userId,
    whatsappPorDefecto,
    puedeAbrir,
    hayDestino,
}: {
    userId: string;
    whatsappPorDefecto: string | null;
    puedeAbrir: boolean;
    hayDestino: boolean;
}) {
    const [tickets, setTickets] = useState<TicketConAdjuntos[]>([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [abierto, setAbierto] = useState(false);

    const cargar = useCallback(async () => {
        setCargando(true);
        setError(null);
        try {
            const res = await misTicketsAction();
            if (!res.success) {
                setError(res.message);
                setTickets([]);
            } else {
                setTickets(res.data ?? []);
            }
        } catch (e) {
            // Sin esto el «Cargando…» se queda puesto para siempre.
            console.warn("[tickets] no se pudieron cargar los mios", e);
            setError("No se pudieron cargar tus tickets.");
            setTickets([]);
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        void cargar();
    }, [cargar]);

    return (
        <div className="flex h-full flex-col gap-4 overflow-y-auto py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                    <h1 className="text-lg font-semibold">Mis tickets</h1>
                    <p className="text-xs text-muted-foreground">
                        {cargando
                            ? "Cargando…"
                            : tickets.length === 0
                              ? "Todavía no has pedido soporte"
                              : `${tickets.length} ${tickets.length === 1 ? "solicitud" : "solicitudes"}`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
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
                    {puedeAbrir && (
                        <Button size="sm" onClick={() => setAbierto(true)} className="h-9 gap-1.5">
                            <Plus className="h-4 w-4" /> Nuevo ticket
                        </Button>
                    )}
                </div>
            </div>

            {!hayDestino && (
                <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                    El soporte por tickets todavía no está configurado en tu plataforma.
                </p>
            )}

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
                    <LifeBuoy className="h-7 w-7 text-muted-foreground/40" />
                    <div>
                        <p className="text-sm font-medium">Sin solicitudes</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Si algo no te funciona, cuéntanoslo y lo revisamos.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="space-y-2">
                    {tickets.map((t) => (
                        <TarjetaDeTicket key={t.id} ticket={t} />
                    ))}
                </div>
            )}

            <FormularioDeTicket
                abierto={abierto}
                onAbierto={setAbierto}
                userId={userId}
                whatsappPorDefecto={whatsappPorDefecto}
                onCreado={() => void cargar()}
            />
        </div>
    );
}
