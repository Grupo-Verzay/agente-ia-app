'use client';

import { useEffect, useState, useTransition } from 'react';
import { Trash2, Loader2, Pencil, Search, HelpCircle, GripVertical, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ModuleToolbar } from '@/components/shared/ModuleToolbar';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  getBookingQuestions,
  createBookingQuestion,
  updateBookingQuestion,
  deleteBookingQuestion,
  reorderBookingQuestions,
  type BookingQuestionItem,
} from '@/actions/booking-questions-actions';
import { BookingQuestionType } from '@prisma/client';

const TYPE_LABELS: Record<BookingQuestionType, string> = {
  TEXT: 'Texto corto',
  TEXTAREA: 'Texto largo',
  SELECT: 'Selección',
};

interface Props {
  userId: string;
}

interface QuestionForm {
  label: string;
  type: BookingQuestionType;
  options: string;
  required: boolean;
}

const EMPTY_FORM: QuestionForm = { label: '', type: 'TEXT', options: '', required: false };

// ─── Sortable Item ────────────────────────────────────────────────────────────

interface SortableItemProps {
  question: BookingQuestionItem;
  editingId: string | null;
  isFirst: boolean;
  isLast: boolean;
  onEdit: (q: BookingQuestionItem) => void;
  onDelete: (id: string) => void;
  onToggle: (q: BookingQuestionItem) => void;
}

function SortableQuestionItem({ question: q, editingId, isFirst, isLast, onEdit, onDelete, onToggle }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={[
        'rounded-xl',
        !q.active ? 'opacity-50' : '',
        editingId === q.id ? 'ring-1 ring-inset ring-primary/30' : '',
      ].join(' ')}
    >
      <CardContent className="flex items-center gap-3 px-4 py-3">
        {/* Drag handle */}
        <div
          className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing shrink-0 touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </div>

        {/* Icono */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <HelpCircle className="h-4 w-4 text-primary" />
        </div>

        {/* Contenido */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug truncate">{q.label}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Badge className="h-5 border-0 bg-blue-100 px-1.5 py-0 text-[10px] text-blue-700">
              {TYPE_LABELS[q.type]}
            </Badge>
            {q.required && (
              <Badge className="h-5 border-0 bg-amber-100 px-1.5 py-0 text-[10px] text-amber-700">
                Obligatorio
              </Badge>
            )}
            {q.type === 'SELECT' && q.options.length > 0 && (
              <span className="truncate max-w-[200px] text-[10px] text-muted-foreground">
                {q.options.join(' · ')}
              </span>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex shrink-0 items-center gap-2">
          <Switch
            checked={q.active}
            onCheckedChange={() => onToggle(q)}
            className="scale-75 origin-center"
          />

          <div className="h-5 w-0.5 shrink-0 rounded-full bg-border" />

          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-500 hover:bg-amber-50 hover:text-amber-600"
              onClick={() => onEdit(q)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50 hover:text-red-600"
              onClick={() => onDelete(q.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BookingFormBuilder({ userId }: Props) {
  const [questions, setQuestions] = useState<BookingQuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<QuestionForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor));

  async function load() {
    setLoading(true);
    const data = await getBookingQuestions(userId);
    setQuestions(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [userId]);

  const filtered = search.trim()
    ? questions.filter((q) => q.label.toLowerCase().includes(search.toLowerCase()))
    : questions;

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowAdd(true);
  }

  function openEdit(q: BookingQuestionItem) {
    setShowAdd(false);
    setEditingId(q.id);
    setForm({ label: q.label, type: q.type, options: q.options.join(', '), required: q.required });
  }

  function closeForm() {
    setShowAdd(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleCreate() {
    if (!form.label.trim()) { toast.error('Escribe la pregunta'); return; }
    if (form.type === 'SELECT' && !form.options.trim()) { toast.error('Agrega al menos una opción'); return; }
    setSaving(true);
    const options = form.type === 'SELECT'
      ? form.options.split(',').map((o) => o.trim()).filter(Boolean)
      : [];
    const res = await createBookingQuestion({ label: form.label.trim(), type: form.type, options, required: form.required });
    setSaving(false);
    if (res.success) { toast.success('Pregunta agregada'); closeForm(); load(); }
    else toast.error(res.message ?? 'Error');
  }

  async function handleUpdate() {
    if (!editingId) return;
    if (!form.label.trim()) { toast.error('Escribe la pregunta'); return; }
    if (form.type === 'SELECT' && !form.options.trim()) { toast.error('Agrega al menos una opción'); return; }
    setSaving(true);
    const options = form.type === 'SELECT'
      ? form.options.split(',').map((o) => o.trim()).filter(Boolean)
      : [];
    const res = await updateBookingQuestion(editingId, { label: form.label.trim(), type: form.type, options, required: form.required });
    setSaving(false);
    if (res.success) { toast.success('Pregunta actualizada'); closeForm(); load(); }
    else toast.error(res.message ?? 'Error');
  }

  async function handleToggleActive(q: BookingQuestionItem) {
    await updateBookingQuestion(q.id, { active: !q.active });
    setQuestions((prev) => prev.map((item) => item.id === q.id ? { ...item, active: !item.active } : item));
  }

  async function handleDelete(id: string) {
    const res = await deleteBookingQuestion(id);
    if (res.success) { setQuestions((prev) => prev.filter((q) => q.id !== id)); toast.success('Pregunta eliminada'); }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = questions.findIndex((q) => q.id === active.id);
    const newIndex = questions.findIndex((q) => q.id === over.id);
    const reordered = arrayMove(questions, oldIndex, newIndex).map((q, i) => ({ ...q, order: i }));
    setQuestions(reordered);
    startTransition(async () => {
      await reorderBookingQuestions(reordered.map((q) => ({ id: q.id, order: q.order })));
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const isEditing = editingId !== null;
  const showForm = showAdd || isEditing;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <ModuleToolbar>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar pregunta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8"
          />
        </div>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openAdd}>
          + Crear
        </Button>
      </ModuleToolbar>

      {/* Formulario crear / editar */}
      {showForm && (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary" />
              <p className="font-semibold">
                {isEditing ? 'Editar pregunta' : 'Nueva pregunta'}
              </p>
            </div>
            <button
              type="button"
              onClick={closeForm}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex flex-col gap-4 p-5">
            <div className="space-y-1.5">
              <Label className="font-semibold text-foreground">Pregunta</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Ej: ¿Cuántos mensajes recibes al día?"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="font-semibold text-foreground">Tipo de respuesta</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as BookingQuestionType })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col justify-end items-end gap-1.5">
                <Label className="font-semibold text-foreground">Obligatorio</Label>
                <div className="flex items-center gap-2 h-10">
                  <span className="text-muted-foreground">
                    {form.required ? 'Sí, es obligatorio' : 'Opcional'}
                  </span>
                  <Switch
                    id="req"
                    checked={form.required}
                    onCheckedChange={(v) => setForm({ ...form, required: v })}
                  />
                </div>
              </div>
            </div>

            {form.type === 'SELECT' && (
              <div className="space-y-1.5">
                <Label className="font-semibold text-foreground">
                  Opciones{' '}
                  <span className="font-normal text-muted-foreground">(separadas por coma)</span>
                </Label>
                <Input
                  value={form.options}
                  onChange={(e) => setForm({ ...form, options: e.target.value })}
                  placeholder="Ej: 1-10, 10-50, 50-100, +100"
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t bg-muted/20">
            <Button variant="ghost" onClick={closeForm}>Cancelar</Button>
            <Button onClick={isEditing ? handleUpdate : handleCreate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : isEditing ? 'Actualizar' : 'Guardar'}
            </Button>
          </div>
        </div>
      )}

      {/* Lista — oculta mientras el formulario esté abierto */}
      {!showForm && (
        filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-4 pt-8 pb-4 text-muted-foreground">
            {search ? (
              <>
                <Search className="h-8 w-8 opacity-20" />
                <p className="text-sm">Sin resultados para &quot;{search}&quot;</p>
              </>
            ) : (
              <>
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                  <HelpCircle className="h-10 w-10 text-primary/60" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-foreground">Sin preguntas configuradas</p>
                  <p className="mt-1">Crea preguntas para precalificar a tus clientes antes de agendar.</p>
                </div>
                <Button onClick={openAdd} className="mt-1 bg-blue-600 hover:bg-blue-700 text-white">
                  + Crear primera pregunta
                </Button>
              </>
            )}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={filtered.map((q) => q.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {filtered.map((q, i) => (
                  <SortableQuestionItem
                    key={q.id}
                    question={q}
                    editingId={editingId}
                    isFirst={i === 0}
                    isLast={i === filtered.length - 1}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onToggle={handleToggleActive}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )
      )}
    </div>
  );
}
