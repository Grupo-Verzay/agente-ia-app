'use client';

import React, { memo, useCallback } from 'react';
import {
    BaseEdge,
    EdgeLabelRenderer,
    getSmoothStepPath,
    type EdgeProps,
    useReactFlow,
} from '@xyflow/react';

import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

function CustomEdgeComponent(props: EdgeProps) {
    const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected } = props;
    const { deleteElements } = useReactFlow();

    const [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 18,
    });

    const handleDelete = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            deleteElements({ edges: [{ id }] });
        },
        [deleteElements, id]
    );

    return (
        <>
            {/* Edge */}
            <BaseEdge
                path={edgePath}
                style={{
                    stroke: selected ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.55)',
                    strokeWidth: selected ? 3.25 : 2,
                    filter: selected ? 'drop-shadow(0 0 6px hsl(var(--primary) / 0.45))' : 'none',
                    transition: 'stroke 180ms ease, stroke-width 180ms ease, filter 180ms ease',
                }}
            />

            {/* Acción (solo cuando está seleccionado) */}
            {selected && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                            pointerEvents: 'all',
                        }}
                        className="nodrag nopan"
                    >
                        {/* contenedor animado */}
                        <div
                            className="
                animate-in fade-in zoom-in-95
                duration-150
              "
                        >
                            <Button
                                onClick={handleDelete}
                                variant="outline"
                                size="sm"
                                title="Eliminar conexión"
                                className="
                  h-8 gap-2 rounded-md
                  border-border/60
                  bg-background/80 backdrop-blur
                  text-foreground
                  shadow-sm
                  hover:bg-background
                  hover:border-border
                  active:scale-[0.98]
                  transition
                  z-50
                "
                            >
                                <Trash2 className="h-4 w-4" />
                                <span className="text-xs font-medium">Eliminar</span>
                            </Button>
                        </div>
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
}

export const CustomEdge = memo(CustomEdgeComponent);