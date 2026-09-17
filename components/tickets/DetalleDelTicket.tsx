"use client";

import {
    FileAudio,
    FileText,
    Image as ImageIcon,
    Phone,
    Video,
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { SelloDeEstado } from "@/components/tickets/TarjetaDeTicket";
import { laEspera } from "@/lib/tickets";
import type { TipoDeAdjunto } from "@/lib/adjuntos-de-tarea-tipos";
import type { TicketConAdjuntos } from "@/actions/tickets-actions";

const ICONOS: Record<TipoDeAdjunto, typeof FileText> = {
    image: ImageIcon,
    video: Video,
    audio: FileAudio,
    document: FileText,
};

/**
 * El ticket entero: lo que la tarjeta no enseña.
 *
 * Existe porque la tarjeta es compacta a propósito (ver `TarjetaDeTicket`), y
 * algo tiene que enseñar la descripción. **Es el mismo diálogo en las tres
 * vistas** —tablero, lista y «Mis tickets»—: si fueran dos, el día que el motivo
 * del descarte cambie de sitio el cliente dejaría de verlo sin que nadie se
 * entere. Es la razón por la que la tarjeta ya era una sola.
 *
 * Aquí el texto **no se recorta**: se ha abierto justamente para leerlo. Lo que
 * se acota es el alto del diálogo, que se desplaza.
 *
 * `acciones` es lo que se puede hacer con él y solo lo pasa el administrador; el
 * cliente abre el mismo diálogo sin nada que pulsar.
 */
export function DetalleDelTicket({
    ticket,
    deQuien,
    acciones,
    onCerrar,
    ahora,
}: {
    ticket: TicketConAdjuntos | null;
    deQuien?: string | null;
    acciones?: React.ReactNode;
    onCerrar: () => void;
    ahora: number;
}) {
    return (
        <Dialog
            open={!!ticket}
            onOpenChange={(v) => {
                if (!v) onCerrar();
            }}
        >
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                {ticket && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="pr-6 text-base leading-snug">
                                {ticket.titulo}
                            </DialogTitle>
                        </DialogHeader>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <SelloDeEstado estado={ticket.estado} />
                            {deQuien && <span className="font-medium text-foreground/70">{deQuien}</span>}
                            <span>{laEspera(ticket, ahora)}</span>
                            {/* El número solo se enseña donde hay algo que hacer
                                con él: es a donde sale el aviso de resuelto, y
                                en «Mis tickets» es el suyo propio. */}
                            {deQuien && ticket.whatsapp && (
                                <span className="inline-flex items-center gap-1">
                                    <Phone className="h-3 w-3" />
                                    {ticket.whatsapp}
                                </span>
                            )}
                        </div>

                        {/* Sin recortar: se abre para leerlo entero. */}
                        <p className="whitespace-pre-wrap break-words text-sm">{ticket.descripcion}</p>

                        {ticket.estado === "descartado" && ticket.motivoDescarte && (
                            <p className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-sm">
                                <span className="font-medium">Por qué se descartó: </span>
                                <span className="text-muted-foreground">{ticket.motivoDescarte}</span>
                            </p>
                        )}

                        {ticket.estado === "resuelto" && (
                            <p className="text-xs text-muted-foreground">
                                {ticket.avisadoEn
                                    ? "Se le avisó al cliente por WhatsApp."
                                    : "Resuelto, pero el aviso por WhatsApp no salió."}
                            </p>
                        )}

                        {ticket.adjuntos.length > 0 && (
                            <ul className="flex flex-wrap gap-1.5">
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

                        {acciones && <div className="border-t pt-3">{acciones}</div>}
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
