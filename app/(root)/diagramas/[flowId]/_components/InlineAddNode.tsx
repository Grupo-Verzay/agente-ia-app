'use client';

import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';

import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import type { DiagramaAction } from './diagrama-node-types';
import { diagramaAccionActions, diagramaPrincipalActions } from './diagrama-node-types';
import { useAddNode } from './FlowAddNodeContext';

/** Sin tildes y en minúsculas, para que "cotización" se encuentre con "cotizacion". */
function normalizar(texto: string) {
    return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function SectionDivider({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-2 px-1 pt-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
            </span>
            <span className="h-px flex-1 bg-border/60" />
        </div>
    );
}

function ActionRow({
    action,
    activa,
    onPick,
    onHover,
}: {
    action: DiagramaAction;
    activa: boolean;
    onPick: (a: DiagramaAction) => void;
    onHover: () => void;
}) {
    const Icon = action.icon;
    return (
        <button
            type="button"
            role="option"
            aria-selected={activa}
            onClick={() => onPick(action)}
            onMouseEnter={onHover}
            className={`flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors ${activa
                ? 'border-primary bg-primary/10 font-medium'
                : 'border-input bg-background hover:bg-accent'
                }`}
        >
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${action.bg ?? 'bg-gray-500'}`}>
                <Icon className="h-3.5 w-3.5 text-white" />
            </span>
            <span className="truncate">{action.label}</span>
        </button>
    );
}

export function InlineAddNode({
    sourceId,
    sourceHandle,
    onPickAction,
    side = 'right',
    trigger,
}: {
    sourceId?: string;
    sourceHandle?: string;
    /**
     * Qué hacer con la acción elegida. Sin esto, se engancha al nodo de origen,
     * que es lo de siempre. El lienzo vacío no tiene de dónde colgar el primer
     * nodo, así que pasa el suyo y coloca en el centro.
     */
    onPickAction?: (action: DiagramaAction) => void;
    side?: 'right' | 'top' | 'bottom' | 'left';
    /** Otro botón para abrir la misma lista. Sin esto, el "+" pequeño. */
    trigger?: React.ReactNode;
}) {
    const addNode = useAddNode();
    const [open, setOpen] = useState(false);
    const [busqueda, setBusqueda] = useState('');
    // Cuál está resaltada. Se mueve con las flechas y Enter la agrega, para
    // poder poner un nodo sin soltar el teclado.
    const [activa, setActiva] = useState(0);
    const listaRef = useRef<HTMLDivElement>(null);

    const consulta = normalizar(busqueda.trim());

    const filtrar = (lista: DiagramaAction[]) =>
        consulta
            ? lista.filter(
                (a) =>
                    normalizar(a.label).includes(consulta) ||
                    normalizar(a.keywords ?? '').includes(consulta),
            )
            : lista;

    const principales = useMemo(() => filtrar(diagramaPrincipalActions), [consulta]);
    const acciones = useMemo(() => filtrar(diagramaAccionActions), [consulta]);
    // El recorrido con flechas ignora los encabezados: es la lista de arriba
    // seguida de la de abajo, tal como se ven.
    const visibles = useMemo(() => [...principales, ...acciones], [principales, acciones]);

    useEffect(() => setActiva(0), [consulta]);

    // Al abrir se empieza de cero: sin filtro y con la primera resaltada.
    useEffect(() => {
        if (!open) {
            setBusqueda('');
            setActiva(0);
        }
    }, [open]);

    // Que la resaltada nunca se quede fuera de la parte visible del panel.
    useEffect(() => {
        listaRef.current
            ?.querySelector('[aria-selected="true"]')
            ?.scrollIntoView({ block: 'nearest' });
    }, [activa, consulta]);

    if (!onPickAction && !addNode) return null;

    const pick = (action: DiagramaAction) => {
        setOpen(false);
        if (onPickAction) {
            onPickAction(action);
            return;
        }
        if (sourceId && sourceHandle) void addNode?.({ sourceId, sourceHandle, action });
    };

    const alTeclear = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiva((i) => Math.min(i + 1, visibles.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiva((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter' && visibles[activa]) {
            e.preventDefault();
            pick(visibles[activa]);
        }
    };

    const indiceDe = (action: DiagramaAction) => visibles.findIndex((a) => a.type === action.type);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                {trigger ?? (
                    <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className="nodrag nopan flex h-7 w-7 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/40 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                        title="Agregar acción"
                    >
                        <Plus className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                )}
            </PopoverTrigger>

            <PopoverContent
                side={side}
                align="center"
                sideOffset={12}
                collisionPadding={12}
                onClick={(e) => e.stopPropagation()}
                className="nodrag nopan h-[410px] w-[320px] overflow-hidden p-0"
            >
                <div className="flex h-full flex-col">
                    <div className="shrink-0 space-y-2 border-b p-4 pb-3">
                        <p className="text-sm font-bold text-foreground">Selecciona una acción</p>

                        <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                autoFocus
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                                onKeyDown={alTeclear}
                                placeholder="Buscar nodo..."
                                aria-label="Buscar nodo"
                                className="h-9 pl-8 pr-8"
                            />
                            {busqueda && (
                                <button
                                    type="button"
                                    onClick={() => setBusqueda('')}
                                    aria-label="Limpiar búsqueda"
                                    className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>

                        {consulta && (
                            <p className="text-xs text-muted-foreground">
                                {visibles.length} de {diagramaPrincipalActions.length + diagramaAccionActions.length} tipos
                            </p>
                        )}
                    </div>

                    <div ref={listaRef} role="listbox" aria-label="Tipos de nodo" className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pr-2">
                        {visibles.length === 0 ? (
                            <p className="px-1 py-8 text-center text-sm text-muted-foreground">
                                Ningún nodo se llama{' '}
                                <span className="font-medium text-foreground">{busqueda.trim()}</span>.
                                <br />
                                Pruebe con otra palabra.
                            </p>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {principales.length > 0 && <SectionDivider label="Principales" />}
                                {principales.map((action) => (
                                    <ActionRow
                                        key={action.type}
                                        action={action}
                                        activa={indiceDe(action) === activa}
                                        onPick={pick}
                                        onHover={() => setActiva(indiceDe(action))}
                                    />
                                ))}

                                {acciones.length > 0 && <SectionDivider label="Acciones" />}
                                {acciones.map((action) => (
                                    <ActionRow
                                        key={action.type}
                                        action={action}
                                        activa={indiceDe(action) === activa}
                                        onPick={pick}
                                        onHover={() => setActiva(indiceDe(action))}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
