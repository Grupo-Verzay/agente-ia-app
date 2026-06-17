'use client';

import { useRouter } from 'next/navigation';
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
import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { SimpleTag } from '@/types/session';
import { batchUpdateTagOrderAction } from '@/actions/tag-actions';

const COLOR_PRESETS = [
  '#3B82F6',
  '#22C55E',
  '#F97316',
  '#EC4899',
  '#A855F7',
  '#F59E0B',
];

const DEFAULT_COLOR = '#64748B';

interface SortableTagItemProps {
  tag: SimpleTag;
  isEditing: boolean;
  editName: string;
  editColor: string | null;
  isPending: boolean;
  onEditName: (v: string) => void;
  onEditColor: (v: string | null) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: (tag: SimpleTag) => void;
  onDelete: (tag: SimpleTag) => void;
}

const SortableTagItem = ({
  tag,
  isEditing,
  editName,
  editColor,
  isPending,
  onEditName,
  onEditColor,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onDelete,
}: SortableTagItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tag.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const color = tag.color ?? DEFAULT_COLOR;

  if (isEditing) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 px-4 py-3"
      >
        <div className="flex flex-1 min-w-[160px] items-center gap-2">
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: (editColor ?? DEFAULT_COLOR) + '25' }}
          >
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: editColor ?? DEFAULT_COLOR }} />
          </span>
          <Input
            value={editName}
            onChange={(e) => onEditName(e.target.value.toUpperCase())}
            className="h-9"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onEditColor(editColor === c ? null : c)}
              className={cn('h-5 w-5 rounded-full border border-border/60', editColor === c && 'ring-2 ring-primary')}
              style={{ backgroundColor: c }}
            />
          ))}
          <Input
            type="color"
            value={editColor ?? '#3B82F6'}
            onChange={(e) => onEditColor(e.target.value)}
            className="h-9 w-12 cursor-pointer p-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 px-3" onClick={onCancelEdit}>
            Cancelar
          </Button>
          <Button variant="outline" size="sm" className="h-8 px-3" onClick={onSaveEdit} disabled={isPending || !editName.trim()}>
            Guardar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-xl border bg-card px-3 py-3 shadow-sm"
    >
      <div
        className="cursor-grab p-1 text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </div>

      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: color + '25' }}
      >
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
      </div>

      <span className="flex-1 truncate font-semibold uppercase tracking-wide">{tag.name}</span>

      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-lg px-3 text-xs"
          onClick={() => onStartEdit(tag)}
        >
          <Pencil className="h-3.5 w-3.5" />
          Editar
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 rounded-lg text-destructive hover:text-destructive/80"
          onClick={() => onDelete(tag)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

interface SortableTagListProps {
  tags: SimpleTag[];
  onReorder: (tags: SimpleTag[]) => void;
  editingTagId: number | null;
  editName: string;
  editColor: string | null;
  isPending: boolean;
  onEditName: (v: string) => void;
  onEditColor: (v: string | null) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: (tag: SimpleTag) => void;
  onDelete: (tag: SimpleTag) => void;
}

export const SortableTagList = ({
  tags,
  onReorder,
  editingTagId,
  editName,
  editColor,
  isPending,
  onEditName,
  onEditColor,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onDelete,
}: SortableTagListProps) => {
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tags.findIndex((t) => t.id === active.id);
    const newIndex = tags.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(tags, oldIndex, newIndex);
    onReorder(reordered);

    const toastId = toast.loading('Guardando orden...');
    const res = await batchUpdateTagOrderAction(
      reordered.map((tag, index) => ({ id: tag.id, order: index }))
    );
    if (res.success) {
      toast.success('Orden actualizado', { id: toastId });
      router.refresh();
    } else {
      toast.error('Error guardando el orden', { id: toastId });
      onReorder(tags);
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tags.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {tags.map((tag) => (
            <SortableTagItem
              key={tag.id}
              tag={tag}
              isEditing={editingTagId === tag.id}
              editName={editName}
              editColor={editColor}
              isPending={isPending}
              onEditName={onEditName}
              onEditColor={onEditColor}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onStartEdit={onStartEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
