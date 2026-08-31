import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getFlowAction } from "@/actions/flow-actions";
import { FlowEditorClient } from "./_components/FlowEditorClient";
import type { FlowGraphNode, FlowGraphEdge } from "./_components/FlowCanvas";

const DiagramaPage = async ({ params }: { params: { flowId: string } }) => {
  const user = await currentUser();
  if (!user) redirect("/login");

  const res = await getFlowAction(params.flowId);
  if (!res.success) notFound();

  const nodes = (Array.isArray(res.data.nodes) ? res.data.nodes : []) as FlowGraphNode[];
  const edges = (Array.isArray(res.data.edges) ? res.data.edges : []) as FlowGraphEdge[];

  return (
    <div className="flex h-full w-full min-w-0 overflow-hidden">
      <FlowEditorClient
        flowId={res.data.id}
        flowName={res.data.name}
        initialNodes={nodes}
        initialEdges={edges}
        puedeEditar={res.data.puedeEditar}
      />
    </div>
  );
};

export default DiagramaPage;
