"use client";

import { useCallback, useState } from "react";
import { Download, FileText, Loader2, Mic, Sparkles, Video } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    transcribirLaReunionAction,
    type GrabacionEnLaFicha,
} from "@/actions/salas-de-video-actions";
import { AVISAR_A_LOS_DIAS, DIAS_DE_GRABACION } from "@/lib/grabacion-de-reunion";

/**
 * Lo grabado de una reunión, dentro de su ficha.
 *
 * # Por qué vive en la ficha y no en una pantalla propia
 *
 * Porque una grabación **es de una reunión**: separada, habría que cruzar dos
 * listas a ojo para saber de qué reunión era cada fichero. Aquí sale debajo de
 * la fila de su reunión, con su título, su fecha y quién entró al lado.
 *
 * El módulo que se vende aparte es la llave —`/reuniones/grabaciones` en Panel ›
 * Módulos— y no una pantalla: sin él este bloque no se pinta y Reuniones sigue
 * funcionando igual, que es lo que quiere decir «Reuniones no cuesta aparte».
 */
export function GrabacionesDeLaReunion({
    grabaciones,
    alTranscribir,
}: {
    grabaciones: GrabacionEnLaFicha[];
    /** Para que la lista de arriba se entere sin volver a pedirlo todo. */
    alTranscribir: (id: string, texto: string, resumen: string | null) => void;
}) {
    if (!grabaciones.length) return null;
    return (
        <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
            {grabaciones.map((g) => (
                <UnaGrabacion key={g.id} g={g} alTranscribir={alTranscribir} />
            ))}
        </div>
    );
}

function UnaGrabacion({
    g,
    alTranscribir,
}: {
    g: GrabacionEnLaFicha;
    alTranscribir: (id: string, texto: string, resumen: string | null) => void;
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

    if (g.estado === "fallida") {
        // Se dice. Una grabación que se pulsó y no aparece por ningún lado se
        // lee como que el botón no hizo nada.
        return (
            <p className="text-xs text-muted-foreground">
                Una grabación de esta reunión no se pudo guardar.
            </p>
        );
    }

    if (g.estado === "grabando") {
        return (
            <p className="flex items-center gap-1.5 text-xs text-red-400">
                <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
                Grabando ahora mismo…
            </p>
        );
    }

    const caducada = g.estado === "caducada" || (!g.audioUrl && !g.videoUrl);

    return (
        <div className="rounded-md bg-muted/40 px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {g.modo === "video" ? (
                    <Video className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                    <Mic className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="text-xs font-medium tabular-nums">{g.duracion}</span>
                {!caducada ? (
                    <span className="text-xs text-muted-foreground">{g.pesa}</span>
                ) : null}
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    la grabó {g.pedidaPor}
                </span>

                {/* Se avisa cuando le quedan pocos días, no cuando ya se fue:
                    enterarse de que una grabación se borró a los 180 días el
                    día 181 no sirve para nada. */}
                {!caducada && g.diasQueLeQuedan <= DIAS_DE_GRABACION - AVISAR_A_LOS_DIAS ? (
                    <span className="text-xs text-amber-500">
                        se borra en {g.diasQueLeQuedan} d
                    </span>
                ) : null}
            </div>

            {caducada ? (
                <p className="mt-1 text-xs text-muted-foreground">
                    El archivo se borró a los {DIAS_DE_GRABACION} días.
                    {g.transcripcion ? " Su transcripción se conserva." : ""}
                </p>
            ) : (
                <div className="mt-1.5 flex flex-col gap-1.5">
                    {/* `preload="metadata"`, nunca `auto`: una ficha con diez
                        reuniones grabadas se descargaría diez ficheros al
                        abrirla. Es la misma regla que el video del chat. */}
                    {g.videoUrl ? (
                        <video
                            src={g.videoUrl}
                            controls
                            preload="metadata"
                            className="w-full rounded bg-black"
                        />
                    ) : g.audioUrl ? (
                        <audio src={g.audioUrl} controls preload="metadata" className="w-full" />
                    ) : null}

                    <div className="flex flex-wrap items-center gap-1.5">
                        <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                            <a href={g.videoUrl ?? g.audioUrl ?? "#"} download>
                                <Download className="mr-1.5 h-3 w-3" />
                                Descargar
                            </a>
                        </Button>

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
                        ) : g.porQueNo ? (
                            // Un botón que al pulsarlo da error es peor que no
                            // tenerlo: se dice por qué y no se ofrece.
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
                                {/* El precio SIEMPRE delante. La duración es el
                                    precio, y un botón que gasta créditos sin
                                    decir cuántos es un cheque en blanco. */}
                                Transcribir
                                <span className="ml-1 text-muted-foreground">
                                    ({g.creditos} {g.creditos === 1 ? "crédito" : "créditos"})
                                </span>
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {abierto && g.transcripcion ? (
                <div className="mt-2 flex flex-col gap-2 rounded bg-background/60 p-2">
                    {/* El resumen ARRIBA y el texto debajo: de una reunión de
                        una hora se vuelve a buscar «qué se dijo», y eso está en
                        los puntos, no en la primera línea de la transcripción. */}
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
