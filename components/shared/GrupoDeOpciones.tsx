'use client';

import { cn } from '@/lib/utils';

/**
 * Un filtro de UNA opción entre pocas, pintado como un grupo de botones pegados
 * («Todas · Salientes · Entrantes» en CRM › Llamadas, «Todos · Sin leer ·
 * Leídos» en Correo). Estaba escrito a mano dentro de Llamadas; se sacó aquí
 * cuando Correo lo necesitó, para que los dos se vean igual y no parecidos.
 */
export function GrupoDeOpciones<V extends string>({
    opciones,
    valor,
    alCambiar,
    grupo,
    title,
}: {
    opciones: { label: string; value: V }[];
    valor: V;
    alCambiar: (v: V) => void;
    /** Va en `data-grupo`: por ahí lo encuentran los bancos. */
    grupo: string;
    title?: string;
}) {
    return (
        <div data-grupo={grupo} title={title} role="group" className="flex shrink-0 rounded-lg border border-border p-0.5">
            {opciones.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    aria-pressed={valor === o.value}
                    onClick={() => alCambiar(o.value)}
                    className={cn(
                        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                        valor === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}
