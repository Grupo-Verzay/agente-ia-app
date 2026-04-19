'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from 'next-themes';

import {
  ReactFlow,
  type Node,
  type Edge,
  type ReactFlowInstance,
  type NodeTypes,
  type OnConnect,
  type OnEdgesDelete,
  Background,
  Controls,
  MiniMap,
  OnNodeDrag,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';

import { toast } from 'sonner';
import {
  createNodeFromCanvas,
  updateWorkflowNodePosition,
  createWorkflowEdge,
  deleteWorkflowEdge,
} from '@/actions/workflow-node-action';

import { CustomNodeData, PaletteItem, PropsWorkflowCanvas, Action } from '@/types/workflow-node';
import { CustomEdge, CustomNode } from '.';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function WorkflowCanvas({
  nodesDB,
  workflowId,
  user,
  edgesDB,
  registerCreateNode,
}: PropsWorkflowCanvas) {
  const { resolvedTheme } = useTheme();
  const { screenToFlowPosition } = useReactFlow();

  const [mounted, setMounted] = useState(false);
  const lastEdgeTargetRef = useRef<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rfRef = useRef<ReactFlowInstance<Node<CustomNodeData>, Edge> | null>(null);

  const totalNodes = useMemo(() => nodesDB.length, [nodesDB]);
  const seguimientoNodes = useMemo(
    () => nodesDB.filter((n) => (n.tipo ?? '').toLowerCase().includes('seguimiento')).length,
    [nodesDB]
  );

  const initialNodes: Node<CustomNodeData>[] = useMemo(() => {
    const sorted = [...nodesDB].sort((a, b) => a.order - b.order);

    return sorted.map((n, idx) => {
      const x = n.posX ?? 0;
      const y = n.posY ?? 0;
      const needsAuto = x === 0 && y === 0 && sorted.length > 1;

      return {
        id: n.id,
        type: 'customNode',
        position: needsAuto ? { x: 80, y: 80 + idx * 140 } : { x, y },
        data: {
          nodeDB: n,
          workflowId,
          user,
          totalNodes,
          seguimientoNodes,
        },
      };
    });
  }, [nodesDB, workflowId, user, totalNodes, seguimientoNodes]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);

  useEffect(() => setMounted(true), []);

  const nodesRef = useRef<Node<CustomNodeData>[]>(initialNodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  const initialEdges: Edge[] = useMemo(() => {
    if (!edgesDB) return [];
    return edgesDB.map((e) => ({
      id: e.id,
      source: e.sourceId,
      target: e.targetId,
      sourceHandle: e.sourceHandle ?? 'out',
      targetHandle: e.targetHandle ?? 'in',
      type: 'customEdge',
    }));
  }, [edgesDB]);

  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  // inicializa “último target” al cargar (si ya hay edges en DB)
  useEffect(() => {
    const last = initialEdges[initialEdges.length - 1];
    lastEdgeTargetRef.current = last?.target ?? null;
  }, [initialEdges]);

  const edgesRef = useRef<Edge[]>(initialEdges);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  const isDark = mounted && resolvedTheme === 'dark';
  const nodeTypes: NodeTypes = useMemo(() => ({ customNode: CustomNode }), []);
  const edgeTypes = useMemo(() => ({ customEdge: CustomEdge }), []);

  const pending = useRef<Record<string, number>>({});

  const onNodeDragStop: OnNodeDrag = useCallback(async (_, node) => {
    const { id, position } = node;

    if (pending.current[id]) window.clearTimeout(pending.current[id]);

    const t = window.setTimeout(async () => {
      try {
        const posX = clamp(Number(position.x.toFixed(2)), -100000, 100000);
        const posY = clamp(Number(position.y.toFixed(2)), -100000, 100000);

        await updateWorkflowNodePosition({ nodeId: id, posX, posY });
      } catch (e: any) {
        toast.error(e?.message ?? 'No se pudo guardar la posición del nodo');
      }
      delete pending.current[id];
    }, 350);

    pending.current[id] = t;
  }, []);

  // elige un sourceHandle libre (intention: yes/no, otros: out)
  const pickAvailableSourceHandle = useCallback((sourceId: string) => {
    const node = nodesRef.current.find((n) => n.id === sourceId);
    const tipo = (node?.data?.nodeDB?.tipo ?? '').toLowerCase();

    const candidates = tipo === 'intention' ? ['yes', 'no'] : ['out'];

    for (const h of candidates) {
      const occupied = edgesRef.current.some(
        (e) => e.source === sourceId && (e.sourceHandle ?? 'out') === h
      );
      if (!occupied) return h;
    }

    return null;
  }, []);

  // FUNCIÓN ÚNICA DE CREACIÓN (la misma que usa drop y click)
  const createFromItem = useCallback(
    async (item: PaletteItem, pos: { x: number; y: number }) => {
      const toastId = toast.loading('Creando nodo...');

      try {
        const res = await createNodeFromCanvas({
          workflowId,
          tipo: item.nodeTipo,
          message: '',
          posX: pos.x,
          posY: pos.y,
        });

        if (!res?.success) {
          toast.error(res?.message ?? 'No se pudo crear el nodo', { id: toastId });
          return;
        }

        const nodeDB = res.data;
        if (!nodeDB) {
          toast.error('Ups! error al crear el nodo.', { id: toastId });
          return;
        }

        setNodes((nds) =>
          nds.concat({
            id: nodeDB.id,
            type: 'customNode',
            position: { x: nodeDB.posX ?? pos.x, y: nodeDB.posY ?? pos.y },
            data: {
              nodeDB,
              workflowId,
              user,
              totalNodes: totalNodes + 1,
              seguimientoNodes,
            },
          } satisfies Node<CustomNodeData>)
        );

        // Auto-connect al último edge conectado
        let connected = false;
        const sourceId = lastEdgeTargetRef.current;

        if (sourceId && sourceId !== nodeDB.id) {
          const sourceHandle = pickAvailableSourceHandle(sourceId);

          if (!sourceHandle) {
            toast.info('La salida del último nodo está ocupada. No se conectó automáticamente.');
          } else {
            const edgeRes = await createWorkflowEdge({
              workflowId,
              sourceId,
              targetId: nodeDB.id,
              sourceHandle,
              targetHandle: 'in',
            });

            if (edgeRes.success && edgeRes.edge) {
              setEdges((eds) =>
                eds.concat({
                  id: edgeRes.edge.id,
                  source: edgeRes.edge.sourceId,
                  target: edgeRes.edge.targetId,
                  sourceHandle: edgeRes.edge.sourceHandle ?? 'out',
                  targetHandle: edgeRes.edge.targetHandle ?? 'in',
                  type: 'customEdge',
                })
              );

              lastEdgeTargetRef.current = nodeDB.id;
              connected = true;
            } else {
              toast.info(edgeRes.message || 'No se pudo conectar automáticamente.');
            }
          }
        }

        toast.success(connected ? 'Nodo creado y conectado' : 'Nodo creado', { id: toastId });
      } catch (e: any) {
        toast.error(e?.message ?? 'Error creando nodo', { id: toastId });
      }
    },
    [workflowId, user, setNodes, setEdges, totalNodes, seguimientoNodes, pickAvailableSourceHandle]
  );

  // Drag over
  const onDragOver = useCallback((evt: React.DragEvent) => {
    evt.preventDefault();
    evt.dataTransfer.dropEffect = 'move';
  }, []);

  // Drop -> usa la misma función
  const onDrop = useCallback(
    async (evt: React.DragEvent) => {
      evt.preventDefault();

      const raw = evt.dataTransfer.getData('application/reactflow');
      if (!raw) return;

      let item: PaletteItem;
      try {
        item = JSON.parse(raw);
      } catch {
        return;
      }

      const pos = screenToFlowPosition({ x: evt.clientX, y: evt.clientY });
      await createFromItem(item, pos);
    },
    [screenToFlowPosition, createFromItem]
  );

  // CLICK desde sidebar (reusa createFromItem)
  useEffect(() => {
    if (!registerCreateNode) return;

    registerCreateNode(async (action: Action) => {
      const el = wrapperRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const pos = screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });

      const item: PaletteItem = {
        type: 'customNode',
        label: action.label,
        nodeTipo: action.type,
      };

      await createFromItem(item, pos);
    });
  }, [registerCreateNode, screenToFlowPosition, createFromItem]);

  // conectar edges
  const onConnect: OnConnect = useCallback(
    async (params) => {
      if (!params.source || !params.target) return;

      const sourceHandle = params.sourceHandle ?? 'out';
      const targetHandle = params.targetHandle ?? 'in';

      const exists = edges.some(
        (e) => e.source === params.source && e.sourceHandle === sourceHandle
      );
      if (exists) {
        toast.info('Ese punto de salida ya está ocupado.');
        return;
      }

      try {
        const res = await createWorkflowEdge({
          workflowId,
          sourceId: params.source,
          targetId: params.target,
          sourceHandle,
          targetHandle,
        });

        if (!res.success || !res.edge) {
          toast.info(res.message || 'No se pudo crear la conexión');
          return;
        }

        const newEdge: Edge = {
          id: res.edge.id,
          source: res.edge.sourceId,
          target: res.edge.targetId,
          sourceHandle: res.edge.sourceHandle ?? 'out',
          targetHandle: res.edge.targetHandle ?? 'in',
          type: 'customEdge',
        };

        setEdges((eds) => [...eds, newEdge]);

        // actualizar “último target conectado”
        lastEdgeTargetRef.current = res.edge.targetId;
      } catch (e: any) {
        toast.error(e?.message ?? 'No se pudo crear la conexión');
      }
    },
    [workflowId, edges, setEdges]
  );

  const onEdgesDelete: OnEdgesDelete = useCallback(
    async (deleted) => {
      // si borran el último, lo limpiamos
      if (deleted.some((e) => e.target === lastEdgeTargetRef.current)) {
        lastEdgeTargetRef.current = null;
      }

      for (const edge of deleted) {
        try {
          const res = await deleteWorkflowEdge({ workflowId, edgeId: edge.id });
          toast.success(res.message || 'Relación eliminada.');
        } catch (e: any) {
          toast.error(e?.message ?? 'No se pudo eliminar la conexión');
        }
      }
    },
    [workflowId]
  );

  return (
    <div ref={wrapperRef} className="w-full h-full max-h-[93vh]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onEdgesChange={onEdgesChange}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onInit={(instance) => (rfRef.current = instance)}
        defaultEdgeOptions={{ type: 'customEdge' }}
        connectionLineStyle={{
          stroke: 'hsl(var(--primary) / 0.65)',
          strokeWidth: 2.5,
        }}
        onNodeDragStop={onNodeDragStop}
        onDragOver={onDragOver}
        onDrop={onDrop}
        fitView
        colorMode={isDark ? 'dark' : 'light'}
        minZoom={0.05}
      >
        <Background />
        <Controls />
        {/* <MiniMap /> */}
      </ReactFlow>
    </div>
  );
}