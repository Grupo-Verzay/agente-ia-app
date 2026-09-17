"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import { toast } from "sonner";
import {
  ArrowLeft, Loader2, Plus, User, Calendar, RefreshCw, Users, Trash2,
  Paperclip, Image as ImageIcon, Video, FileAudio, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { TiempoDeTarea } from "@/components/shared/TiempoDeTarea";
import {
  NOMBRE_DEL_TIPO,
  QUE_ES_CADA_TIPO,
  TIPOS_DE_TRABAJO,
  type TipoDeTrabajo,
} from "@/lib/tipo-de-trabajo";
import {
  clientesParaLaTareaAction,
  guardarElClienteDeLaTareaAction,
} from "@/actions/trabajo-de-tarea-actions";
import { cn } from "@/lib/utils";
import type { AdvisorInfo } from "@/actions/team-actions";
import { createTaskAction, deleteTaskAction } from "@/actions/task-actions";
import {
  getProjectTasksAction, moveProjectTaskAction, updateProjectTaskAction,
} from "@/actions/project-actions";
import { BOARD_COLUMNS, type ProjectData } from "@/lib/project-types";
import { TASK_TYPES, type TaskData } from "@/lib/task-types";
import {
  adjuntarArchivoATareaAction, quitarAdjuntoDeTareaAction,
} from "@/actions/adjuntos-de-tarea-actions";
import {
  TOPE_DE_ADJUNTOS_POR_TAREA,
  type AdjuntoDeTarea, type TipoDeAdjunto,
} from "@/lib/adjuntos-de-tarea-tipos";
import { HiloDeLaTarea } from "./HiloDeLaTarea";
import {
  BloqueDeAdjuntos,
  borrarDelBucket,
  engancharLosDelAire,
  type AdjuntoEnElAire,
} from "./BloqueDeAdjuntos";

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
  // Algo que ESTA persona no ha abierto: se lo asignaron, alguien comentó,
  // alguien la dio por hecha. No se quita al pasar por encima ni con el tiempo:
  // solo al abrir la tarea, que es cuando de verdad se ha leído.
  const sinVer = task.tieneAlgoSinVer === true;

  return (
    <div
      className={cn(
        // `flex flex-col gap-2` y no `space-y-2`, por el punto de aviso.
        //
        // `space-y-*` reparte el hueco con márgenes (`> * + *`), y un hijo
        // ABSOLUTO también entra en esa cuenta: siendo el primero le regalaba un
        // `mt-2` al título —la tarjeta con aviso salía 8px más alta— y puesto al
        // final el margen se le sumaba a su propio `top`, o sea que el punto se
        // movía 8px hacia abajo. Con `gap` no hay márgenes: lo que está fuera
        // del flujo no cuenta ni recibe nada, y el punto se queda clavado en su
        // esquina mida lo que mida la tarjeta.
        "relative flex select-none flex-col gap-2 rounded-lg border border-border bg-background p-3 shadow-sm",
        sinVer && "border-indigo-400 ring-1 ring-indigo-400/40",
        dragging && "rotate-1 scale-105 opacity-80 shadow-lg",
      )}
    >
      {/* Fuera del flujo, en la esquina: un punto dentro de la fila le quitaría
          ancho al título, que es lo que de verdad se lee. */}
      {sinVer && (
        <span
          className="absolute -right-1 -top-1 flex h-3 w-3"
          title="Tiene algo que no has visto"
          aria-label="Tiene algo que no has visto"
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-60" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-indigo-500 ring-2 ring-background" />
        </span>
      )}

      {/* El título, recortado a DOS líneas.

          Sin recorte, una sola tarea larga se comía la columna entera y las
          demás quedaban fuera de vista: había que desplazarse dentro de la
          tarjeta para leerla, que es lo contrario de un tablero. El texto
          completo se lee al abrir la tarea, y de paso en el `title`.

          `whitespace-pre-wrap` se queda: lo que se pega aquí son varias líneas
          —«Empresa: … Fecha: … Tarea: …»— y sin él se pintaban todas seguidas.
          Medido en Chromium, `line-clamp` recorta igual de bien con `pre-wrap`.

          Y `min-h-[2.75em]` reserva sitio para las dos líneas **aunque use
          una**: es lo que iguala las alturas, el mismo patrón que la tarjeta de
          Diagramas. El número no es a ojo: son 2 × 1.375em, que es lo que mide
          una línea con `leading-snug`. Con `2.5em` —el de Diagramas, que va con
          otro interlineado— las tarjetas quedaban 4px descuadradas. */}
      <p
        title={task.title}
        className={cn(
          "line-clamp-2 min-h-[2.75em] whitespace-pre-wrap break-words text-sm font-medium leading-snug",
          isDone && "text-muted-foreground line-through",
        )}
      >
        {task.title}
      </p>

      {(task.adjuntos?.length ?? 0) > 0 && (
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Paperclip className="h-3 w-3" />
          {task.adjuntos!.length}
          {task.adjuntos!.length === 1 ? " archivo" : " archivos"}
        </p>
      )}

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
            // Arrastrar no, pero abrir sí: aquí dentro está el hilo, y quien no
            // puede mover una tarjeta también tiene que poder leerla y
            // contestar. Si no, el punto de «sin ver» no se podría quitar.
            : (
              <button
                key={task.id}
                type="button"
                className="w-full text-left"
                onClick={() => onOpenTask(task)}
              >
                <TaskCard task={task} />
              </button>
            )
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
  recibido = false,
  abrirTareaId,
  onBack,
  onProjectChanged,
}: {
  project: ProjectData;
  team: AdvisorInfo[];
  userId: string;
  /**
   * Puede trabajar en el tablero: crear, editar y mover cualquier tarjeta. Un
   * agente solo mueve las que tiene asignadas, y en un proyecto recibido de solo
   * lectura no se toca nada.
   */
  canManage: boolean;
  /**
   * El proyecto es de OTRA cuenta y nos lo están enseñando.
   *
   * Con permiso de edición se trabaja en él —crear, mover y cerrar tareas— pero
   * **no se borra nada**: borrar una tarea del proyecto de otro no es
   * «trabajar en él», y lo destructivo se queda en la cuenta dueña. La puerta de
   * verdad está en el servidor; esto es para no enseñar un botón que va a
   * contestar que no.
   */
  recibido?: boolean;
  /** Abrir esta tarea nada más cargar. Es a donde lleva un aviso. */
  abrirTareaId?: number | null;
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

  // Venir de un aviso abre su tarea. Una sola vez: si no, cerrar el diálogo lo
  // volvería a abrir en el render siguiente y no habría forma de salir.
  const yaSeAbrio = useRef(false);
  useEffect(() => {
    if (yaSeAbrio.current || !abrirTareaId || !tasks.length) return;
    const suya = tasks.find((t) => t.id === abrirTareaId);
    if (!suya) return;
    yaSeAbrio.current = true;
    setEditingTask(suya);
  }, [abrirTareaId, tasks]);

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

  // La tarea que se está cerrando desde el tablero, y su tiempo.
  const [cerrando, setCerrando] = useState<TaskData | null>(null);
  const [minutosDeTrabajo, setMinutosDeTrabajo] = useState<number | null>(null);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over || pendingRef.current) return;

    const task = (active.data.current as { task?: TaskData } | undefined)?.task;
    const toStatus = String(over.id);
    if (!task || task.status === toStatus) return;
    if (!BOARD_COLUMNS.some((col) => col.status === toStatus)) return;

    // Soltarla en «Hecho» es cerrarla, igual que el botón de Tareas, y cerrar
    // pide el tiempo. Aquí NO se mueve la tarjeta todavía: pintarla en Hecho y
    // devolverla si se cancela el diálogo la haría saltar a la vista. Se mueve
    // cuando el cierre se confirma.
    if (toStatus === "done") {
      setCerrando(task);
      return;
    }

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

  /** Confirmar el cierre: ahora sí se mueve, con el tiempo registrado. */
  const confirmarElCierre = useCallback(async () => {
    if (!cerrando || !minutosDeTrabajo) return;
    const task = cerrando;

    const previous = tasks;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: "done" } : t)));
    pendingRef.current = true;
    const res = await moveProjectTaskAction({
      taskId: task.id,
      status: "done",
      minutosDeTrabajo,
    });
    pendingRef.current = false;

    setCerrando(null);
    setMinutosDeTrabajo(null);

    if (!res.success) {
      setTasks(previous);
      toast.error(res.message);
      return;
    }
    onProjectChanged();
  }, [cerrando, minutosDeTrabajo, tasks, onProjectChanged]);

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
                  onOpenTask={setEditingTask}
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
        canManage={canManage}
        puedeBorrar={canManage && !recibido}
        recibido={recibido}
        onClose={() => {
          const habiaTarea = editingTask !== null;
          setAddingTo(null);
          setEditingTask(null);
          // Abrir la tarea quita su punto en el servidor. Se recarga para que
          // también se caiga en pantalla: si no, la tarjeta se queda marcada
          // hasta el siguiente refresco y parece que el punto no se apaga.
          if (habiaTarea) void load();
        }}
        onSaved={() => {
          setAddingTo(null);
          setEditingTask(null);
          void load();
          onProjectChanged();
        }}
      />

      {/* Cerrar desde el tablero pide lo mismo que el botón de Tareas.
          No se puede escapar sin registrar: cerrar el diálogo devuelve la
          tarjeta a su columna, no la da por hecha. */}
      <Dialog
        open={!!cerrando}
        onOpenChange={(o) => {
          if (!o) { setCerrando(null); setMinutosDeTrabajo(null); }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Dar por hecha</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{cerrando?.title}</p>
          <TiempoDeTarea minutos={minutosDeTrabajo} onChange={setMinutosDeTrabajo} autoFocus />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setCerrando(null); setMinutosDeTrabajo(null); }}
            >
              Cancelar
            </Button>
            <Button disabled={!minutosDeTrabajo} onClick={() => void confirmarElCierre()}>
              Dar por hecha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  canManage,
  puedeBorrar,
  recibido,
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
  /**
   * Quien no lleva el proyecto **abre igual** la tarjeta: aquí dentro está el
   * hilo, y el asignado tiene que poder leer y contestar. Lo que no puede es
   * cambiar los campos, así que salen bloqueados y sin botón de guardar. El
   * servidor lo vuelve a comprobar de todos modos.
   */
  canManage: boolean;
  /** Borrar es aparte: en un proyecto recibido no se borra ni con edición. */
  puedeBorrar: boolean;
  /**
   * El proyecto es de otra cuenta. Con esto no se pinta el bloque de «Cuenta» y
   * «Tipo de trabajo»: eso es la contabilidad de la cuenta DUEÑA —a cuál de SUS
   * clientes se le dedica el rato— y la lista de cuentas que vería la invitada
   * es la suya, que no pinta nada aquí. Guardarlo tampoco funcionaría: la acción
   * resuelve el dueño por quien llama.
   */
  recibido: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>(TASK_TYPES[4]);
  const [assignedToId, setAssignedToId] = useState(userId);
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [adjuntos, setAdjuntos] = useState<AdjuntoDeTarea[]>([]);
  // Los que subieron antes de que la tarea existiera. Se enganchan al crear
  // y se borran del bucket si se cancela.
  const [enElAire, setEnElAire] = useState<AdjuntoEnElAire[]>([]);
  // La cuenta a la que se le dedica. Vacío = tarea interna, que es normal.
  const [clienteId, setClienteId] = useState<string>("");
  // Montaje o soporte. Vacío = sin tipo, y sale así en el reparto.
  const [tipoDeTrabajo, setTipoDeTrabajo] = useState<string>("");
  // Solo hace falta cuando la tarjeta nace directamente en «Hecho».
  const [minutosDeTrabajo, setMinutosDeTrabajo] = useState<number | null>(null);
  const [clientes, setClientes] = useState<{ id: string; nombre: string }[]>([]);

  // Se repuebla al abrir: si no, el formulario conserva lo de la tarjeta anterior.
  useEffect(() => {
    if (!open) return;
    setAdjuntos(task?.adjuntos ?? []);
    setEnElAire([]);
    setTitle(task?.title ?? "");
    setType(task?.type ?? TASK_TYPES[4]);
    setAssignedToId(task?.assignedToId ?? userId);
    // Por defecto, hoy: una tarea sin fecha no aparece en los avisos de Tareas.
    setDueDate((task?.dueDate ?? new Date().toISOString()).slice(0, 10));
    setClienteId(task?.clienteId ?? "");
    setTipoDeTrabajo(task?.tipoDeTrabajo ?? "");
    setMinutosDeTrabajo(null);
    // Se piden al abrir y no al montar: el diálogo vive montado todo el rato y
    // pedirlas una vez al arrancar el tablero sería una consulta que casi nunca
    // se usa. Si falla, la lista sale vacía y el campo queda en «Sin cuenta»,
    // que es lo que había antes de esto.
    if (!recibido) void clientesParaLaTareaAction().then(setClientes);
  }, [open, task, userId, recibido]);

  /**
   * Cerrar sin guardar: lo que subió y no llegó a colgar de ninguna tarea se
   * borra del bucket.
   *
   * Va por UN solo camino —la X, el clic fuera y «Cancelar» llaman aquí— porque
   * con tres salidas distintas basta con olvidarse de una para que esa deje
   * basura, y eso no se nota hasta que alguien mira cuánto ocupa el bucket.
   *
   * El diálogo se cierra **antes** de esperar al borrado: es limpieza de fondo
   * y no tiene por qué retener la pantalla. Y si falla, `borrarDelBucket` lo
   * dice en la consola y no lanza.
   */
  const cerrar = () => {
    const sueltos = enElAire;
    setEnElAire([]);
    onClose();
    for (const a of sueltos) void borrarDelBucket(a.url);
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Ponle un título a la tarea."); return; }
    // Nacer en «Hecho» es nacer cerrada, y cerrar pide el tiempo.
    if (!task && initialStatus === "done" && !minutosDeTrabajo) {
      toast.error("Registra cuánto tiempo tomó la tarea.");
      return;
    }
    setSaving(true);

    if (task) {
      const res = await updateProjectTaskAction({
        taskId: task.id,
        title: title.trim(),
        type,
        dueDate: new Date(`${dueDate}T12:00:00`).toISOString(),
        assignedToId,
      });
      if (res.success && !recibido) {
        await guardarElClienteDeLaTareaAction(
          task.id,
          clienteId || null,
          tipoDeTrabajo || null,
        );
      }
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

    if (!recibido) {
      await guardarElClienteDeLaTareaAction(
        res.data.id,
        clienteId || null,
        tipoDeTrabajo || null,
      );
    }

    // Los archivos que se subieron mientras se redactaba ya están en el bucket;
    // aquí se les pone por fin el id de la tarea. Va ANTES de avisar de que se
    // guardó: si no, la tarjeta se refresca sin sus adjuntos y parece que se
    // perdieron. Y se vacía la lista para que el `onClose` de después no los
    // borre del bucket — ya no están en el aire, cuelgan de la tarea.
    if (enElAire.length) {
      await engancharLosDelAire(res.data.id, enElAire);
      setEnElAire([]);
    }

    // createTaskAction siempre nace en "pending"; si se pidió otra columna, se
    // mueve acto seguido en vez de duplicar la lógica de creación.
    //
    // Y si esa columna es «Hecho», el movimiento es un cierre y lleva su
    // tiempo: crear una tarea ya hecha es cerrarla. Sin esto, ese «+» era la
    // puerta de atrás por la que una tarea se cerraba sin registrar nada.
    if (initialStatus !== "pending") {
      await moveProjectTaskAction({
        taskId: res.data.id,
        status: initialStatus as TaskData["status"],
        ...(initialStatus === "done" ? { minutosDeTrabajo: minutosDeTrabajo as number } : {}),
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
    <Dialog open={open} onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {!task ? "Nueva tarea" : canManage ? "Editar tarea" : "La tarea"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Qué hay que hacer</Label>
            {/* Un textarea y no un `Input`: lo que se pega aquí son varias
                líneas —«Empresa: … Fecha: … Tarea: …»— y en una sola línea no
                se veía el contenido y los saltos se perdían al escribir.
                Mismo tamaño y comportamiento que el campo «Mensaje» del modal
                de recordatorios, que es la referencia. */}
            <Textarea
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              readOnly={!canManage}
              rows={5}
              className="min-h-[7rem] resize-y"
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
                disabled={!canManage}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-70"
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
                readOnly={!canManage}
              />
            </div>
          </div>

          <BloqueDeAdjuntos
            taskId={task?.id ?? null}
            userId={userId}
            adjuntos={adjuntos}
            onCambio={setAdjuntos}
            enElAire={enElAire}
            onCambioEnElAire={setEnElAire}
          />

          {/* El hilo, solo con la tarea ya creada: los comentarios cuelgan de un
              `taskId` y en una tarea nueva ese id todavía no existe. Misma
              condición que los adjuntos. Se pinta para todo el mundo, también
              para quien no puede editar: es el asignado quien tiene que poder
              leer y contestar, y abrirlo es lo que apaga su punto. */}
          {task && <HiloDeLaTarea taskId={task.id} userId={userId} />}

          <div className="space-y-1.5">
            <Label htmlFor="task-assignee">Responsable</Label>
            <select
              id="task-assignee"
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
              disabled={!canManage}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-70"
            >
              <option value={userId}>Yo</option>
              {team
                .filter((person) => person.id !== userId)
                .map((person) => (
                  <option key={person.id} value={person.id}>{personLabel(person)}</option>
                ))}
            </select>
          </div>

          {!recibido && (
          <>
          <div className="space-y-1.5">
            <Label htmlFor="task-cliente">Cuenta</Label>
            <select
              id="task-cliente"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              disabled={!canManage}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-70"
            >
              {/* El vacío va primero y con nombre: sin cuenta es un caso
                  normal —las tareas internas— y no un campo a medio rellenar.
                  Dejarlo sin etiqueta haría pensar que falta elegir algo. */}
              <option value="">Sin cuenta (interna)</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>

          {/* Va pegado a Cuenta porque los dos contestan a la misma pregunta:
              a quién se le dedica el rato y para qué. Separados, se rellena uno
              y se olvida el otro, y entonces el reparto no puede cruzar nada. */}
          <div className="space-y-1.5">
            <Label htmlFor="task-tipo-trabajo">Tipo de trabajo</Label>
            <select
              id="task-tipo-trabajo"
              value={tipoDeTrabajo}
              onChange={(e) => setTipoDeTrabajo(e.target.value)}
              disabled={!canManage}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-70"
            >
              <option value="">Sin tipo</option>
              {TIPOS_DE_TRABAJO.map((t) => (
                <option key={t} value={t}>{NOMBRE_DEL_TIPO[t]}</option>
              ))}
            </select>
            {/* Qué es cada uno se dice aquí y no se deja adivinar: es la
                diferencia entre medir bien y medir cualquier cosa. */}
            <p className="text-xs text-muted-foreground">
              {tipoDeTrabajo
                ? QUE_ES_CADA_TIPO[tipoDeTrabajo as TipoDeTrabajo]
                : "Montaje entrega un cliente nuevo; soporte mantiene uno que ya funciona."}
            </p>
          </div>
          </>
          )}
        </div>

        {/* Nacer en «Hecho» es nacer cerrada, y cerrar pide el tiempo. Solo
            sale en ese caso: en las demás columnas no hay nada que registrar
            todavía. */}
        {!task && initialStatus === "done" && (
          <TiempoDeTarea minutos={minutosDeTrabajo} onChange={setMinutosDeTrabajo} />
        )}

        <DialogFooter className="sm:justify-between">
          {task && puedeBorrar ? (
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
            <Button variant="outline" onClick={cerrar} disabled={saving || deleting}>
              {canManage ? "Cancelar" : "Cerrar"}
            </Button>
            {/* Sin permiso no hay botón de guardar: enseñarlo y que el servidor
                conteste «No autorizado» es la puerta cerrada detrás del menú
                abierto. Lo que sí puede hacer aquí es comentar. */}
            {canManage && (
              <Button onClick={() => void handleSave()} disabled={saving || deleting} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {task ? "Guardar" : "Crear tarea"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
