'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Check, Loader2, Save } from 'lucide-react';
import "@xyflow/react/dist/style.css";
import { ReactFlowProvider } from '@xyflow/react';
import { Button } from '@/components/ui/button';

import { saveFlowGraphAction } from '@/actions/flow-actions';
import { FlowCanvas, type FlowCanvasHandle, type FlowGraphNode, type FlowGraphEdge } from './FlowCanvas';

interface FlowEditorClientProps {
  flowId: string;
  flowName: string;
  initialNodes: FlowGraphNode[];
  initialEdges: FlowGraphEdge[];
}

/**
 * Cuanto se espera desde el ultimo cambio antes de guardar.
 *
 * Arrastrar un nodo dispara decenas de cambios seguidos; sin esta espera se
 * mandaria el diagrama entero en cada pixel. Un segundo y pico es suficiente
 * para que una tanda de movimientos se guarde de una sola vez, y lo bastante
 * corto para que nadie se vaya con algo sin guardar.
 */
const ESPERA_ANTES_DE_GUARDAR = 1200;

type EstadoGuardado = 'guardado' | 'pendiente' | 'guardando';

export function FlowEditorClient({ flowId, flowName, initialNodes, initialEdges }: FlowEditorClientProps) {
  const router = useRouter();
  const canvasRef = useRef<FlowCanvasHandle>(null);

  const [estado, setEstado] = useState<EstadoGuardado>('guardado');
  // Lo ultimo que quedo escrito, en texto. Sirve para no volver a mandar un
  // diagrama que no cambio: seleccionar un nodo o pasarle el mouse por encima
  // tambien mueve el estado interno del lienzo, y eso no hay que guardarlo.
  const loGuardado = useRef<string | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Para poder guardar desde la limpieza al desmontar sin arrastrar
  // dependencias que reinicien el temporizador en cada render.
  const guardarRef = useRef<(avisar?: boolean) => Promise<void>>();

  const guardar = useCallback(async (avisar = false) => {
    const graph = canvasRef.current?.getGraph();
    if (!graph) return;

    const firma = JSON.stringify(graph);
    if (firma === loGuardado.current) {
      setEstado('guardado');
      return;
    }

    setEstado('guardando');
    const res = await saveFlowGraphAction(flowId, graph.nodes, graph.edges);

    if (!res.success) {
      // Se queda en pendiente a proposito: el boton sigue ofreciendo guardar.
      setEstado('pendiente');
      toast.error(res.message);
      return;
    }

    loGuardado.current = firma;
    setEstado('guardado');
    if (avisar) toast.success('Diagrama guardado.');
  }, [flowId]);

  guardarRef.current = guardar;

  const alCambiarElLienzo = useCallback(() => {
    setEstado('pendiente');
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => void guardarRef.current?.(), ESPERA_ANTES_DE_GUARDAR);
  }, []);

  // Al salir del diagrama, lo que estuviera esperando se manda de una vez en
  // lugar de perderse con el temporizador.
  useEffect(() => {
    return () => {
      if (!temporizador.current) return;
      clearTimeout(temporizador.current);
      void guardarRef.current?.();
    };
  }, []);

  const guardarAhora = () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    void guardar(true);
  };

  return (
    <div className="relative h-full w-full min-w-0 overflow-hidden">
      <ReactFlowProvider>
        <FlowCanvas
          ref={canvasRef}
          initialNodes={initialNodes}
          initialEdges={initialEdges}
          onGraphChange={alCambiarElLienzo}
        />
      </ReactFlowProvider>

      <div className="pointer-events-auto absolute left-3 top-3 z-30 flex items-center gap-1.5 rounded-full border border-border bg-background/95 py-1 pl-1.5 pr-3 shadow-md backdrop-blur">
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => router.push('/diagramas')} title="Volver a Diagramas">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="max-w-[180px] truncate text-sm font-semibold">{flowName}</span>
      </div>

      {/* El diagrama se guarda solo, pero el boton se queda: dice en que va
          -guardando, guardado, o con cambios sin mandar- y deja forzarlo sin
          esperar. Verde fijo y no el color de la App, para que no se confunda
          con el azul de los conectores. */}
      <div className="absolute right-3 top-3 z-30">
        <Button
          size="sm"
          onClick={guardarAhora}
          disabled={estado === 'guardando'}
          title={estado === 'guardado' ? 'Todo guardado' : 'Guardar ahora'}
          className={`h-9 gap-2 rounded-full shadow-md ${estado === 'guardado'
            ? 'bg-background text-muted-foreground hover:bg-accent'
            : 'bg-green-600 text-white hover:bg-green-700'
            }`}
        >
          {estado === 'guardando' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Guardando...
            </>
          ) : estado === 'pendiente' ? (
            <>
              <Save className="h-4 w-4" />
              Guardar
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              Guardado
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
