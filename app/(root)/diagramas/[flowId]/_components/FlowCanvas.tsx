'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useTheme } from 'next-themes';

import {
  ReactFlow,
  type Node,
  type Edge,
  type ReactFlowInstance,
  type NodeTypes,
  type OnConnect,
  Background,
  Controls,
  Panel,
  Position,
  OnNodeDrag,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';

import { toast } from 'sonner';
import { LayoutGrid, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { Action, PaletteItem } from '@/types/workflow-node';
import { CustomEdge } from './CustomEdge';
import { FlowNode, type FlowNodeData } from './FlowNode';
import { FlowAddNodeProvider, AddNodeFn } from './FlowAddNodeContext';
import { InlineAddNode } from './InlineAddNode';

// Misma cuadricula/comportamiento de carriles que Workflow, para que el
// lienzo se sienta identico. Ver WorkflowCanvas.tsx para el original.
const COL_W = 350;
const ROW_H = 160;
const NODE_W = 320;

function snapMultiple(v: number, step: number) {
  return Math.round(v / step) * step;
}

export interface FlowGraphNode {
  id: string;
  tipo: string;
  label: string;
  content: string;
  posX: number;
  posY: number;
}

export interface FlowGraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  sourceHandle: string;
  targetHandle: string;
}

export interface FlowCanvasHandle {
  getGraph: () => { nodes: FlowGraphNode[]; edges: FlowGraphEdge[] };
  createAtCenter: (action: Action) => void;
}

interface FlowCanvasProps {
  initialNodes: FlowGraphNode[];
  initialEdges: FlowGraphEdge[];
}

export const FlowCanvas = forwardRef<FlowCanvasHandle, FlowCanvasProps>(function FlowCanvas(
  { initialNodes: initialNodesDB, initialEdges: initialEdgesDB },
  ref,
) {
  const { resolvedTheme } = useTheme();
  const { screenToFlowPosition } = useReactFlow();

  const [mounted, setMounted] = useState(false);
  const lastEdgeTargetRef = useRef<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rfRef = useRef<ReactFlowInstance<Node<FlowNodeData>, Edge> | null>(null);

  const rawInitialNodes: Node<FlowNodeData>[] = useMemo(() => {
    return initialNodesDB.map((n, i) => {
      const hasPos = n.posX !== 0 || n.posY !== 0;
      const position = hasPos
        ? { x: snapMultiple(n.posX, COL_W), y: Math.max(0, snapMultiple(n.posY, ROW_H)) }
        : { x: i * COL_W, y: 0 };

      return {
        id: n.id,
        type: 'flowNode',
        position,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          tipo: n.tipo,
          label: n.label,
          content: n.content,
          totalNodes: initialNodesDB.length,
          onChangeContent: () => {},
          onDelete: () => {},
        },
      } satisfies Node<FlowNodeData>;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rawInitialEdges: Edge[] = useMemo(
    () =>
      initialEdgesDB.map((e) => ({
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        sourceHandle: e.sourceHandle || 'out',
        targetHandle: e.targetHandle || 'in',
        type: 'customEdge',
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(rawInitialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rawInitialEdges);

  useEffect(() => setMounted(true), []);

  const nodesRef = useRef<Node<FlowNodeData>[]>(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  const edgesRef = useRef<Edge[]>(edges);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  useEffect(() => {
    const sorted = [...initialNodesDB];
    lastEdgeTargetRef.current = sorted.length ? sorted[sorted.length - 1].id : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChangeContent = useCallback((nodeId: string, content: string) => {
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, content } } : n)));
  }, [setNodes]);

  const onDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, [setNodes, setEdges]);

  // Cada nodo necesita las funciones de arriba enganchadas (no existen todavia
  // cuando se arma rawInitialNodes). Se inyectan aqui, una vez.
  useEffect(() => {
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, onChangeContent, onDelete: onDeleteNode } })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';
  const nodeTypes: NodeTypes = useMemo(() => ({ flowNode: FlowNode as any }), []);
  const edgeTypes = useMemo(() => ({ customEdge: CustomEdge }), []);

  const handleAutoLayout = useCallback(() => {
    const current = nodesRef.current;
    const ordered = current
      .map((n) => ({ id: n.id, x: n.position.x }))
      .sort((a, b) => a.x - b.x);

    const next = new Map<string, { x: number; y: number }>();
    ordered.forEach((w, i) => next.set(w.id, { x: i * COL_W, y: 0 }));

    setNodes((nds) => nds.map((n) => (next.has(n.id) ? { ...n, position: next.get(n.id)! } : n)));
    toast.success('Diagrama ordenado. Recuerda darle a Guardar.');
  }, [setNodes]);

  const onNodeDragStop: OnNodeDrag = useCallback((_, node) => {
    const { id } = node;
    let x = node.position.x;
    let y = node.position.y;

    const others = nodesRef.current.filter((o) => o.id !== id);
    const myH = node.measured?.height ?? 200;

    if (others.length) {
      let nearest = others[0];
      let bestD = Infinity;
      for (const o of others) {
        const d = Math.hypot(o.position.x - x, o.position.y - y);
        if (d < bestD) { bestD = d; nearest = o; }
      }

      const dx = x - nearest.position.x;
      const dy = y - nearest.position.y;
      const h = nearest.measured?.height ?? 200;
      const w = nearest.measured?.width ?? NODE_W;
      const gap = COL_W - w;

      if (Math.abs(dx) >= Math.abs(dy)) {
        y = nearest.position.y;
        x = nearest.position.x + (dx >= 0 ? COL_W : -COL_W);
      } else {
        x = nearest.position.x;
        y = dy >= 0 ? nearest.position.y + h + gap : nearest.position.y - myH - gap;
      }
    }

    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, position: { x, y } } : n)));
  }, [setNodes]);

  const pickAvailableSourceHandle = useCallback((sourceId: string) => {
    const node = nodesRef.current.find((n) => n.id === sourceId);
    const tipo = node?.data?.tipo ?? '';
    const candidates = tipo === 'intention' ? ['yes', 'no'] : ['out'];
    for (const h of candidates) {
      const occupied = edgesRef.current.some((e) => e.source === sourceId && (e.sourceHandle ?? 'out') === h);
      if (!occupied) return h;
    }
    return null;
  }, []);

  const nextFreeX = useCallback(() => {
    const xs = nodesRef.current.map((n) => n.position.x);
    return xs.length ? Math.max(...xs) + COL_W : 0;
  }, []);

  const createFromItem = useCallback((item: PaletteItem) => {
    const id = `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const pos = { x: nextFreeX(), y: 0 };

    setNodes((nds) =>
      nds.concat({
        id,
        type: 'flowNode',
        position: pos,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          tipo: item.nodeTipo,
          label: item.label,
          content: '',
          totalNodes: nds.length + 1,
          onChangeContent,
          onDelete: onDeleteNode,
        },
      } satisfies Node<FlowNodeData>),
    );

    let connected = false;
    const sourceId = lastEdgeTargetRef.current;
    if (sourceId && sourceId !== id) {
      const sourceHandle = pickAvailableSourceHandle(sourceId);
      if (sourceHandle) {
        const edgeId = `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        setEdges((eds) => eds.concat({ id: edgeId, source: sourceId, target: id, sourceHandle, targetHandle: 'in', type: 'customEdge' }));
        connected = true;
      }
    }
    lastEdgeTargetRef.current = id;
    toast.success(connected ? 'Nodo creado y conectado' : 'Nodo creado');
  }, [nextFreeX, onChangeContent, onDeleteNode, pickAvailableSourceHandle, setEdges, setNodes]);

  const addNodeFromSource: AddNodeFn = useCallback(({ sourceId, sourceHandle, action }) => {
    const id = `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const pos = { x: nextFreeX(), y: 0 };

    setNodes((nds) =>
      nds.concat({
        id,
        type: 'flowNode',
        position: pos,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          tipo: action.type,
          label: action.label,
          content: '',
          totalNodes: nds.length + 1,
          onChangeContent,
          onDelete: onDeleteNode,
        },
      } satisfies Node<FlowNodeData>),
    );

    const edgeId = `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setEdges((eds) => eds.concat({ id: edgeId, source: sourceId, target: id, sourceHandle, targetHandle: 'in', type: 'customEdge' }));
    lastEdgeTargetRef.current = id;
    toast.success('Nodo creado y conectado');
  }, [nextFreeX, onChangeContent, onDeleteNode, setEdges, setNodes]);

  const onDragOver = useCallback((evt: React.DragEvent) => {
    evt.preventDefault();
    evt.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((evt: React.DragEvent) => {
    evt.preventDefault();
    const raw = evt.dataTransfer.getData('application/reactflow');
    if (!raw) return;
    try {
      const item: PaletteItem = JSON.parse(raw);
      createFromItem(item);
    } catch {
      // payload de arrastre invalido: se ignora
    }
  }, [createFromItem]);

  const createAtCenter = useCallback((action: Action) => {
    createFromItem({ type: 'customNode', label: action.label, nodeTipo: action.type });
  }, [createFromItem]);

  useImperativeHandle(ref, () => ({
    createAtCenter,
    getGraph: () => ({
      nodes: nodesRef.current.map((n) => ({
        id: n.id,
        tipo: n.data.tipo,
        label: n.data.label,
        content: n.data.content,
        posX: n.position.x,
        posY: n.position.y,
      })),
      edges: edgesRef.current.map((e) => ({
        id: e.id,
        sourceId: e.source,
        targetId: e.target,
        sourceHandle: e.sourceHandle || 'out',
        targetHandle: e.targetHandle || 'in',
      })),
    }),
  }), [createAtCenter]);

  const onConnect: OnConnect = useCallback((params) => {
    if (!params.source || !params.target) return;
    const sourceHandle = params.sourceHandle ?? 'out';
    const targetHandle = params.targetHandle ?? 'in';

    const exists = edgesRef.current.some((e) => e.source === params.source && e.sourceHandle === sourceHandle);
    if (exists) {
      toast.info('Ese punto de salida ya está ocupado.');
      return;
    }

    const id = `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setEdges((eds) => eds.concat({ id, source: params.source!, target: params.target!, sourceHandle, targetHandle, type: 'customEdge' }));
    lastEdgeTargetRef.current = params.target;
  }, [setEdges]);

  return (
    <FlowAddNodeProvider value={addNodeFromSource}>
      <div ref={wrapperRef} className="relative w-full h-full max-h-[93vh]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={(instance) => (rfRef.current = instance)}
          defaultEdgeOptions={{ type: 'customEdge' }}
          connectionLineStyle={{ stroke: 'hsl(var(--primary) / 0.65)', strokeWidth: 2.5 }}
          onNodeDragStop={onNodeDragStop}
          onDragOver={onDragOver}
          onDrop={onDrop}
          snapToGrid
          snapGrid={[COL_W, ROW_H]}
          fitView
          fitViewOptions={{ padding: 0.28 }}
          colorMode={isDark ? 'dark' : 'light'}
          minZoom={0.05}
        >
          <Background />
          <Controls fitViewOptions={{ padding: 0.28 }} />

          <Panel position="top-center">
            <Button onClick={handleAutoLayout} variant="outline" size="sm" className="h-8 gap-2 bg-background/80 shadow-sm backdrop-blur" title="Ordenar el diagrama en carriles horizontales">
              <LayoutGrid className="h-4 w-4" />
              <span className="text-xs font-medium">Ordenar</span>
            </Button>
          </Panel>
        </ReactFlow>

        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="pointer-events-auto flex flex-col items-center gap-3">
              <InlineAddNode
                totalNodes={0}
                side="bottom"
                onPickAction={(action) => createAtCenter(action)}
                trigger={
                  <button
                    type="button"
                    className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-all hover:scale-105 hover:bg-primary/90"
                    title="Agregar el primer paso"
                  >
                    <Plus className="h-7 w-7" strokeWidth={3} />
                  </button>
                }
              />
              <p className="text-sm font-medium text-muted-foreground">Agrega el primer paso</p>
            </div>
          </div>
        )}
      </div>
    </FlowAddNodeProvider>
  );
});
