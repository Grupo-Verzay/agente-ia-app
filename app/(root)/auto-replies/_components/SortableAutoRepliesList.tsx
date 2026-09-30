'use client';

import { useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { Workflow } from '@prisma/client';
import { GripVertical } from 'lucide-react';
import { guardarElOrdenDeLasRespuestasAction, type RespuestaRapida } from '@/actions/rr-actions';
import { CasillaDeFila } from '@/components/shared/AccionesMasivas';
import { AutoRepliesCard } from './AutoRepliesCard';

interface SortableAutoRepliesListProps {
  autoReplies: RespuestaRapida[];
  workflows: Workflow[];
  /** La cuenta cuyas respuestas se ordenan. */
  cuentaId: string;
  /** Por qué no se puede arrastrar ahora, o `null` si se puede (`porQueNoSePuedeOrdenar`). */
  bloqueo: string | null;
  /** Los ids marcados para las acciones masivas. */
  marcados: ReadonlySet<string>;
  onMarcar: (id: string) => void;
}

interface SortableItemProps {
  autoReplie: RespuestaRapida;
  workflows: Workflow[];
  bloqueo: string | null;
  marcada: boolean;
  onMarcar: (id: string) => void;
}

const SortableAutoRepliesItem = ({ autoReplie, workflows, bloqueo, marcada, onMarcar }: SortableItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: autoReplie.id, disabled: !!bloqueo });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const editable = autoReplie.editable !== false;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-1.5"
    >
      {/* Con un filtro puesto el asa no arrastra: se pulsa y dice por qué. Un
          asa que se agarra y no mueve nada se lee como que la lista está rota. */}
      <div
        data-zona="asa"
        title={bloqueo ?? 'Arrastra para reordenar'}
        aria-label={bloqueo ?? 'Arrastra para reordenar'}
        className={
          'rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted ' +
          (bloqueo ? 'cursor-not-allowed opacity-50' : 'cursor-grab')
        }
        onClick={bloqueo ? () => toast.info(bloqueo) : undefined}
        {...(bloqueo ? {} : attributes)}
        {...(bloqueo ? {} : listeners)}
      >
        <GripVertical className="h-4 w-4" />
      </div>
      {/* La casilla solo en las que se pueden borrar. Las demás conservan el
          hueco, para que las tarjetas no arranquen cada una en otro sitio. */}
      <div className="flex h-7 w-4 shrink-0 items-center" data-zona="casilla">
        {editable && (
          <CasillaDeFila
            marcada={marcada}
            onCambiar={() => onMarcar(String(autoReplie.id))}
            etiqueta="Seleccionar respuesta"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <AutoRepliesCard autoReplie={autoReplie} workflows={workflows} />
      </div>
    </div>
  );
};

export const SortableAutoRepliesList = ({
  autoReplies,
  workflows,
  cuentaId,
  bloqueo,
  marcados,
  onMarcar,
}: SortableAutoRepliesListProps) => {
  const [items, setItems] = useState<RespuestaRapida[]>(autoReplies);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    setItems(autoReplies);
  }, [autoReplies]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    // Por si el asa se soltó justo cuando se puso un filtro: la lista que se
    // ve ya no es la entera y guardarla movería las escondidas.
    if (bloqueo) {
      toast.info(bloqueo);
      return;
    }

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);

    if (oldIndex < 0 || newIndex < 0) {
      console.warn('[respuestas] se soltó una respuesta que no está en la lista', { active: active.id, over: over.id });
      return;
    }

    const antes = items;
    const newOrder = arrayMove(items, oldIndex, newIndex);
    setItems(newOrder);

    const toastId = toast.loading('Guardando el orden...');

    try {
      // UNA acción con la lista entera, y se mira lo que contesta. Antes eran
      // N acciones a la vez y el aviso decía «actualizado» pasara lo que pasara.
      const res = await guardarElOrdenDeLasRespuestasAction(cuentaId, newOrder.map((r) => r.id));
      if (!res.success) {
        setItems(antes);
        toast.error(res.message, { id: toastId });
        return;
      }
      toast.success('Orden actualizado', { id: toastId });
    } catch (error) {
      console.error('[respuestas] no se pudo guardar el orden', error);
      setItems(antes);
      toast.error('No se pudo guardar el orden', { id: toastId });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((autoReplie) => autoReplie.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="grid grid-cols-1 gap-2" data-zona="lista-de-respuestas">
          {items.map((autoReplie) => (
            <SortableAutoRepliesItem
              key={autoReplie.id}
              autoReplie={autoReplie}
              workflows={workflows}
              bloqueo={bloqueo}
              marcada={marcados.has(String(autoReplie.id))}
              onMarcar={onMarcar}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
