'use client';

import { GrabadorDeAudio } from '@/components/shared/GrabadorDeAudio';
import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Zap, Pencil, Trash2, ArrowUp, ArrowDown, X, Loader2, GripVertical,
  Search, CheckCircle2, CircleOff, MoreVertical, Copy, Power, PowerOff, Paperclip,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PastillasDeMetricas } from '@/components/shared/PastillasDeMetricas';
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
  ETIQUETA_DE_ACCION,
  GRUPOS_DE_ACCIONES,
  TIPOS_DE_TAREA,
  COLORES_DE_MACRO,
  SEGUNDOS_MAXIMOS_DE_ESPERA,
  SEGUNDOS_POR_DEFECTO,
  porQueNoEstaLista,
  losProblemasDeLaMacro,
  lasMacrosQueSeVen,
  losConteosDeMacros,
  sePuedeReordenar,
  elMensajeDeLaListaVacia,
  elDetalleDeLaFila,
  type FiltroDeMacros,
} from '@/lib/macros';
import { LEAD_STATUS_FILTER_OPTIONS } from '@/app/(root)/crm/dashboard/helpers/leadStatus';
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
import { listMetaTemplates, type MetaTemplateOption } from '@/actions/channel-chat-actions';
import { BarraDeAcciones, BotonDeCrear } from '@/components/shared/BarraDeAcciones';
import { AccionesMasivas, CasillaDeFila, useSeleccionMultiple } from '@/components/shared/AccionesMasivas';

type TagOpt = { id: number; name: string; color: string | null };
type RROpt = { id: number; name: string | null; mensaje: string | null };
type AdvisorOpt = { id: string; name: string | null };
type WorkflowOpt = { id: string; name: string };
type LineOpt = { instanceName: string; label: string; type: string };

interface Props {
  initialMacros: MacroData[];
  tags: TagOpt[];
  quickReplies: RROpt[];
  advisors: AdvisorOpt[];
  workflows: WorkflowOpt[];
  lines: LineOpt[];
  userId: string;
}

// Las acciones, sus grupos y sus nombres viven en `lib/macros.ts`: los usan
// también la acción que corre la macro y la guía pública.
const COLORS: readonly string[] = COLORES_DE_MACRO;

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
      <CasillaDeFila
        marcada={h.isSelected(macro.id)}
        onCambiar={() => h.onToggleSelect(macro.id)}
        etiqueta={`Seleccionar ${macro.name}`}
      />
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: macro.color || '#6366f1' }} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate font-semibold', !macro.enabled && 'text-muted-foreground line-through')}>
          {macro.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {elDetalleDeLaFila({ acciones: macro.actions.length, ejecuciones: macro.runCount, activa: macro.enabled })}
        </p>
      </div>
      {/* Íconos directos (rápidos) */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-amber-500 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/30"
        onClick={() => h.onEdit(macro)}
        title="Editar"
        aria-label={`Editar ${macro.name}`}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
        onClick={() => h.onDelete(macro)}
        title="Eliminar"
        aria-label={`Eliminar ${macro.name}`}
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
            aria-label={`Más acciones de ${macro.name}`}
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
      data-macro-de-la-lista
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

export function MacrosManager({ initialMacros, tags, quickReplies, advisors, workflows, lines, userId }: Props) {
  const [macros, setMacros] = useState<MacroData[]>(initialMacros);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<FiltroDeMacros>('todas');
  // Se enseña qué le falta a cada acción solo después del primer intento de
  // guardar: pintarlo en rojo mientras se está escribiendo sería regañar.
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [confirm, setConfirm] = useState<{ open: boolean; ids: string[]; all: boolean; nombre?: string }>({
    open: false,
    ids: [],
    all: false,
  });
  const [deleting, setDeleting] = useState(false);
  // Plantillas de Meta por línea (WhatsApp Cloud), cargadas bajo demanda para el
  // selector "Enviar por otra línea" cuando la línea elegida es de tipo Meta.
  const [templatesByLine, setTemplatesByLine] = useState<Record<string, MetaTemplateOption[]>>({});
  const [loadingTemplates, setLoadingTemplates] = useState<Set<string>>(new Set());

  const metaLineNames = useMemo(
    () => new Set(lines.filter((l) => l.type === 'meta').map((l) => l.instanceName)),
    [lines],
  );

  // Carga las plantillas de las líneas Meta usadas en el borrador (una sola vez por línea).
  useEffect(() => {
    const needed = draft.actions
      .filter((a) => a.type === 'SEND_TEXT_VIA')
      .map((a) => a.config?.instanceName)
      .filter((n): n is string => !!n && metaLineNames.has(n) && !(n in templatesByLine) && !loadingTemplates.has(n));
    if (needed.length === 0) return;
    setLoadingTemplates((prev) => {
      const next = new Set(prev);
      needed.forEach((n) => next.add(n));
      return next;
    });
    needed.forEach(async (inst) => {
      const res = await listMetaTemplates(inst);
      setTemplatesByLine((prev) => ({ ...prev, [inst]: res.success ? res.templates : [] }));
      setLoadingTemplates((prev) => {
        const next = new Set(prev);
        next.delete(inst);
        return next;
      });
    });
  }, [draft.actions, metaLineNames, templatesByLine, loadingTemplates]);

  // Lo que se ve con el buscador y la pastilla puestos. Los números de las
  // pastillas son de la lista ENTERA, para que no cambien al pulsarlas.
  const filtered = useMemo(() => lasMacrosQueSeVen(macros, search, filtro), [macros, search, filtro]);
  const conteos = useMemo(() => losConteosDeMacros(macros), [macros]);

  // Marcar es de lo que se VE: con un filtro puesto, lo escondido no cuenta
  // —si no, «eliminar 3» se llevaría macros que quien mira no tiene delante—.
  const idsVisibles = useMemo(() => filtered.map((m) => m.id), [filtered]);
  const seleccion = useSeleccionMultiple(idsVisibles);

  const sensors = useSensors(useSensor(PointerSensor));
  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = macros.findIndex((m) => m.id === active.id);
    const newIndex = macros.findIndex((m) => m.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const antes = macros;
    const reordered = arrayMove(macros, oldIndex, newIndex);
    setMacros(reordered);
    // Si el servidor dice que no, se devuelve tal cual estaba: un orden que se
    // ve y no se guardó vuelve solo al recargar, y nadie sabe por qué.
    const res = await reorderMacrosAction(reordered.map((m) => m.id));
    if (!res.success) {
      setMacros(antes);
      toast.error('No se pudo guardar el nuevo orden.');
    }
  };
  // Se arrastra solo con la lista ENTERA a la vista: el orden se guarda
  // completo, y con un filtro puesto las escondidas perderían su sitio.
  const reordenable = sePuedeReordenar(search, filtro);

  const openCreate = () => {
    setDraft(EMPTY_DRAFT);
    setIntentoGuardar(false);
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
    setIntentoGuardar(false);
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
      // La pausa nace con los segundos que su campo enseña: con `{}` el campo
      // decía «2» y la macro no esperaba nada.
      next[i] = { type, config: type === 'WAIT' ? { seconds: SEGUNDOS_POR_DEFECTO } : {} };
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
  const uploadFileForAction = async (i: number, file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      toast.error('El archivo no puede superar 25 MB.');
      return;
    }
    setUploadingIdx(i);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('userID', userId);
      form.append('workflowID', 'macros');
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok || !json?.url) throw new Error(json?.error || 'No se pudo subir');
      const mime = file.type || 'application/octet-stream';
      const mt = mime.startsWith('image/')
        ? 'image'
        : mime.startsWith('video/')
          ? 'video'
          : mime.startsWith('audio/')
            ? 'audio'
            : 'document';
      setActionConfig(i, {
        mediaUrl: json.url,
        mediatype: mt,
        mimetype: mime,
        fileName: file.name,
      });
    } catch (e: any) {
      toast.error(e?.message || 'Error al subir el archivo.');
    } finally {
      setUploadingIdx(null);
    }
  };

  const save = async () => {
    // La MISMA regla que la acción usa al correrla (`lib/macros.ts`): una
    // acción a medias no se guarda, porque al correrla no haría nada.
    const problemas = losProblemasDeLaMacro(draft);
    if (problemas.length > 0) {
      setIntentoGuardar(true);
      toast.error(problemas[0]);
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

  // Borrar las marcadas desde el `⋯`. Va por `deleteMacrosAction`, que es la
  // acción de servidor que YA existía y recibe el arreglo entero: veinte
  // llamadas sueltas serían veinte viajes en fila india.
  const borrarLasMarcadas = async (ids: string[]) => {
    const res = await deleteMacrosAction(ids);
    if (!res.success) {
      toast.error(res.message);
      return { fallaron: ids.length };
    }
    setMacros((prev) => prev.filter((m) => !ids.includes(m.id)));
    return { fallaron: 0 };
  };

  const doConfirmDelete = async () => {
    setDeleting(true);
    if (confirm.all) {
      const res = await deleteAllMacrosAction();
      if (res.success) {
        setMacros([]);
        seleccion.limpiar();
      } else toast.error(res.message);
    } else {
      const ids = confirm.ids;
      const res = ids.length === 1 ? await deleteMacroAction(ids[0]) : await deleteMacrosAction(ids);
      if (res.success) {
        setMacros((prev) => prev.filter((m) => !ids.includes(m.id)));
      } else toast.error(res.message);
    }
    setDeleting(false);
    setConfirm({ open: false, ids: [], all: false });
  };

  const h: RowHandlers = {
    isSelected: (id) => seleccion.seleccionados.includes(id),
    onToggleSelect: seleccion.alternar,
    onEdit: openEdit,
    onDuplicate: (m) => void duplicate(m),
    onToggleEnabled: (m) => void toggleEnabled(m),
    onDelete: (m) => setConfirm({ open: true, ids: [m.id], all: false, nombre: m.name }),
  };

  return (
    <div className="flex h-full flex-col">
      {/* La barra es `BarraDeAcciones`. Antes era un `flex-wrap` con `ml-auto`,
          o sea la forma que en Plantillas partía la barra en dos filas a 1024
          —y aquí había hasta tres botones sueltos a la derecha—. */}
      <BarraDeAcciones
        buscador={
          <div className="relative w-56 shrink-0 sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar macro..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8"
            />
          </div>
        }
        className="mb-3"
        filtros={
          // Las pastillas FILTRAN la lista: Todas, Activas e Inactivas, con el
          // número de cada una. Antes eran cuatro cifras sin filtro detrás
          // —total, activas, acciones y ejecuciones—, y una cifra que no filtra
          // no va en la barra. Las acciones y ejecuciones de cada macro siguen
          // en su fila. En el teléfono también: son la única forma de llegar a
          // las inactivas.
          <PastillasDeMetricas
            enElTelefono
            metricas={[
              { clave: 'todas', icono: <Zap />, etiqueta: 'Todas', valor: conteos.todas, color: '#6366F1', ayuda: 'Todas tus macros', alPulsar: () => setFiltro('todas'), activa: filtro === 'todas' },
              { clave: 'activas', icono: <CheckCircle2 />, etiqueta: 'Activas', valor: conteos.activas, color: '#10B981', ayuda: 'Las que salen en el botón «Macros» de Chats', alPulsar: () => setFiltro('activas'), activa: filtro === 'activas' },
              { clave: 'inactivas', icono: <CircleOff />, etiqueta: 'Inactivas', valor: conteos.inactivas, color: '#94A3B8', ayuda: 'Desactivadas: no salen en Chats', alPulsar: () => setFiltro('inactivas'), activa: filtro === 'inactivas' },
            ]}
          />
        }
        crear={<BotonDeCrear onClick={openCreate}>Nuevo</BotonDeCrear>}
        acciones={
          <AccionesMasivas
            seleccionados={seleccion.seleccionados}
            queSon="macros"
            onEliminar={borrarLasMarcadas}
            onTerminar={seleccion.limpiar}
            extras={
              macros.length > 0
                ? [{
                    clave: "todas",
                    etiqueta: "Eliminar todas",
                    icono: <Trash2 className="h-4 w-4" />,
                    destructiva: true,
                    sinSeleccion: true,
                    onSelect: () => setConfirm({ open: true, ids: [], all: true }),
                  }]
                : []
            }
          />
        }
      />

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
            <Zap className="mx-auto mb-2 h-8 w-8 opacity-40" />
            <p className="text-sm">{elMensajeDeLaListaVacia(macros.length, search, filtro)}</p>
          </div>
        ) : !reordenable ? (
          <div className="flex flex-col gap-2" data-lista-de-macros>
            {filtered.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-3"
                data-macro-de-la-lista
              >
                {/* El asa se queda, apagada: sin ella la fila entera se corría
                    a la izquierda al filtrar, y no se leía como la misma lista. */}
                <span
                  className="cursor-not-allowed p-1 text-muted-foreground/25"
                  title="Para ordenar, vuelve a «Todas» y borra el buscador"
                  aria-hidden
                >
                  <GripVertical className="h-4 w-4" />
                </span>
                <MacroRowInner macro={m} h={h} />
              </div>
            ))}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={macros.map((m) => m.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2" data-lista-de-macros>
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
        {/* Sin `overflow-hidden` ni un cuerpo con su propio `max-h`: desplaza el
            propio diálogo, con la cabecera y el pie pegajosos, como en toda la
            plataforma. Con los dos puestos, una macro larga tenía una barra de
            desplazamiento dentro de otra caja de alto fijo. */}
        <DialogContent className="w-[min(96vw,640px)] gap-0 p-0" data-editor-de-macro>
          <DialogHeader className="border-b px-5 py-3">
            <DialogTitle>{draft.id ? 'Editar macro' : 'Nueva macro'}</DialogTitle>
          </DialogHeader>

          <div className="px-5 py-4">
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
                  <li
                    key={i}
                    className={cn(
                      'rounded-lg border bg-muted/20 p-2.5',
                      intentoGuardar && porQueNoEstaLista(a) ? 'border-red-300 dark:border-red-800' : 'border-border',
                    )}
                    data-accion-de-macro={i + 1}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      {/* El número de la acción: se corren en este orden. Antes
                          había un asa de arrastrar que no arrastraba nada. */}
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                        {i + 1}
                      </span>
                      <select
                        value={a.type}
                        onChange={(e) => setActionType(i, e.target.value as MacroActionType)}
                        className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm"
                        aria-label={`Tipo de la acción ${i + 1}`}
                      >
                        {GRUPOS_DE_ACCIONES.map((g) => (
                          <optgroup key={g.grupo} label={g.grupo}>
                            {g.tipos.map((t) => (
                              <option key={t} value={t}>
                                {ETIQUETA_DE_ACCION[t]}
                              </option>
                            ))}
                          </optgroup>
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
                    <div className="pl-7">
                      {a.type === 'SEND_TEXT' && (
                        <Textarea
                          value={a.config?.text ?? ''}
                          onChange={(e) => setActionConfig(i, { text: e.target.value })}
                          placeholder="Mensaje a enviar…"
                          rows={2}
                          className="text-sm"
                        />
                      )}
                      {a.type === 'SEND_TEXT_VIA' && (() => {
                        const selName = a.config?.instanceName ?? '';
                        const isMeta = !!selName && metaLineNames.has(selName);
                        const tpls = selName ? templatesByLine[selName] ?? [] : [];
                        const loadingTpl = selName ? loadingTemplates.has(selName) : false;
                        const mode = a.config?.viaMode === 'template' ? 'template' : 'text';
                        const selTpl = tpls.find((t) => t.name === a.config?.templateName);
                        const params = a.config?.templateParams ?? [];
                        return (
                          <div className="space-y-1.5">
                            <select
                              value={selName}
                              onChange={(e) => {
                                const name = e.target.value;
                                const meta = metaLineNames.has(name);
                                setActionConfig(i, {
                                  instanceName: name,
                                  // En líneas Meta, por defecto plantilla (el texto libre solo
                                  // llega dentro de la ventana de 24 h); en el resto, texto.
                                  viaMode: meta ? 'template' : 'text',
                                  templateName: '',
                                  templateLanguage: '',
                                  templateBody: '',
                                  templateParams: [],
                                });
                              }}
                              className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
                            >
                              <option value="">Elige la línea…</option>
                              {lines.map((l) => (
                                <option key={l.instanceName} value={l.instanceName}>
                                  {l.label}
                                </option>
                              ))}
                            </select>

                            {isMeta && (
                              <div className="inline-flex rounded-md border border-border p-0.5">
                                <button
                                  type="button"
                                  onClick={() => setActionConfig(i, { viaMode: 'template' })}
                                  className={cn(
                                    'rounded px-2 py-0.5 text-xs',
                                    mode === 'template' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                                  )}
                                >
                                  Plantilla de Meta
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setActionConfig(i, { viaMode: 'text' })}
                                  className={cn(
                                    'rounded px-2 py-0.5 text-xs',
                                    mode === 'text' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                                  )}
                                >
                                  Texto libre
                                </button>
                              </div>
                            )}

                            {isMeta && mode === 'template' ? (
                              <div className="space-y-1.5">
                                <select
                                  value={a.config?.templateName ?? ''}
                                  onChange={(e) => {
                                    const t = tpls.find((x) => x.name === e.target.value);
                                    setActionConfig(i, {
                                      templateName: t?.name ?? '',
                                      templateLanguage: t?.language ?? '',
                                      templateBody: t?.bodyText ?? '',
                                      templateParams: t ? new Array(t.paramCount).fill('') : [],
                                    });
                                  }}
                                  disabled={loadingTpl || tpls.length === 0}
                                  className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm disabled:opacity-60"
                                >
                                  <option value="">
                                    {loadingTpl ? 'Cargando plantillas…' : 'Elige una plantilla…'}
                                  </option>
                                  {tpls.map((t) => (
                                    <option key={`${t.name}-${t.language}`} value={t.name}>
                                      {t.name} ({t.language})
                                    </option>
                                  ))}
                                </select>
                                {selTpl && (
                                  <>
                                    <p className="whitespace-pre-wrap rounded bg-muted p-2 text-xs text-muted-foreground">
                                      {selTpl.bodyText}
                                    </p>
                                    {selTpl.paramCount > 0 &&
                                      Array.from({ length: selTpl.paramCount }).map((_, pi) => (
                                        <Input
                                          key={pi}
                                          value={params[pi] ?? ''}
                                          onChange={(e) => {
                                            const next = [...(params.length ? params : new Array(selTpl.paramCount).fill(''))];
                                            next[pi] = e.target.value;
                                            setActionConfig(i, { templateParams: next });
                                          }}
                                          placeholder={`Valor {{${pi + 1}}}`}
                                          className="h-8 text-sm"
                                        />
                                      ))}
                                  </>
                                )}
                                {!loadingTpl && selName && tpls.length === 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    Esta línea no tiene plantillas aprobadas en Meta.
                                  </p>
                                )}
                              </div>
                            ) : (
                              <>
                                <Textarea
                                  value={a.config?.text ?? ''}
                                  onChange={(e) => setActionConfig(i, { text: e.target.value })}
                                  placeholder="Mensaje a enviar por esa línea…"
                                  rows={2}
                                  className="text-sm"
                                />
                                {isMeta && (
                                  <p className="text-xs text-muted-foreground">
                                    En líneas de Meta el texto libre solo llega dentro de la ventana de 24 h.
                                    Para iniciar la conversación usa una plantilla.
                                  </p>
                                )}
                              </>
                            )}

                            {lines.length === 0 && (
                              <p className="text-xs text-muted-foreground">
                                No hay líneas conectadas disponibles.
                              </p>
                            )}
                          </div>
                        );
                      })()}
                      {a.type === 'SEND_FILE' && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent">
                              <Paperclip className="h-4 w-4" />
                              {uploadingIdx === i ? 'Subiendo…' : a.config?.fileName ? 'Cambiar archivo' : 'Elegir archivo'}
                              <input
                                type="file"
                                className="hidden"
                                disabled={uploadingIdx === i}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) void uploadFileForAction(i, f);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                            {a.config?.fileName && (
                              <span className="truncate text-xs text-muted-foreground">{a.config.fileName}</span>
                            )}
                          </div>
                          {/* O grabarlo aquí mismo: entra por el MISMO camino que elegir archivo. */}
                          <GrabadorDeAudio
                            disabled={uploadingIdx === i}
                            onGrabado={(f) => uploadFileForAction(i, f)}
                          />
                          <Textarea
                            value={a.config?.caption ?? ''}
                            onChange={(e) => setActionConfig(i, { caption: e.target.value })}
                            placeholder="Texto que acompaña el archivo (opcional)…"
                            rows={2}
                            className="text-sm"
                          />
                        </div>
                      )}
                      {a.type === 'CREATE_TASK' && (
                        <div className="space-y-1.5">
                          <Input
                            value={a.config?.taskTitle ?? ''}
                            onChange={(e) => setActionConfig(i, { taskTitle: e.target.value })}
                            placeholder="Título de la tarea…"
                            className="h-8 text-sm"
                          />
                          <div className="flex gap-1.5">
                            <select
                              value={a.config?.taskType ?? 'Seguimiento'}
                              onChange={(e) => setActionConfig(i, { taskType: e.target.value })}
                              className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm"
                            >
                              {TIPOS_DE_TAREA.map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                            <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2 text-sm">
                              <span className="text-muted-foreground">en</span>
                              <input
                                type="number"
                                min={0}
                                value={a.config?.taskDays ?? 0}
                                onChange={(e) => setActionConfig(i, { taskDays: Number(e.target.value) })}
                                className="w-12 bg-transparent text-center outline-none"
                              />
                              <span className="text-muted-foreground">días</span>
                            </div>
                          </div>
                          <select
                            value={a.config?.advisorId ?? ''}
                            onChange={(e) => setActionConfig(i, { advisorId: e.target.value })}
                            className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
                          >
                            <option value="">Responsable…</option>
                            {advisors.map((ad) => (
                              <option key={ad.id} value={ad.id}>{ad.name || ad.id}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {a.type === 'WAIT' && (
                        <div className="flex items-center gap-1.5 text-sm">
                          <span className="text-muted-foreground">Esperar</span>
                          <input
                            type="number"
                            min={1}
                            max={SEGUNDOS_MAXIMOS_DE_ESPERA}
                            value={a.config?.seconds ?? SEGUNDOS_POR_DEFECTO}
                            onChange={(e) => setActionConfig(i, { seconds: Number(e.target.value) })}
                            className="h-8 w-16 rounded-md border border-border bg-background px-2 text-center outline-none"
                          />
                          <span className="text-muted-foreground">segundos (máx. {SEGUNDOS_MAXIMOS_DE_ESPERA})</span>
                        </div>
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
                      {(a.type === 'ADD_TAG' || a.type === 'REMOVE_TAG') && (
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
                          <option value="">Elige una calificación…</option>
                          {/* Las cinco de las pastillas de Chats, con sus mismos nombres. */}
                          {LEAD_STATUS_FILTER_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      )}
                      {(a.type === 'ASSIGN_ADVISOR' || a.type === 'TRANSFER_ADVISOR') && (
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
                      {intentoGuardar && porQueNoEstaLista(a) && (
                        <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400" data-falta-en-la-accion>
                          {porQueNoEstaLista(a)}
                        </p>
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
              data-agregar-accion
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
            <DialogTitle>
              {confirm.all ? 'Eliminar todas las macros' : confirm.ids.length === 1 ? 'Eliminar macro' : 'Eliminar macros'}
            </DialogTitle>
          </DialogHeader>
          <p className="px-1 text-sm text-muted-foreground">
            {confirm.all
              ? 'Se eliminarán TODAS tus macros. Esta acción no se puede deshacer.'
              : confirm.ids.length === 1 && confirm.nombre
                ? `Se eliminará la macro «${confirm.nombre}». Esta acción no se puede deshacer.`
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
