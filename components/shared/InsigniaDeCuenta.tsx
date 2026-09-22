'use client';

import { Badge } from '@/components/ui/badge';

/**
 * De qué cuenta es esta fila, en una pastilla.
 *
 * Con la vista unificada —la madre viendo lo suyo y lo de sus hijas— una lista
 * sin esto es un revoltijo: veinte llamadas de tres cuentas seguidas, ordenadas
 * por fecha y sin decir de quién es cada una.
 *
 * Está escrita **una vez** y la usan las dos formas en que el CRM enseña una
 * fila: la columna de una tabla (`columnaDeCuenta`, que la envuelve) y las
 * tarjetas que no son tabla —el kanban, los informes—. Copiada en cada sitio,
 * el día que se afine el ancho o el recorte se afina en uno y los demás se
 * quedan atrás, y eso se lee como que «en el kanban la cuenta a veces no se
 * ve».
 *
 * Sin nombre sale «—» y no se esconde: un hueco vacío donde las demás filas
 * llevan su cuenta se lee como que esa fila no es de nadie.
 */
export function InsigniaDeCuenta({ nombre, className }: { nombre?: string | null; className?: string }) {
    const texto = (nombre ?? '').trim() || '—';
    return (
        <Badge
            variant="outline"
            className={`h-6 max-w-[12rem] shrink-0 truncate text-[11px] font-normal ${className ?? ''}`}
            title={texto}
        >
            {texto}
        </Badge>
    );
}
