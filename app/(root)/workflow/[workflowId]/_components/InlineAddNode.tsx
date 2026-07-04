'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';

import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Action, baseActions, seguimientoActions } from '@/types/workflow-node';
import { useAddNode } from './WorkflowAddNodeContext';

function PickTile({ action, onPick }: { action: Action; onPick: (a: Action) => void }) {
    const Icon = action.icon;
    return (
        <button
            type="button"
            onClick={() => onPick(action)}
            className="group flex flex-col items-center gap-1.5 rounded-xl border border-transparent p-2 text-center transition-all hover:-translate-y-0.5 hover:border-border hover:bg-muted/60 hover:shadow-sm"
        >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/70 ring-1 ring-border/50 transition-colors group-hover:bg-background">
                <Icon className={`h-5 w-5 ${action.iconClassName ?? ''}`} />
            </span>
            <span className="text-[11px] font-medium leading-tight text-foreground/80">
                {action.label}
            </span>
        </button>
    );
}

export function InlineAddNode({
    sourceId,
    sourceHandle,
}: {
    sourceId: string;
    sourceHandle: string;
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
                    className="nodrag nopan flex h-7 w-7 items-center justify-center rounded-full border-2 border-primary/50 bg-background text-primary shadow-md transition-all hover:scale-110 hover:bg-primary hover:text-primary-foreground"
                    title="Agregar siguiente paso"
                >
                    <Plus className="h-4 w-4" />
                </button>
            </PopoverTrigger>

            <PopoverContent
                side="right"
                align="center"
                sideOffset={12}
                className="nodrag nopan w-72 rounded-2xl border-border/70 p-0 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Encabezado */}
                <div className="rounded-t-2xl border-b border-border/60 bg-muted/40 px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Agregar paso
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                        Elige el tipo de nodo a conectar
                    </p>
                </div>

                <div className="space-y-3 p-3">
                    <div className="grid grid-cols-3 gap-1.5">
                        {baseActions.map((a) => (
                            <PickTile key={a.type} action={a} onPick={pick} />
                        ))}
                    </div>

                    <div className="flex items-center gap-2 px-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Seguimientos
                        </span>
                        <span className="h-px flex-1 bg-border/60" />
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                        {seguimientoActions.map((a) => (
                            <PickTile key={a.type} action={a} onPick={pick} />
                        ))}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
