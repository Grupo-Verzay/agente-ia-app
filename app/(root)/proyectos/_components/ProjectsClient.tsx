"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2, Plus, Trash2, Pencil, FolderKanban, Search, AlertCircle, Eye, ListTodo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/custom/MetricCard";
import { ModuleToolbar } from "@/components/shared/ModuleToolbar";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { AdvisorInfo } from "@/actions/team-actions";
import {
  listProjectsAction, saveProjectAction, deleteProjectAction,
} from "@/actions/project-actions";
import {
  BOARD_COLUMNS, PROJECT_STATUSES, PROJECT_STATUS_LABELS,
  type ProjectData, type ProjectStatus,
} from "@/lib/project-types";
import { ProjectBoard } from "./ProjectBoard";

const STATUS_STYLES: Record<ProjectStatus, string> = {
  activo: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  pausado: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  terminado: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30",
};

/** Un color por miembro, estable: el mismo nombre siempre da el mismo. */
const AVATAR_COLORS = [
  "bg-blue-600", "bg-violet-600", "bg-teal-600",
  "bg-rose-600", "bg-amber-600", "bg-cyan-600",
];
function avatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function personLabel(person: { name: string | null; email: string | null }) {
  return person.name?.trim() || person.email || "Sin nombre";
}

function initials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * La fecha avisa en vez de informar: «Venció hace 2 días» se lee sin pensar,
 * «30 de ago» obliga a calcular.
 */
function describeDue(iso: string | null) {
  if (!iso) return { label: "Sin fecha", tone: "idle" as const };

  const due = new Date(iso);
  const today = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(due) - startOfDay(today)) / 86_400_000);

  if (days < 0) {
    const n = Math.abs(days);
    return { label: n === 1 ? "Venció ayer" : `Venció hace ${n} días`, tone: "late" as const };
  }
  if (days === 0) return { label: "Vence hoy", tone: "soon" as const };
  if (days === 1) return { label: "Vence mañana", tone: "soon" as const };
  if (days <= 7) return { label: `Vence en ${days} días`, tone: "soon" as const };

  return {
    label: due.toLocaleDateString("es-CO", { day: "2-digit", month: "short" }),
    tone: "idle" as const,
  };
}

const DUE_TONES = {
  late: "bg-red-500/10 text-red-600 dark:text-red-400",
  soon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  idle: "bg-muted text-muted-foreground",
};

export function ProjectsClient({
  userId,
  team,
}: {
  userId: string;
  team: AdvisorInfo[];
}) {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [openProjectId, setOpenProjectId] = useState<number | null>(null);
  const [editing, setEditing] = useState<ProjectData | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectData | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"todos" | ProjectStatus | "mios">("todos");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listProjectsAction();
    if (res.success && res.data) setProjects(res.data);
    else toast.error(res.message);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openProject = useMemo(
    () => projects.find((p) => p.id === openProjectId) ?? null,
    [projects, openProjectId],
  );

  const summary = useMemo(() => {
    let activos = 0, vencidas = 0, revision = 0, abiertas = 0;
    for (const p of projects) {
      if (p.status === "activo") activos += 1;
      vencidas += p.overdueTasks;
      revision += p.taskCounts["in_review"] ?? 0;
      abiertas +=
        (p.taskCounts["pending"] ?? 0) +
        (p.taskCounts["in_progress"] ?? 0) +
        (p.taskCounts["in_review"] ?? 0);
    }
    return { activos, vencidas, revision, abiertas };
  }, [projects]);

  const visibleProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !(p.description ?? "").toLowerCase().includes(q)) {
        return false;
      }
      if (filter === "todos") return true;
      if (filter === "mios") {
        return p.leadId === userId || p.members.some((m) => m.userId === userId);
      }
      return p.status === filter;
    });
  }, [projects, query, filter, userId]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setBusy(true);
    const res = await deleteProjectAction(deleteTarget.id);
    setBusy(false);
    if (!res.success) { toast.error(res.message); return; }
    toast.success(res.message);
    setDeleteTarget(null);
    if (openProjectId === deleteTarget.id) setOpenProjectId(null);
    void load();
  }, [deleteTarget, openProjectId, load]);

  // ─── Tablero de un proyecto ────────────────────────────────────────────────
  if (openProject) {
    return (
      <ProjectBoard
        project={openProject}
        team={team}
        userId={userId}
        canManage={openProject.puedeGestionar}
        onBack={() => setOpenProjectId(null)}
        onProjectChanged={load}
      />
    );
  }

  const FILTERS: { key: typeof filter; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "activo", label: "Activos" },
    { key: "pausado", label: "En pausa" },
    { key: "terminado", label: "Terminados" },
    { key: "mios", label: "Míos" },
  ];

  // ─── Lista de proyectos ────────────────────────────────────────────────────
  return (
    // Mismo contenedor que Clientes: sin padding propio, el contenido va pegado
    // a los bordes del área de la pantalla.
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">

      {/* Resumen arriba del todo, igual que en Clientes. La miga de pan ya dice
          que esto es Proyectos, así que no se repite como título.
          La fila envolvente es la que hace que el flex-1 crezca a lo ancho; sin
          ella, dentro de una columna, se comería toda la altura. */}
      <div className="flex shrink-0 items-center justify-between">
      <div className="container-stats mb-2 hidden flex-1 sm:flex sm:gap-4 sm:overflow-x-auto">
        <div className="min-w-0 sm:flex-1">
          <MetricCard
            icon={<FolderKanban className="h-4 w-4" />}
            label="Proyectos activos"
            value={summary.activos}
            color="#22C55E"
          />
        </div>
        <div className="min-w-0 sm:flex-1">
          <MetricCard
            icon={<AlertCircle className="h-4 w-4" />}
            label="Tareas vencidas"
            value={summary.vencidas}
            helper="Tareas sin terminar cuya fecha ya pasó."
            color="#EF4444"
          />
        </div>
        <div className="min-w-0 sm:flex-1">
          <MetricCard
            icon={<Eye className="h-4 w-4" />}
            label="Esperando revisión"
            value={summary.revision}
            color="#A855F7"
          />
        </div>
        <div className="min-w-0 sm:flex-1">
          <MetricCard
            icon={<ListTodo className="h-4 w-4" />}
            label="Tareas abiertas"
            value={summary.abiertas}
            color="#3B82F6"
          />
        </div>
      </div>

      </div>

      {/* Buscador, filtros y la acción, en una sola fila. */}
      <ModuleToolbar className="shrink-0">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar proyecto..."
            className="h-9 pl-8"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              aria-pressed={filter === item.key}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                filter === item.key
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Crear lo puede cualquiera del equipo: el proyecto queda a su
              cargo. Lo de los demás sigue necesitando ser administrador. */}
          <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nuevo
          </Button>
        </div>
      </ModuleToolbar>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : visibleProjects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <FolderKanban className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="font-medium">
              {projects.length === 0 ? "Todavía no hay proyectos" : "Nada coincide con esa búsqueda"}
            </p>
            <p className="text-sm text-muted-foreground">
              {projects.length === 0
                ? "Crea el primero y empieza a repartir tareas con tu equipo."
                : "Prueba con otro texto o quita los filtros."}
            </p>
          </div>
          {projects.length === 0 && (
            <Button onClick={() => setCreating(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Nuevo proyecto
            </Button>
          )}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 items-stretch gap-3 overflow-y-auto pb-2 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              canManage={project.puedeGestionar}
              onOpen={() => setOpenProjectId(project.id)}
              onEdit={() => setEditing(project)}
              onDelete={() => setDeleteTarget(project)}
            />
          ))}
        </div>
      )}

      <ProjectDialog
        open={creating || editing !== null}
        project={editing}
        team={team}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); void load(); }}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar proyecto</AlertDialogTitle>
            <AlertDialogDescription>
              {`Se eliminará «${deleteTarget?.name ?? ""}». Sus tareas NO se borran: se quedan en la pantalla de Tareas, sueltas.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={busy}
              onClick={(e) => { e.preventDefault(); void handleDelete(); }}
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Tarjeta ─────────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  canManage,
  onOpen,
  onEdit,
  onDelete,
}: {
  project: ProjectData;
  canManage: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const total = BOARD_COLUMNS.reduce((sum, col) => sum + (project.taskCounts[col.status] ?? 0), 0);
  const due = describeDue(project.dueDate);
  const shown = project.members.slice(0, 4);
  const rest = project.members.length - shown.length;

  // Solo las etapas con tareas: una leyenda de cinco entradas a cero no dice nada.
  const segments = BOARD_COLUMNS
    .map((col) => ({ ...col, count: project.taskCounts[col.status] ?? 0 }))
    .filter((col) => col.count > 0);

  return (
    <Card
      className="group relative flex h-full cursor-pointer flex-col transition-colors hover:border-primary/50"
      onClick={onOpen}
    >
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 font-semibold leading-snug">{project.name}</p>
          {/* Quietas hasta que el puntero entra o llega el teclado: la papelera
              roja permanente era lo más llamativo de la tarjeta. Van en la fila,
              antes del estado: así el estado se queda pegado a la derecha, en el
              mismo sitio que le sale a un participante, que no tiene botones. */}
          {canManage && (
            <div className="flex shrink-0 gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <Button
                variant="outline" size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-red-600"
                title="Eliminar" aria-label={`Eliminar ${project.name}`}
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
              <Button
                variant="outline" size="icon" className="h-6 w-6"
                title="Editar" aria-label={`Editar ${project.name}`}
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
            </div>
          )}
          <Badge variant="outline" className={cn("shrink-0 text-[10px] uppercase", STATUS_STYLES[project.status])}>
            {PROJECT_STATUS_LABELS[project.status]}
          </Badge>
        </div>

        {project.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{project.description}</p>
        )}

        {/* Barra partida por etapas: dice DÓNDE está el trabajo, no solo cuánto
            falta. Cuatro por hacer y nada en curso es un proyecto parado. */}
        <div className="flex flex-col gap-1.5">
          <div className="flex h-1.5 overflow-hidden rounded-full border border-border bg-muted">
            {segments.map((col) => (
              <span
                key={col.status}
                style={{ width: `${(col.count / total) * 100}%`, backgroundColor: col.color }}
              />
            ))}
          </div>
          <div className="flex min-h-[2.2rem] flex-wrap content-start gap-x-2.5 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
            {total === 0 ? (
              <span>Sin tareas todavía</span>
            ) : (
              segments.map((col) => (
                <span key={col.status} className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-[2px]" style={{ backgroundColor: col.color }} />
                  <b className="font-semibold text-foreground">{col.count}</b> {col.label.toLowerCase()}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center">
            {shown.map((member) => {
              const label = personLabel(member);
              return (
                <span
                  key={member.userId}
                  title={label}
                  className={cn(
                    "-mr-1.5 grid h-6 w-6 place-items-center rounded-full border-2 border-card text-[9px] font-semibold text-white",
                    avatarColor(member.userId),
                  )}
                >
                  {initials(label)}
                </span>
              );
            })}
            {rest > 0 && (
              <span className="-mr-1.5 grid h-6 w-6 place-items-center rounded-full border-2 border-card bg-muted text-[9px] font-semibold text-muted-foreground">
                +{rest}
              </span>
            )}
            {project.members.length === 0 && (
              <span className="text-[11px] text-muted-foreground">Sin equipo</span>
            )}
          </div>

          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", DUE_TONES[due.tone])}>
            {due.label}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Alta / edición ──────────────────────────────────────────────────────────

function ProjectDialog({
  open,
  project,
  team,
  onClose,
  onSaved,
}: {
  open: boolean;
  project: ProjectData | null;
  team: AdvisorInfo[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("activo");
  const [leadId, setLeadId] = useState<string>("");
  const [dueDate, setDueDate] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Se repuebla al abrir: si no, el formulario conserva lo del proyecto anterior.
  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? "");
    setDescription(project?.description ?? "");
    setStatus(project?.status ?? "activo");
    setLeadId(project?.leadId ?? "");
    setDueDate(project?.dueDate ? project.dueDate.slice(0, 10) : "");
    setMemberIds(project?.members.map((m) => m.userId) ?? []);
  }, [open, project]);

  const toggleMember = (id: string) =>
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Ponle un nombre al proyecto."); return; }
    setSaving(true);
    const res = await saveProjectAction({
      id: project?.id,
      name: name.trim(),
      description: description.trim() || null,
      status,
      leadId: leadId || null,
      dueDate: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null,
      memberIds,
    });
    setSaving(false);
    if (!res.success) { toast.error(res.message); return; }
    toast.success(res.message);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? "Editar proyecto" : "Nuevo proyecto"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Nombre</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Rediseño de la web"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-description">Descripción</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional: en qué consiste."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="project-status">Estado</Label>
              <select
                id="project-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="project-due">Fecha límite</Label>
              <Input
                id="project-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-lead">Responsable</Label>
            <select
              id="project-lead"
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Sin asignar</option>
              {team.map((person) => (
                <option key={person.id} value={person.id}>{personLabel(person)}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Equipo</Label>
            {team.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Todavía no tienes a nadie en el equipo. Puedes crear el proyecto igual y añadirlos después.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {team.map((person) => {
                  const active = memberIds.includes(person.id);
                  return (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => toggleMember(person.id)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/50",
                      )}
                    >
                      {personLabel(person)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={() => void handleSave()} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {project ? "Guardar" : "Crear proyecto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
