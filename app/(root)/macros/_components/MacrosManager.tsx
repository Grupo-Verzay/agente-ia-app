'use client';

import { useMemo, useState } from 'react';
import {
  Plus, Zap, Pencil, Trash2, ArrowUp, ArrowDown, X, Loader2, GripVertical,
  Search, CheckCircle2, List, Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/custom/MetricCard';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  createMacroAction,
  updateMacroAction,
  deleteMacroAction,
  type MacroData,
  type MacroActionItem,
  type MacroActionType,
} from '@/actions/macro-actions';

type TagOpt = { id: number; name: string; color: string | null };
type RROpt = { id: number; name: string | null; mensaje: string | null };
type AdvisorOpt = { id: string; name: string | null };
type WorkflowOpt = { id: string; name: string };

interface Props {
  initialMacros: MacroData[];
  tags: TagOpt[];
  quickReplies: RROpt[];
  advisors: AdvisorOpt[];
  workflows: WorkflowOpt[];
}

const ACTION_LABEL: Record<MacroActionType, string> = {
  SEND_TEXT: 'Enviar mensaje',
  SEND_QUICK_REPLY: 'Enviar respuesta rápida',
  EXECUTE_FLOW: 'Ejecutar flujo',
  ADD_TAG: 'Agregar etiqueta',
  CHANGE_STAGE: 'Cambiar etapa',
  ASSIGN_ADVISOR: 'Asignar asesor',
  INTERNAL_NOTE: 'Agregar nota interna',
  TOGGLE_AI: 'Agente IA',
  RESOLVE: 'Resolver conversación',
};

const ACTION_ORDER: MacroActionType[] = [
  'SEND_TEXT',
  'SEND_QUICK_REPLY',
  'EXECUTE_FLOW',
  'ADD_TAG',
  'CHANGE_STAGE',
  'ASSIGN_ADVISOR',
  'INTERNAL_NOTE',
  'TOGGLE_AI',
  'RESOLVE',
];

const STAGES = ['FRIO', 'TIBIO', 'CALIENTE', 'FINALIZADO', 'DESCARTADO'] as const;
const STAGE_LABEL: Record<string, string> = {
  FRIO: 'Frío',
  TIBIO: 'Tibio',
  CALIENTE: 'Caliente',
  FINALIZADO: 'Finalizado',
  DESCARTADO: 'Descartado',
};

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#64748b'];

type Draft = {
  id?: string;
  name: string;
  description: string;
  color: string;
  actions: MacroActionItem[];
};

const EMPTY_DRAFT: Draft = { name: '', description: '', color: COLORS[0], actions: [] };

export function MacrosManager({ initialMacros, tags, quickReplies, advisors, workflows }: Props) {
  const [macros, setMacros] = useState<MacroData[]>(initialMacros);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(
    () => macros.filter((m) => m.name.toLowerCase().includes(search.trim().toLowerCase())),
    [macros, search],
  );
  const activeCount = macros.filter((m) => m.enabled).length;
  const totalActions = macros.reduce((n, m) => n + m.actions.length, 0);
  const withFlow = macros.filter((m) => m.actions.some((a) => a.type === 'EXECUTE_FLOW')).length;

  const openCreate = () => {
    setDraft(EMPTY_DRAFT);
    setOpen(true);
  };
  const openEdit = (m: MacroData) => {
    setDraft({
      id: m.id,
      name: m.name,
      description: m.description ?? '',
      color: m.color ?? COLORS[0],
      actions: m.actions,
    });
    setOpen(true);
  };

  const addAction = () => {
    setDraft((d) => ({ ...d, actions: [...d.actions, { type: 'SEND_TEXT', config: { text: '' } }] }));
  };
  const removeAction = (i: number) => {
    setDraft((d) => ({ ...d, actions: d.actions.filter((_, idx) => idx !== i) }));
  };
  const moveAction = (i: number, dir: -1 | 1) => {
    setDraft((d) => {
      const next = [...d.actions];
      const j = i + dir;
      if (j < 0 || j >= next.length) return d;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...d, actions: next };
    });
  };
  const setActionType = (i: number, type: MacroActionType) => {
    setDraft((d) => {
      const next = [...d.actions];
      next[i] = { type, config: {} };
      return { ...d, actions: next };
    });
  };
  const setActionConfig = (i: number, config: MacroActionItem['config']) => {
    setDraft((d) => {
      const next = [...d.actions];
      next[i] = { ...next[i], config: { ...next[i].config, ...config } };
      return { ...d, actions: next };
    });
  };

  const save = async () => {
    if (!draft.name.trim()) {
      toast.error('Ponle un nombre a la macro.');
      return;
    }
    if (draft.actions.length === 0) {
      toast.error('Agrega al menos una acción.');
      return;
    }
    setSaving(true);
    if (draft.id) {
      const res = await updateMacroAction(draft.id, {
        name: draft.name,
        description: draft.description,
        color: draft.color,
        actions: draft.actions,
      });
      if (res.success) {
        setMacros((prev) =>
          prev.map((m) =>
            m.id === draft.id
              ? { ...m, name: draft.name, description: draft.description, color: draft.color, actions: draft.actions }
              : m,
          ),
        );
        toast.success('Macro actualizada.');
        setOpen(false);
      } else toast.error(res.message);
    } else {
      const res = await createMacroAction({
        name: draft.name,
        description: draft.description,
        color: draft.color,
        actions: draft.actions,
      });
      if (res.success && res.id) {
        setMacros((prev) => [
          ...prev,
          {
            id: res.id!,
            name: draft.name,
            description: draft.description || null,
            color: draft.color,
            actions: draft.actions,
            order: prev.length,
            enabled: true,
          },
        ]);
        toast.success('Macro creada.');
        setOpen(false);
      } else toast.error(res.message);
    }
    setSaving(false);
  };

  const remove = async (m: MacroData) => {
    const res = await deleteMacroAction(m.id);
    if (res.success) setMacros((prev) => prev.filter((x) => x.id !== m.id));
    else toast.error(res.message);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Métricas */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <MetricCard icon={<Zap className="h-4 w-4" />} label="Total" value={macros.length} helper="Macros creadas" color="#6366F1" />
        <MetricCard icon={<CheckCircle2 className="h-4 w-4" />} label="Activas" value={activeCount} helper="Macros habilitadas" color="#10B981" />
        <MetricCard icon={<List className="h-4 w-4" />} label="Acciones" value={totalActions} helper="Acciones en total" color="#3B82F6" />
        <MetricCard icon={<Workflow className="h-4 w-4" />} label="Con flujo" value={withFlow} helper="Macros que ejecutan un flujo" color="#F59E0B" />
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar macro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8"
          />
        </div>
        <Button size="sm" onClick={openCreate} className="ml-auto bg-blue-600 text-white hover:bg-blue-700">
          + Crear
        </Button>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
            <Zap className="mx-auto mb-2 h-8 w-8 opacity-40" />
            <p className="text-sm">
              {macros.length === 0 ? 'Aún no tienes macros. Crea la primera.' : 'Sin resultados para tu búsqueda.'}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: m.color || '#6366f1' }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{m.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.actions.length} acción{m.actions.length === 1 ? '' : 'es'}
                    {m.description ? ` · ${m.description}` : ''}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(m)} title="Editar">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-red-500"
                  onClick={() => void remove(m)}
                  title="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Editor */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] w-[min(96vw,640px)] overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-3">
            <DialogTitle>{draft.id ? 'Editar macro' : 'Nueva macro'}</DialogTitle>
          </DialogHeader>

          <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
            {/* Nombre + color */}
            <div className="mb-4">
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Nombre</label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Ej: Cierre Ganado"
              />
            </div>
            <div className="mb-4 flex items-center gap-3">
              <label className="shrink-0 text-xs font-semibold text-muted-foreground">Color</label>
              <div className="flex flex-wrap items-center gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, color: c }))}
                    className={cn(
                      'h-6 w-6 rounded-full ring-offset-2 ring-offset-background transition hover:scale-110',
                      draft.color === c && 'ring-2 ring-foreground',
                    )}
                    style={{ background: c }}
                  />
                ))}
                {/* Color personalizado */}
                <label
                  className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-border"
                  title="Color personalizado"
                  style={{ background: COLORS.includes(draft.color) ? undefined : draft.color }}
                >
                  <input
                    type="color"
                    value={draft.color}
                    onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                  {COLORS.includes(draft.color) && (
                    <span className="pointer-events-none absolute inset-0 bg-[conic-gradient(red,orange,yellow,lime,cyan,blue,magenta,red)] opacity-70" />
                  )}
                </label>
              </div>
            </div>

            {/* Acciones */}
            <div className="mb-2">
              <label className="text-xs font-semibold text-muted-foreground">Acciones (en orden)</label>
            </div>

            {draft.actions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                Aún no hay acciones. Usa “Agregar acción”.
              </p>
            ) : (
              <ol className="flex flex-col gap-2">
                {draft.actions.map((a, i) => (
                  <li key={i} className="rounded-lg border border-border bg-muted/20 p-2.5">
                    <div className="mb-2 flex items-center gap-2">
                      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                      <select
                        value={a.type}
                        onChange={(e) => setActionType(i, e.target.value as MacroActionType)}
                        className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm"
                      >
                        {ACTION_ORDER.map((t) => (
                          <option key={t} value={t}>
                            {ACTION_LABEL[t]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => moveAction(i, -1)}
                        disabled={i === 0}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                        title="Subir"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveAction(i, 1)}
                        disabled={i === draft.actions.length - 1}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                        title="Bajar"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeAction(i)}
                        className="text-muted-foreground hover:text-red-500"
                        title="Quitar"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Config por tipo */}
                    <div className="pl-6">
                      {a.type === 'SEND_TEXT' && (
                        <Textarea
                          value={a.config?.text ?? ''}
                          onChange={(e) => setActionConfig(i, { text: e.target.value })}
                          placeholder="Mensaje a enviar…"
                          rows={2}
                          className="text-sm"
                        />
                      )}
                      {a.type === 'INTERNAL_NOTE' && (
                        <Textarea
                          value={a.config?.content ?? ''}
                          onChange={(e) => setActionConfig(i, { content: e.target.value })}
                          placeholder="Contenido de la nota interna…"
                          rows={2}
                          className="text-sm"
                        />
                      )}
                      {a.type === 'SEND_QUICK_REPLY' && (
                        <select
                          value={a.config?.quickReplyId ?? ''}
                          onChange={(e) => setActionConfig(i, { quickReplyId: Number(e.target.value) })}
                          className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
                        >
                          <option value="">Elige una respuesta rápida…</option>
                          {quickReplies.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name || r.mensaje?.slice(0, 40) || `#${r.id}`}
                            </option>
                          ))}
                        </select>
                      )}
                      {a.type === 'EXECUTE_FLOW' && (
                        <select
                          value={a.config?.workflowId ?? ''}
                          onChange={(e) => setActionConfig(i, { workflowId: e.target.value })}
                          className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
                        >
                          <option value="">Elige un flujo…</option>
                          {workflows.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {a.type === 'ADD_TAG' && (
                        <select
                          value={a.config?.tagId ?? ''}
                          onChange={(e) => setActionConfig(i, { tagId: Number(e.target.value) })}
                          className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
                        >
                          <option value="">Elige una etiqueta…</option>
                          {tags.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {a.type === 'CHANGE_STAGE' && (
                        <select
                          value={a.config?.stage ?? ''}
                          onChange={(e) => setActionConfig(i, { stage: e.target.value })}
                          className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
                        >
                          <option value="">Elige una etapa…</option>
                          {STAGES.map((s) => (
                            <option key={s} value={s}>
                              {STAGE_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      )}
                      {a.type === 'ASSIGN_ADVISOR' && (
                        <select
                          value={a.config?.advisorId ?? ''}
                          onChange={(e) => setActionConfig(i, { advisorId: e.target.value })}
                          className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
                        >
                          <option value="">Elige un asesor…</option>
                          {advisors.map((ad) => (
                            <option key={ad.id} value={ad.id}>
                              {ad.name || ad.id}
                            </option>
                          ))}
                        </select>
                      )}
                      {a.type === 'TOGGLE_AI' && (
                        <select
                          value={a.config?.disabled ? 'off' : 'on'}
                          onChange={(e) => setActionConfig(i, { disabled: e.target.value === 'off' })}
                          className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
                        >
                          <option value="on">Activar Agente IA</option>
                          <option value="off">Desactivar Agente IA</option>
                        </select>
                      )}
                      {a.type === 'RESOLVE' && (
                        <p className="text-xs text-muted-foreground">Marca la conversación como resuelta.</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {/* Agregar acción (abajo, para ir sumando) */}
            <Button
              variant="outline"
              className="mt-2 w-full gap-1.5 border-dashed"
              onClick={addAction}
            >
              <Plus className="h-4 w-4" /> Agregar acción
            </Button>
          </div>

          <DialogFooter className="flex-row justify-between border-t px-5 py-3">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
