'use client';

import { useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Save } from 'lucide-react';
import "@xyflow/react/dist/style.css";
import { ReactFlowProvider } from '@xyflow/react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';

import { saveFlowGraphAction } from '@/actions/flow-actions';
import { FlowCanvas, type FlowCanvasHandle, type FlowGraphNode, type FlowGraphEdge } from './FlowCanvas';
import { FlowSidebar } from './FlowSidebar';

interface FlowEditorClientProps {
  flowId: string;
  flowName: string;
  initialNodes: FlowGraphNode[];
  initialEdges: FlowGraphEdge[];
}

export function FlowEditorClient({ flowId, flowName, initialNodes, initialEdges }: FlowEditorClientProps) {
  const router = useRouter();
  const canvasRef = useRef<FlowCanvasHandle>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const graph = canvasRef.current?.getGraph();
    if (!graph) return;

    setSaving(true);
    const res = await saveFlowGraphAction(flowId, graph.nodes, graph.edges);
    setSaving(false);

    if (!res.success) {
      toast.error(res.message);
      return;
    }
    toast.success('Diagrama guardado.');
  };

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/diagramas')} title="Volver a Diagramas">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="truncate text-sm font-semibold">{flowName}</span>
        </div>
        <Button size="sm" className="h-8 gap-2" onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>

      <div className="relative flex w-full min-w-0 flex-1 overflow-hidden">
        <SidebarProvider className="min-w-0" style={{ '--sidebar-width': '20rem' } as CSSProperties}>
          <div className="relative w-full min-w-0 h-full overflow-hidden">
            <ReactFlowProvider>
              <FlowCanvas ref={canvasRef} initialNodes={initialNodes} initialEdges={initialEdges} />
            </ReactFlowProvider>
          </div>

          <FlowSidebar onCreateNode={(action) => canvasRef.current?.createAtCenter(action)} />
        </SidebarProvider>
      </div>
    </div>
  );
}
