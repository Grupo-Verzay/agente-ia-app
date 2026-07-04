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
  Panel,
  Position,
  ViewportPortal,
  OnNodeDrag,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';

import { toast } from 'sonner';
import { LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  createNodeFromCanvas,
  updateWorkflowNodePosition,
  createWorkflowEdge,
  deleteWorkflowEdge,
} from '@/actions/workflow-node-action';

import { CustomNodeData, PaletteItem, PropsWorkflowCanvas, Action } from '@/types/workflow-node';
import { CustomEdge, CustomNode } from '.';
import { WorkflowAddNodeProvider, AddNodeFn } from './WorkflowAddNodeContext';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// ── Cuadrícula con carriles (layout horizontal) ─────────────────────────────
const COL_W = 350; // ancho de cada carril / paso
const ROW_H = 200; // alto de cada fila (ramas apiladas)
const NODE_W = 320; // ancho aprox. de la tarjeta (para centrarla en el carril)
const LANE_PAD = (COL_W - NODE_W) / 2; // margen lateral dentro del carril
const HEADER_H = 52; // alto de la banda de encabezado (arriba de los nodos)

const isSeguim = (tipo?: string | null) => (tipo ?? '').toLowerCase().includes('seguimiento');

function snapMultiple(v: number, step: number) {
  return Math.round(v / step) * step;
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

    // Todos los nodos en una sola fila horizontal, cada uno en su columna,
    // en el orden del flujo. Así siempre queda uniforme y ninguno se monta.
    return sorted.map((n, i) => ({
      id: n.id,
      type: 'customNode',
      position: { x: i * COL_W, y: 0 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        nodeDB: n,
        workflowId,
        user,
        totalNodes,
        seguimientoNodes,
      },
    }));
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

  // El "último nodo" para encadenar es el final del flujo (mayor order),
  // así un nodo nuevo siempre se conecta al anterior aunque aún no haya edges.
  useEffect(() => {
    const sorted = [...nodesDB].sort((a, b) => a.order - b.order);
    lastEdgeTargetRef.current = sorted.length ? sorted[sorted.length - 1].id : null;
  }, [nodesDB]);

  const edgesRef = useRef<Edge[]>(initialEdges);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  const isDark = mounted && resolvedTheme === 'dark';
  const nodeTypes: NodeTypes = useMemo(() => ({ customNode: CustomNode }), []);
  const edgeTypes = useMemo(() => ({ customEdge: CustomEdge }), []);

  // Carriles (columnas) calculados a partir de la posición de los nodos.
  const lanes = useMemo(() => {
    const cols = new Map<number, { hasSeg: boolean }>();
    let maxRow = 0;

    for (const n of nodes) {
      const c = Math.max(0, Math.round(n.position.x / COL_W));
      const r = Math.max(0, Math.round(n.position.y / ROW_H));
      maxRow = Math.max(maxRow, r);
      const cur = cols.get(c) ?? { hasSeg: false };
      cur.hasSeg = cur.hasSeg || isSeguim(n.data?.nodeDB?.tipo);
      cols.set(c, cur);
    }

    const maxCol = cols.size ? Math.max(...Array.from(cols.keys())) : 0;
    const bandBottom = Math.max((maxRow + 1) * ROW_H + LANE_PAD, 900);

    let step = 0;
    const list: { col: number; label: string; hasSeg: boolean }[] = [];
    for (let c = 0; c <= maxCol; c++) {
      const hasSeg = cols.get(c)?.hasSeg ?? false;
      let label: string;
      if (hasSeg) {
        label = 'SEGUIMIENTOS';
      } else {
        step += 1;
        label = `PASO ${step}`;
      }
      list.push({ col: c, label, hasSeg });
    }

    return { list, bandBottom };
  }, [nodes]);

  // Botón "Ordenar": realinea todo el flujo en horizontal y guarda posiciones.
  const handleAutoLayout = useCallback(async () => {
    const current = nodesRef.current;
    const ordered = current
      .map((n) => ({ id: n.id, order: n.data?.nodeDB?.order ?? 0 }))
      .sort((a, b) => a.order - b.order);

    const next = new Map<string, { x: number; y: number }>();
    ordered.forEach((w, i) => next.set(w.id, { x: i * COL_W, y: 0 }));

    setNodes((nds) =>
      nds.map((n) => (next.has(n.id) ? { ...n, position: next.get(n.id)! } : n))
    );

    const toastId = toast.loading('Ordenando flujo...');
    try {
      await Promise.all(
        Array.from(next.entries()).map(([nodeId, p]) =>
          updateWorkflowNodePosition({ nodeId, posX: p.x, posY: p.y })
        )
      );
      toast.success('Flujo ordenado', { id: toastId });
    } catch (e) {
      toast.error(e?.message ?? 'No se pudo guardar el orden', { id: toastId });
    }
  }, [setNodes]);

  const pending = useRef<Record<string, number>>({});

  const onNodeDragStop: OnNodeDrag = useCallback(async (_, node) => {
    const { id, position } = node;

    if (pending.current[id]) window.clearTimeout(pending.current[id]);

    const t = window.setTimeout(async () => {
      try {
        const posX = clamp(Number(position.x.toFixed(2)), -100000, 100000);
        const posY = clamp(Number(position.y.toFixed(2)), 0, 100000);

        await updateWorkflowNodePosition({ nodeId: id, posX, posY });
      } catch (e) {
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
    async (item: PaletteItem, rawPos: { x: number; y: number }) => {
      const toastId = toast.loading('Creando nodo...');

      // Ajustamos la posición de creación a la cuadrícula de carriles.
      const pos = {
        x: snapMultiple(rawPos.x, COL_W),
        y: Math.max(0, snapMultiple(rawPos.y, ROW_H)),
      };

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
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
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

        // El nodo recién creado pasa a ser el final del flujo, para que el
        // siguiente que se cree se encadene automáticamente a este.
        lastEdgeTargetRef.current = nodeDB.id;

        toast.success(connected ? 'Nodo creado y conectado' : 'Nodo creado', { id: toastId });
      } catch (e) {
        toast.error(e?.message ?? 'Error creando nodo', { id: toastId });
      }
    },
    [workflowId, user, setNodes, setEdges, totalNodes, seguimientoNodes, pickAvailableSourceHandle]
  );

  // Crear un nodo desde el "+" de una salida concreta y conectarlo a ella.
  const addNodeFromSource: AddNodeFn = useCallback(
    async ({ sourceId, sourceHandle, action }) => {
      const toastId = toast.loading('Creando nodo...');

      try {
        const src = nodesRef.current.find((n) => n.id === sourceId);
        const basePos = src
          ? { x: src.position.x + COL_W, y: src.position.y }
          : { x: 0, y: 0 };

        const res = await createNodeFromCanvas({
          workflowId,
          tipo: action.type,
          message: '',
          posX: basePos.x,
          posY: basePos.y,
        });

        if (!res?.success || !res.data) {
          toast.error(res?.message ?? 'No se pudo crear el nodo', { id: toastId });
          return;
        }

        const nodeDB = res.data;

        setNodes((nds) =>
          nds.concat({
            id: nodeDB.id,
            type: 'customNode',
            position: { x: nodeDB.posX ?? basePos.x, y: nodeDB.posY ?? basePos.y },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            data: {
              nodeDB,
              workflowId,
              user,
              totalNodes: totalNodes + 1,
              seguimientoNodes,
            },
          } satisfies Node<CustomNodeData>)
        );

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
          toast.success('Nodo creado y conectado', { id: toastId });
        } else {
          toast.info(edgeRes.message || 'Nodo creado, pero no se pudo conectar', {
            id: toastId,
          });
        }
      } catch (e) {
        toast.error(e?.message ?? 'Error creando nodo', { id: toastId });
      }
    },
    [workflowId, user, setNodes, setEdges, totalNodes, seguimientoNodes]
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
      } catch (e) {
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
        } catch (e) {
          toast.error(e?.message ?? 'No se pudo eliminar la conexión');
        }
      }
    },
    [workflowId]
  );

  return (
    <WorkflowAddNodeProvider value={addNodeFromSource}>
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
        snapToGrid
        snapGrid={[COL_W, ROW_H]}
        fitView
        colorMode={isDark ? 'dark' : 'light'}
        minZoom={0.05}
      >
        <Background />
        <Controls />
        {/* <MiniMap /> */}

        {/* Carriles / columnas (PASO 1, PASO 2… y SEGUIMIENTOS) */}
        <ViewportPortal>
          <div style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
            {lanes.list.map((l) => (
              <div
                key={l.col}
                style={{
                  position: 'absolute',
                  left: l.col * COL_W - LANE_PAD,
                  top: -HEADER_H,
                  width: COL_W,
                  height: HEADER_H + lanes.bandBottom,
                }}
                className="border-r border-dashed border-border/40"
              >
                <div className="flex justify-center pt-2">
                  <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {l.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ViewportPortal>

        <Panel position="top-center">
          <Button
            onClick={handleAutoLayout}
            variant="outline"
            size="sm"
            className="h-8 gap-2 bg-background/80 shadow-sm backdrop-blur"
            title="Ordenar el flujo en carriles horizontales"
          >
            <LayoutGrid className="h-4 w-4" />
            <span className="text-xs font-medium">Ordenar</span>
          </Button>
        </Panel>
      </ReactFlow>
    </div>
    </WorkflowAddNodeProvider>
  );
}