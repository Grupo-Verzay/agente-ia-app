"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import { toast } from "sonner";
import {
  ArrowLeft, Loader2, Plus, User, Calendar, RefreshCw, Users, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AdvisorInfo } from "@/actions/team-actions";
import { createTaskAction, deleteTaskAction } from "@/actions/task-actions";
import {
  getProjectTasksAction, moveProjectTaskAction, updateProjectTaskAction,
} from "@/actions/project-actions";
import { BOARD_COLUMNS, type ProjectData } from "@/lib/project-types";
import { TASK_TYPES, type TaskData } from "@/lib/task-types";

function personLabel(person: { name: string | null; email: string | null }) {
  return person.name?.trim() || person.email || "Sin nombre";
}

function fmtDue(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const overdue = date < today;
  return {
    label: date.toLocaleDateString("es-CO", { day: "2-digit", month: "short" }),
    overdue,
  };
}

// ─── Tarjeta ─────────────────────────────────────────────────────────────────

function TaskCard({ task, dragging = false }: { task: TaskData; dragging?: boolean }) {
  const due = fmtDue(task.dueDate);
  const isDone = task.status === "done";

  return (
    <div
      className={cn(
        "select-none space-y-2 rounded-lg border border-border bg-background p-3 shadow-sm",
        dragging && "rotate-1 scale-105 opacity-80 shadow-lg",
      )}
    >
      <p className={cn("text-sm font-medium leading-snug", isDone && "text-muted-foreground line-through")}>
        {task.title}
      </p>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px]">{task.type}</Badge>
        <span className="flex items-center gap-1">
          <User className="h-2.5 w-2.5" />
          {task.assignedToName ?? "Sin asignar"}
        </span>
        <span className={cn("flex items-center gap-1", !isDone && due.overdue && "text-red-600 dark:text-red-400")}>
          <Calendar className="h-2.5 w-2.5" />
          {due.label}
        </span>
      </div>
    </div>
  );
}

function DraggableTask({ task, onOpen }: { task: TaskData; onOpen: (task: TaskData) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(task.id),
    data: { task },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50, position: "relative" as const }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      // El sensor exige mover 6px antes de arrastrar, asi que un clic limpio
      // llega aqui y abre la tarjeta; soltarla tras arrastrar, no.
      onClick={() => { if (!isDragging) onOpen(task); }}
      className="cursor-grab active:cursor-grabbing"
    >
      <TaskCard task={task} dragging={isDragging} />
    </div>
  );
}

// ─── Columna ─────────────────────────────────────────────────────────────────

function BoardColumn({
  status,
  label,
  color,
  tasks,
  onAdd,
  onOpenTask,
  canDrag,
  canAdd,
}: {
  status: string;
  label: string;
  color: string;
  tasks: TaskData[];
  onAdd: () => void;
  onOpenTask: (task: TaskData) => void;
  canDrag: (task: TaskData) => boolean;
  canAdd: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      className="flex h-full w-[280px] shrink-0 flex-col overflow-hidden rounded-xl border-2 shadow-sm"
      style={{ borderColor: `${color}52`, backgroundColor: `${color}0A` }}
    >
      <div
        className="flex shrink-0 items-center justify-between px-3 py-2"
        style={{ backgroundColor: color }}
      >
        <span className="text-sm font-semibold uppercase text-white">{label}</span>
        <div className="flex items-center gap-1">
          <Badge className="border-0 bg-white/20 text-xs font-medium text-white">{tasks.length}</Badge>
          {canAdd && (
            <button
              onClick={onAdd}
              className="rounded p-0.5 transition-colors hover:bg-white/20"
              title={`Añadir tarea en ${label}`}
            >
              <Plus className="h-3.5 w-3.5 text-white/90" />
            </button>
          )}
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "min-h-0 flex-1 space-y-2 overflow-y-auto p-2 transition-colors",
          isOver && "bg-primary/5 ring-2 ring-inset ring-primary/30",
        )}
      >
        {tasks.map((task) => (
          canDrag(task)
            ? <DraggableTask key={task.id} task={task} onOpen={onOpenTask} />
            : <TaskCard key={task.id} task={task} />
        ))}
        {tasks.length === 0 && (
          <div className="flex h-20 items-center justify-center text-xs text-muted-foreground/40">
            Sin tareas
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tablero ─────────────────────────────────────────────────────────────────

export function ProjectBoard({
  project,
  team,
  userId,
  canManage,
  onBack,
  onProjectChanged,
}: {
  project: ProjectData;
  team: AdvisorInfo[];
  userId: string;
  /** Dueño o administrador. Un agente solo mueve las tareas que tiene asignadas. */
  canManage: boolean;
  onBack: () => void;
  onProjectChanged: () => void;
}) {
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<TaskData | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<TaskData | null>(null);
  const pendingRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getProjectTasksAction(project.id);
    if (res.success && res.data) setTasks(res.data);
    else toast.error(res.message);
    setLoading(false);
  }, [project.id]);

  useEffect(() => { void load(); }, [load]);

  // Un agente participa moviendo lo suyo; el servidor lo vuelve a comprobar.
  const puedeTocar = useCallback(
    (task: TaskData) => canManage || task.assignedToId === userId,
    [canManage, userId],
  );

  const byColumn = useMemo(() => {
    const map: Record<string, TaskData[]> = {};
    for (const col of BOARD_COLUMNS) map[col.status] = [];
    for (const task of tasks) {
      // Un estado que no tenga columna (por datos viejos) no se pierde: cae en
      // «Por hacer» en vez de desaparecer del tablero sin dejar rastro.
      const column = map[task.status] ? task.status : "pending";
      map[column].push(task);
    }
    return map;
  }, [tasks]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over || pendingRef.current) return;

    const task = (active.data.current as { task?: TaskData } | undefined)?.task;
    const toStatus = String(over.id);
    if (!task || task.status === toStatus) return;
    if (!BOARD_COLUMNS.some((col) => col.status === toStatus)) return;

    const previous = tasks;
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: toStatus as TaskData["status"] } : t)),
    );

    pendingRef.current = true;
    const res = await moveProjectTaskAction({
      taskId: task.id,
      status: toStatus as TaskData["status"],
    });
    pendingRef.current = false;

    if (!res.success) {
      setTasks(previous);
      toast.error(res.message);
      return;
    }
    // El avance del proyecto se ve en la tarjeta de la lista.
    onProjectChanged();
  }, [tasks, onProjectChanged]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onBack} title="Volver">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{project.name}</h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {project.leadName && <span>Responsable: {project.leadName}</span>}
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {project.members.length} en el equipo
              </span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => void load()} title="Actualizar">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {canManage && (
            <Button size="sm" className="gap-1.5" onClick={() => setAddingTo("pending")}>
              <Plus className="h-4 w-4" /> Nueva tarea
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={(e: DragStartEvent) =>
            setActiveTask((e.active.data.current as { task?: TaskData } | undefined)?.task ?? null)
          }
          onDragEnd={handleDragEnd}
        >
          <div className="min-h-0 flex-1 overflow-x-auto pb-2">
            <div className="flex h-full gap-3" style={{ width: "max-content", minWidth: "100%" }}>
              {BOARD_COLUMNS.map((col) => (
                <BoardColumn
                  key={col.status}
                  status={col.status}
                  label={col.label}
                  color={col.color}
                  tasks={byColumn[col.status] ?? []}
                  onAdd={() => setAddingTo(col.status)}
                  onOpenTask={(task) => { if (canManage) setEditingTask(task); }}
                  canDrag={puedeTocar}
                  canAdd={canManage}
                />
              ))}
            </div>
          </div>

          <DragOverlay>
            {activeTask && (
              <div className="w-[264px] rotate-2 shadow-2xl">
                <TaskCard task={activeTask} dragging />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <TaskDialog
        open={addingTo !== null || editingTask !== null}
        task={editingTask}
        projectId={project.id}
        initialStatus={addingTo ?? "pending"}
        team={team}
        userId={userId}
        onClose={() => { setAddingTo(null); setEditingTask(null); }}
        onSaved={() => {
          setAddingTo(null);
          setEditingTask(null);
          void load();
          onProjectChanged();
        }}
      />
    </div>
  );
}

// ─── Alta y edición de tarea ─────────────────────────────────────────────────

function TaskDialog({
  open,
  task,
  projectId,
  initialStatus,
  team,
  userId,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Con tarea, se edita. Sin ella, se crea. */
  task: TaskData | null;
  projectId: number;
  initialStatus: string;
  team: AdvisorInfo[];
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>(TASK_TYPES[4]);
  const [assignedToId, setAssignedToId] = useState(userId);
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Se repuebla al abrir: si no, el formulario conserva lo de la tarjeta anterior.
  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setType(task?.type ?? TASK_TYPES[4]);
    setAssignedToId(task?.assignedToId ?? userId);
    // Por defecto, hoy: una tarea sin fecha no aparece en los avisos de Tareas.
    setDueDate((task?.dueDate ?? new Date().toISOString()).slice(0, 10));
  }, [open, task, userId]);

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Ponle un título a la tarea."); return; }
    setSaving(true);

    if (task) {
      const res = await updateProjectTaskAction({
        taskId: task.id,
        title: title.trim(),
        type,
        dueDate: new Date(`${dueDate}T12:00:00`).toISOString(),
        assignedToId,
      });
      setSaving(false);
      if (!res.success) { toast.error(res.message); return; }
      toast.success(res.message);
      onSaved();
      return;
    }

    const res = await createTaskAction({
      assignedToId,
      title: title.trim(),
      type,
      dueDate: new Date(`${dueDate}T12:00:00`).toISOString(),
      projectId,
    });

    if (!res.success || !res.data) {
      setSaving(false);
      toast.error(res.message);
      return;
    }

    // createTaskAction siempre nace en "pending"; si se pidió otra columna, se
    // mueve acto seguido en vez de duplicar la lógica de creación.
    if (initialStatus !== "pending") {
      await moveProjectTaskAction({
        taskId: res.data.id,
        status: initialStatus as TaskData["status"],
      });
    }

    setSaving(false);
    toast.success("Tarea creada.");
    onSaved();
  };

  const handleDelete = async () => {
    if (!task) return;
    setDeleting(true);
    const res = await deleteTaskAction(task.id);
    setDeleting(false);
    if (!res.success) { toast.error(res.message); return; }
    toast.success("Tarea eliminada.");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{task ? "Editar tarea" : "Nueva tarea"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Qué hay que hacer</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Preparar los textos de la home"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-type">Tipo</Label>
              <select
                id="task-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-due">Para cuándo</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-assignee">Responsable</Label>
            <select
              id="task-assignee"
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value={userId}>Yo</option>
              {team
                .filter((person) => person.id !== userId)
                .map((person) => (
                  <option key={person.id} value={person.id}>{personLabel(person)}</option>
                ))}
            </select>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          {task ? (
            <Button
              variant="ghost"
              onClick={() => void handleDelete()}
              disabled={saving || deleting}
              className="gap-2 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Eliminar
            </Button>
          ) : <span />}

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving || deleting}>Cancelar</Button>
            <Button onClick={() => void handleSave()} disabled={saving || deleting} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {task ? "Guardar" : "Crear tarea"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
