import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { themeClass } from "@/types/generic";
import "@xyflow/react/dist/style.css";

import { SidebarProvider } from "@/components/ui/sidebar";
import { ReactFlowProvider } from "@xyflow/react";

import { getNodeforUser, getWorkflowEdges } from "@/actions/workflow-node-action";

import { WorkflowEditorShellProvider } from "./_components/WorkflowEditorShellProvider";
import { WorkflowNodesSidebarLayout } from "./_components/WorkflowNodesSidebarLayout";
import { WorkflowNodesSidebarTrigger } from "./_components/WorkflowNodesSidebarTrigger";
import { WorkflowEditorClient } from "./_components";

const CustomWorkflow = async ({ params }: { params: { workflowId: string } }) => {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { workflowId } = params;

  const [nodes, edgesDB] = await Promise.all([
    getNodeforUser(workflowId),
    getWorkflowEdges(workflowId),
  ]);

  const cookieStore = cookies();
  const defaultOpen = cookieStore.get("workflow_sidebar_state")?.value === "true";

  return (
    <div className="flex w-full h-full overflow-hidden">
      <WorkflowEditorShellProvider>
        <SidebarProvider defaultOpen={defaultOpen}>
          <div className="relative w-full h-full overflow-hidden">
            <div className="absolute right-0 top-0 z-50">
              <WorkflowNodesSidebarTrigger />
            </div>
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
