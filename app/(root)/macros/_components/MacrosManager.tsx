'use client';

import { useMemo, useState } from 'react';
import {
  Plus, Zap, Pencil, Trash2, ArrowUp, ArrowDown, X, Loader2, GripVertical,
  Search, CheckCircle2, List, Play, MoreVertical, Copy, Power, PowerOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/custom/MetricCard';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  createMacroAction,
  updateMacroAction,
  deleteMacroAction,
  duplicateMacroAction,
  deleteMacrosAction,
  deleteAllMacrosAction,
  reorderMacrosAction,
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

const COLORS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#14b8a6', '#10b981', '#22c55e',
  '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#8b5cf6',
];

type Draft = {
  id?: string;
  name: string;
  description: string;
  color: string;
  actions: MacroActionItem[];
};

const EMPTY_DRAFT: Draft = { name: '', description: '', color: COLORS[0], actions: [] };

type RowHandlers = {
  isSelected: (id: string) => boolean;
  onToggleSelect: (id: string) => void;
  onEdit: (m: MacroData) => void;
  onDuplicate: (m: MacroData) => void;
  onToggleEnabled: (m: MacroData) => void;
  onDelete: (m: MacroData) => void;
};

function MacroRowInner({ macro, h }: { macro: MacroData; h: RowHandlers }) {
  return (
    <>
      <input
        type="checkbox"
        checked={h.isSelected(macro.id)}
        onChange={() => h.onToggleSelect(macro.id)}
        onClick={(e) => e.stopPropagation()}
        className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
        title="Seleccionar"
      />
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: macro.color || '#6366f1' }} />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate font-semibold', !macro.enabled && 'text-muted-foreground line-through')}>
          {macro.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {macro.actions.length} acción{macro.actions.length === 1 ? '' : 'es'}
          {macro.runCount > 0
            ? ` · ${macro.runCount} ejecución${macro.runCount === 1 ? '' : 'es'}`
            : ''}
          {!macro.enabled ? ' · Inactiva' : ''}
        </p>
      </div>
      {/* Íconos directos (rápidos) */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-amber-500 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/30"
        onClick={() => h.onEdit(macro)}
        title="Editar"
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
        onClick={() => h.onDelete(macro)}
        title="Eliminar"
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      {/* Menú con acciones extra */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted"
            title="Más acciones"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => h.onDuplicate(macro)} className="gap-2 cursor-pointer">
            <Copy className="h-3.5 w-3.5" /> Duplicar
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => h.onToggleEnabled(macro)} className="gap-2 cursor-pointer">
            {macro.enabled ? (
              <><PowerOff className="h-3.5 w-3.5" /> Desactivar</>
            ) : (
              <><Power className="h-3.5 w-3.5" /> Activar</>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function SortableMacroRow({ macro, h }: { macro: MacroData; h: RowHandlers }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: macro.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-3"
    >
      <button
        type="button"
        className="cursor-grab touch-none p-1 text-muted-foreground/50 hover:text-foreground"
        title="Arrastrar para reordenar"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <MacroRowInner macro={macro} h={h} />
    </div>
  );
}

export function MacrosManager({ initialMacros, tags, quickReplies, advisors, workflows }: Props) {
  const [macros, setMacros] = useState<MacroData[]>(initialMacros);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ open: boolean; ids: string[]; all: boolean }>({
    open: false,
    ids: [],
    all: false,
  });
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(
    () => macros.filter((m) => m.name.toLowerCase().includes(search.trim().toLowerCase())),
    [macros, search],
  );
  const activeCount = macros.filter((m) => m.enabled).length;
  const totalActions = macros.reduce((n, m) => n + m.actions.length, 0);
  const totalRuns = macros.reduce((n, m) => n + m.runCount, 0);

  const sensors = useSensors(useSensor(PointerSensor));
  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = macros.findIndex((m) => m.id === active.id);
    const newIndex = macros.findIndex((m) => m.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(macros, oldIndex, newIndex);
    setMacros(reordered);
    await reorderMacrosAction(reordered.map((m) => m.id));
  };
  const isSearching = search.trim().length > 0;

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
            runCount: 0,
            lastRunAt: null,
          },
        ]);
        toast.success('Macro creada.');
        setOpen(false);
      } else toast.error(res.message);
    }
    setSaving(false);
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const duplicate = async (m: MacroData) => {
    const res = await duplicateMacroAction(m.id);
    if (res.success && res.id) {
      setMacros((prev) => [
        ...prev,
        { ...m, id: res.id!, name: `${m.name} (copia)`, order: prev.length, runCount: 0, lastRunAt: null },
      ]);
      toast.success('Macro duplicada.');
    } else toast.error(res.message);
  };

  const toggleEnabled = async (m: MacroData) => {
    const next = !m.enabled;
    setMacros((prev) => prev.map((x) => (x.id === m.id ? { ...x, enabled: next } : x)));
    const res = await updateMacroAction(m.id, { enabled: next });
    if (!res.success) {
      setMacros((prev) => prev.map((x) => (x.id === m.id ? { ...x, enabled: m.enabled } : x)));
      toast.error(res.message);
    }
  };

  const doConfirmDelete = async () => {
    setDeleting(true);
    if (confirm.all) {
      const res = await deleteAllMacrosAction();
      if (res.success) {
        setMacros([]);
        setSelected(new Set());
      } else toast.error(res.message);
    } else {
      const ids = confirm.ids;
      const res = ids.length === 1 ? await deleteMacroAction(ids[0]) : await deleteMacrosAction(ids);
      if (res.success) {
        setMacros((prev) => prev.filter((m) => !ids.includes(m.id)));
        setSelected((prev) => {
          const n = new Set(prev);
          ids.forEach((i) => n.delete(i));
          return n;
        });
      } else toast.error(res.message);
    }
    setDeleting(false);
    setConfirm({ open: false, ids: [], all: false });
  };

  const h: RowHandlers = {
    isSelected: (id) => selected.has(id),
    onToggleSelect: toggleSelect,
    onEdit: openEdit,
    onDuplicate: (m) => void duplicate(m),
    onToggleEnabled: (m) => void toggleEnabled(m),
    onDelete: (m) => setConfirm({ open: true, ids: [m.id], all: false }),
  };

  return (
    <div className="flex h-full flex-col">
      {/* Métricas */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <MetricCard icon={<Zap className="h-4 w-4" />} label="Total" value={macros.length} helper="Macros creadas" color="#6366F1" />
        <MetricCard icon={<CheckCircle2 className="h-4 w-4" />} label="Activas" value={activeCount} helper="Macros habilitadas" color="#10B981" />
        <MetricCard icon={<List className="h-4 w-4" />} label="Acciones" value={totalActions} helper="Acciones en total" color="#3B82F6" />
        <MetricCard icon={<Play className="h-4 w-4" />} label="Ejecuciones" value={totalRuns} helper="Veces que se han aplicado las macros" color="#F59E0B" />
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
        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setConfirm({ open: true, ids: Array.from(selected), all: false })}
            >
              Eliminar ({selected.size})
            </Button>
          )}
          {macros.length > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setConfirm({ open: true, ids: [], all: true })}
            >
              Eliminar todas
            </Button>
          )}
          <Button size="sm" onClick={openCreate} className="bg-blue-600 text-white hover:bg-blue-700">
            + Crear
          </Button>
        </div>
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
        ) : isSearching ? (
          <div className="flex flex-col gap-2">
            {filtered.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-3"
              >
                <MacroRowInner macro={m} h={h} />
              </div>
            ))}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={macros.map((m) => m.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {macros.map((m) => (
                  <SortableMacroRow key={m.id} macro={m} h={h} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
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
            <button
              type="button"
              onClick={addAction}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary transition hover:border-primary/60 hover:bg-primary/10"
            >
              <Plus className="h-4 w-4" /> Agregar acción
            </button>
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

      {/* Confirmación de borrado (lote / todos) */}
      <Dialog
        open={confirm.open}
        onOpenChange={(o) => !o && setConfirm({ open: false, ids: [], all: false })}
      >
        <DialogContent className="w-[min(94vw,420px)]">
          <DialogHeader>
            <DialogTitle>{confirm.all ? 'Eliminar todas las macros' : 'Eliminar macros'}</DialogTitle>
          </DialogHeader>
          <p className="px-1 text-sm text-muted-foreground">
            {confirm.all
              ? 'Se eliminarán TODAS tus macros. Esta acción no se puede deshacer.'
              : `Se eliminará${confirm.ids.length === 1 ? '' : 'n'} ${confirm.ids.length} macro${confirm.ids.length === 1 ? '' : 's'}. Esta acción no se puede deshacer.`}
          </p>
          <DialogFooter className="flex-row justify-between">
            <Button
              variant="outline"
              onClick={() => setConfirm({ open: false, ids: [], all: false })}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void doConfirmDelete()} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
