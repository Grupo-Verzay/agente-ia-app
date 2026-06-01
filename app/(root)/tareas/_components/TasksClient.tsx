"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ClipboardList, Loader2, Phone, RefreshCw, Users, Mail, CalendarClock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { TaskData } from "@/lib/task-types";
import {
  getMyTasksAction,
  completeTaskAction,
  cancelTaskAction,
} from "@/actions/task-actions";
import { TaskFormDialog } from "../../chats/_components/TaskFormDialog";

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
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getMyTasksAction();
    if (res.success && res.data) setTasks(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => {
    const map: Record<string, TaskData[]> = {};
    for (const t of tasks) {
      const group = t.status === "done" ? "Completadas" : getDayGroup(t.dueDate);
      if (!map[group]) map[group] = [];
      map[group].push(t);
    }
    return GROUP_ORDER.filter((g) => map[g]?.length).map((g) => ({ label: g, items: map[g] }));
  }, [tasks]);

  const pending = tasks.filter((t) => t.status === "pending").length;
  const done = tasks.filter((t) => t.status === "done").length;

  const handleComplete = async () => {
    if (!completeTarget) return;
    setCompleting(true);
    const res = await completeTaskAction(completeTarget.id, resultText);
    setCompleting(false);
    if (res.success) {
      toast.success("Tarea completada.");
      setTasks((prev) => prev.map((t) => t.id === completeTarget.id ? { ...t, status: "done", result: resultText || null } : t));
      setCompleteTarget(null);
      setResultText("");
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

  const visibleGroups = showDone ? grouped : grouped.filter((g) => g.label !== "Completadas");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Mis Tareas
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pending} pendiente{pending !== 1 ? "s" : ""}
              {done > 0 && ` · ${done} completada${done !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
          {done > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowDone((v) => !v)}>
              {showDone ? "Ocultar completadas" : `Ver completadas (${done})`}
            </Button>
          )}
          <Button size="sm" onClick={() => setNewTaskOpen(true)}>
            + Nueva tarea
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Cargando tareas...</span>
        </div>
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
                    onComplete={() => { setCompleteTarget(task); setResultText(""); }}
                    onCancel={() => void handleCancel(task)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog completar */}
      <Dialog open={!!completeTarget} onOpenChange={(o) => !o && setCompleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
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

function TaskCard({
  task,
  onComplete,
  onCancel,
}: {
  task: TaskData;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const isDone = task.status === "done";
  const typeColor = TYPE_COLOR[task.type] ?? TYPE_COLOR["Tarea"];
  const typeIcon = TYPE_ICON[task.type] ?? <ClipboardList className="h-3.5 w-3.5" />;

  return (
    <div className={cn(
      "rounded-xl border p-3 transition-all",
      isDone
        ? "bg-muted/30 opacity-60"
        : "bg-card hover:shadow-sm",
    )}>
      <div className="flex items-start gap-3">
        {/* Tipo badge */}
        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium shrink-0 mt-0.5", typeColor)}>
          {typeIcon}
          {task.type}
        </span>

        {/* Contenido */}
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-medium leading-snug", isDone && "line-through")}>{task.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {task.contactName && (
              <span className="truncate max-w-[160px]">📱 {task.contactName}</span>
            )}
            <span>👤 {task.assignedToName ?? task.assignedToId}</span>
            <span className={cn(new Date(task.dueDate) < new Date() && !isDone && "text-red-500 font-medium")}>
              🕐 {formatDueDate(task.dueDate)}
            </span>
          </div>
          {isDone && task.result && (
            <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">✓ {task.result}</p>
          )}
        </div>

        {/* Acciones */}
        {!isDone && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              onClick={onComplete}
              title="Marcar completada"
              type="button"
            >
              <CheckCircle2 className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
              onClick={onCancel}
              title="Cancelar tarea"
              type="button"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
