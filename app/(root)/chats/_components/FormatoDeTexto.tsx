'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bold, Code, Italic, Strikethrough, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Las cuatro marcas de WhatsApp, en el orden en que se usan. */
const BOTONES = [
    { marca: '*', icono: Bold, nombre: 'Negrilla', atajo: 'Ctrl+B' },
    { marca: '_', icono: Italic, nombre: 'Cursiva', atajo: 'Ctrl+I' },
    { marca: '~', icono: Strikethrough, nombre: 'Tachado', atajo: 'Ctrl+Shift+X' },
    { marca: '```', icono: Code, nombre: 'Monoespaciado', atajo: '' },
] as const;

/**
 * Los botones de formato del cuadro de mensaje.
 *
 * Van **plegados detrás de un botón**, no sueltos en la fila: esa barra ya lleva
 * firma, automatizaciones, adjuntos, nota interna, IA y emojis, y en móvil se
 * recoge entera en el menú «+». Cuatro botones más sueltos la desbordan; es la
 * misma regla que el menú de «Acciones».
 *
 * Y son **cuatro y no más**. WhatsApp no tiene listas, ni encabezados, ni
 * enlaces con texto: un botón que produce algo que el cliente ve roto es peor
 * que no tenerlo. Por eso esto no se parece a la barra de Chatwoot aunque se
 * use igual —aquello escribe markdown, `**así**`, y en WhatsApp eso deja un
 * asterisco a la vista—.
 *
 * El `onMouseDown` con `preventDefault` de cada botón es lo que hace que
 * funcione: sin él, pulsar mueve el foco fuera del cuadro y se pierde lo que
 * había seleccionado, que es justo sobre lo que hay que aplicar la marca.
 */
export function FormatoDeTexto({
    onAplicar,
    disabled,
}: {
    onAplicar: (marca: string) => void;
    disabled?: boolean;
}) {
    const [abierto, setAbierto] = useState(false);
    const caja = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!abierto) return;
        const fuera = (e: MouseEvent) => {
            if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
        };
        document.addEventListener('mousedown', fuera);
        return () => document.removeEventListener('mousedown', fuera);
    }, [abierto]);

    const aplicar = useCallback(
        (marca: string) => {
            onAplicar(marca);
        },
        [onAplicar],
    );

    return (
        <div className="relative" ref={caja}>
            <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={disabled}
                onClick={() => setAbierto((v) => !v)}
                className={cn(
                    'h-8 w-8 rounded-full shrink-0 transition-colors',
                    abierto
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
                aria-label="Formato del texto"
                title="Formato: negrilla, cursiva, tachado"
            >
                <Type className="w-4 h-4" />
            </Button>

            {abierto && (
                <div className="absolute bottom-9 left-0 z-50 flex items-center gap-0.5 rounded-xl border border-border bg-popover p-1 shadow-lg">
                    {BOTONES.map(({ marca, icono: Icono, nombre, atajo }) => (
                        <Button
                            key={marca}
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                            aria-label={nombre}
                            title={atajo ? `${nombre} (${atajo})` : nombre}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => aplicar(marca)}
                        >
                            <Icono className="w-4 h-4" />
                        </Button>
                    ))}
                </div>
            )}
        </div>
    );
}
