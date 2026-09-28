"use client";

/**
 * Grabar una nota de voz AHÍ MISMO, al lado del botón de subir un archivo.
 *
 * Lo pintan Macros, los dos editores de flujos, Recordatorios, Multiagenda y
 * la biblioteca de Seguimientos del CRM, y **ninguno sabe grabar**: el
 * micrófono es `useAudioRecording` (el mismo de Chats y del chat del equipo) y
 * los mandos salen de `lib/grabador-de-audio.ts`. Lo único que recibe cada
 * pantalla es un `File`, por `onGrabado`, y lo mete por el MISMO camino que
 * un archivo elegido del dispositivo: así subir y grabar no pueden acabar
 * guardándose de dos formas.
 *
 * Grabar no sustituye a subir: el botón de elegir archivo se queda donde
 * estaba.
 */

import { useMemo } from "react";
import { Check, Mic, Pause, Play, RotateCcw, Square, Trash2 } from "lucide-react";

import { useAudioRecording } from "@/hooks/useAudioRecording";
import { comoArchivoDeAudio } from "@/lib/audio-del-navegador";
import {
    comoSeLeeElTiempo,
    elEstadoDelGrabador,
    losMandosDelGrabador,
    type MandoDelGrabador,
} from "@/lib/grabador-de-audio";
import { cn } from "@/lib/utils";

type Props = {
    /** Recibe la grabación ya convertida en archivo, lista para subir. */
    onGrabado: (archivo: File) => void | Promise<void>;
    disabled?: boolean;
    className?: string;
};

const BOTON =
    "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";

const ESTILO: Record<MandoDelGrabador, { rotulo: string; clase: string; Icono: typeof Mic }> = {
    grabar: { rotulo: "Grabar audio", clase: "border-red-200 bg-background text-red-600 hover:bg-red-50", Icono: Mic },
    pausar: { rotulo: "Pausar", clase: "border-border bg-background hover:bg-accent", Icono: Pause },
    reanudar: { rotulo: "Reanudar", clase: "border-border bg-background hover:bg-accent", Icono: Play },
    detener: { rotulo: "Detener", clase: "border-red-200 bg-red-600 text-white hover:bg-red-700", Icono: Square },
    descartar: { rotulo: "Descartar", clase: "border-border bg-background text-muted-foreground hover:bg-accent", Icono: Trash2 },
    usar: { rotulo: "Usar grabación", clase: "border-primary bg-primary text-primary-foreground hover:bg-primary/90", Icono: Check },
    "grabar-otra": { rotulo: "Grabar otra", clase: "border-border bg-background hover:bg-accent", Icono: RotateCcw },
};

export function GrabadorDeAudio({ onGrabado, disabled, className }: Props) {
    const {
        isRecording,
        isPaused,
        error,
        recordSecs,
        recordedAudio,
        startRecording,
        stopRecordingAndPreview,
        cancelRecording,
        clearRecordedAudio,
        pauseRecording,
        resumeRecording,
    } = useAudioRecording(Boolean(disabled));

    const estado = elEstadoDelGrabador({
        grabando: isRecording,
        pausado: isPaused,
        hayGrabacion: Boolean(recordedAudio),
    });
    const mandos = losMandosDelGrabador(estado);

    const tiempo = useMemo(
        () => comoSeLeeElTiempo(recordedAudio && estado === "lista" ? recordedAudio.durationSecs : recordSecs),
        [recordedAudio, estado, recordSecs],
    );

    const pulsar = (m: MandoDelGrabador) => {
        switch (m) {
            case "grabar":
            case "grabar-otra":
                clearRecordedAudio();
                void startRecording();
                return;
            case "pausar":
                return pauseRecording();
            case "reanudar":
                return resumeRecording();
            case "detener":
                return stopRecordingAndPreview();
            case "descartar":
                return cancelRecording();
            case "usar":
                if (!recordedAudio) return;
                void onGrabado(comoArchivoDeAudio(recordedAudio));
                clearRecordedAudio();
                return;
        }
    };

    return (
        <div
            data-grabador={estado}
            className={cn("nodrag flex flex-col gap-2", className)}
            // Dentro de un nodo de React Flow, un clic aquí no puede abrir el
            // selector de archivos del recuadro de al lado.
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex flex-wrap items-center gap-2">
                {mandos.map((m) => {
                    const { rotulo, clase, Icono } = ESTILO[m];
                    return (
                        <button
                            key={m}
                            type="button"
                            data-mando={m}
                            disabled={disabled}
                            onClick={() => pulsar(m)}
                            className={cn(BOTON, clase)}
                        >
                            <Icono className="h-4 w-4" />
                            {rotulo}
                        </button>
                    );
                })}
                {(estado === "grabando" || estado === "pausado") && (
                    <span data-tiempo className="inline-flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
                        <span
                            className={cn(
                                "h-2 w-2 rounded-full",
                                estado === "grabando" ? "animate-pulse bg-red-500" : "bg-amber-500",
                            )}
                        />
                        {estado === "pausado" ? "En pausa · " : ""}
                        {tiempo}
                    </span>
                )}
            </div>
            {estado === "lista" && recordedAudio && (
                <audio data-escuchar controls src={recordedAudio.dataUrlWithPrefix} className="h-9 w-full" />
            )}
            {error && estado === "inactivo" && (
                <p data-error-del-grabador className="text-xs text-destructive">
                    {error}
                </p>
            )}
        </div>
    );
}
