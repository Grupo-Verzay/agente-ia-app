'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2, Lock } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { saveContactFieldConfig } from '@/actions/finance-contact-fields-actions';
import {
  newCustomFieldKey,
  type FinanceContactKind,
  type FinanceFieldDef,
  type FinanceFieldType,
} from '@/lib/finance-contact-fields';

const TYPE_LABELS: Record<FinanceFieldType, string> = {
  text: 'Texto',
  number: 'Número',
  phone: 'Teléfono',
  email: 'Email',
  date: 'Fecha',
  textarea: 'Texto largo',
  select: 'Lista',
  contact: 'Contacto WhatsApp',
};

const SELECTABLE_TYPES: FinanceFieldType[] = ['text', 'number', 'phone', 'email', 'date', 'textarea', 'select'];

function SortableRow({
  field,
  onChange,
  onRemove,
}: {
  field: FinanceFieldDef;
  onChange: (patch: Partial<FinanceFieldDef>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.key });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const isName = field.key === 'name';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border bg-background p-2.5 ${isDragging ? 'z-10 opacity-70 shadow-md' : ''}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex h-8 w-6 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label="Reordenar"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <Input
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="h-9 flex-1 text-sm"
          placeholder="Etiqueta del campo"
        />

        {field.system ? (
          <Badge variant="secondary" className="h-6 shrink-0 gap-1 text-[11px]">
            <Lock className="h-3 w-3" /> {TYPE_LABELS[field.type]}
          </Badge>
        ) : (
          <Select value={field.type} onValueChange={(v) => onChange({ type: v as FinanceFieldType })}>
            <SelectTrigger className="h-9 w-[150px] shrink-0 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SELECTABLE_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="text-sm">
                  {TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex shrink-0 items-center gap-1.5" title="Obligatorio">
          <Switch
            checked={!!field.required}
            disabled={isName}
            onCheckedChange={(v) => onChange({ required: v })}
          />
          <span className="hidden text-[11px] text-muted-foreground sm:inline">Oblig.</span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5" title="Visible">
          <Switch
            checked={!field.hidden}
            disabled={isName}
            onCheckedChange={(v) => onChange({ hidden: !v })}
          />
          <span className="hidden text-[11px] text-muted-foreground sm:inline">Visible</span>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={onRemove}
          disabled={field.system}
          title={field.system ? 'Campo del sistema (no se elimina, puedes ocultarlo)' : 'Eliminar campo'}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {field.type === 'select' && !field.system ? (
        <div className="mt-2 pl-8">
          <Input
            value={(field.options ?? []).join(', ')}
            onChange={(e) =>
              onChange({ options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
            }
            className="h-8 text-sm"
            placeholder="Opciones separadas por coma (ej. Contado, Crédito)"
          />
        </div>
      ) : null}
    </div>
  );
}

export function FieldBuilderDialog({
  open,
  onOpenChange,
  userId,
  kind,
  fields,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  kind: FinanceContactKind;
  fields: FinanceFieldDef[];
  onSaved: (fields: FinanceFieldDef[]) => void;
}) {
  const [draft, setDraft] = useState<FinanceFieldDef[]>(fields);
  const [isPending, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    if (open) setDraft(fields);
  }, [open, fields]);

  const patchAt = (key: string, patch: Partial<FinanceFieldDef>) =>
    setDraft((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  const removeAt = (key: string) => setDraft((prev) => prev.filter((f) => f.key !== key));
  const addField = () =>
    setDraft((prev) => [
      ...prev,
      { key: newCustomFieldKey(prev), label: 'Nuevo campo', type: 'text', system: false },
    ]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft((prev) => {
      const oldIndex = prev.findIndex((f) => f.key === active.id);
      const newIndex = prev.findIndex((f) => f.key === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const onSave = () => {
    startTransition(() => {
      void (async () => {
        const res = await saveContactFieldConfig(userId, kind, draft);
        if (!res.success) return toast.error(res.message);
        toast.success('Configuración guardada');
        onSaved(res.data ?? draft);
        onOpenChange(false);
      })();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[620px] flex-col overflow-hidden rounded-2xl sm:max-w-[760px]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-base">Configurar campos</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Arrastra para reordenar, renombra, oculta o agrega tus propios campos. Aplica a esta tabla.
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={draft.map((f) => f.key)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {draft.map((f) => (
                  <SortableRow
                    key={f.key}
                    field={f}
                    onChange={(patch) => patchAt(f.key, patch)}
                    onRemove={() => removeAt(f.key)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <Button type="button" variant="outline" size="sm" className="mt-3 h-9" onClick={addField}>
            <Plus className="mr-1 h-4 w-4" /> Agregar campo
          </Button>
        </div>

        <div className="shrink-0 border-t pt-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Los campos con candado son del sistema: no se eliminan, pero puedes ocultarlos.
          </p>
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" className="h-9" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button variant="save" size="sm" className="h-9" onClick={onSave} disabled={isPending}>
              Guardar configuración
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
