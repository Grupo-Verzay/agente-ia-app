'use client';

import { useState } from 'react';
import { ArrowUpCircle, Coins, XCircle, Settings2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const WA_BASE = 'https://wa.me/573115616975?text=';

const ACTIONS = [
    {
        icon: ArrowUpCircle,
        label: 'Cambiar plan',
        color: 'bg-blue-500 hover:bg-blue-600',
        href: WA_BASE + encodeURIComponent('Hola, me gustaría cambiar mi plan de Agente IA.'),
    },
    {
        icon: Coins,
        label: 'Comprar créditos',
        color: 'bg-green-500 hover:bg-green-600',
        href: WA_BASE + encodeURIComponent('Hola, me gustaría comprar créditos adicionales para mi Agente IA.'),
    },
    {
        icon: XCircle,
        label: 'Cancelar plan',
        color: 'bg-red-500 hover:bg-red-600',
        href: WA_BASE + encodeURIComponent('Hola, me gustaría cancelar mi plan de Agente IA.'),
    },
];

export function PlanSpeedDial() {
    const [open, setOpen] = useState(false);

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
            {/* Opciones */}
            <div className={cn(
                'flex flex-col items-end gap-2 transition-all duration-200',
                open ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'
            )}>
                {ACTIONS.map(({ icon: Icon, label, color, href }) => (
                    <a
                        key={label}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 group"
                    >
                        <span className="bg-background border border-border text-foreground text-xs font-medium px-3 py-1.5 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                            {label}
                        </span>
                        <button className={cn(
                            'w-10 h-10 rounded-full flex items-center justify-center text-white shadow-md transition-transform hover:scale-110',
                            color
                        )}>
                            <Icon className="h-4 w-4" />
                        </button>
                    </a>
                ))}
            </div>

            {/* Botón principal */}
            <button
                onClick={() => setOpen(v => !v)}
                className={cn(
                    'w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg transition-all duration-200',
                    open ? 'bg-muted-foreground hover:bg-muted-foreground/80 rotate-90' : 'bg-primary hover:bg-primary/90'
                )}
                title="Opciones del plan"
            >
                {open ? <X className="h-5 w-5" /> : <Settings2 className="h-5 w-5" />}
            </button>
        </div>
    );
}
