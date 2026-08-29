import { Handle, Position, useNodeConnections, useNodeId } from "@xyflow/react";
import { InlineAddNode } from "./InlineAddNode";

export const SourceDotHandle = (props: {
    id: string;
    topPct: number;
    label: string;
    active: boolean;
    connectableStart: boolean;
    totalNodes: number;
    seguimientoNodes: number;
}) => {
    const { id, topPct, label, active, connectableStart, totalNodes, seguimientoNodes } = props;

    const nodeId = useNodeId();
    const connections = useNodeConnections({ handleType: "source", handleId: id });
    const isFree = connections.length === 0;

    return (
        <div
            className="absolute right-0 z-20"
            style={{ top: `${topPct}%`, transform: "translate(50%, -50%)" }}
        >
            <Handle
                id={id}
                type="source"
                position={Position.Right}
                isConnectable={connectableStart}
                isConnectableStart={connectableStart}
                style={{
                    position: "relative",
                    top: "auto",
                    left: "auto",
                    right: "auto",
                    bottom: "auto",
                    transform: "none",
                    width: 16,
                    height: 16,
                    border: "2px solid",
                    borderColor: active
                        ? "hsl(var(--primary) / 0.35)"
                        : "hsl(var(--border))",
                    background: active
                        ? "hsl(var(--primary))"
                        : "hsl(var(--muted-foreground) / 0.55)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                    cursor: connectableStart ? "crosshair" : "default",
                }}
            />

            {/* La etiqueta va FUERA de la tarjeta, a la derecha del punto, junto al
                boton de agregar. Antes se dibujaba hacia adentro (right-6): con
                "Si" y "No" cabia en el margen, pero el nodo de menu pone
                "1) Ventas" y se montaba encima de los campos.

                Se recorta a un ancho fijo para que los botones "+" de todas las
                ramas queden alineados en la misma columna; la etiqueta completa
                sigue disponible al pasar el raton.

                Sin etiqueta -la salida normal de casi todos los nodos- el boton
                se queda exactamente donde estaba. */}
            <div
                className={`absolute top-1/2 flex -translate-y-1/2 items-center gap-2 ${label ? "left-6" : "left-10"}`}
            >
                {label ? (
                    <span
                        title={label}
                        className="pointer-events-none max-w-[7.5rem] truncate text-[11px] font-medium text-zinc-600 dark:text-zinc-300"
                    >
                        {label}
                    </span>
                ) : null}

                {isFree && nodeId ? (
                    <InlineAddNode
                        sourceId={nodeId}
                        sourceHandle={id}
                        totalNodes={totalNodes}
                        seguimientoNodes={seguimientoNodes}
                    />
                ) : null}
            </div>
        </div>
    );
};
