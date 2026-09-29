'use client';

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { GripVertical, Plus, Trash2, Loader2, Lock } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CAMPOS_FIJOS, ContactFieldDef, DEFAULT_CONTACT_SECTIONS, pickIconForLabel } from '@/lib/contact-fields';
import { saveContactFieldsConfig } from '@/actions/contact-fields-actions';
import { resolveContactIcon } from './contact-field-icons';

interface Props {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: ContactFieldDef[];
  onSaved: (fields: ContactFieldDef[]) => void;
}

// Nombre y Teléfono: la MISMA anatomía que una fila editable (mismos huecos y
// mismos anchos, así las etiquetas caen en la misma columna), pero sin
// arrastre, sin interruptor y con un candado donde va la papelera. Son el
// nombre y el número del contacto en toda la plataforma: se editan donde
// aparezcan, no aquí.
function FilaFija({ label, icon }: { label: string; icon: string }) {
  const Icon = resolveContactIcon(icon);
  const porQue = 'Campo fijo: es el mismo dato en toda la plataforma y se edita donde aparezca';
  return (
    <div
      data-campo-fijo={label}
      className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-2 py-1.5"
      title={porQue}
    >
      <span className="h-7 w-5 shrink-0" aria-hidden />
      <span className="h-6 w-11 shrink-0" aria-hidden />
      <span className="h-7 w-7 shrink-0 flex items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <Input value={label} readOnly disabled className="h-8 flex-1 min-w-0 disabled:opacity-100" />
      <span className="h-8 w-28 shrink-0 flex items-center px-2 text-xs text-muted-foreground">Fijo</span>
      <span className="h-7 w-7 shrink-0 flex items-center justify-center text-muted-foreground" aria-label={porQue}>
        <Lock className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

function SortableRow({
  field, onChange, onRemove,
}: {
  field: ContactFieldDef;
  onChange: (next: ContactFieldDef) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.key });
  const style: React.CSSProperties = {
    transform: transform ? CSS.Transform.toString({ ...transform, x: 0 }) : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 ${field.enabled ? '' : 'opacity-60'}`}
    >
      <button
        type="button"
        className="h-7 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing shrink-0"
        title="Arrastrar"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <Switch
        checked={field.enabled}
        onCheckedChange={(v) => onChange({ ...field, enabled: v })}
        title={field.enabled ? 'Visible' : 'Oculto'}
        className="shrink-0"
      />

      {(() => {
        const Icon = resolveContactIcon(field.icon);
        return (
          <span
            className="h-7 w-7 shrink-0 flex items-center justify-center rounded-md bg-muted text-muted-foreground"
            title="El ícono se asigna automáticamente según el nombre"
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        );
      })()}

      <Input
        value={field.label}
        onChange={(e) => {
          const label = e.target.value;
          // El sistema asigna el ícono según el nombre, igual en todos: desde la
          // versión 2 no quedan campos «de fábrica» con un ícono aparte.
          onChange({ ...field, label, icon: pickIconForLabel(label), custom: true });
        }}
        placeholder="Etiqueta"
        className="h-8 flex-1 min-w-0"
      />

      <input
        list="contact-field-sections"
        value={field.section}
        onChange={(e) => onChange({ ...field, section: e.target.value })}
        placeholder="Sección"
        className="h-8 w-28 shrink-0 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-primary/40"
      />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        title="Eliminar campo"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function ContactFieldsConfigDialog({ userId, open, onOpenChange, fields, onSaved }: Props) {
  const [draft, setDraft] = useState<ContactFieldDef[]>(fields);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setDraft(fields); }, [open, fields]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sectionSuggestions = Array.from(
    new Set([...DEFAULT_CONTACT_SECTIONS.map((s) => s.title), ...draft.map((f) => f.section)].filter(Boolean)),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setDraft((prev) => {
      const oldI = prev.findIndex((f) => f.key === active.id);
      const newI = prev.findIndex((f) => f.key === over.id);
      if (oldI < 0 || newI < 0) return prev;
      return arrayMove(prev, oldI, newI).map((f, i) => ({ ...f, order: i }));
    });
  };

  const updateField = (key: string, next: ContactFieldDef) =>
    setDraft((prev) => prev.map((f) => (f.key === key ? next : f)));

  const removeField = (key: string) =>
    setDraft((prev) => prev.filter((f) => f.key !== key));

  const addField = () => {
    setDraft((prev) => {
      const keys = new Set(prev.map((f) => f.key));
      let key = 'nuevo_campo';
      let n = 1;
      while (keys.has(key)) key = `nuevo_campo_${n++}`;
      return [
        ...prev,
        {
          key,
          label: 'Nuevo campo',
          section: sectionSuggestions[0] ?? 'Libre',
          icon: pickIconForLabel('Nuevo campo'),
          enabled: true,
          order: prev.length,
          custom: true,
        },
      ];
    });
  };

  const handleSave = async () => {
    const cleaned = draft
      .map((f, i) => ({ ...f, label: f.label.trim(), section: f.section.trim() || 'Libre', order: i }))
      .filter((f) => f.label.length > 0);
    // Una lista vacía es válida: la ficha se queda con Nombre y Teléfono.
    setSaving(true);
    try {
      const res = await saveContactFieldsConfig(userId, cleaned);
      if (res.success) {
        toast.success('Campos guardados');
        onSaved(cleaned);
        onOpenChange(false);
      } else {
        toast.error(res.message);
      }
    } catch (error) {
      // Una acción que revienta (red, despliegue a medias) no puede dejar el
      // botón en «Guardando…» para siempre ni callarse.
      console.warn('[ficha] no se pudo guardar la configuración de campos', { error });
      toast.error('No se pudo guardar la configuración de campos. Revisa la conexión.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar campos de la ficha</DialogTitle>
          <DialogDescription className="text-xs">
            Nombre y Teléfono son fijos. Los demás campos se activan u ocultan, se renombran, se cambian de sección, se reordenan arrastrando y se eliminan.
          </DialogDescription>
        </DialogHeader>

        <datalist id="contact-field-sections">
          {sectionSuggestions.map((s) => <option key={s} value={s} />)}
        </datalist>

        <ScrollArea className="max-h-[55vh] pr-3 -mr-3">
          <div className="space-y-1.5 mb-1.5">
            {CAMPOS_FIJOS.map((c) => <FilaFija key={c.key} label={c.label} icon={c.icon} />)}
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={draft.map((f) => f.key)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {draft.map((f) => (
                  <SortableRow
                    key={f.key}
                    field={f}
                    onChange={(next) => updateField(f.key, next)}
                    onRemove={() => removeField(f.key)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </ScrollArea>

        <Button variant="outline" size="sm" onClick={addField} className="gap-1.5 self-start">
          <Plus className="h-3.5 w-3.5" />
          Agregar campo
        </Button>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
