'use client';

import React, { memo, useCallback } from 'react';
import {
    BaseEdge,
    EdgeLabelRenderer,
    getBezierPath,
    type EdgeProps,
    useReactFlow,
} from '@xyflow/react';

import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

function CustomEdgeComponent(props: EdgeProps) {
    const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected } = props;
    const { deleteElements } = useReactFlow();

    // Curva, no escalones: el trazo de escalones sale del nodo hacia la
    // derecha y, si el nodo de destino quedo debajo o detras, tiene que dar
    // una vuelta en angulo recto que se ve como un error. La curva llega a
    // cualquier lado sin rodeos raros.
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
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
            <BaseEdge
                path={edgePath}
                style={{
                    stroke: selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.4)',
                    strokeWidth: selected ? 2.5 : 1.5,
                    filter: selected ? 'drop-shadow(0 0 6px hsl(var(--primary) / 0.45))' : 'none',
                    transition: 'stroke 180ms ease, stroke-width 180ms ease, filter 180ms ease',
                }}
            />

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
                        <div className="animate-in fade-in zoom-in-95 duration-150">
                            <Button
                                onClick={handleDelete}
                                variant="outline"
                                size="sm"
                                title="Eliminar conexión"
                                className="h-8 gap-2 rounded-md border-border/60 bg-background/80 backdrop-blur text-foreground shadow-sm hover:bg-background hover:border-border active:scale-[0.98] transition z-50"
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
