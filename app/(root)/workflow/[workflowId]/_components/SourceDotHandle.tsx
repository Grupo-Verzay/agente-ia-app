import { Handle, Position } from "@xyflow/react";

export const SourceDotHandle = (props: {
    id: string;
    leftPct: number;
    label: string;
    active: boolean;
    connectableStart: boolean;
}) => {
    const { id, leftPct, label, active, connectableStart } = props;

    return (
        <div
            className="absolute z-20"
            style={{ left: `${leftPct}%`, transform: "translateX(-50%)" }}
        >
            <Handle
                id={id}
                type="source"
                position={Position.Bottom}
                isConnectable={connectableStart}
                isConnectableStart={connectableStart}
                style={{
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
                <div className="pointer-events-none mb-1 mt-1 text-center">
                    <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                        {label}
                    </span>
                </div>
            ) : null}
        </div>
    );
};
