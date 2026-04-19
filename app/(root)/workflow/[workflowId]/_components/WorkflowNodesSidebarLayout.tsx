'use client';

import { toast } from "sonner";
import { WorkflowSidebar } from "./WorkflowSidebar";
import { useWorkflowEditorShell } from "./WorkflowEditorShellProvider";

export function WorkflowNodesSidebarLayout() {
    const { totalNodes, seguimientoNodes, createNode } = useWorkflowEditorShell();

    return (
        <WorkflowSidebar
            totalNodes={totalNodes}
            seguimientoNodes={seguimientoNodes}
            onCreateNode={(action) => {
                const ok = createNode(action);
                if (!ok) {
                    toast.error("El canvas aún no está listo para crear nodos.", { id: "canvas-not-ready" });
                }
            }}
        />
    );
}