"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calendar, CheckCircle2, ClipboardList, Eye, EyeOff, Kanban, List, Loader2, Phone, RefreshCw, Search, Settings2, Trash2, User, Users, Mail, CalendarClock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TaskTypeAutomationsPanel } from "@/app/(root)/crm/rules/components/TaskTypeAutomationsPanel";
import { cn } from "@/lib/utils";
import { fmtPhone } from "@/lib/whatsapp-jid";
import { TASK_TYPES, isTaskOpen, type TaskData } from "@/lib/task-types";
import { tituloDeLaTarjeta } from "@/lib/titulo-de-la-tarea";
import { PastillasDeMetricas } from "@/components/shared/PastillasDeMetricas";
import { ModuleToolbar } from "@/components/shared/ModuleToolbar";
import {
  getMyTasksAction,
  completeTaskAction,
  cancelTaskAction,
  deleteTaskAction,
  getCustomTaskTypesAction,
} from "@/actions/task-actions";
import { TaskFormDialog } from "../../chats/_components/TaskFormDialog";
import { FichaDeLaTarea } from "./FichaDeLaTarea";
import { useAterrizajeDeMencion } from "@/hooks/useAterrizajeDeMencion";
import TooltipWrapper from "@/components/TooltipWrapper";
import { TiempoDeTarea } from "@/components/shared/TiempoDeTarea";
import { BotonDeCrear } from '@/components/shared/BarraDeAcciones';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ATAJOS_DE_LA_SIGUIENTE,
  GRUPOS_DE_LA_LISTA,
  RESULTADOS_RAPIDOS,
  elGrupoDeLaTarea,
  elMensajeDeLaListaVacia,
  estaVencida,
  laFechaPropuesta,
  lasCifras,
} from "@/lib/pantalla-de-tareas";

const TYPE_ICON: Record<string, React.ReactNode> = {
  Seguimiento: <RefreshCw className="h-3.5 w-3.5" />,
  Llamada:     <Phone className="h-3.5 w-3.5" />,
  Reunión:     <Users className="h-3.5 w-3.5" />,
  Email:       <Mail className="h-3.5 w-3.5" />,
  Tarea:       <ClipboardList className="h-3.5 w-3.5" />,
};

const TYPE_COLOR: Record<string, string> = {
  Seguimiento: "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-800",
  Llamada:     "text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800",
  Reunión:     "text-violet-600 bg-violet-50 border-violet-200 dark:text-violet-400 dark:bg-violet-950/40 dark:border-violet-800",
  Email:       "text-orange-600 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-950/40 dark:border-orange-800",
  Tarea:       "text-slate-600 bg-slate-50 border-slate-200 dark:text-slate-400 dark:bg-slate-800 dark:border-slate-700",
};

function formatDueDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })
    + " " + d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: true });
}

const GROUP_COLOR: Record<string, string> = {
  "Vencidas":       "text-red-600 dark:text-red-400",
  "Hoy":            "text-blue-600 dark:text-blue-400",
  "Mañana":         "text-violet-600 dark:text-violet-400",
  "Esta semana":    "text-amber-600 dark:text-amber-400",
  "Más adelante":   "text-slate-500 dark:text-slate-400",
  "Completadas":    "text-emerald-600 dark:text-emerald-400",
};

/** El grupo, la cifra y la fecha propuesta salen de `lib/pantalla-de-tareas.ts`. */
const getNextDueDate = (dias: number) => laFechaPropuesta(dias);

type Props = {
  userId: string;
  userName?: string | null;
};

export function TasksClient({ userId, userName }: Props) {
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<TaskData | null>(null);
  // Cuánto costó, ya en minutos. `null` = todavía no hay un número usable,
  // y con eso el botón de completar no deja seguir.
  const [minutosDeTrabajo, setMinutosDeTrabajo] = useState<number | null>(null);
  const [resultText, setResultText] = useState("");
  const [completing, setCompleting] = useState(false);
  const [scheduleNext, setScheduleNext] = useState(false);
  const [nextTaskType, setNextTaskType] = useState("Seguimiento");
  const [nextDueDate, setNextDueDate] = useState(() => getNextDueDate(1));
  const [showDone, setShowDone] = useState(false);
  const [view, setView] = useState<"list" | "kanban">("list");
  const [customTypes, setCustomTypes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  /** La tarea que se está mirando en su ficha. */
  const [ficha, setFicha] = useState<TaskData | null>(null);
  /** Lo que se va a cancelar o eliminar: las dos cosas se confirman. */
  const [confirmar, setConfirmar] = useState<{ que: "cancelar" | "eliminar"; tarea: TaskData } | null>(null);

  const allTypes = useMemo(() => [...TASK_TYPES, ...customTypes], [customTypes]);

  const load = useCallback(async () => {
    setLoading(true);
    const [res, types] = await Promise.all([
      getMyTasksAction(),
      getCustomTaskTypesAction(),
    ]);
    if (res.success && res.data) setTasks(res.data);
    setCustomTypes(types);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // `?tarea=…` — por donde aterriza una mención de Documentación.
  //
  // La lista trae las de la cuenta enteras (`getMyTasksAction`), que son las
  // mismas que se pueden mencionar, así que lo único que no se encuentra aquí
  // es una tarea cancelada o ya borrada — y eso se dice.
  useAterrizajeDeMencion({
    clave: "tarea",
    listo: !loading,
    queEs: "esa tarea",
    aterrizar: (id) => {
      const suya = tasks.find((t) => String(t.id) === id);
      if (!suya) return false;
      setFicha(suya);
      return true;
    },
  });

  const beginComplete = (task: TaskData) => {
    setCompleteTarget(task);
    setResultText("");
    setScheduleNext(false);
    setNextTaskType(task.type);
    setNextDueDate(getNextDueDate(1));
  };

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tasks;

    return tasks.filter((task) =>
      `${task.title} ${task.type} ${task.contactName ?? ""} ${task.assignedToName ?? ""} ${formatDueDate(task.dueDate)}`
        .toLowerCase()
        .includes(query)
    );
  }, [search, tasks]);

  const grouped = useMemo(() => {
    const map: Record<string, TaskData[]> = {};
    for (const t of filteredTasks) {
      const group = elGrupoDeLaTarea(t);
      if (!group) continue;
      if (!map[group]) map[group] = [];
      map[group].push(t);
    }
    return GRUPOS_DE_LA_LISTA.filter((g) => map[g]?.length).map((g) => ({ label: g, items: map[g] }));
  }, [filteredTasks]);

  // Las cifras salen de la MISMA regla que los grupos de la lista: una tarea
  // de esta mañana que ya pasó cuenta como vencida arriba y sale en Vencidas.
  const { pendientes: pending, vencidas: overdue, paraHoy: dueToday, completadas: done } = lasCifras(tasks);

  const handleComplete = async () => {
    if (!completeTarget) return;
    if (scheduleNext && !nextDueDate) {
      toast.error("Selecciona la fecha de la siguiente tarea.");
      return;
    }
    // El tiempo es obligatorio. Se comprueba aquí y también en la acción: una
    // tarea cerrada sin tiempo no se recupera, porque nadie vuelve a abrirla
    // para apuntarlo.
    if (!minutosDeTrabajo) {
      toast.error("Registra cuánto tiempo tomó la tarea.");
      return;
    }
    setCompleting(true);
    const res = await completeTaskAction(
      completeTarget.id,
      resultText,
      scheduleNext ? { type: nextTaskType, dueDate: new Date(nextDueDate).toISOString() } : undefined,
      minutosDeTrabajo,
    );
    setCompleting(false);
    if (res.success) {
      toast.success(res.message);
      setTasks((prev) => {
        const completed = prev.map((t) => t.id === completeTarget.id ? { ...t, status: "done" as const, result: resultText || null } : t);
        return res.data?.nextTask ? [...completed, res.data.nextTask] : completed;
      });
      setCompleteTarget(null);
      setResultText("");
      setScheduleNext(false);
      setMinutosDeTrabajo(null);
    } else {
      toast.error(res.message);
    }
  };

  const handleCancel = async (task: TaskData) => {
    setConfirmar(null);
    const res = await cancelTaskAction(task.id);
    if (res.success) {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      toast.success("Tarea cancelada.");
    } else {
      toast.error(res.message);
    }
  };

  const handleDelete = async (task: TaskData) => {
    setConfirmar(null);
    const res = await deleteTaskAction(task.id);
    if (res.success) {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      toast.success("Tarea eliminada.");
    } else {
      toast.error(res.message);
    }
  };

  const visibleGroups = showDone ? grouped : grouped.filter((g) => g.label !== "Completadas");

  return (
    <div className="flex h-full w-full flex-col gap-3">

      {/* Header: el selector de vista va en su propia fila para que el buscador
          y las acciones ("+ Crear") queden SIEMPRE en la misma línea, alineados. */}
      <div className="flex shrink-0 flex-col gap-2">
        <div data-zona="vista" className="flex w-fit gap-1 overflow-x-auto rounded-lg border border-border/60 bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => setView("list")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
              view === "list"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <List className="h-3.5 w-3.5" /> Lista
          </button>
          <button
            type="button"
            onClick={() => setView("kanban")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
              view === "kanban"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Kanban className="h-3.5 w-3.5" /> Kanban
          </button>
        </div>
        <ModuleToolbar
          buscador={
            <div className="relative w-56 sm:w-64">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar tarea..."
                className="pl-8 text-sm"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          }
          secundarias={
            /* Refrescar no acota la lista ni añade una fila: va pegado al
               azul, no dentro de él. */
            <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => void load()} disabled={loading} title="Actualizar" aria-label="Actualizar">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          }
          right={<BotonDeCrear onClick={() => setNewTaskOpen(true)}>Nuevo</BotonDeCrear>}
        >
          {/* Las cifras que abrían la pantalla. «Completadas» NO entra: la
              barra ya tiene su botón con el mismo número, y encima filtra —
              cuando una métrica duplica una pastilla que ya está, se queda la
              que ya existe. Las otras tres no tienen filtro equivalente en esta
              lista, así que van sin aspecto de pulsables. */}
          <span data-zona="cifras" className="contents">
          <PastillasDeMetricas
            metricas={[
              { clave: "pending", icono: <Calendar />, etiqueta: "Pendientes", valor: pending, color: "#EAB308", ayuda: "Tareas pendientes" },
              { clave: "overdue", icono: <Calendar />, etiqueta: "Vencidas", valor: overdue, color: "#EF4444", ayuda: "Tareas vencidas" },
              { clave: "dueToday", icono: <Calendar />, etiqueta: "Para hoy", valor: dueToday, color: "#3B82F6", ayuda: "Tareas para hoy" },
            ]}
          />
          </span>
          {/* Esto FILTRA la lista, así que se queda a la izquierda con los
              demás filtros. A la derecha solo va lo que crea o actúa. */}
          {view === "list" && done > 0 && (
            <Button data-zona="completadas" variant="outline" size="sm" className="shrink-0" onClick={() => setShowDone((v) => !v)} title={showDone ? "Ocultar completadas" : "Mostrar completadas"}>
              {showDone ? <EyeOff className="mr-1.5 h-3.5 w-3.5" /> : <Eye className="mr-1.5 h-3.5 w-3.5" />}
              Completadas ({done})
            </Button>
          )}
        </ModuleToolbar>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Cargando tareas...</span>
        </div>
      ) : view === "kanban" ? (
        <KanbanView
          tasks={filteredTasks.filter((t) => t.status !== "cancelled")}
          allTypes={allTypes}
          userId={userId}
          onComplete={beginComplete}
          onCancel={(task) => setConfirmar({ que: "cancelar", tarea: task })}
          onDelete={(task) => setConfirmar({ que: "eliminar", tarea: task })}
        />
      ) : visibleGroups.length === 0 ? (
        <div data-zona="lista-vacia" className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <ClipboardList className="h-8 w-8 text-primary/60" />
          </div>
          <div>
            <p className="font-semibold">{elMensajeDeLaListaVacia(search).titulo}</p>
            <p className="text-sm text-muted-foreground mt-1">{elMensajeDeLaListaVacia(search).detalle}</p>
          </div>
        </div>
      ) : (
        <div data-zona="lista" className="flex-1 overflow-y-auto space-y-6 pr-1">
          {visibleGroups.map(({ label, items }) => (
            <div key={label} data-grupo={label}>
              <div className={cn("mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide", GROUP_COLOR[label])}>
                <CalendarClock className="h-3.5 w-3.5" />
                {label}
                <span className="font-normal text-muted-foreground">({items.length})</span>
              </div>
              <div className="space-y-2">
                {items.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onOpen={() => setFicha(task)}
                    onComplete={() => beginComplete(task)}
                    onCancel={() => setConfirmar({ que: "cancelar", tarea: task })}
                    onDelete={() => setConfirmar({ que: "eliminar", tarea: task })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog completar */}
      <Dialog open={!!completeTarget} onOpenChange={(o) => !o && setCompleteTarget(null)}>
        <DialogContent data-ventana-de-completar className="overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              Completar tarea
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{completeTarget?.title}</p>
          {/* Va ARRIBA del resultado, que es opcional: lo obligatorio se pide
              primero, o se rellena lo de abajo y el botón no deja seguir sin
              decir dónde está el problema. */}
          <div data-campo="tiempo"><TiempoDeTarea minutos={minutosDeTrabajo} onChange={setMinutosDeTrabajo} autoFocus /></div>
          <Textarea
            data-campo="resultado"
            value={resultText}
            onChange={(e) => setResultText(e.target.value)}
            placeholder="Resultado (opcional)..."
            rows={3}
            className="resize-none"
          />
          <div data-campo="rapidos" className="flex flex-wrap gap-1.5">
            {RESULTADOS_RAPIDOS.map((result) => (
              <Button
                key={result}
                type="button"
                size="sm"
                variant={resultText === result ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => setResultText(result)}
              >
                {result}
              </Button>
            ))}
          </div>
          <div data-campo="siguiente" className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              <Checkbox id="schedule-next-task" checked={scheduleNext} onCheckedChange={(value) => setScheduleNext(Boolean(value))} />
              <label htmlFor="schedule-next-task" className="cursor-pointer text-sm font-medium">
                Programar siguiente tarea
              </label>
            </div>
            {scheduleNext && (
              <div className="mt-3 space-y-3">
                <Select value={nextTaskType} onValueChange={setNextTaskType}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allTypes.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-1.5">
                  {ATAJOS_DE_LA_SIGUIENTE.map(({ rotulo, dias }) => (
                    <Button key={rotulo} type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setNextDueDate(getNextDueDate(dias))}>{rotulo}</Button>
                  ))}
                </div>
                <Input type="datetime-local" value={nextDueDate} onChange={(event) => setNextDueDate(event.target.value)} className="h-9" />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCompleteTarget(null)} type="button">Cancelar</Button>
            <Button onClick={() => void handleComplete()} disabled={completing} className="bg-emerald-600 hover:bg-emerald-700" type="button">
              {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Marcar completada"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancelar y eliminar se confirman: los dos sacan la tarea de la lista,
          y eliminar no se deshace. */}
      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent data-confirmar={confirmar?.que}>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmar?.que === "eliminar" ? "¿Eliminar esta tarea?" : "¿Cancelar esta tarea?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar?.que === "eliminar"
                ? `«${tituloDeLaTarjeta(confirmar.tarea.title) || confirmar.tarea.title}» se borra para siempre, con su historial.`
                : `«${confirmar ? tituloDeLaTarjeta(confirmar.tarea.title) || confirmar.tarea.title : ""}» sale de tu lista sin contarse como hecha.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              className={confirmar?.que === "eliminar" ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"}
              onClick={() => {
                if (!confirmar) return;
                if (confirmar.que === "eliminar") void handleDelete(confirmar.tarea);
                else void handleCancel(confirmar.tarea);
              }}
            >
              {confirmar?.que === "eliminar" ? "Eliminar" : "Sí, cancelar la tarea"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* La ficha: el texto entero y los documentos que la nombran. */}
      <FichaDeLaTarea tarea={ficha} alCerrar={() => setFicha(null)} />

      {/* Dialog nueva tarea */}
      <TaskFormDialog
        open={newTaskOpen}
        onOpenChange={setNewTaskOpen}
        session={null}
        currentUserId={userId}
        currentUserName={userName}
        onCreated={(t) => setTasks((prev) => [t, ...prev])}
      />
    </div>
  );
}

/* ─── Columnas — mismos colores y clases que AgendaKanban ─── */
const TASK_COL: Record<string, { headerClass: string; borderColor: string }> = {
  Seguimiento: { headerClass: "bg-amber-500",  borderColor: "#f59e0b" },
  Llamada:     { headerClass: "bg-green-500",   borderColor: "#22c55e" },
  Reunión:     { headerClass: "bg-blue-500",    borderColor: "#3b82f6" },
  Email:       { headerClass: "bg-violet-500",  borderColor: "#8b5cf6" },
  Tarea:       { headerClass: "bg-red-500",     borderColor: "#ef4444" },
  Otros:       { headerClass: "bg-slate-500",   borderColor: "#64748b" },
};

/* ─── KanbanView — copia exacta de AgendaKanban ─── */
function KanbanView({ tasks, allTypes, userId, onComplete, onCancel, onDelete }: {
  tasks: TaskData[];
  allTypes: readonly string[] | string[];
  userId: string;
  onComplete: (t: TaskData) => void;
  onCancel: (t: TaskData) => void;
  onDelete: (t: TaskData) => void;
}) {
  const [automationsOpen, setAutomationsOpen] = useState<string | null>(null);
  const knownTypes = new Set(allTypes);
  const others = tasks.filter((t) => !knownTypes.has(t.type));
  const columns = [
    ...allTypes.map((type) => ({ type, items: tasks.filter((t) => t.type === type) })),
    ...(others.length > 0 ? [{ type: "Otros", items: others }] : []),
  ];

  return (
    <div data-zona="kanban" className="flex flex-col gap-3 min-w-0 w-full flex-1 min-h-0">
      <div className="overflow-x-auto w-full flex-1 min-h-0 pb-3">
        <div className="flex gap-3 h-full" style={{ width: "max-content", minWidth: "100%" }}>
          {columns.map(({ type, items }) => {
            const col = TASK_COL[type] ?? TASK_COL["Otros"];
            const pendingItems = items.filter((t) => isTaskOpen(t.status));
            const doneItems    = items.filter((t) => t.status === "done");

            return (
              <div
                key={type}
                data-columna={type}
                className="flex flex-col min-w-[260px] w-[260px] shrink-0 rounded-xl border-2 overflow-hidden shadow-sm h-full"
                style={{
                  borderColor: col.borderColor + "52",
                  backgroundColor: col.borderColor + "0A",
                }}
              >
                {/* Header */}
                <div className={cn("px-3 py-2 flex items-center justify-between shrink-0", col.headerClass)}>
                  <span className="text-white text-sm font-semibold uppercase">{type}</span>
                  <div className="flex items-center gap-1.5">
                    <Badge className="bg-white/20 text-white border-0 text-xs font-medium">
                      {pendingItems.length}
                    </Badge>
                    <button
                      type="button"
                      data-boton="automatizaciones"
                      className="text-white/70 hover:text-white transition-colors"
                      onClick={() => setAutomationsOpen(type)}
                      title="Configurar automatizaciones"
                      aria-label={`Configurar automatizaciones de ${type}`}
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <Sheet open={automationsOpen === type} onOpenChange={(v) => !v && setAutomationsOpen(null)}>
                  <SheetContent data-automatizaciones-del-tipo={type} side="right" className="w-[420px] sm:w-[480px] overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>Automatizaciones · {type}</SheetTitle>
                    </SheetHeader>
                    <div className="mt-4">
                      <TaskTypeAutomationsPanel userId={userId} taskType={type} />
                    </div>
                  </SheetContent>
                </Sheet>

                {/* Body — exacto de AgendaColumn */}
                <div className="flex-1 min-h-0 p-2 space-y-2 overflow-y-auto">
                  {pendingItems.map((task) => (
                    <KanbanCard key={task.id} task={task} onComplete={() => onComplete(task)} onCancel={() => onCancel(task)} onDelete={() => onDelete(task)} />
                  ))}
                  {pendingItems.length === 0 && doneItems.length === 0 && (
                    <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/40">
                      Sin tareas
                    </div>
                  )}
                  {doneItems.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 py-0.5">
                        <div className="flex-1 border-t border-dashed border-border/50" />
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">Completadas · {doneItems.length}</span>
                        <div className="flex-1 border-t border-dashed border-border/50" />
                      </div>
                      {doneItems.map((task) => (
                        <KanbanCard key={task.id} task={task} onComplete={() => onComplete(task)} onCancel={() => onCancel(task)} onDelete={() => onDelete(task)} />
                      ))}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── KanbanCard — copia exacta de AgendaCardItem ─── */
function KanbanCard({ task, onComplete, onCancel, onDelete }: {
  task: TaskData;
  onComplete: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const isDone    = task.status === "done";
  const isOverdue = estaVencida(task);
  const router    = useRouter();

  return (
    <div
      data-tarea={task.id}
      className={cn(
        "bg-background rounded-lg border border-border p-3 shadow-sm transition-shadow hover:shadow-md",
        isDone && "opacity-60",
      )}
    >
      <div className="flex gap-2">
        {/* Contenido izquierdo */}
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          {/* Fila 1: título */}
          <p className={cn("app-item-title line-clamp-2 break-words leading-tight uppercase", isDone && "line-through text-muted-foreground")}>
            {task.title}
          </p>

          {/* Fila 2: contacto */}
          {task.contactName && (
            <button type="button" onClick={() => task.contactJid && router.push(`/chats?jid=${encodeURIComponent(task.contactJid)}`)}
              className={cn("flex items-center gap-1 text-xs text-left w-fit", task.contactJid && "text-blue-600 hover:underline cursor-pointer")}>
              <Users className="h-3 w-3 shrink-0" />
              <span className="truncate max-w-[120px]">{task.contactName}</span>
            </button>
          )}

          {/* Fila 3: asesor */}
          <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
            <User className="h-3 w-3 shrink-0" />
            {task.assignedToName ?? "Sin asesor"}
          </span>
          {task.assignedToPhone &&
            task.assignedToPhone.replace(/\D/g, "") !== task.contactJid?.replace(/\D/g, "") && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3 shrink-0" />
              <span className="truncate">{fmtPhone(task.assignedToPhone)}</span>
            </span>
          )}

          {/* Fila 4: fecha */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarClock className="h-3 w-3 shrink-0" />
            <span className={cn(isOverdue && !isDone && "text-red-500 font-medium")}>
              {new Date(task.dueDate).toLocaleDateString("es", { day: "2-digit", month: "short" })}
              {" · "}
              {new Date(task.dueDate).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: true })}
            </span>
          </div>
        </div>

        {/* Acciones derecha: vertical */}
        <div className="flex flex-col items-center justify-between shrink-0 self-stretch" onClick={(e) => e.stopPropagation()}>
          {!isDone ? (
            <>
              <TooltipWrapper content="Completar">
                <Button type="button" size="icon" variant="ghost" onClick={onComplete}
                  className="h-6 w-6 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipWrapper>
              <TooltipWrapper content="Cancelar">
                <Button type="button" size="icon" variant="ghost" onClick={onCancel}
                  className="h-6 w-6 text-amber-500 hover:bg-amber-50 hover:text-amber-600">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </TooltipWrapper>
              <TooltipWrapper content="Eliminar">
                <Button type="button" size="icon" variant="ghost" onClick={onDelete}
                  className="h-6 w-6 text-red-500 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipWrapper>
            </>
          ) : (
            <TooltipWrapper content="Eliminar">
              <Button type="button" size="icon" variant="ghost" onClick={onDelete}
                className="h-6 w-6 text-red-500 hover:bg-red-50 hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipWrapper>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mt-1">
        {isOverdue && !isDone && (
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0 border-red-200 text-red-500 bg-red-50">
            Vencida
          </Badge>
        )}
        {isDone && task.result && (
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0 border-emerald-200 text-emerald-600 bg-emerald-50">
            ✓ {task.result}
          </Badge>
        )}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  onOpen,
  onComplete,
  onCancel,
  onDelete,
}: {
  task: TaskData;
  onOpen: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const isDone = task.status === "done";
  const dueDate = new Date(task.dueDate);
  const now = new Date();
  const grupo = elGrupoDeLaTarea(task, now);
  const isOverdue = grupo === "Vencidas";
  const isDueToday = grupo === "Hoy" && dueDate >= now;
  const typeColor = TYPE_COLOR[task.type] ?? TYPE_COLOR["Tarea"];
  const typeIcon = TYPE_ICON[task.type] ?? <ClipboardList className="h-3.5 w-3.5" />;
  const router = useRouter();

  const goToChat = () => {
    if (task.contactJid) router.push(`/chats?jid=${encodeURIComponent(task.contactJid)}`);
  };

  return (
    <div data-tarea={task.id} className={cn(
      "rounded-xl border border-l-4 px-3 py-2.5 transition-all",
      isDone
        ? "border-l-emerald-300 bg-muted/30 opacity-55"
        : isOverdue
          ? "border-l-red-500 bg-red-50/30 hover:shadow-sm dark:bg-red-950/10"
          : isDueToday
            ? "border-l-blue-500 bg-blue-50/30 hover:shadow-sm dark:bg-blue-950/10"
            : "border-l-transparent bg-card hover:shadow-sm",
    )}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
          <ClipboardList className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          {/* Fila 1: título. Se pulsa para abrir la ficha — es lo único que
              enseña el texto entero de una tarea vieja, cuyo ladrillo sigue
              dentro de `title`, y los documentos que la nombran. El asa es el
              título y no la tarjeta: esta va llena de botones y con el oyente
              en la tarjeta cada clic competiría con ellos. */}
          <button
            type="button"
            data-zona="titulo"
            onClick={onOpen}
            title={task.title}
            className={cn(
              "app-item-title block w-full text-left leading-snug uppercase hover:underline",
              isDone && "line-through",
            )}
          >
            {tituloDeLaTarjeta(task.title) || task.title}
          </button>

          <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
            {/* Fila 2: contacto + teléfono */}
            {task.contactName && (
              <button type="button" data-zona="contacto" onClick={goToChat}
                className={cn("flex items-center gap-1 text-left w-fit", task.contactJid && "text-blue-600 hover:underline cursor-pointer")}>
                <Phone className="h-3 w-3 shrink-0" />
                <span className="truncate max-w-[140px]">{task.contactName}</span>
                {task.contactJid && <span className="shrink-0 whitespace-nowrap text-muted-foreground">· {fmtPhone(task.contactJid)}</span>}
              </button>
            )}
            {/* Fila 3: asesor */}
            <span data-zona="asesor" className="flex items-center gap-1">
              <User className="h-3 w-3 shrink-0" />
              {task.assignedToName ?? task.assignedToId}
            </span>
            {task.assignedToPhone &&
              task.assignedToPhone.replace(/\D/g, "") !== task.contactJid?.replace(/\D/g, "") && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3 shrink-0" />
                <span className="whitespace-nowrap">{fmtPhone(task.assignedToPhone)}</span>
              </span>
            )}
            {/* Fila 4: fecha */}
            <span data-zona="fecha" className={cn("flex items-center gap-1", isOverdue && !isDone && "text-red-500 font-medium")}>
              <CalendarClock className="h-3 w-3 shrink-0" />
              {formatDueDate(task.dueDate)}
            </span>
          </div>

          {isDone && task.result && (
            <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">✓ {task.result}</p>
          )}
        </div>

        {/* Acciones derecha */}
        <div className="flex items-center gap-2 shrink-0">
          <span data-zona="tipo" className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", typeColor)}>
            {typeIcon}{task.type}
          </span>
          {!isDone && (
            <>
              <div className="w-0.5 h-5 bg-border rounded-full shrink-0" />
              <TaskActionButtons onComplete={onComplete} onCancel={onCancel} onDelete={onDelete} />
            </>
          )}
          {isDone && (
            <TooltipWrapper content="Eliminar tarea">
              <Button type="button" size="icon" variant="ghost" onClick={onDelete}
                className="h-7 w-7 text-red-500 hover:bg-red-50 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipWrapper>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskActionButtons({
  compact = false,
  onComplete,
  onCancel,
  onDelete,
}: {
  compact?: boolean;
  onComplete: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const buttonClass = compact ? "h-6 w-6" : "h-8 w-8";
  const iconClass = compact ? "h-3 w-3" : "h-4 w-4";

  return (
    <div data-zona="mandos" className={cn(
      "flex shrink-0 items-center gap-1",
      compact && "gap-0.5",
    )}>
      <TooltipWrapper content="Completar tarea">
        <Button type="button" size="icon" variant="ghost" aria-label="Completar tarea" onClick={onComplete}
          className={cn(buttonClass, "text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40")}>
          <CheckCircle2 className={iconClass} />
        </Button>
      </TooltipWrapper>
      <TooltipWrapper content="Cancelar tarea">
        <Button type="button" size="icon" variant="ghost" aria-label="Cancelar tarea" onClick={onCancel}
          className={cn(buttonClass, "text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950/40")}>
          <X className={iconClass} />
        </Button>
      </TooltipWrapper>
      <TooltipWrapper content="Eliminar definitivamente">
        <Button type="button" size="icon" variant="ghost" aria-label="Eliminar tarea definitivamente" onClick={onDelete}
          className={cn(buttonClass, "text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40")}>
          <Trash2 className={iconClass} />
        </Button>
      </TooltipWrapper>
    </div>
  );
}
