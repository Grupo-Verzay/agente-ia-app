'use client';

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
import { updateTagOrderAction } from '@/actions/tag-actions';

const COLOR_PRESETS = [
  '#3B82F6',
  '#22C55E',
  '#F97316',
  '#EC4899',
  '#A855F7',
  '#F59E0B',
];

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
  renderColorDot: (color?: string | null) => React.ReactNode;
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
  renderColorDot,
}: SortableTagItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tag.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (isEditing) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2"
      >
        <div className="flex flex-1 min-w-[160px] items-center gap-2">
          {renderColorDot(editColor)}
          <Input
            value={editName}
            onChange={(e) => onEditName(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {COLOR_PRESETS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onEditColor(editColor === color ? null : color)}
              className={cn(
                'h-5 w-5 rounded-full border border-border/60',
                editColor === color && 'ring-2 ring-primary'
              )}
              style={{ backgroundColor: color }}
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
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3"
            onClick={onSaveEdit}
            disabled={isPending || !editName.trim()}
          >
            Guardar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3"
            onClick={onCancelEdit}
          >
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
    >
      <div
        className="cursor-grab p-1 text-muted-foreground hover:bg-slate-100 rounded"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </div>

      <button
        type="button"
        className="inline-flex min-w-[120px] flex-1 items-center gap-2 rounded-full px-2 py-1 text-left"
      >
        {renderColorDot(tag.color)}
        <span className="truncate">{tag.name}</span>
      </button>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => onStartEdit(tag)}
          title="Editar etiqueta"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={() => onDelete(tag)}
          title="Eliminar etiqueta"
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
  renderColorDot: (color?: string | null) => React.ReactNode;
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
  renderColorDot,
}: SortableTagListProps) => {
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
    try {
      await Promise.all(
        reordered.map((tag, index) => updateTagOrderAction(tag.id, index))
      );
      toast.success('Orden actualizado', { id: toastId });
    } catch {
      toast.error('Error guardando el orden', { id: toastId });
      onReorder(tags); // revertir
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={tags.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-1.5">
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
              renderColorDot={renderColorDot}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
