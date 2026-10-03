"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Film, Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { elVideoDelPlan } from "@/lib/pagina-de-plan";
import { elPesoLegible, porQueNoSeSubeElVideo, TOPE_DEL_VIDEO_SUBIDO, VIDEOS_QUE_SE_ACEPTAN } from "@/lib/video-subido";

/**
 * Subir un video como ARCHIVO, al lado del enlace que ya se podía pegar. Es la
 * pareja de `ImageUploader` (la miniatura) y se ve igual: un recuadro punteado
 * que se convierte en la vista previa.
 *
 * Lo que sube lo deja en el MISMO campo que el enlace (`value`/`onChange`): el
 * video del plan es uno, venga de YouTube o de un archivo, y la página decide
 * cómo pintarlo con `elVideoDelPlan`.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **Se manda el archivo crudo con `XMLHttpRequest`**, no con `fetch`: es lo
 *    único que da el progreso de la SUBIDA, y un video de 100 MB sin barra se
 *    lee como una pantalla colgada.
 * 2. **Lo que no se puede subir se dice ANTES de empezar** con la misma regla
 *    que la ruta (`porQueNoSeSubeElVideo`): no se hace esperar una barra entera
 *    por algo que ya se sabía.
 * 3. **Un fallo nunca es mudo**: se queda escrito debajo del botón —no solo en
 *    un aviso que se va— y en la consola.
 */
export function VideoUploader({
    value,
    onChange,
    className,
    placeholder = "Subir video (.mp4)",
}: {
    value: string;
    onChange: (url: string) => void;
    className?: string;
    placeholder?: string;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [progreso, setProgreso] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const subiendo = progreso !== null;
    const video = value.trim() ? elVideoDelPlan(value) : null;
    const archivoSubido = video?.tipo === "archivo" ? video.url : null;

    const fallo = (motivo: string, detalle?: unknown) => {
        setError(motivo);
        toast.error(motivo);
        console.error("[video] no se pudo subir el video", { motivo, detalle });
    };

    const subir = (archivo: File) => {
        const motivo = porQueNoSeSubeElVideo({ tamano: archivo.size, tipo: archivo.type, nombre: archivo.name });
        if (motivo) {
            fallo(motivo);
            return;
        }
        setError(null);
        setProgreso(0);
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/upload-plan-video");
        xhr.setRequestHeader("Content-Type", archivo.type || "video/mp4");
        xhr.setRequestHeader("x-nombre-del-archivo", encodeURIComponent(archivo.name));
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && e.total > 0) setProgreso(Math.min(99, Math.round((e.loaded / e.total) * 100)));
        };
        xhr.onerror = () => {
            setProgreso(null);
            fallo("No se pudo subir el video: se cortó la conexión. Vuelve a intentarlo.");
        };
        xhr.onload = () => {
            setProgreso(null);
            let cuerpo: { url?: string; error?: string } = {};
            try {
                cuerpo = JSON.parse(xhr.responseText || "{}");
            } catch {
                cuerpo = {};
            }
            if (xhr.status >= 200 && xhr.status < 300 && cuerpo.url) {
                onChange(cuerpo.url);
                toast.success("Video subido. Guarda para publicarlo.");
                return;
            }
            fallo(cuerpo.error || `No se pudo subir el video (error ${xhr.status}).`, xhr.status);
        };
        xhr.send(archivo);
    };

    return (
        <div className={cn("flex flex-col gap-1.5", className)} data-subir-video>
            {archivoSubido ? (
                <div className="relative overflow-hidden rounded-md border border-border bg-black">
                    <video
                        src={archivoSubido}
                        controls
                        playsInline
                        preload="metadata"
                        className="aspect-video w-full"
                        data-vista-previa-del-video
                    />
                    <button
                        type="button"
                        onClick={() => onChange("")}
                        disabled={subiendo}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                        title="Quitar el video"
                        aria-label="Quitar el video"
                    >
                        <X className="h-3 w-3" />
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={subiendo}
                    className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-xs text-muted-foreground transition-colors hover:bg-muted disabled:opacity-70"
                    data-boton-subir-video
                >
                    {subiendo ? (
                        <span className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" /> Subiendo… {progreso} %
                        </span>
                    ) : (
                        <>
                            <span className="flex items-center gap-2">
                                <Upload className="h-4 w-4" /> {placeholder}
                            </span>
                            <span className="text-[10px]">MP4, WebM o MOV · hasta {elPesoLegible(TOPE_DEL_VIDEO_SUBIDO)}</span>
                        </>
                    )}
                </button>
            )}
            {subiendo && (
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className="h-full bg-primary transition-[width]" style={{ width: `${progreso}%` }} />
                </div>
            )}
            {archivoSubido && (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={subiendo}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                    {subiendo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Film className="h-3 w-3" />}
                    {subiendo ? `Subiendo… ${progreso} %` : "Cambiar video"}
                </button>
            )}
            {error && (
                <p className="flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-400" data-error-del-video>
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{error}</span>
                </p>
            )}
            <input
                ref={inputRef}
                type="file"
                accept={VIDEOS_QUE_SE_ACEPTAN}
                className="hidden"
                onChange={(e) => {
                    const archivo = e.target.files?.[0];
                    if (archivo) subir(archivo);
                    e.target.value = "";
                }}
            />
        </div>
    );
}
