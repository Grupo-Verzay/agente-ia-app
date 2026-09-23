'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { colorDeLaLinea, palabraCortaDeLaLinea } from '@/lib/insignia-de-linea';

/**
 * «● Ventas»: el puntico de color y la palabra corta de una línea o cuenta, con
 * el nombre entero al posar el cursor.
 *
 * Es la marca de la lista de Chats, sacada de `ChatContactItem` para que CRM ›
 * Llamadas la pinte igual y no una parecida. El color sale de `clave` —el
 * nombre crudo de la línea, el mismo que usa Chats— y la palabra de `nombre`.
 */
export function InsigniaDeLinea({ clave, nombre }: { clave: string; nombre: string }) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span
                        data-insignia-de-linea
                        className="flex max-w-[86px] shrink-0 items-center gap-0.5 rounded bg-muted/80 px-1 py-0.5 text-[9px] font-medium leading-3 text-muted-foreground cursor-default"
                    >
                        <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${colorDeLaLinea(clave)}`} />
                        <span className="truncate">{palabraCortaDeLaLinea(nombre)}</span>
                    </span>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6} className="z-[9999]">
                    <p className="text-xs font-semibold">{nombre}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
