'use client';

import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Plus, Search, X } from 'lucide-react';

import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Action, nodeActions, accionActions, seguimientoActions, automationActions } from '@/types/workflow-node';
import { MAX_NODES_PER_WORKFLOW, MAX_SEGUIMIENTOS_PER_WORKFLOW } from '@/types/workflow';
import { useAddNode } from './WorkflowAddNodeContext';
import { useWorkflowEditorShell } from './WorkflowEditorShellProvider';

/** Sin tildes y en minúsculas, para que "intención" se encuentre con "intencion". */
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
    onPick,
    onHover,
    seguimiento,
    locked,
    activa,
}: {
    action: Action;
    onPick: (a: Action) => void;
    onHover?: () => void;
    seguimiento?: boolean;
    locked?: boolean;
    activa?: boolean;
}) {
    const Icon = action.icon;
    return (
        <Button
            type="button"
            variant="outline"
            role="option"
            aria-selected={activa}
            disabled={locked}
            onClick={() => onPick(action)}
            onMouseEnter={onHover}
            title={locked ? 'No incluido en tu plan' : undefined}
            className={cn(
                'flex w-full items-center justify-start gap-2 text-sm',
                seguimiento && 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-950/50',
                activa && 'border-primary bg-primary/10 font-medium'
            )}
        >
            <Icon className={`h-4 w-4 ${action.iconClassName ?? ''}`} />
            <span className="truncate">{action.label}</span>
            {locked && <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground" />}
        </Button>
    );
}

export function InlineAddNode({
    sourceId,
    sourceHandle,
    totalNodes,
    seguimientoNodes,
    onPickAction,
    side = 'right',
    trigger,
}: {
    sourceId?: string;
    sourceHandle?: string;
    totalNodes: number;
    seguimientoNodes: number;
    /**
     * Qué hacer con la acción elegida. Sin esto, se engancha al nodo de origen,
     * que es lo de siempre. El lienzo vacío no tiene de dónde colgar el primer
     * nodo, así que pasa el suyo y coloca en el centro.
     */
    onPickAction?: (action: Action) => void;
    side?: 'right' | 'top' | 'bottom' | 'left';
    /** Otro botón para abrir la misma lista. Sin esto, el "+" pequeño. */
    trigger?: React.ReactNode;
}) {
    const addNode = useAddNode();
    const { lockedFeatures } = useWorkflowEditorShell();
    const isLocked = (a: Action) => lockedFeatures.has(a.type);
    const [open, setOpen] = useState(false);
    const [busqueda, setBusqueda] = useState('');
    // Cuál está resaltada. Se mueve con las flechas y Enter la agrega, para poder
    // poner un nodo sin soltar el teclado.
    const [activa, setActiva] = useState(0);
    const listaRef = useRef<HTMLDivElement>(null);

    const consulta = normalizar(busqueda.trim());

    const filtrar = (lista: Action[]) =>
        consulta
            ? lista.filter(
                (a) =>
                    normalizar(a.label).includes(consulta) ||
                    normalizar(a.keywords ?? '').includes(consulta),
            )
            : lista;

    const nodos = useMemo(() => filtrar(nodeActions), [consulta]);
    const acciones = useMemo(() => filtrar(accionActions), [consulta]);
    const automatizaciones = useMemo(() => filtrar(automationActions), [consulta]);
    const seguimientos = useMemo(() => filtrar(seguimientoActions), [consulta]);
    // El recorrido con flechas ignora los encabezados: es la lista completa en el
    // mismo orden en que se ve.
    const visibles = useMemo(
        () => [...nodos, ...acciones, ...automatizaciones, ...seguimientos],
        [nodos, acciones, automatizaciones, seguimientos],
    );
    const total =
        nodeActions.length + accionActions.length + automationActions.length + seguimientoActions.length;

    useEffect(() => setActiva(0), [consulta]);

    // Al cerrar se deja limpio: la próxima vez se abre sin filtro.
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

    const pick = (action: Action) => {
        if (isLocked(action)) return;
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

    const indiceDe = (action: Action) => visibles.findIndex((a) => a.type === action.type);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                {trigger ?? (
                    <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className="nodrag nopan flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-md transition-all hover:scale-105 hover:bg-primary/90"
                        title="Agregar acción"
                    >
                        <Plus className="h-5 w-5" strokeWidth={3} />
                    </button>
                )}
            </PopoverTrigger>

            <PopoverContent
                side={side}
                align="center"
                sideOffset={12}
                collisionPadding={16}
                onClick={(e) => e.stopPropagation()}
                // El alto fijo no cabía cerca del borde de arriba del lienzo y el
                // panel se salía: el encabezado y el buscador quedaban por encima
                // de la pantalla. Con el alto disponible que publica Radix se
                // encoge hasta lo que quepa y la lista scrollea dentro.
                className="nodrag nopan h-[410px] max-h-[var(--radix-popover-content-available-height)] w-[320px] overflow-hidden p-0"
            >
                <div className="flex h-full flex-col">
                    {/* Encabezado fijo */}
                    <div className="shrink-0 space-y-2 border-b p-4 pb-3">
                        <p className="text-sm font-bold text-foreground">Selecciona una acción</p>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            <span>{`Nodos: ${totalNodes}/${MAX_NODES_PER_WORKFLOW}`}</span>
                            <span>{`Seguimientos: ${seguimientoNodes}/${MAX_SEGUIMIENTOS_PER_WORKFLOW}`}</span>
                        </div>

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
                                {visibles.length} de {total} tipos
                            </p>
                        )}
                    </div>

                    {/* Cuerpo con scroll */}
                    <div
                        ref={listaRef}
                        role="listbox"
                        aria-label="Tipos de nodo"
                        className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pr-2"
                    >
                        <div className="flex flex-col gap-2">
                            {nodos.length > 0 && <SectionDivider label="Nodos" />}
                            {nodos.map((action) => (
                                <ActionRow
                                    key={action.type}
                                    action={action}
                                    onPick={pick}
                                    onHover={() => setActiva(indiceDe(action))}
                                    activa={visibles[activa]?.type === action.type}
                                    locked={isLocked(action)}
                                />
                            ))}

                            {acciones.length > 0 && <SectionDivider label="Acciones" />}
                            {acciones.map((action) => (
                                <ActionRow
                                    key={action.type}
                                    action={action}
                                    onPick={pick}
                                    onHover={() => setActiva(indiceDe(action))}
                                    activa={visibles[activa]?.type === action.type}
                                    locked={isLocked(action)}
                                />
                            ))}

                            {automatizaciones.length > 0 && <SectionDivider label="Automatizaciones" />}
                            {automatizaciones.map((action) => (
                                <ActionRow
                                    key={action.type}
                                    action={action}
                                    onPick={pick}
                                    onHover={() => setActiva(indiceDe(action))}
                                    activa={visibles[activa]?.type === action.type}
                                    locked={isLocked(action)}
                                />
                            ))}

                            {seguimientos.length > 0 && <SectionDivider label="Seguimientos" />}
                            {seguimientos.map((action) => (
                                <ActionRow
                                    key={action.type}
                                    action={action}
                                    onPick={pick}
                                    onHover={() => setActiva(indiceDe(action))}
                                    activa={visibles[activa]?.type === action.type}
                                    seguimiento
                                    locked={isLocked(action)}
                                />
                            ))}

                            {visibles.length === 0 && (
                                <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                                    Nada con “{busqueda.trim()}”.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
