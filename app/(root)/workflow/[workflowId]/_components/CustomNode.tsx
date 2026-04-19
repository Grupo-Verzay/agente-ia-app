import { Handle, Position, useConnection } from "@xyflow/react";
import { NodeCard } from "./NodeCard";
import { CustomNodeData } from "@/types/workflow-node";
import { SourceDotHandle } from "./SourceDotHandle"; // o donde lo tengas

export function CustomNode({ data }: { data: CustomNodeData }) {
    const connection = useConnection();

    const isTarget =
        connection.inProgress && connection.fromNode?.id !== data.nodeDB.id;

    const isSourceActive =
        connection.inProgress && connection.fromNode?.id === data.nodeDB.id;

    const nodeType = (data.nodeDB.tipo ?? "").toLowerCase();
    const isIntention = nodeType === "intention";

    return (
        <div className="relative min-w-[320px] pb-8">
            <NodeCard
                nodes={data.nodeDB as any}
                workflowId={data.workflowId}
                user={data.user}
                targetHandle={
                    <Handle
                        id="in"
                        type="target"
                        position={Position.Top}
                        isConnectable={!connection.inProgress || isTarget}
                        isConnectableStart={false}
                        style={{ width: 16, height: 16, borderRadius: 9999 }}
                    />
                }
            />

            {isIntention ? (
                <>
                    <SourceDotHandle
                        id="yes"
                        label="Sí"
                        leftPct={30}
                        active={!connection.inProgress || isSourceActive}
                        connectableStart={!connection.inProgress}
                    />
                    <SourceDotHandle
                        id="no"
                        label="No"
                        leftPct={70}
                        active={!connection.inProgress || isSourceActive}
                        connectableStart={!connection.inProgress}
                    />
                </>
            ) : (
                <SourceDotHandle
                    id="out"
                    label=""
                    leftPct={50}
                    active={!connection.inProgress || isSourceActive}
                    connectableStart={!connection.inProgress}
                />
            )}
        </div>
    );
}
