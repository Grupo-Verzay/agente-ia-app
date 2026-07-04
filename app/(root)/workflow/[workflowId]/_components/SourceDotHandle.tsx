import { Handle, Position, useNodeConnections, useNodeId } from "@xyflow/react";
import { InlineAddNode } from "./InlineAddNode";

export const SourceDotHandle = (props: {
    id: string;
    topPct: number;
    label: string;
    active: boolean;
    connectableStart: boolean;
}) => {
    const { id, topPct, label, active, connectableStart } = props;

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

            {label ? (
                <div className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 whitespace-nowrap">
                    <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                        {label}
                    </span>
                </div>
            ) : null}

            {isFree && nodeId ? (
                <div className="absolute left-6 top-1/2 -translate-y-1/2">
                    <InlineAddNode sourceId={nodeId} sourceHandle={id} />
                </div>
            ) : null}
        </div>
    );
};
