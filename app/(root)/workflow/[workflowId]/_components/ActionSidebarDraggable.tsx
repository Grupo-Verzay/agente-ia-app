'use client';

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Action } from "@/types/workflow-node";

type Props = {
    action: Action;
    disabled?: boolean;
    onDragStart: (e: React.DragEvent, action: Action) => void;

    /** NUEVO */
    onClickCreate?: (action: Action) => void;
};

export const ActionSidebarDraggable = ({
    action,
    disabled,
    onDragStart,
    onClickCreate,
}: Props) => {
    const Icon = action.icon;

    // evita que un drag termine disparando click
    const didDragRef = useRef(false);

    return (
        <Button
            variant="outline"
            className="flex"
            draggable={!disabled}
            disabled={disabled}
            title={disabled ? 'Límite alcanzado o acción deshabilitada' : 'Arrastra o haz click para crear en el canvas'}
            onDragStart={(e) => {
                didDragRef.current = true;
                onDragStart(e, action);
            }}
            onDragEnd={() => {
                setTimeout(() => {
                    didDragRef.current = false;
                }, 0);
            }}
            onClick={() => {
                if (disabled) return;
                if (didDragRef.current) return;
                onClickCreate?.(action);
            }}
        >
            <Icon className={action.iconClassName ?? "!h-3 !w-3"} />
            <div className="flex flex-1">{action.label}</div>
        </Button>
    );
};