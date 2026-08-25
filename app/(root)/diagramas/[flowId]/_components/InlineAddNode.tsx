'use client';

import type React from 'react';
import { useState } from 'react';
import { Plus } from 'lucide-react';

import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import type { DiagramaAction } from './diagrama-node-types';
import { diagramaContentActions, diagramaLogicActions } from './diagrama-node-types';
import { useAddNode } from './FlowAddNodeContext';

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
}: {
    action: DiagramaAction;
    onPick: (a: DiagramaAction) => void;
}) {
    const Icon = action.icon;
    return (
        <Button
            type="button"
            variant="outline"
            onClick={() => onPick(action)}
            className="flex w-full items-center justify-start gap-2 text-sm"
        >
            <Icon className={`h-4 w-4 ${action.iconClassName ?? ''}`} />
            <span className="truncate">{action.label}</span>
        </Button>
    );
}

export function InlineAddNode({
    sourceId,
    sourceHandle,
    totalNodes,
    onPickAction,
    side = 'right',
    trigger,
}: {
    sourceId?: string;
    sourceHandle?: string;
    totalNodes: number;
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

    if (!onPickAction && !addNode) return null;

    const pick = (action: DiagramaAction) => {
        setOpen(false);
        if (onPickAction) {
            onPickAction(action);
            return;
        }
        if (sourceId && sourceHandle) void addNode?.({ sourceId, sourceHandle, action });
    };

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
                    <div className="shrink-0 p-4 pb-3">
                        <p className="text-sm font-bold text-foreground">Selecciona una acción</p>
                        <p className="mt-1 text-xs text-muted-foreground">{`Nodos en el diagrama: ${totalNodes}`}</p>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pr-2">
                        <div className="flex flex-col gap-2">
                            <SectionDivider label="Nodos" />
                            {diagramaContentActions.map((action) => (
                                <ActionRow key={action.type} action={action} onPick={pick} />
                            ))}

                            <SectionDivider label="Acciones" />
                            {diagramaLogicActions.map((action) => (
                                <ActionRow key={action.type} action={action} onPick={pick} />
                            ))}
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
