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
import { TASK_TYPES, type TaskData } from "@/lib/task-types";
import { MetricCard } from "@/components/custom/MetricCard";
import { ModuleToolbar } from "@/components/shared/ModuleToolbar";
import {
  getMyTasksAction,
  completeTaskAction,
  cancelTaskAction,
  deleteTaskAction,
  getCustomTaskTypesAction,
} from "@/actions/task-actions";
import { TaskFormDialog } from "../../chats/_components/TaskFormDialog";
import TooltipWrapper from "@/components/TooltipWrapper";

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

function getDayGroup(iso: string): string {
  const now = new Date();
  const due = new Date(iso);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  if (due < todayStart) return "Vencidas";
  if (due < tomorrowStart) return "Hoy";
  if (due < new Date(tomorrowStart.getTime() + 86400000)) return "Mañana";
  if (due < weekEnd) return "Esta semana";
  return "Más adelante";
}

const GROUP_ORDER = ["Vencidas", "Hoy", "Mañana", "Esta semana", "Más adelante", "Completadas"];
const GROUP_COLOR: Record<string, string> = {
  "Vencidas":       "text-red-600 dark:text-red-400",
  "Hoy":            "text-blue-600 dark:text-blue-400",
  "Mañana":         "text-violet-600 dark:text-violet-400",
  "Esta semana":    "text-amber-600 dark:text-amber-400",
  "Más adelante":   "text-slate-500 dark:text-slate-400",
  "Completadas":    "text-emerald-600 dark:text-emerald-400",
};

const QUICK_RESULTS = ["Contactado", "No respondio", "Reagendar", "Interesado", "Cerrado"];

function getNextDueDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(9, 0, 0, 0);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

type Props = {
  userId: string;
  userName?: string | null;
};

export function TasksClient({ userId, userName }: Props) {
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<TaskData | null>(null);
  const [resultText, setResultText] = useState("");
  const [completing, setCompleting] = useState(false);
  const [scheduleNext, setScheduleNext] = useState(false);
  const [nextTaskType, setNextTaskType] = useState("Seguimiento");
  const [nextDueDate, setNextDueDate] = useState(() => getNextDueDate(1));
  const [showDone, setShowDone] = useState(false);
  const [view, setView] = useState<"list" | "kanban">("list");
  const [customTypes, setCustomTypes] = useState<string[]>([]);
  const [search, setSearch] = useState("");

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
      const group = t.status === "done" ? "Completadas" : getDayGroup(t.dueDate);
      if (!map[group]) map[group] = [];
      map[group].push(t);
    }
    return GROUP_ORDER.filter((g) => map[g]?.length).map((g) => ({ label: g, items: map[g] }));
  }, [filteredTasks]);

  const pending = tasks.filter((t) => t.status === "pending").length;
  const done = tasks.filter((t) => t.status === "done").length;
  const overdue = tasks.filter((t) => t.status === "pending" && new Date(t.dueDate) < new Date()).length;
  const dueToday = tasks.filter((t) => {
    if (t.status !== "pending") return false;
    const d = new Date(t.dueDate);
    const now = new Date();
    return d >= now && d <= new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  }).length;

  const handleComplete = async () => {
    if (!completeTarget) return;
    if (scheduleNext && !nextDueDate) {
      toast.error("Selecciona la fecha de la siguiente tarea.");
      return;
    }
    setCompleting(true);
    const res = await completeTaskAction(
      completeTarget.id,
      resultText,
      scheduleNext ? { type: nextTaskType, dueDate: new Date(nextDueDate).toISOString() } : undefined,
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
    } else {
      toast.error(res.message);
    }
  };

  const handleCancel = async (task: TaskData) => {
    const res = await cancelTaskAction(task.id);
    if (res.success) {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      toast.success("Tarea cancelada.");
    } else {
      toast.error(res.message);
    }
  };

  const handleDelete = async (task: TaskData) => {
    if (!window.confirm("Eliminar esta tarea definitivamente?")) return;
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

      {/* Tarjetas de resumen — MetricCard, exactamente igual al schedule */}
      <div className="grid grid-cols-2 gap-2 shrink-0 sm:flex sm:flex-wrap sm:gap-3">
        <div className="min-w-0 sm:flex-1">
          <MetricCard icon={<Calendar className="h-4 w-4" />} label="Pendiente" value={pending} color="#EAB308" helper="Tareas pendientes" />
        </div>
        <div className="min-w-0 sm:flex-1">
          <MetricCard icon={<Calendar className="h-4 w-4" />} label="Vencidas" value={overdue} color="#EF4444" helper="Tareas vencidas" />
        </div>
        <div className="min-w-0 sm:flex-1">
          <MetricCard icon={<Calendar className="h-4 w-4" />} label="Para hoy" value={dueToday} color="#3B82F6" helper="Tareas para hoy" />
        </div>
        <div className="min-w-0 sm:flex-1">
          <MetricCard icon={<Calendar className="h-4 w-4" />} label="Completadas" value={done} color="#22C55E" helper="Tareas completadas" />
        </div>
      </div>

      {/* Header */}
      <ModuleToolbar className="shrink-0">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="flex gap-1 overflow-x-auto rounded-lg border border-border/60 bg-muted/30 p-1">
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
          <div className="relative w-64 shrink-0">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar tarea..."
              className="pl-8 text-sm"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => void load()} disabled={loading} title="Actualizar">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
          {view === "list" && done > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowDone((v) => !v)} title={showDone ? "Ocultar completadas" : "Mostrar completadas"}>
              {showDone ? <EyeOff className="mr-1.5 h-3.5 w-3.5" /> : <Eye className="mr-1.5 h-3.5 w-3.5" />}
              Completadas ({done})
            </Button>
          )}
          <Button size="sm" onClick={() => setNewTaskOpen(true)}>
            + Crear
          </Button>
        </div>
      </ModuleToolbar>

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
          onCancel={(task) => void handleCancel(task)}
          onDelete={(task) => void handleDelete(task)}
        />
      ) : visibleGroups.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <ClipboardList className="h-8 w-8 text-primary/60" />
          </div>
          <div>
            <p className="font-semibold">Sin tareas pendientes</p>
            <p className="text-sm text-muted-foreground mt-1">Crea una tarea desde cualquier chat</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-6 pr-1">
          {visibleGroups.map(({ label, items }) => (
            <div key={label}>
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
                    onComplete={() => beginComplete(task)}
                    onCancel={() => void handleCancel(task)}
                    onDelete={() => void handleDelete(task)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog completar */}
      <Dialog open={!!completeTarget} onOpenChange={(o) => !o && setCompleteTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              Completar tarea
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{completeTarget?.title}</p>
          <Textarea
            value={resultText}
            onChange={(e) => setResultText(e.target.value)}
            placeholder="Resultado (opcional)..."
            rows={3}
            className="resize-none"
          />
          <div className="flex flex-wrap gap-1.5">
            {QUICK_RESULTS.map((result) => (
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
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
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
                  <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setNextDueDate(getNextDueDate(1))}>Manana</Button>
                  <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setNextDueDate(getNextDueDate(7))}>Proxima semana</Button>
                  <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setNextDueDate(getNextDueDate(30))}>Proximo mes</Button>
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
    <div className="flex flex-col gap-3 min-w-0 w-full flex-1 min-h-0">
      <div className="overflow-x-auto w-full flex-1 min-h-0 pb-3">
        <div className="flex gap-3 h-full" style={{ width: "max-content", minWidth: "100%" }}>
          {columns.map(({ type, items }) => {
            const col = TASK_COL[type] ?? TASK_COL["Otros"];
            const pendingItems = items.filter((t) => t.status === "pending");
            const doneItems    = items.filter((t) => t.status === "done");

            return (
              <div
                key={type}
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
                      className="text-white/70 hover:text-white transition-colors"
                      onClick={() => setAutomationsOpen(type)}
                      title="Configurar automatizaciones"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <Sheet open={automationsOpen === type} onOpenChange={(v) => !v && setAutomationsOpen(null)}>
                  <SheetContent side="right" className="w-[420px] sm:w-[480px] overflow-y-auto">
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
  const isOverdue = !isDone && new Date(task.dueDate) < new Date();
  const typeColor = TYPE_COLOR[task.type] ?? TYPE_COLOR["Tarea"];
  const typeIcon  = TYPE_ICON[task.type] ?? <ClipboardList className="h-3 w-3" />;
  const router    = useRouter();

  return (
    <div
      className={cn(
        "bg-background rounded-lg border border-border p-3 shadow-sm transition-shadow hover:shadow-md",
        isDone && "opacity-60",
      )}
    >
      <div className="flex gap-2">
        {/* Contenido izquierdo */}
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          {/* Fila 1: título */}
          <p className={cn("app-item-title truncate leading-tight uppercase", isDone && "line-through text-muted-foreground")}>
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
          {task.assignedToPhone && (
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
  onComplete,
  onCancel,
  onDelete,
}: {
  task: TaskData;
  onComplete: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const isDone = task.status === "done";
  const dueDate = new Date(task.dueDate);
  const now = new Date();
  const isOverdue = !isDone && dueDate < now;
  const isDueToday = !isDone
    && !isOverdue
    && dueDate <= new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const typeColor = TYPE_COLOR[task.type] ?? TYPE_COLOR["Tarea"];
  const typeIcon = TYPE_ICON[task.type] ?? <ClipboardList className="h-3.5 w-3.5" />;
  const router = useRouter();

  const goToChat = () => {
    if (task.contactJid) router.push(`/chats?jid=${encodeURIComponent(task.contactJid)}`);
  };

  return (
    <div className={cn(
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
          {/* Fila 1: título */}
          <p className={cn("app-item-title leading-snug uppercase", isDone && "line-through")}>{task.title}</p>

          <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
            {/* Fila 2: contacto + teléfono */}
            {task.contactName && (
              <button type="button" onClick={goToChat}
                className={cn("flex items-center gap-1 text-left w-fit", task.contactJid && "text-blue-600 hover:underline cursor-pointer")}>
                <Phone className="h-3 w-3 shrink-0" />
                <span className="truncate max-w-[140px]">{task.contactName}</span>
                {task.contactJid && <span className="shrink-0 text-muted-foreground">· {fmtPhone(task.contactJid)}</span>}
              </button>
            )}
            {/* Fila 3: asesor */}
            <span className="flex items-center gap-1">
              <User className="h-3 w-3 shrink-0" />
              {task.assignedToName ?? task.assignedToId}
            </span>
            {task.assignedToPhone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3 shrink-0" />
                <span className="whitespace-nowrap">{fmtPhone(task.assignedToPhone)}</span>
              </span>
            )}
            {/* Fila 4: fecha */}
            <span className={cn("flex items-center gap-1", isOverdue && !isDone && "text-red-500 font-medium")}>
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
          <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", typeColor)}>
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
    <div className={cn(
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
