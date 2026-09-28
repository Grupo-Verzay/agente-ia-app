'use client';

import { FileText, Download } from 'lucide-react';
import { laClaseDelArchivo, type Actualizacion } from '@/lib/actualizaciones';
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
 */
export function ContenidoDeLaActualizacion({
    actualizacion,
    completa = false,
}: {
    actualizacion: Pick<Actualizacion, 'texto' | 'archivo'>;
    completa?: boolean;
}) {
    const clase = laClaseDelArchivo(actualizacion.archivo);
    const archivo = actualizacion.archivo;

    return (
        <div className="flex min-w-0 flex-col gap-3" data-contenido-de-actualizacion>
            <p
                className={cn(
                    'whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground',
                    !completa && 'line-clamp-6',
                )}
                data-texto-de-actualizacion
            >
                {actualizacion.texto}
            </p>

            {archivo && clase === 'video' && (
                <video
                    src={archivo.url}
                    controls
                    // `metadata`, nunca `auto`: la ventana sale a toda la
                    // plataforma y no puede bajarse un video entero por abrirla.
                    preload="metadata"
                    className={cn(
                        'w-full rounded-lg border border-border bg-black',
                        completa ? 'max-h-[70vh]' : 'max-h-56',
                    )}
                    data-video-de-actualizacion
                />
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
