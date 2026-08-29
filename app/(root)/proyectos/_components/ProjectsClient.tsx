"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2, Plus, Users, Calendar, Trash2, Pencil, ArrowLeft, FolderKanban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  activo: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  pausado: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  terminado: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
};

function personLabel(person: { name: string | null; email: string | null }) {
  return person.name?.trim() || person.email || "Sin nombre";
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

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
        onBack={() => setOpenProjectId(null)}
        onProjectChanged={load}
      />
    );
  }

  // ─── Lista de proyectos ────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Proyectos</h1>
          <p className="text-sm text-muted-foreground">
            Agrupa el trabajo del equipo y sigue su avance.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" /> Nuevo proyecto
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <FolderKanban className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="font-medium">Todavía no hay proyectos</p>
            <p className="text-sm text-muted-foreground">
              Crea el primero y empieza a repartir tareas con tu equipo.
            </p>
          </div>
          <Button onClick={() => setCreating(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Nuevo proyecto
          </Button>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const total = BOARD_COLUMNS.reduce(
              (sum, col) => sum + (project.taskCounts[col.status] ?? 0), 0,
            );
            const done = project.taskCounts["done"] ?? 0;
            const due = fmtDate(project.dueDate);

            return (
              <Card
                key={project.id}
                className="cursor-pointer transition-colors hover:border-primary/50"
                onClick={() => setOpenProjectId(project.id)}
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate font-medium">{project.name}</p>
                    <Badge variant="outline" className={cn("shrink-0 text-[10px]", STATUS_STYLES[project.status])}>
                      {PROJECT_STATUS_LABELS[project.status]}
                    </Badge>
                  </div>

                  {project.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{project.description}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {project.members.length || "—"}
                    </span>
                    {due && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {due}
                      </span>
                    )}
                    <span>{total === 0 ? "Sin tareas" : `${done}/${total} hechas`}</span>
                  </div>

                  {total > 0 && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${Math.round((done / total) * 100)}%` }}
                      />
                    </div>
                  )}

                  <div className="flex justify-end gap-1 pt-1">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      title="Editar"
                      onClick={(e) => { e.stopPropagation(); setEditing(project); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                      title="Eliminar"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(project); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
