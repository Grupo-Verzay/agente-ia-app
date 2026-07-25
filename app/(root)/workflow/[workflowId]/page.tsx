import type { CSSProperties } from "react";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { themeClass } from "@/types/generic";
import "@xyflow/react/dist/style.css";

import { SidebarProvider } from "@/components/ui/sidebar";
import { ReactFlowProvider } from "@xyflow/react";

import { getNodeforUser, getWorkflowEdges } from "@/actions/workflow-node-action";
import { getWorkflowFeatureAccessMap } from "@/actions/workflow-feature-access-actions";
import { lockedFeatureKeys } from "@/lib/workflow-features";
import { isAdminOrReseller } from "@/lib/rbac";

import { WorkflowEditorShellProvider } from "./_components/WorkflowEditorShellProvider";
import { WorkflowNodesSidebarLayout } from "./_components/WorkflowNodesSidebarLayout";
import { WorkflowEditorClient } from "./_components";

const CustomWorkflow = async ({ params }: { params: { workflowId: string } }) => {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { workflowId } = params;

  const [nodes, edgesDB, featureAccess] = await Promise.all([
    getNodeforUser(workflowId),
    getWorkflowEdges(workflowId),
    getWorkflowFeatureAccessMap(),
  ]);

  // Piezas bloqueadas por plan para este dueño (los admin/reseller ven todo).
  const lockedFeatures = Array.from(
    lockedFeatureKeys(user.plan, featureAccess, isAdminOrReseller(user.role)),
  );

  const cookieStore = cookies();
  const defaultOpen = cookieStore.get("workflow_sidebar_state")?.value === "true";

  return (
    <div className="flex w-full h-full overflow-hidden">
      <WorkflowEditorShellProvider lockedFeatures={lockedFeatures}>
        <SidebarProvider
          defaultOpen={defaultOpen}
          style={{ '--sidebar-width': '20rem' } as CSSProperties}
        >
          <div className="relative w-full h-full overflow-hidden">
            <ReactFlowProvider>
              <WorkflowEditorClient
                nodesDB={nodes}
                edgesDB={edgesDB.data}
                workflowId={workflowId}
                user={user}
              />
            </ReactFlowProvider>
          </div>

          <WorkflowNodesSidebarLayout />
        </SidebarProvider>
      </WorkflowEditorShellProvider>
    </div>
  );
};

export default CustomWorkflow;
