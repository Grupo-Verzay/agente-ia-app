'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Download, Play } from 'lucide-react';
import { laClaseDelArchivo, type Actualizacion } from '@/lib/actualizaciones';
import { TextoConEnlaces } from '@/components/shared/TextoConFormato';
import { comoSeLeeElNombre, comoSeLeeElTamano } from '@/lib/adjuntos-del-equipo';
import { cn } from '@/lib/utils';

/**
 * Cómo se pinta una actualización: el texto y, si lo hay, su archivo.
 *
 * Es UNA pieza para los dos sitios —la ventana que salta a todos y la lista de
 * la pantalla que publica— para que lo que ve quien publica sea exactamente lo
 * que les salta a los demás.
 *
 * `completa` quita el recorte del texto y deja el video a su tamaño: es lo que
 * se ve al pulsar «Ver completo».
 *
 * Dos cosas que hay que mantener:
 *
 * 1. **Las direcciones del texto son enlaces** (`TextoConEnlaces`, la misma
 *    regla que en los chats) y SIN leer las marcas de WhatsApp: esto no viaja
 *    por WhatsApp y un `*` escrito aquí es un asterisco.
 * 2. **Un video se REPRODUCE aquí dentro**, nunca se descarga. De qué clase es
 *    lo decide `laClaseDelArchivo`, que ya no da por bueno un mime genérico
 *    (`octet-stream`): con él, un `.mp4` salía como documento y el enlace lo
 *    descargaba.
 */
const CLASE_DEL_ENLACE =
    'break-all font-medium text-blue-600 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300';

export function ContenidoDeLaActualizacion({
    actualizacion,
    completa = false,
    alAbrirUnEnlace,
}: {
    actualizacion: Pick<Actualizacion, 'texto' | 'archivo'>;
    completa?: boolean;
    /**
     * Se avisa al pulsar un enlace del texto, con si es de DENTRO de la
     * plataforma (navega en esta pestaña) o de fuera (abre otra).
     */
    alAbrirUnEnlace?: (deDentro: boolean) => void;
}) {
    const clase = laClaseDelArchivo(actualizacion.archivo);
    const archivo = actualizacion.archivo;
    const [videoFallo, setVideoFallo] = useState(false);
    const [empezado, setEmpezado] = useState(false);
    const video = useRef<HTMLVideoElement>(null);

    // Reproducir es un gesto EXPLÍCITO, no confiar en que el navegador
    // arranque al tocar la superficie: Safari no lo hace, y un recuadro negro
    // que no responde se lee como «esto no se puede ver».
    const reproducir = () => {
        const v = video.current;
        if (!v) return;
        setEmpezado(true);
        v.play().catch((error: unknown) => {
            console.warn('[actualizaciones] el video no arrancó', error);
            // Solo un formato que no se entiende es «no se puede»; cualquier
            // otra negativa (el navegador pidiendo otro gesto) devuelve el
            // botón para volver a intentarlo.
            if ((error as { name?: string })?.name === 'NotSupportedError') setVideoFallo(true);
            else setEmpezado(false);
        });
    };
    // El origen se lee DESPUÉS de montar: este contenido solo existe en el
    // navegador (se pinta tras una consulta), pero leerlo al pintar seguiría
    // siendo una hidratación rota el día que alguien lo pinte en el servidor.
    const [origen, setOrigen] = useState('');
    useEffect(() => {
        setOrigen(window.location.origin);
    }, []);

    return (
        <div className="flex min-w-0 flex-col gap-3" data-contenido-de-actualizacion>
            <p
                className={cn(
                    'whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground',
                    !completa && 'line-clamp-6',
                )}
                data-texto-de-actualizacion
                onClick={(e) => {
                    const a = (e.target as HTMLElement).closest('a');
                    if (a) alAbrirUnEnlace?.(a.getAttribute('target') !== '_blank');
                }}
            >
                <TextoConEnlaces texto={actualizacion.texto} origen={origen} claseDelEnlace={CLASE_DEL_ENLACE} />
            </p>

            {archivo && clase === 'video' && (
                <div className="flex flex-col gap-1">
                    <div className="relative">
                        <video
                            ref={video}
                            // `#t=0.1` pinta el primer fotograma en vez de un
                            // recuadro negro, sin bajarse el video entero.
                            src={`${archivo.url}#t=0.1`}
                            controls
                            playsInline
                            // Se reproduce aquí dentro: el botón de descargar
                            // del reproductor no se ofrece.
                            controlsList="nodownload"
                            // `metadata`, nunca `auto`: la ventana sale a toda la
                            // plataforma y no puede bajarse un video entero por abrirla.
                            preload="metadata"
                            onPlay={() => setEmpezado(true)}
                            onError={() => setVideoFallo(true)}
                            className={cn(
                                'block w-full rounded-lg border border-border bg-black',
                                completa ? 'max-h-[70vh]' : 'max-h-56',
                            )}
                            data-video-de-actualizacion
                        />
                        {!empezado && !videoFallo && (
                            <button
                                type="button"
                                onClick={reproducir}
                                aria-label="Reproducir video"
                                className="group absolute inset-0 flex items-center justify-center rounded-lg bg-black/20 transition-colors hover:bg-black/30"
                                data-reproducir-video
                            >
                                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-black shadow-lg transition-transform group-hover:scale-105">
                                    <Play className="ml-1 h-6 w-6 fill-current" />
                                </span>
                            </button>
                        )}
                    </div>
                    {videoFallo && (
                        <span className="text-xs text-muted-foreground" data-video-sin-reproducir>
                            Este navegador no puede reproducir este video.
                        </span>
                    )}
                </div>
            )}

            {archivo && clase === 'imagen' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={archivo.url}
                    alt={archivo.nombre}
                    className={cn(
                        'w-full rounded-lg border border-border object-contain',
                        completa ? 'max-h-[70vh]' : 'max-h-56',
                    )}
                />
            )}

            {archivo && clase === 'documento' && (
                <a
                    href={archivo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-muted/40 p-3 transition-colors hover:bg-muted"
                    data-documento-de-actualizacion
                >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <FileText className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium" title={archivo.nombre}>
                            {comoSeLeeElNombre(archivo.nombre)}
                        </span>
                        {comoSeLeeElTamano(archivo.tamano) && (
                            <span className="block text-xs text-muted-foreground">
                                {comoSeLeeElTamano(archivo.tamano)}
                            </span>
                        )}
                    </span>
                    <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                </a>
            )}
        </div>
    );
}
