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
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';

import { toast } from 'sonner';
import { LayoutGrid, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { PaletteItem } from '@/types/workflow-node';
import type { DiagramaAction } from './diagrama-node-types';
import { CustomEdge } from './CustomEdge';
import { FlowNode, type FlowNodeData } from './FlowNode';
import { FlowAddNodeProvider, AddNodeFn } from './FlowAddNodeContext';
import { InlineAddNode } from './InlineAddNode';

// Separacion de referencia entre dos nodos medianos, de borde a borde de la
// caja anterior a la siguiente. Solo se usa para repartir de entrada nodos
// que nunca se han movido; el hueco de verdad lo pone AIRE_X, que se mide
// contra el ancho real de cada nodo. Es el mismo valor que ANCHO_DE_CARRIL
// en actions/flow-actions.ts: si aqui se cambia, alla tambien.
const COL_W = 132;
const SNAP = 10;

// Mover el diagrama es libre: solo se ajusta a una cuadricula fina para que
// las cosas queden alineadas sin pelear con el mouse.
function snapMultiple(v: number, step: number) {
  return Math.round(v / step) * step;
}

// Cuanto mide cada nodo en pantalla. Tiene que ir de la mano con SIZE_TOKENS
// y WIDE_TOKENS de FlowNode.tsx: es lo que se usa para saber si dos nodos se
// estan tocando.
const ANCHO: Record<string, number> = { sm: 92, md: 116, lg: 148 };
const ANCHO_DECISION: Record<string, number> = { sm: 152, md: 196, lg: 244 };
const ALTO: Record<string, number> = { sm: 86, md: 104, lg: 126 };

// El hueco que queda entre dos nodos, de borde a borde. Se mide contra el
// ancho real de cada uno, asi que el hueco se ve igual entre dos nodos
// medianos que al lado de una Decision, que es casi el doble de ancha.
//
// Ojo: NO es el hueco que se ve. La caja de un nodo mediano mide 116 px
// porque debajo le tiene que caber el nombre, pero el cuadro que se ve es de
// 58; entre los dos cuadros quedan siempre 58 px mas que este numero. Con 16
// se ven 74. Por debajo de 0 los nombres empezarian a montarse unos con
// otros, asi que ese es el piso mientras el nombre siga yendo encima del
// cuadro y no dentro.
const AIRE_X = 16;
// A lo alto vale el mismo numero, para que el diagrama respire igual en los
// dos sentidos. Aqui el hueco que se ve son unos 46 px mas que este numero,
// pero a diferencia de los lados casi todo ese sobrante esta ocupado: el
// texto que se asoma bajo el nodo de arriba y el nombre del de abajo. Por
// eso el piso practico son unos 8: en 0 el texto de uno tocaria el nombre
// del otro.
const AIRE_Y = 16;

// Alto del carril: los nodos no flotan a cualquier altura, caen siempre en
// una de estas franjas, para que las filas de un diagrama queden alineadas
// entre si sin tener que cuadrarlas a mano. Va calculado sobre el nodo
// mediano, que es el que sale por defecto (104 de alto + AIRE_Y). Dos nodos
// grandes seguidos no le caben justos, asi que a esos `separar` los aparta un
// poco mas y se salen del carril; es el unico caso.
const CARRIL_Y = 120;

// A que franja pertenece una altura. `hacia` fuerza la de arriba o la de
// abajo cuando lo que se busca es escaparse de otro nodo y redondear al mas
// cercano lo devolveria encima.
function alCarril(y: number, hacia: 'cerca' | 'arriba' | 'abajo' = 'cerca') {
  const n = y / CARRIL_Y;
  const franja = hacia === 'arriba' ? Math.floor(n) : hacia === 'abajo' ? Math.ceil(n) : Math.round(n);
  return franja * CARRIL_Y;
}

// Cuantos carriles se desvia el nodo que cuelga de cada salida. Decision
// saca tres y se leen de arriba abajo: el que cuelga del Si sube un carril,
// el de Variante sigue derecho -su linea queda recta- y el del No baja uno.
// Cualquier otra salida no desvia nada.
const CARRIL_DE_SALIDA: Record<string, number> = { yes: -1, variante: 0, no: 1, out: 0 };

function anchoDe(n: Node<FlowNodeData>) {
  const size = (n.data?.size ?? 'md') as string;
  return n.data?.tipo === 'intention' ? ANCHO_DECISION[size] : ANCHO[size];
}

function altoDe(n: Node<FlowNodeData>) {
  return ALTO[(n.data?.size ?? 'md') as string];
}

/**
 * Corre el nodo lo justo para que no quede pegado a ninguno de los otros.
 *
 * El diagrama se mueve a gusto, pero dos nodos encimados no se leen: al
 * soltar uno donde ya hay otro se aparta por el lado que menos lo desvie de
 * donde lo dejo el mouse. Se repite unas cuantas veces porque apartarlo de
 * uno puede acercarlo a un tercero.
 */
function separar(
  movido: Node<FlowNodeData>,
  otros: Node<FlowNodeData>[],
  desde: { x: number; y: number },
): { x: number; y: number } {
  const anchoA = anchoDe(movido);
  const altoA = altoDe(movido);
  let { x, y } = desde;

  for (let vuelta = 0; vuelta < 12; vuelta++) {
    const choque = otros.find((o) => {
      const anchoB = anchoDe(o);
      const altoB = altoDe(o);
      // Cada nodo reclama su tamaño mas el aire de rodearlo. Se cuenta una
      // sola vez y no una por nodo, para que la holgura sea la misma se
      // mueva hacia donde se mueva.
      return (
        x < o.position.x + anchoB + AIRE_X && o.position.x < x + anchoA + AIRE_X &&
        y < o.position.y + altoB + AIRE_Y && o.position.y < y + altoA + AIRE_Y
      );
    });
    if (!choque) break;

    // Las cuatro salidas posibles; se toma la que menos lo desvie de donde
    // lo dejo el mouse.
    const salidas = [
      { x: choque.position.x - anchoA - AIRE_X, y },
      { x: choque.position.x + anchoDe(choque) + AIRE_X, y },
      { x, y: alCarril(choque.position.y - altoA - AIRE_Y, 'arriba') },
      { x, y: alCarril(choque.position.y + altoDe(choque) + AIRE_Y, 'abajo') },
    ];
    const mejor = salidas.reduce((a, b) =>
      Math.hypot(a.x - desde.x, a.y - desde.y) <= Math.hypot(b.x - desde.x, b.y - desde.y) ? a : b,
    );
    x = mejor.x;
    y = mejor.y;
  }

  return { x: snapMultiple(x, SNAP), y: snapMultiple(y, SNAP) };
}

export interface FlowGraphNode {
  id: string;
  tipo: string;
  label: string;
  content: string;
  posX: number;
  posY: number;
  size?: 'sm' | 'md' | 'lg';
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
  createAtCenter: (action: DiagramaAction) => void;
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
      // Se respeta la posicion guardada tal cual -antes se redondeaba a la
      // cuadricula gruesa y al recargar los nodos saltaban de sitio-.
      const position = hasPos
        ? { x: snapMultiple(n.posX, SNAP), y: snapMultiple(n.posY, SNAP) }
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
          size: n.size ?? 'md',
          totalNodes: initialNodesDB.length,
          onChangeLabel: () => {},
          onChangeContent: () => {},
          onChangeSize: () => {},
          onDuplicate: () => {},
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

  const onChangeLabel = useCallback((nodeId: string, label: string) => {
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, label } } : n)));
  }, [setNodes]);

  const onChangeContent = useCallback((nodeId: string, content: string) => {
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, content } } : n)));
  }, [setNodes]);

  const onChangeSize = useCallback((nodeId: string, size: 'sm' | 'md' | 'lg') => {
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, size } } : n)));
  }, [setNodes]);

  // Duplicar: la copia sale justo debajo del original -es donde se espera
  // ver algo que se acaba de copiar- y, si ahi ya hay alguien, `separar` la
  // corre a la primera posicion libre. Sale sin conexiones: es una copia del
  // paso, no del sitio que ocupaba en el proceso.
  const onDuplicateNode = useCallback((nodeId: string) => {
    setNodes((nds) => {
      const original = nds.find((n) => n.id === nodeId);
      if (!original) return nds;

      const id = `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const copia: Node<FlowNodeData> = {
        ...original,
        id,
        selected: false,
        dragging: false,
        position: { x: original.position.x, y: alCarril(original.position.y + altoDe(original) + AIRE_Y, 'abajo') },
        data: { ...original.data },
      };
      copia.position = separar(copia, nds, copia.position);
      return nds.concat(copia).map((n) => ({ ...n, data: { ...n.data, totalNodes: nds.length + 1 } }));
    });
    toast.success('Nodo duplicado');
  }, [setNodes]);

  const onDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, [setNodes, setEdges]);

  // Cada nodo necesita las funciones de arriba enganchadas (no existen todavia
  // cuando se arma rawInitialNodes). Se inyectan aqui, una vez.
  useEffect(() => {
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, onChangeLabel, onChangeContent, onChangeSize, onDuplicate: onDuplicateNode, onDelete: onDeleteNode } })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';
  const nodeTypes: NodeTypes = useMemo(() => ({ flowNode: FlowNode as any }), []);
  const edgeTypes = useMemo(() => ({ customEdge: CustomEdge }), []);

  /**
   * Reparte el diagrama en columnas y filas siguiendo las lineas.
   *
   * La columna sale de lo lejos que este el nodo del arranque; cuando dos
   * caminos vuelven a juntarse gana el mas largo, para que el nodo comun no
   * se monte con nadie.
   *
   * La fila la manda la salida de la que cuelga cada nodo: el del Si va un
   * carril arriba de quien lo cuelga, el de Variante a la misma altura -su
   * linea queda recta- y el del No uno abajo. Cuando dos ramas se pisan, la
   * de mas abajo se corre entera hacia abajo lo justo.
   */
  const handleAutoLayout = useCallback(() => {
    const current = nodesRef.current;
    if (!current.length) return;

    // Salidas de cada nodo en el orden en que se leen -Si, Variante, No-, y no
    // en el orden en que se dibujaron las lineas.
    const ORDEN_SALIDA: Record<string, number> = { yes: 0, variante: 1, no: 2, out: 0 };
    const hijos = new Map<string, string[]>();
    const porSalida = new Map<string, string>();
    const conEntrada = new Set<string>();
    Array.from(edgesRef.current)
      .sort((a, b) => (ORDEN_SALIDA[a.sourceHandle ?? 'out'] ?? 0) - (ORDEN_SALIDA[b.sourceHandle ?? 'out'] ?? 0))
      .forEach((e) => {
        if (!hijos.has(e.source)) hijos.set(e.source, []);
        hijos.get(e.source)!.push(e.target);
        porSalida.set(`${e.source}>${e.target}`, e.sourceHandle ?? 'out');
        conEntrada.add(e.target);
      });

    const raices = current
      .filter((n) => !conEntrada.has(n.id))
      .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
      .map((n) => n.id);

    // --- columna: la distancia mas larga hasta el arranque ---
    const columna = new Map<string, number>();
    const enCamino = new Set<string>();
    const medirColumna = (id: string, col: number) => {
      if (enCamino.has(id)) return; // bucle cerrado: no se sigue
      if ((columna.get(id) ?? -1) >= col) return;
      columna.set(id, col);
      enCamino.add(id);
      (hijos.get(id) ?? []).forEach((h) => medirColumna(h, col + 1));
      enCamino.delete(id);
    };
    raices.forEach((id) => medirColumna(id, 0));
    current.forEach((n) => { if (!columna.has(n.id)) medirColumna(n.id, 0); });

    // --- arbol: cada nodo cuelga del primer camino que lo alcanza ---
    const hijosArbol = new Map<string, string[]>();
    const salidaDe = new Map<string, string>();
    const enArbol = new Set<string>();
    const construir = (id: string) => {
      enArbol.add(id);
      (hijos.get(id) ?? []).forEach((h) => {
        if (enArbol.has(h)) return; // ya cuelga de otro, o cierra un bucle
        if (!hijosArbol.has(id)) hijosArbol.set(id, []);
        hijosArbol.get(id)!.push(h);
        salidaDe.set(h, porSalida.get(`${id}>${h}`) ?? 'out');
        construir(h);
      });
    };
    const troncos: string[] = [];
    raices.forEach((id) => { if (!enArbol.has(id)) { troncos.push(id); construir(id); } });
    current.forEach((n) => { if (!enArbol.has(n.id)) { troncos.push(n.id); construir(n.id); } });

    // --- fila: cada hijo va al carril que le pide SU salida ---
    //
    // Antes el padre se centraba entre su primer y su ultimo hijo, sin mirar
    // de que salida colgaba cada uno. En una Decision con una sola rama eso
    // dejaba al hijo a la misma altura del padre aunque colgara del "Si", que
    // es justo lo que se veia torcido. Ahora manda la salida: el del Si va un
    // carril arriba del padre, el de Variante a la misma altura y el del No
    // uno abajo. Si dos ramas se pisan, la de mas abajo se corre hacia abajo
    // lo justo, que es la unica forma de respetar la salida sin encimar nada.
    //
    // `colocarRel` devuelve las filas de un subarbol contadas DESDE su propio
    // nodo, que queda en 0, junto con hasta donde llega por arriba y por
    // abajo. Asi cada rama se puede correr entera de una pieza.
    const colocarRel = (id: string): { min: number; max: number; filas: Map<string, number> } => {
      const filas = new Map<string, number>([[id, 0]]);
      let min = 0;
      let max = 0;
      let ocupadoHasta = -Infinity;

      (hijosArbol.get(id) ?? []).forEach((h) => {
        const rama = colocarRel(h);
        let en = CARRIL_DE_SALIDA[salidaDe.get(h) ?? 'out'] ?? 0;
        if (en + rama.min <= ocupadoHasta) en += ocupadoHasta + 1 - (en + rama.min);
        ocupadoHasta = en + rama.max;
        rama.filas.forEach((f, k) => filas.set(k, f + en));
        min = Math.min(min, en + rama.min);
        max = Math.max(max, en + rama.max);
      });

      return { min, max, filas };
    };

    const fila = new Map<string, number>();
    let siguienteBanda = 0;
    troncos.forEach((id) => {
      const rama = colocarRel(id);
      rama.filas.forEach((f, k) => fila.set(k, siguienteBanda + f - rama.min));
      siguienteBanda += rama.max - rama.min + 1;
    });

    // --- a pixeles: el ancho de cada columna lo pone su nodo mas ancho ---
    const anchoDeColumna = new Map<number, number>();
    current.forEach((n) => {
      const col = columna.get(n.id) ?? 0;
      anchoDeColumna.set(col, Math.max(anchoDeColumna.get(col) ?? 0, anchoDe(n)));
    });
    const xDeColumna = new Map<number, number>();
    let x = 0;
    Array.from(anchoDeColumna.keys()).sort((a, b) => a - b).forEach((col) => {
      xDeColumna.set(col, snapMultiple(x, SNAP));
      x += anchoDeColumna.get(col)! + AIRE_X;
    });

    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        position: {
          x: xDeColumna.get(columna.get(n.id) ?? 0) ?? 0,
          y: (fila.get(n.id) ?? 0) * CARRIL_Y,
        },
      })),
    );
    toast.success('Diagrama ordenado. Recuerda darle a Guardar.');
  }, [setNodes]);

  const pickAvailableSourceHandle = useCallback((sourceId: string) => {
    const node = nodesRef.current.find((n) => n.id === sourceId);
    const tipo = node?.data?.tipo ?? '';
    // Fin no tiene salida, asi que nada se le cuelga detras.
    if (tipo === 'fin') return null;
    const candidates = tipo === 'intention' ? ['yes', 'variante', 'no'] : ['out'];
    const libre = candidates.find(
      (h) => !edgesRef.current.some((e) => e.source === sourceId && (e.sourceHandle ?? 'out') === h),
    );
    return libre ?? candidates[0];
  }, []);

  // Donde cae el proximo nodo: pegado al borde derecho del que mas se
  // adentra, mas el hueco de siempre. Va por borde y no por carril fijo para
  // que el hueco se vea igual venga detras de un nodo normal o de una
  // Decision, que es casi el doble de ancha.
  const nextFreeX = useCallback(() => {
    const bordes = nodesRef.current.map((n) => n.position.x + anchoDe(n));
    return bordes.length ? snapMultiple(Math.max(...bordes) + AIRE_X, SNAP) : 0;
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
          size: 'md',
          totalNodes: nds.length + 1,
          onChangeLabel,
          onChangeContent,
          onChangeSize,
          onDuplicate: onDuplicateNode,
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
  }, [nextFreeX, onChangeLabel, onChangeContent, onChangeSize, onDuplicateNode, onDeleteNode, pickAvailableSourceHandle, setEdges, setNodes]);

  const addNodeFromSource: AddNodeFn = useCallback(({ sourceId, sourceHandle, action }) => {
    const id = `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    setNodes((nds) => {
      // El nodo nace justo a la derecha del que lo cuelga y en el carril que
      // le toca a esa salida, para que la linea salga derecha en vez de
      // cruzar medio lienzo. Si el sitio ya esta ocupado, `separar` lo corre.
      const origen = nds.find((n) => n.id === sourceId);
      const nuevo: Node<FlowNodeData> = {
        id,
        type: 'flowNode',
        position: { x: 0, y: 0 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          tipo: action.type,
          label: action.label,
          content: '',
          size: 'md',
          totalNodes: nds.length + 1,
          onChangeLabel,
          onChangeContent,
          onChangeSize,
          onDuplicate: onDuplicateNode,
          onDelete: onDeleteNode,
        },
      };

      const junto = origen
        ? {
            x: snapMultiple(origen.position.x + anchoDe(origen) + AIRE_X, SNAP),
            y: origen.position.y + (CARRIL_DE_SALIDA[sourceHandle] ?? 0) * CARRIL_Y,
          }
        : { x: nextFreeX(), y: 0 };

      nuevo.position = separar(nuevo, nds, junto);
      return nds.concat(nuevo);
    });

    const edgeId = `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setEdges((eds) => eds.concat({ id: edgeId, source: sourceId, target: id, sourceHandle, targetHandle: 'in', type: 'customEdge' }));
    lastEdgeTargetRef.current = id;
    toast.success('Nodo creado y conectado');
  }, [nextFreeX, onChangeLabel, onChangeContent, onChangeSize, onDuplicateNode, onDeleteNode, setEdges, setNodes]);

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

  const createAtCenter = useCallback((action: DiagramaAction) => {
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
        size: n.data.size,
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

  // Al soltar un nodo se comprueba que no haya quedado encima de otro. Si
  // quedo pegado se corre lo justo; si lo soltaron en un hueco, no se toca.
  const onNodeDragStop = useCallback((_evt: unknown, nodo: Node<FlowNodeData>) => {
    setNodes((nds) => {
      const otros = nds.filter((n) => n.id !== nodo.id);
      // La altura salta al carril mas cercano; el lado a lo ancho se respeta
      // tal cual quedo. Asi las filas se alinean solas sin quitarle libertad
      // al movimiento horizontal.
      const enCarril = { x: nodo.position.x, y: alCarril(nodo.position.y) };
      const libre = separar(nodo, otros, enCarril);
      if (libre.x === nodo.position.x && libre.y === nodo.position.y) return nds;
      return nds.map((n) => (n.id === nodo.id ? { ...n, position: libre } : n));
    });
  }, [setNodes]);

  const onConnect: OnConnect = useCallback((params) => {
    if (!params.source || !params.target) return;
    const sourceHandle = params.sourceHandle ?? 'out';
    const targetHandle = params.targetHandle ?? 'in';

    // De un mismo punto de salida pueden salir varias lineas: asi se dibuja
    // que de un paso arrancan dos caminos a la vez, o que dos pasos distintos
    // llegan al mismo sitio. Lo unico que no se repite es la misma linea
    // exacta entre los mismos dos puntos, que no se veria como dos.
    const repetida = edgesRef.current.some(
      (e) =>
        e.source === params.source &&
        (e.sourceHandle ?? 'out') === sourceHandle &&
        e.target === params.target &&
        (e.targetHandle ?? 'in') === targetHandle,
    );
    if (repetida) {
      toast.info('Esos dos nodos ya están conectados por ahí.');
      return;
    }

    const id = `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setEdges((eds) => eds.concat({ id, source: params.source!, target: params.target!, sourceHandle, targetHandle, type: 'customEdge' }));
    lastEdgeTargetRef.current = params.target;
  }, [setEdges]);

  return (
    <FlowAddNodeProvider value={addNodeFromSource}>
      <div ref={wrapperRef} className="relative w-full h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onInit={(instance) => (rfRef.current = instance)}
          defaultEdgeOptions={{ type: 'customEdge' }}
          connectionLineStyle={{ stroke: 'hsl(var(--primary) / 0.65)', strokeWidth: 2.5 }}
          onDragOver={onDragOver}
          onDrop={onDrop}
          snapToGrid
          snapGrid={[SNAP, SNAP]}
          fitView
          fitViewOptions={{ padding: 0.28 }}
          colorMode={isDark ? 'dark' : 'light'}
          minZoom={0.05}
        >
          <Background />
          <Controls
            fitViewOptions={{ padding: 0.28 }}
            className="overflow-hidden !rounded-xl !border !border-border !bg-background !shadow-lg [&>button+button]:!border-t [&>button+button]:!border-border [&>button]:!h-9 [&>button]:!w-9 [&>button]:!border-0 [&>button]:!bg-transparent [&>button]:!text-foreground [&>button:hover]:!bg-accent [&_svg]:!h-3.5 [&_svg]:!w-3.5 [&_svg]:!max-h-none [&_svg]:!max-w-none [&_svg]:!fill-current"
          />

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
