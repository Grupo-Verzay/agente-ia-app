import { Handle, Position, useConnection } from "@xyflow/react";
import { NodeCard } from "./NodeCard";
import { CustomNodeData } from "@/types/workflow-node";
import { SourceDotHandle } from "./SourceDotHandle"; // o donde lo tengas
import { menuOptionHandle, parseMenuOptions } from "@/lib/workflow-menu";

export function CustomNode({ data }: { data: CustomNodeData }) {
    const connection = useConnection();

    const isTarget =
        connection.inProgress && connection.fromNode?.id !== data.nodeDB.id;

    const isSourceActive =
        connection.inProgress && connection.fromNode?.id === data.nodeDB.id;

    const nodeType = (data.nodeDB.tipo ?? "").toLowerCase();
    const isIntention = nodeType === "intention";
    const isMenu = nodeType === "menu";

    // Un conector por opcion, mas el de rendicion. Se reparten a lo alto del
    // nodo dejando aire arriba y abajo; con una sola opcion queda centrada.
    const opcionesMenu = isMenu
        ? parseMenuOptions((data.nodeDB as { menuOptions?: string | null }).menuOptions)
        : [];
    const totalConectores = opcionesMenu.length + 1;
    const posicionConector = (indice: number) =>
        totalConectores === 1 ? 50 : 18 + (indice * 64) / (totalConectores - 1);

    return (
        <div className="relative min-w-[320px]">
            <NodeCard
                nodes={data.nodeDB}
                workflowId={data.workflowId}
                user={data.user}
                targetHandle={
                    <Handle
                        id="in"
                        type="target"
                        position={Position.Left}
                        isConnectable={!connection.inProgress || isTarget}
                        isConnectableStart={false}
                        style={{ width: 16, height: 16, borderRadius: 9999 }}
                    />
                }
            />

            {isMenu ? (
                <>
                    {opcionesMenu.map((opcion, i) => (
                        <SourceDotHandle
                            key={menuOptionHandle(i + 1)}
                            id={menuOptionHandle(i + 1)}
                            label={`${i + 1}) ${opcion}`}
                            topPct={posicionConector(i)}
                            active={!connection.inProgress || isSourceActive}
                            connectableStart={!connection.inProgress}
                            totalNodes={data.totalNodes}
                            seguimientoNodes={data.seguimientoNodes}
                        />
                    ))}
                    {/* La rama de rendicion: por aqui sale cuando el cliente no
                        acierta ninguna opcion despues de varios intentos. Es
                        donde se suele poner "te paso con un asesor". */}
                    <SourceDotHandle
                        id="no"
                        label="No entendió"
                        topPct={posicionConector(opcionesMenu.length)}
                        active={!connection.inProgress || isSourceActive}
                        connectableStart={!connection.inProgress}
                        totalNodes={data.totalNodes}
                        seguimientoNodes={data.seguimientoNodes}
                    />
                </>
            ) : isIntention ? (
                <>
                    <SourceDotHandle
                        id="yes"
                        label="Sí"
                        topPct={38}
                        active={!connection.inProgress || isSourceActive}
                        connectableStart={!connection.inProgress}
                        totalNodes={data.totalNodes}
                        seguimientoNodes={data.seguimientoNodes}
                    />
                    <SourceDotHandle
                        id="no"
                        label="No"
                        topPct={62}
                        active={!connection.inProgress || isSourceActive}
                        connectableStart={!connection.inProgress}
                        totalNodes={data.totalNodes}
                        seguimientoNodes={data.seguimientoNodes}
                    />
                </>
            ) : (
                <SourceDotHandle
                    id="out"
                    label=""
                    topPct={50}
                    active={!connection.inProgress || isSourceActive}
                    connectableStart={!connection.inProgress}
                    totalNodes={data.totalNodes}
                    seguimientoNodes={data.seguimientoNodes}
                />
            )}
        </div>
    );
}
