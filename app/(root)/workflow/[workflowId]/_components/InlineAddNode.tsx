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
            className="flex flex-col items-center gap-1 rounded-md border border-transparent p-2 text-center transition hover:border-border hover:bg-muted"
        >
            <Icon className={`h-4 w-4 ${action.iconClassName ?? ''}`} />
            <span className="text-[10px] leading-tight text-foreground">{action.label}</span>
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
                    className="nodrag nopan flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary/40 bg-background text-primary shadow-sm transition hover:bg-primary hover:text-primary-foreground"
                    title="Agregar siguiente paso"
                >
                    <Plus className="h-3.5 w-3.5" />
                </button>
            </PopoverTrigger>

            <PopoverContent
                side="right"
                align="center"
                className="nodrag nopan w-64 p-2"
                onClick={(e) => e.stopPropagation()}
            >
                <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Agregar paso
                </p>
                <div className="grid grid-cols-3 gap-1">
                    {baseActions.map((a) => (
                        <PickTile key={a.type} action={a} onPick={pick} />
                    ))}
                </div>

                <p className="px-1 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Seguimientos
                </p>
                <div className="grid grid-cols-3 gap-1">
                    {seguimientoActions.map((a) => (
                        <PickTile key={a.type} action={a} onPick={pick} />
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}
