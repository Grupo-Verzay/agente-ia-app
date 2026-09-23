"use client";

import { useCallback, useState } from "react";
import {
    AlertTriangle,
    Download,
    FileText,
    Loader2,
    Maximize2,
    Mic,
    Sparkles,
    VideoOff,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
    transcribirLaReunionAction,
    type GrabacionEnLaFicha,
} from "@/actions/salas-de-video-actions";
import { AVISAR_A_LOS_DIAS, DIAS_DE_GRABACION } from "@/lib/grabacion-de-reunion";
import type { ConSuReunion } from "@/lib/grabaciones-de-la-pantalla";
import { InsigniaDeCuenta } from "./InsigniaDeCuenta";

export type GrabacionDeLaLista = ConSuReunion<GrabacionEnLaFicha>;

/**
 * La pestaña «Grabaciones» de Reuniones: una fila por grabación.
 *
 * # La miniatura es pequeña y se AMPLÍA, no al revés
 *
 * Antes cada grabación iba dentro de la fila de su reunión con un
 * `<video className="w-full">`: dentro de una fila `flex` eso es todo el ancho
 * que sobra, y una sola grabación empujaba el resto de reuniones fuera de la
 * vista. Ahora la fila lleva una miniatura de tamaño fijo (`MINIATURA`) y un
 * botón de ampliar; al pulsarlo el video se abre grande en un diálogo, y al
 * cerrarlo vuelve a su miniatura.
 *
 * Dos cosas que hay que mantener:
 *
 * 1. **`preload="metadata"`, nunca `auto`**: una pestaña con veinte grabaciones
 *    se bajaría veinte ficheros al abrirla. La miniatura pide el fotograma de
 *    `#t=0.1` —sin él muchos navegadores enseñan un recuadro negro— y nada más.
 * 2. **El video grande vive DENTRO del diálogo**, que se desmonta al cerrarse:
 *    cerrar para la reproducción. Un video que sigue sonando con el diálogo
 *    cerrado se lee como que la App se quedó colgada.
 */
export const MINIATURA = "h-16 w-28 sm:h-[4.5rem] sm:w-32";

export function ListaDeGrabaciones({
    grabaciones,
    variasCuentas,
    alTranscribir,
}: {
    grabaciones: GrabacionDeLaLista[];
    variasCuentas: boolean;
    /** Para que la lista se entere sin volver a pedirlo todo. */
    alTranscribir: (id: string, texto: string, resumen: string | null) => void;
}) {
    const [ampliada, setAmpliada] = useState<GrabacionDeLaLista | null>(null);

    if (!grabaciones.length) {
        return (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                Todavía no hay grabaciones.
            </p>
        );
    }

    const url = ampliada ? (ampliada.videoUrl ?? ampliada.audioUrl) : null;

    return (
        <>
            {grabaciones.map((g) => (
                <FilaDeGrabacion
                    key={g.id}
                    g={g}
                    variasCuentas={variasCuentas}
                    alTranscribir={alTranscribir}
                    alAmpliar={() => setAmpliada(g)}
                />
            ))}

            <Dialog open={Boolean(ampliada)} onOpenChange={(abierto) => !abierto && setAmpliada(null)}>
                <DialogContent className="sm:max-w-4xl" data-grabacion-ampliada="">
                    <DialogTitle className="truncate pr-8 text-base">
                        {ampliada?.reunionTitulo ?? "Grabación"}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        {ampliada
                            ? `${cuandoFue(ampliada.creadaEn)} · ${ampliada.duracion} · la grabó ${ampliada.pedidaPor}`
                            : null}
                    </DialogDescription>
                    {ampliada?.videoUrl ? (
                        <video
                            src={ampliada.videoUrl}
                            controls
                            autoPlay
                            playsInline
                            preload="metadata"
                            className="max-h-[70dvh] w-full rounded bg-black"
                        />
                    ) : url ? (
                        <audio src={url} controls autoPlay preload="metadata" className="w-full" />
                    ) : null}
                </DialogContent>
            </Dialog>
        </>
    );
}

function FilaDeGrabacion({
    g,
    variasCuentas,
    alTranscribir,
    alAmpliar,
}: {
    g: GrabacionDeLaLista;
    variasCuentas: boolean;
    alTranscribir: (id: string, texto: string, resumen: string | null) => void;
    alAmpliar: () => void;
}) {
    const [pidiendo, setPidiendo] = useState(false);
    const [abierto, setAbierto] = useState(false);

    const transcribir = useCallback(async () => {
        if (pidiendo) return;
        setPidiendo(true);
        try {
            const res = await transcribirLaReunionAction({ grabacionId: g.id });
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            alTranscribir(g.id, res.transcripcion, res.resumen);
            setAbierto(true);
            if (!res.yaEstaba) toast.success("Reunión transcrita.");
        } catch (error) {
            console.warn("[reuniones] no se pudo transcribir", error);
            toast.error("No se pudo transcribir. Inténtalo otra vez.");
        } finally {
            setPidiendo(false);
        }
    }, [alTranscribir, g.id, pidiendo]);

    const caducada = g.estado === "caducada" || (!g.audioUrl && !g.videoUrl);
    const lista = g.estado !== "grabando" && g.estado !== "fallida" && !caducada;

    return (
        <div
            data-grabacion={g.id}
            className="rounded-md border border-border px-3 py-2"
        >
            <div className="flex items-center gap-3">
                <Miniatura g={g} lista={lista} caducada={caducada} alAmpliar={alAmpliar} />

                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-medium">{g.reunionTitulo}</p>
                        <InsigniaDeCuenta nombre={g.cuentaNombre} variasCuentas={variasCuentas} />
                    </div>
                    <p className="truncate text-xs text-muted-foreground" data-datos-de-la-grabacion="">
                        <span className="tabular-nums">{cuandoFue(g.creadaEn)}</span>
                        {" · "}
                        <span className="font-medium tabular-nums text-foreground">{g.duracion}</span>
                        {lista ? ` · ${g.pesa}` : ""}
                        {` · la grabó ${g.pedidaPor}`}
                    </p>

                    {g.estado === "grabando" ? (
                        <p className="mt-1 text-xs text-red-400">Grabando ahora mismo…</p>
                    ) : g.estado === "fallida" ? (
                        // Se dice. Una grabación que se pulsó y no aparece por
                        // ningún lado se lee como que el botón no hizo nada.
                        <p className="mt-1 text-xs text-muted-foreground">
                            Esta grabación no se pudo guardar.
                        </p>
                    ) : caducada ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                            El archivo se borró a los {DIAS_DE_GRABACION} días.
                            {g.transcripcion ? " Su transcripción se conserva." : ""}
                        </p>
                    ) : null}

                    {g.estado !== "grabando" && g.estado !== "fallida" ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {lista ? (
                                <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                                    <a href={g.videoUrl ?? g.audioUrl ?? "#"} download>
                                        <Download className="mr-1.5 h-3 w-3" />
                                        Descargar
                                    </a>
                                </Button>
                            ) : null}

                            {g.transcripcion ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => setAbierto((a) => !a)}
                                >
                                    <FileText className="mr-1.5 h-3 w-3" />
                                    {abierto ? "Ocultar el texto" : "Ver el texto"}
                                </Button>
                            ) : !lista ? null : g.porQueNo ? (
                                // Un botón que al pulsarlo da error es peor que
                                // no tenerlo: se dice por qué y no se ofrece.
                                <span className="text-xs text-muted-foreground">{g.porQueNo}</span>
                            ) : (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => void transcribir()}
                                    disabled={pidiendo}
                                >
                                    {pidiendo ? (
                                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                                    ) : (
                                        <Sparkles className="mr-1.5 h-3 w-3" />
                                    )}
                                    {/* El precio SIEMPRE delante: la duración es
                                        el precio, y un botón que gasta créditos
                                        sin decir cuántos es un cheque en blanco. */}
                                    Transcribir
                                    <span className="ml-1 text-muted-foreground">
                                        ({g.creditos} {g.creditos === 1 ? "crédito" : "créditos"})
                                    </span>
                                </Button>
                            )}

                            {/* Se avisa cuando le quedan pocos días, no cuando ya
                                se fue: enterarse el día 181 no sirve de nada. */}
                            {lista && g.diasQueLeQuedan <= DIAS_DE_GRABACION - AVISAR_A_LOS_DIAS ? (
                                <span className="text-xs text-amber-500">
                                    se borra en {g.diasQueLeQuedan} d
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </div>

            {abierto && g.transcripcion ? (
                <div className="mt-2 flex flex-col gap-2 rounded bg-muted/40 p-2">
                    {/* El resumen ARRIBA: de una reunión de una hora se vuelve a
                        buscar «qué se dijo», y eso está en los puntos. */}
                    {g.resumen ? (
                        <div>
                            <p className="mb-1 text-xs font-medium">Puntos tratados</p>
                            <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                                {g.resumen}
                            </p>
                        </div>
                    ) : (
                        <p className="text-xs text-amber-500">
                            El resumen no se pudo generar, pero la transcripción sí.
                        </p>
                    )}
                    <div>
                        <p className="mb-1 text-xs font-medium">Transcripción</p>
                        <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">
                            {g.transcripcion}
                        </p>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

/**
 * La miniatura: tamaño FIJO, y un botón de ampliar encima.
 *
 * Lo que no se puede reproducir —grabando, fallida, borrada— ocupa el mismo
 * hueco con su icono: así todas las filas empiezan en el mismo píxel y la lista
 * no baila según el estado de cada una.
 */
function Miniatura({
    g,
    lista,
    caducada,
    alAmpliar,
}: {
    g: GrabacionDeLaLista;
    lista: boolean;
    caducada: boolean;
    alAmpliar: () => void;
}) {
    const caja = `relative ${MINIATURA} shrink-0 overflow-hidden rounded bg-muted`;
    if (!lista) {
        return (
            <div className={`${caja} flex items-center justify-center`} data-miniatura="">
                {g.estado === "grabando" ? (
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                    </span>
                ) : g.estado === "fallida" ? (
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                ) : caducada ? (
                    <VideoOff className="h-4 w-4 text-muted-foreground" />
                ) : null}
            </div>
        );
    }
    return (
        <button
            type="button"
            onClick={alAmpliar}
            className={`${caja} group`}
            title="Ampliar la grabación"
            aria-label="Ampliar la grabación"
            data-miniatura=""
        >
            {g.videoUrl ? (
                <video
                    src={`${g.videoUrl}#t=0.1`}
                    preload="metadata"
                    muted
                    playsInline
                    className="pointer-events-none h-full w-full bg-black object-cover"
                />
            ) : (
                <span className="flex h-full w-full items-center justify-center">
                    <Mic className="h-5 w-5 text-muted-foreground" />
                </span>
            )}
            <span className="absolute bottom-1 right-1 rounded bg-black/60 p-1 text-white transition-colors group-hover:bg-black/80">
                <Maximize2 className="h-3 w-3" />
            </span>
        </button>
    );
}

/** La fecha de una grabación, corta y con su hora. */
function cuandoFue(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("es", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}
