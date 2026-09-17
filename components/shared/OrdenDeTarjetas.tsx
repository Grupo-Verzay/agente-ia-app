'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { GripVertical } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { cn } from '@/lib/utils';
import { guardarElOrdenAction, leerElOrdenAction } from '@/actions/orden-de-tarjetas-actions';
import {
  moverEnLaListaCompleta,
  ordenDeLaLista,
  ordenarTarjetas,
  type OrdenGuardado,
  type TipoDeTarjeta,
} from '@/lib/orden-de-las-tarjetas';

/**
 * Ninguna de estas llamadas puede dejar la pantalla a medias.
 *
 * Una acción de servidor no solo devuelve `success: false`: también puede
 * **reventar** —un 500, la red— y entonces el `await` se rompe. Sin esto, la
 * tarjeta se quedaría movida en pantalla y en su sitio de antes en la base, que
 * es la peor de las dos: parece guardado y no lo está.
 */
async function pedir<T>(
  quéEs: string,
  llamada: () => Promise<{ success: true; data: T } | { success: false; message: string }>,
): Promise<{ success: true; data: T } | { success: false; message: string }> {
  try {
    return await llamada();
  } catch (error) {
    console.warn(`[orden] ${quéEs} no llegó al servidor`, error);
    return { success: false, message: `No se pudo ${quéEs}. Revisa la conexión.` };
  }
}

/**
 * Reordenar las tarjetas de una pantalla arrastrándolas (Proyectos, Diagramas).
 *
 * Todo vive aquí —el estado, la rejilla y el asa— para que las dos pantallas se
 * comporten igual sin copiar nada, exactamente como `useCarpetas`. Si mañana lo
 * necesita una tercera, es este hook y estos dos componentes.
 *
 * El orden **no filtra ni ordena en el servidor**: la lista de cosas ya viene
 * entera y aquí solo se decide en qué orden se pinta. Así arrastrar se ve al
 * momento y no depende de una vuelta de red — la misma regla que las carpetas.
 */
export function useOrdenDeTarjetas(tipo: TipoDeTarjeta, puedeOrdenar: boolean) {
  const [orden, setOrden] = useState<OrdenGuardado>({});

  const recargar = useCallback(async () => {
    const res = await pedir('cargar el orden', () => leerElOrdenAction(tipo));
    if (!res.success) {
      // Mudo, esto se ve como «las tarjetas no se quedan donde las dejo».
      console.warn('[orden] no se pudo cargar', { tipo, motivo: res.message });
      return;
    }
    setOrden(res.data);
  }, [tipo]);

  // Lo lee también quien no puede mover: el agente ve el orden que puso su
  // administrador, solo que no lo cambia.
  useEffect(() => { void recargar(); }, [recargar]);

  /** Coloca la lista. Sin nada guardado devuelve la lista tal cual llegó. */
  const colocar = useCallback(
    <T,>(items: T[], idDe: (item: T) => string) => ordenarTarjetas(items, orden, idDe),
    [orden],
  );

  /**
   * Mueve al momento y avisa después, y si el servidor dice que no, se devuelve
   * tal cual estaba. Misma regla que mover a una carpeta o borrar un chat.
   *
   * `idsCompletos` es la lista ENTERA ya colocada, no la que se ve: con un
   * filtro puesto se arrastran las visibles y hay que guardar todas, o las
   * escondidas pierden su sitio sin que nadie lo note hasta quitar el filtro.
   */
  const mover = useCallback(
    async (idsCompletos: string[], arrastrada: string, soltadaSobre: string) => {
      if (!puedeOrdenar) return;

      const nuevos = moverEnLaListaCompleta(idsCompletos, arrastrada, soltadaSobre);
      if (nuevos === idsCompletos) return;

      const antes = orden;
      setOrden(ordenDeLaLista(nuevos));

      const res = await pedir('guardar el orden', () => guardarElOrdenAction(tipo, nuevos));
      if (!res.success) {
        setOrden(antes);
        toast.error(res.message);
      }
    },
    [orden, puedeOrdenar, tipo],
  );

  return useMemo(
    () => ({ orden, colocar, mover, puedeOrdenar, recargar }),
    [orden, colocar, mover, puedeOrdenar, recargar],
  );
}

/**
 * La rejilla que admite arrastre.
 *
 * `rectSortingStrategy` y no `verticalListSortingStrategy` —la de los módulos—
 * porque esto es una **rejilla de varias columnas** y aquella solo sabe de una
 * columna: con ella, arrastrar de la fila de arriba a la de abajo coloca las
 * demás como si estuvieran apiladas y la animación va a otro sitio.
 *
 * Sin permiso para ordenar **no se monta el `DndContext`**: así no hay ni
 * sensores escuchando ni tarjetas que se muevan un poco al pulsarlas.
 */
export function RejillaOrdenable({
  ids,
  puedeOrdenar,
  onMover,
  className,
  children,
}: {
  /** La lista COMPLETA ya colocada, en el mismo orden con el que se pinta. */
  ids: string[];
  puedeOrdenar: boolean;
  onMover: (idsCompletos: string[], arrastrada: string, soltadaSobre: string) => void;
  className?: string;
  children: ReactNode;
}) {
  // Con `distance` el clic sigue siendo un clic: el arrastre no empieza hasta
  // moverse 6 px. Sin esto, pulsar el asa y soltar sin querer contaría como un
  // movimiento de cero y dispararía una escritura por cada pulsación.
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  if (!puedeOrdenar) return <div className={className}>{children}</div>;

  const alSoltar = (evento: DragEndEvent) => {
    const { active, over } = evento;
    if (!over || active.id === over.id) return;
    onMover(ids, String(active.id), String(over.id));
  };

  return (
    <DndContext
      sensors={sensores}
      collisionDetection={closestCenter}
      onDragEnd={alSoltar}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className={className}>{children}</div>
      </SortableContext>
    </DndContext>
  );
}

/**
 * Una tarjeta con su asa, como las de los módulos.
 *
 * Se arrastra **por el asa y no por la tarjeta entera**: estas tarjetas están
 * llenas de botones y menús —abrir, renombrar, compartir, mover a carpeta— y
 * con los oyentes en la tarjeta cada clic compite con un arrastre. Es el mismo
 * reparto que `ModuleCard`, que también lleva su `GripVertical` en una esquina.
 *
 * El asa va **fuera del flujo** (`absolute`), así que no ocupa ancho y no
 * recorta el nombre; lo que reserva su sitio es el `pl-*` que pone cada
 * pantalla, igual que el `pl-8` de la cabecera de un módulo.
 */
export function TarjetaOrdenable({
  id,
  puedeOrdenar,
  className,
  children,
}: {
  id: string;
  puedeOrdenar: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !puedeOrdenar,
  });

  if (!puedeOrdenar) return <div className={className}>{children}</div>;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-10 opacity-70', className)}
    >
      <button
        type="button"
        aria-label="Reordenar"
        title="Arrastra para reordenar"
        // Fondo propio: aparece encima de la esquina de la tarjeta y sin él se
        // leerían las dos cosas superpuestas.
        className="absolute left-1.5 top-1.5 z-20 cursor-grab touch-none rounded-md border bg-background/90 p-1 text-muted-foreground shadow-sm active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}
