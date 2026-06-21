'use client';

import { useEffect, useState, useTransition } from 'react';
import { Plus, Trash2, GripVertical, Loader2, ChevronDown, ChevronUp, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
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

interface NewQuestionForm {
  label: string;
  type: BookingQuestionType;
  options: string;
  required: boolean;
}

const EMPTY_FORM: NewQuestionForm = { label: '', type: 'TEXT', options: '', required: false };

export function BookingFormBuilder({ userId }: Props) {
  const [questions, setQuestions] = useState<BookingQuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<NewQuestionForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function load() {
    setLoading(true);
    const data = await getBookingQuestions(userId);
    setQuestions(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [userId]);

  async function handleCreate() {
    if (!form.label.trim()) { toast.error('Escribe la pregunta'); return; }
    if (form.type === 'SELECT' && !form.options.trim()) { toast.error('Agrega al menos una opción separada por coma'); return; }

    setSaving(true);
    const options = form.type === 'SELECT'
      ? form.options.split(',').map((o) => o.trim()).filter(Boolean)
      : [];

    const res = await createBookingQuestion({ label: form.label.trim(), type: form.type, options, required: form.required });
    setSaving(false);
    if (res.success) {
      toast.success('Pregunta agregada');
      setForm(EMPTY_FORM);
      setShowAdd(false);
      load();
    } else {
      toast.error(res.message ?? 'Error al crear pregunta');
    }
  }

  async function handleToggleActive(q: BookingQuestionItem) {
    await updateBookingQuestion(q.id, { active: !q.active });
    setQuestions((prev) => prev.map((item) => item.id === q.id ? { ...item, active: !item.active } : item));
  }

  async function handleDelete(id: string) {
    const res = await deleteBookingQuestion(id);
    if (res.success) {
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      toast.success('Pregunta eliminada');
    }
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Preguntas de precalificación</p>
          <p className="text-xs text-muted-foreground">
            Se muestran al cliente antes de confirmar su cita. Las respuestas se guardan en la App y se sincronizan a tu Google Sheet.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowAdd((v) => !v)}>
          <Plus className="h-3.5 w-3.5" />
          Agregar
        </Button>
      </div>

      {/* Formulario para nueva pregunta */}
      {showAdd && (
        <div className="rounded-xl border bg-muted/30 p-4 flex flex-col gap-3">
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

            <div className="flex items-end gap-2 pb-0.5">
              <div className="flex items-center gap-1.5">
                <Switch
                  id="required"
                  checked={form.required}
                  onCheckedChange={(v) => setForm({ ...form, required: v })}
                />
                <Label htmlFor="required" className="text-xs cursor-pointer">Obligatorio</Label>
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
            <Button size="sm" onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Guardar pregunta'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); }}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Lista de preguntas */}
      {questions.length === 0 && !showAdd ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-muted-foreground">
          <p className="text-sm">Sin preguntas configuradas</p>
          <p className="text-xs">Haz clic en "Agregar" para crear la primera</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {questions.map((q, i) => (
            <div
              key={q.id}
              className={`flex items-start gap-2 rounded-lg border bg-card p-3 ${!q.active ? 'opacity-50' : ''}`}
            >
              {/* Drag handle / reorder */}
              <div className="flex flex-col gap-0.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => handleMove(i, -1)}
                  disabled={i === 0}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-20"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(i, 1)}
                  disabled={i === questions.length - 1}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-20"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug truncate">{q.label}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{TYPE_LABELS[q.type]}</Badge>
                  {q.required && <Badge variant="outline" className="text-[10px] h-4 px-1.5">Obligatorio</Badge>}
                  {q.type === 'SELECT' && q.options.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">{q.options.join(' · ')}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Switch
                  checked={q.active}
                  onCheckedChange={() => handleToggleActive(q)}
                  className="scale-75"
                />
                <button
                  type="button"
                  onClick={() => handleDelete(q.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
