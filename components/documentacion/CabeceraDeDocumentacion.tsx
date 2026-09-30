import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * La cabecera de las pantallas internas de Documentación: una flecha que vuelve
 * a la portada y el título. La misma en las cuatro —Guías, Tutoriales,
 * Actualizaciones y Conexión API de Meta—, así que la flecha cae en el mismo
 * píxel en todas y nadie tiene que subir a la barra de arriba para volver.
 *
 * La flecha es un ENLACE (`/documentation`), no un «atrás» del navegador: quien
 * llega por un enlace directo no tiene historial al que volver, y un botón que
 * a veces saca de la plataforma es peor que no tenerlo.
 */
export const RUTA_DE_DOCUMENTACION = '/documentation';

export function CabeceraDeDocumentacion({
    titulo,
    subtitulo,
    volverA = { href: RUTA_DE_DOCUMENTACION, etiqueta: 'Volver a Documentación' },
    children,
}: {
    titulo: string;
    subtitulo?: string;
    /**
     * A dónde lleva la flecha. Por defecto, la portada de Documentación; el
     * centro de ayuda la usa para volver a sus categorías. `null`: sin flecha
     * (la portada del centro de ayuda no vuelve a ningún sitio).
     */
    volverA?: { href: string; etiqueta: string } | null;
    /** Lo que va a la derecha del título, si la pantalla tiene algo ahí. */
    children?: ReactNode;
}) {
    return (
        <div className="flex items-start gap-3" data-cabecera-de-documentacion>
            {volverA ? (
                <Link
                    href={volverA.href}
                    aria-label={volverA.etiqueta}
                    title={volverA.etiqueta}
                    data-volver-a-documentacion
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                </Link>
            ) : null}
            <div className="flex min-h-9 min-w-0 flex-1 flex-col justify-center">
                <h2 className="h3-bold leading-tight text-gray-900 dark:text-white" data-titulo-de-documentacion>
                    {titulo}
                </h2>
                {subtitulo ? <p className="mt-1 text-sm text-muted-foreground">{subtitulo}</p> : null}
            </div>
            {children}
        </div>
    );
}
