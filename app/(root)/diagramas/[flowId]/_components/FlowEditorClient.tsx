'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Save, Plus } from 'lucide-react';
import "@xyflow/react/dist/style.css";
import { ReactFlowProvider } from '@xyflow/react';
import { Button } from '@/components/ui/button';

import { saveFlowGraphAction } from '@/actions/flow-actions';
import { FlowCanvas, type FlowCanvasHandle, type FlowGraphNode, type FlowGraphEdge } from './FlowCanvas';
import { InlineAddNode } from './InlineAddNode';

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
    <div className="relative h-full w-full min-w-0 overflow-hidden">
      <ReactFlowProvider>
        <FlowCanvas ref={canvasRef} initialNodes={initialNodes} initialEdges={initialEdges} />
      </ReactFlowProvider>

      <div className="pointer-events-auto absolute left-3 top-3 z-30 flex items-center gap-1.5 rounded-full border border-border bg-background/95 py-1 pl-1.5 pr-3 shadow-md backdrop-blur">
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => router.push('/diagramas')} title="Volver a Diagramas">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="max-w-[180px] truncate text-sm font-semibold">{flowName}</span>
      </div>

      <div className="absolute right-3 top-3 z-30 flex items-center gap-2">
        <InlineAddNode
          totalNodes={initialNodes.length}
          side="left"
          onPickAction={(action) => canvasRef.current?.createAtCenter(action)}
          trigger={
            <Button size="icon" className="h-9 w-9 rounded-full shadow-md" title="Agregar nodo">
              <Plus className="h-5 w-5" />
            </Button>
          }
        />
        <Button size="sm" className="h-9 gap-2 rounded-full shadow-md" onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>
    </div>
  );
}
