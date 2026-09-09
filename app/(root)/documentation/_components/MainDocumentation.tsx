'use client';

import { ReactNode } from 'react';
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface ModuleItem {
    title: string;
    description: string;
    icon: ReactNode;
    href: string;
    buttonLabel: string;
    accent?: string;
};

interface MainDocumentationInterface {
    modules: ModuleItem[]
};

export const MainDocumentation = ({ modules }: MainDocumentationInterface) => {
    const accents = ['#3B82F6', '#22C55E', '#8B5CF6'];

    return (
        // Rejilla, no `flex-wrap` con ancho fijo. Con `w-72` las tarjetas no
        // crecían: en pantalla ancha entraban tres y la cuarta bajaba sola y
        // centrada, dejando un hueco a los lados. Aquí el ancho se reparte y
        // los cortes son 1 / 2 / 4, nunca 3: con cuatro tarjetas, tres por fila
        // es justo lo que deja una huérfana debajo.
        //
        // Las cuatro entran a partir de `lg` (1024 px), no de `xl` (1280): el
        // corte alto dejaba 2+2 en un portátil normal —basta con el zoom del
        // navegador o una ventana sin maximizar para bajar de 1280—, que es lo
        // que se vio. A 1024, descontando la barra lateral, cada tarjeta pasa
        // de 200 px y el contenido es corto: cabe.
        <div className="grid grid-cols-1 items-stretch gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map((card, index) => {
                const color = card.accent ?? accents[index % accents.length];
                return (
                    <div
                        key={index}
                        className="flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-border bg-background transition-all duration-300 hover:shadow-lg hover:scale-[1.015]"
                        style={{ borderTop: `3px solid ${color}` }}
                    >
                        {/* Icono + título */}
                        <div className="flex flex-col items-center gap-2.5 px-5 pt-6 pb-4 text-center">
                            <div
                                className="flex items-center justify-center w-12 h-12 rounded-2xl"
                                style={{ backgroundColor: `${color}18` }}
                            >
                                <span style={{ color }}>{card.icon}</span>
                            </div>
                            <p className="font-semibold text-base leading-tight">{card.title}</p>
                            <p className="text-sm text-muted-foreground leading-snug">{card.description}</p>
                        </div>

                        {/* Botón */}
                        <div className="px-5 pb-5">
                            <Button asChild className="w-full" style={{ backgroundColor: color, borderColor: color }}>
                                <Link href={card.href}>{card.buttonLabel}</Link>
                            </Button>
                        </div>
                    </div>
                );
            })}
        </div>
    )
}