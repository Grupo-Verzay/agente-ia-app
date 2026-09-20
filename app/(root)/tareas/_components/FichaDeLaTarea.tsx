"use client";

import { useRouter } from "next/navigation";
import { CalendarClock, ClipboardList, MessageSquare, Phone, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DocumentosQueLoNombran } from "@/components/shared/DocumentosQueLoNombran";
import { tituloDeLaTarjeta } from "@/lib/titulo-de-la-tarea";
import { isTaskOpen, type TaskData } from "@/lib/task-types";

/**
 * La ficha de una tarea de `/tareas`.
 *
 * Existe porque **no había ninguna**: la pantalla enseñaba tarjetas con
 * botones de completar, cancelar y borrar, y el texto largo de una tarea vieja
 * —el que vive dentro de `title`— no se podía leer entero por ningún lado. Y
 * sin ficha, una mención de Documentación no tenía dónde aterrizar: la pastilla
 * llevaba a la lista y ahí se acababa.
 *
 * Por eso lleva dentro **los retroenlaces**: desde una tarea se ven los
 * documentos que la nombran. Hasta ahora eso solo existía en el tablero de
 * Proyectos, así que una tarea suelta —la mayoría de las de esta pantalla— no
 * podía enseñar los suyos.
 *
 * Y **se llega pulsando el título**, no solo por la URL. Una pantalla a la que
 * únicamente se entra con un enlace pegado a mano es media función: quien no
 * venga de un documento no sabría que existe.
 */

function comoFecha(iso: string) {
    const d = new Date(iso);
    return (
        d.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }) +
        " " +
        d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: true })
    );
}

const COMO_SE_LLAMA_EL_ESTADO: Record<string, string> = {
    pending: "Pendiente",
    in_progress: "En curso",
    in_review: "En revisión",
    done: "Completada",
    cancelled: "Cancelada",
};

export function FichaDeLaTarea({
    tarea,
    alCerrar,
}: {
    tarea: TaskData | null;
    alCerrar: () => void;
}) {
    const router = useRouter();
    if (!tarea) return null;

    const vencida = isTaskOpen(tarea.status) && new Date(tarea.dueDate) < new Date();

    // El título corto es la primera línea. En una tarea de antes de que el
    // detalle se mudara a `task_details`, el resto del ladrillo sigue dentro de
    // `title` — y esta ficha es justo donde se lee entero, así que lo de abajo
    // se pinta con el título COMPLETO y no con el recortado.
    const corto = tituloDeLaTarjeta(tarea.title);
    const restoDelTitulo = tarea.title.slice(corto.length).trim();
    const cuerpo = [restoDelTitulo, (tarea.detalle ?? "").trim()].filter(Boolean).join("\n\n");

    return (
        <Dialog open onOpenChange={(v) => !v && alCerrar()}>
            <DialogContent className="overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="pr-6 text-left leading-snug">{corto}</DialogTitle>
                </DialogHeader>

                {cuerpo && (
                    <p className="whitespace-pre-wrap rounded border bg-muted/30 p-3 text-sm">
                        {cuerpo}
                    </p>
                )}

                <dl className="flex flex-col gap-2 text-sm">
                    <div className="flex items-center gap-2">
                        <ClipboardList className="size-4 shrink-0 text-muted-foreground" />
                        <dt className="sr-only">Tipo</dt>
                        <dd>
                            {tarea.type}
                            <span className="ml-2 text-muted-foreground">
                                · {COMO_SE_LLAMA_EL_ESTADO[tarea.status] ?? tarea.status}
                            </span>
                        </dd>
                    </div>

                    <div className="flex items-center gap-2">
                        <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
                        <dt className="sr-only">Vence</dt>
                        <dd className={cn(vencida && "font-medium text-red-600")}>
                            {comoFecha(tarea.dueDate)}
                            {vencida && " · vencida"}
                        </dd>
                    </div>

                    <div className="flex items-center gap-2">
                        <User className="size-4 shrink-0 text-muted-foreground" />
                        <dt className="sr-only">Asignada a</dt>
                        <dd>{tarea.assignedToName ?? tarea.assignedToId}</dd>
                    </div>

                    {tarea.contactName && (
                        <div className="flex items-center gap-2">
                            <Phone className="size-4 shrink-0 text-muted-foreground" />
                            <dt className="sr-only">Contacto</dt>
                            <dd>
                                {tarea.contactJid ? (
                                    <button
                                        type="button"
                                        className="text-blue-600 hover:underline"
                                        onClick={() =>
                                            router.push(
                                                `/chats?jid=${encodeURIComponent(tarea.contactJid!)}`,
                                            )
                                        }
                                    >
                                        {tarea.contactName}
                                    </button>
                                ) : (
                                    tarea.contactName
                                )}
                            </dd>
                        </div>
                    )}

                    {tarea.result && (
                        <div className="flex items-start gap-2">
                            <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            <dt className="sr-only">Resultado</dt>
                            <dd className="whitespace-pre-wrap text-muted-foreground">
                                {tarea.result}
                            </dd>
                        </div>
                    )}
                </dl>

                <DocumentosQueLoNombran tipo="tarea" refId={String(tarea.id)} />

                <DialogFooter>
                    <Button variant="outline" onClick={alCerrar}>
                        Cerrar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
