'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';

import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Action, baseActions, seguimientoActions } from '@/types/workflow-node';
import { MAX_NODES_PER_WORKFLOW, MAX_SEGUIMIENTOS_PER_WORKFLOW } from '@/types/workflow';
import { useAddNode } from './WorkflowAddNodeContext';

function ActionRow({
    action,
    onPick,
    seguimiento,
}: {
    action: Action;
    onPick: (a: Action) => void;
    seguimiento?: boolean;
}) {
    const Icon = action.icon;
    return (
        <Button
            type="button"
            variant="outline"
            onClick={() => onPick(action)}
            className={cn(
                'flex w-full items-center justify-start gap-2 text-sm',
                seguimiento && 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-950/50'
            )}
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
    seguimientoNodes,
}: {
    sourceId: string;
    sourceHandle: string;
    totalNodes: number;
    seguimientoNodes: number;
}) {
    const addNode = useAddNode();
    const [open, setOpen] = useState(false);

    if (!addNode) return null;

    const pick = (action: Action) => {
        setOpen(false);
        void addNode({ sourceId, sourceHandle, action });
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="nodrag nopan flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all hover:scale-110 hover:bg-primary/90"
                    title="Agregar acción"
                >
                    <Plus className="h-5 w-5" />
                </button>
            </PopoverTrigger>

            <PopoverContent
                side="right"
                align="center"
                sideOffset={12}
                collisionPadding={12}
                onClick={(e) => e.stopPropagation()}
                className="nodrag nopan h-[410px] w-[320px] overflow-hidden p-0"
            >
                <div className="flex h-full flex-col">
                    {/* Encabezado fijo */}
                    <div className="shrink-0 p-4 pb-3">
                        <p className="text-sm font-bold text-foreground">Selecciona una acción</p>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                            <span>{`Nodos: ${totalNodes}/${MAX_NODES_PER_WORKFLOW}`}</span>
                            <span>{`Seguimientos: ${seguimientoNodes}/${MAX_SEGUIMIENTOS_PER_WORKFLOW}`}</span>
                        </div>
                    </div>

                    {/* Cuerpo con scroll */}
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pr-2">
                        <div className="flex flex-col gap-2">
                            {baseActions.map((action) => (
                                <ActionRow key={action.type} action={action} onPick={pick} />
                            ))}

                            <div className="flex items-center gap-2 px-1 pt-2">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Seguimientos
                                </span>
                                <span className="h-px flex-1 bg-border/60" />
                            </div>

                            {seguimientoActions.map((action) => (
                                <ActionRow key={action.type} action={action} onPick={pick} seguimiento />
                            ))}
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
