'use client';

import { useEffect, useState, useTransition } from 'react';
import { Trash2, Loader2, ChevronDown, ChevronUp, Pencil, Search, HelpCircle } from 'lucide-react';
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

export function BookingFormBuilder({ userId }: Props) {
  const [questions, setQuestions] = useState<BookingQuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<QuestionForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

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

  async function handleMove(index: number, dir: -1 | 1) {
    const newList = [...questions];
    const target = index + dir;
    if (target < 0 || target >= newList.length) return;
    [newList[index], newList[target]] = [newList[target], newList[index]];
    const reordered = newList.map((q, i) => ({ ...q, order: i }));
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
        <div className="rounded-xl border bg-muted/30 p-4 flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {isEditing ? 'Editar pregunta' : 'Nueva pregunta'}
          </p>

          <div className="space-y-1">
            <Label className="text-xs">Pregunta</Label>
            <Input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Ej: ¿Cuántos mensajes recibes al día?"
              className="h-8 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as BookingQuestionType })}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end pb-0.5">
              <div className="flex items-center gap-1.5">
                <Switch
                  id="req"
                  checked={form.required}
                  onCheckedChange={(v) => setForm({ ...form, required: v })}
                />
                <Label htmlFor="req" className="text-xs cursor-pointer">Obligatorio</Label>
              </div>
            </div>
          </div>

          {form.type === 'SELECT' && (
            <div className="space-y-1">
              <Label className="text-xs">Opciones <span className="text-muted-foreground">(separadas por coma)</span></Label>
              <Input
                value={form.options}
                onChange={(e) => setForm({ ...form, options: e.target.value })}
                placeholder="Ej: 1-10, 10-50, 50-100, +100"
                className="h-8 text-sm"
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={isEditing ? handleUpdate : handleCreate} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isEditing ? 'Actualizar' : 'Guardar'}
            </Button>
            <Button size="sm" variant="ghost" onClick={closeForm}>Cancelar</Button>
          </div>
        </div>
      )}

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-muted-foreground">
          <p className="text-sm">{search ? 'Sin resultados' : 'Sin preguntas configuradas'}</p>
          {!search && <p className="text-xs">Haz clic en "+ Crear" para agregar la primera</p>}
        </div>
      ) : (
        <div className="flex flex-col">
          {filtered.map((q, i) => (
            <Card
              key={q.id}
              className={[
                'rounded-none border-x-0 border-b-0',
                'first:rounded-t-xl first:border-t',
                'last:rounded-b-xl last:border-b',
                !q.active ? 'opacity-50' : '',
                editingId === q.id ? 'ring-1 ring-inset ring-primary/30' : '',
              ].join(' ')}
            >
              <CardContent className="flex items-center gap-3 px-4 py-3">
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
                  {/* Reordenar */}
                  <div className="flex flex-col">
                    <button type="button" onClick={() => handleMove(i, -1)} disabled={i === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-20">
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => handleMove(i, 1)} disabled={i === questions.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-20">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="h-5 w-0.5 shrink-0 rounded-full bg-border" />

                  <Switch
                    checked={q.active}
                    onCheckedChange={() => handleToggleActive(q)}
                    className="scale-75 origin-center"
                  />

                  <div className="h-5 w-0.5 shrink-0 rounded-full bg-border" />

                  <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-500 hover:bg-amber-50 hover:text-amber-600"
                      onClick={() => openEdit(q)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50 hover:text-red-600"
                      onClick={() => handleDelete(q.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
