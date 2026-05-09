"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, KeyRound, UserCheck, LayoutGrid, Bot, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AdvisorRow, ModuleOption, TeamMetrics } from "@/actions/team-actions";
import { TeamMetrics as TeamMetricsPanel } from "./TeamMetrics";
import {
  createAdvisor,
  updateAdvisorPassword,
  updateAdvisorRole,
  toggleAdvisorAvailability,
  deleteAdvisor,
  linkExistingAdvisor,
  getAdvisorModuleIds,
  saveAdvisorModules,
  saveAutoAssignSettings,
} from "@/actions/team-actions";
import { bulkAutoAssign } from "@/actions/advisor-assign-actions";

const PALETTE = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500',
  'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-fuchsia-500',
];
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function getInitials(name: string | null, email: string) {
  const src = name?.trim() || email;
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

type ModulesForm = { advisorId: string; advisorName: string; enabledIds: string[]; loading: boolean };

type AutoAssignSettings = { autoAssignEnabled: boolean; autoAssignMaxChats: number };

type Props = {
  initialAdvisors: AdvisorRow[];
  ownerModules: ModuleOption[];
  initialAutoAssign: AutoAssignSettings;
  teamMetrics: TeamMetrics | null;
};

type CreateForm = { name: string; email: string; password: string; role: "agente" | "administrador" };
type PasswordForm = { advisorId: string; advisorName: string; newPassword: string };

export function TeamClient({ initialAdvisors, ownerModules, initialAutoAssign, teamMetrics }: Props) {
  const [advisors, setAdvisors] = useState<AdvisorRow[]>(initialAdvisors);
  const [isPending, startTransition] = useTransition();

  // Auto-assign settings
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(initialAutoAssign.autoAssignEnabled);
  const [autoAssignMaxChats, setAutoAssignMaxChats] = useState(initialAutoAssign.autoAssignMaxChats);
  const [autoAssignSaving, setAutoAssignSaving] = useState(false);

  function handleAutoAssignToggle(enabled: boolean) {
    setAutoAssignEnabled(enabled);
    setAutoAssignSaving(true);
    saveAutoAssignSettings({ enabled, maxChats: autoAssignMaxChats }).then((res) => {
      if (!res.success) toast.error(res.message);
      setAutoAssignSaving(false);
    });
  }

  function handleMaxChatsChange(val: string) {
    const n = parseInt(val);
    if (isNaN(n) || n < 1) return;
    setAutoAssignMaxChats(n);
  }

  function handleMaxChatsBlur() {
    setAutoAssignSaving(true);
    saveAutoAssignSettings({ enabled: autoAssignEnabled, maxChats: autoAssignMaxChats }).then((res) => {
      if (!res.success) toast.error(res.message);
      else toast.success("Configuración guardada.");
      setAutoAssignSaving(false);
    });
  }

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({ name: "", email: "", password: "", role: "agente" });

  // Link existing dialog
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkEmail, setLinkEmail] = useState("");

  // Password dialog
  const [pwForm, setPwForm] = useState<PasswordForm | null>(null);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<AdvisorRow | null>(null);

  // Modules dialog
  const [modulesForm, setModulesForm] = useState<ModulesForm | null>(null);

  function handleCreateField(field: keyof CreateForm, value: string) {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
  }

  async function openModules(advisor: AdvisorRow) {
    setModulesForm({ advisorId: advisor.id, advisorName: advisor.name ?? advisor.email, enabledIds: [], loading: true });
    const res = await getAdvisorModuleIds(advisor.id);
    const ids = res.success && res.data && res.data.length > 0 ? res.data : ownerModules.map((m) => m.id);
    setModulesForm((prev) => prev ? { ...prev, enabledIds: ids, loading: false } : null);
  }

  function handleSaveModules() {
    if (!modulesForm) return;
    startTransition(async () => {
      const res = await saveAdvisorModules(modulesForm.advisorId, modulesForm.enabledIds);
      if (!res.success) { toast.error(res.message); return; }
      toast.success(res.message ?? "Módulos guardados.");
      setModulesForm(null);
    });
  }

  function handleLink() {
    startTransition(async () => {
      const res = await linkExistingAdvisor(linkEmail);
      if (!res.success) { toast.error(res.message); return; }
      toast.success(res.message ?? "Asesor vinculado.");
      setLinkOpen(false);
      setLinkEmail("");
      const { getTeamAdvisors } = await import("@/actions/team-actions");
      const list = await getTeamAdvisors();
      if (list.success && list.data) setAdvisors(list.data);
    });
  }

  function handleCreate() {
    startTransition(async () => {
      const res = await createAdvisor(createForm);
      if (!res.success) {
        toast.error(res.message);
        return;
      }
      toast.success(res.message ?? "Asesor creado.");
      setCreateOpen(false);
      setCreateForm({ name: "", email: "", password: "", role: "agente" });
      // Reload list
      const { getTeamAdvisors } = await import("@/actions/team-actions");
      const list = await getTeamAdvisors();
      if (list.success && list.data) setAdvisors(list.data);
    });
  }

  function handleUpdatePassword() {
    if (!pwForm) return;
    startTransition(async () => {
      const res = await updateAdvisorPassword({ advisorId: pwForm.advisorId, newPassword: pwForm.newPassword });
      if (!res.success) {
        toast.error(res.message);
        return;
      }
      toast.success(res.message ?? "Contraseña actualizada.");
      setPwForm(null);
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const res = await deleteAdvisor(deleteTarget.id);
      if (!res.success) {
        toast.error(res.message);
        return;
      }
      toast.success(res.message ?? "Asesor eliminado.");
      setAdvisors((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      setDeleteTarget(null);
    });
  }

  return (
    <div className="space-y-6">
      {/* Auto-assign settings card */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Auto-asignación de conversaciones</span>
          {autoAssignSaving && <span className="text-xs text-muted-foreground ml-auto">Guardando...</span>}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <Switch
              id="auto-assign-toggle"
              checked={autoAssignEnabled}
              onCheckedChange={handleAutoAssignToggle}
            />
            <Label htmlFor="auto-assign-toggle" className="text-sm cursor-pointer">
              {autoAssignEnabled ? "Activada" : "Desactivada"}
            </Label>
          </div>
          {autoAssignEnabled && (
            <div className="flex items-center gap-2">
              <Label htmlFor="max-chats" className="text-sm text-muted-foreground whitespace-nowrap">
                Máx. chats por asesor:
              </Label>
              <Input
                id="max-chats"
                type="number"
                min={1}
                max={500}
                className="h-8 w-20 text-sm"
                value={autoAssignMaxChats}
                onChange={(e) => handleMaxChatsChange(e.target.value)}
                onBlur={handleMaxChatsBlur}
              />
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Cuando llegue un nuevo contacto, se asignará automáticamente al asesor con menos conversaciones activas, sin superar el límite.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Los <strong>administradores</strong> ven todas las conversaciones. Los <strong>agentes</strong> solo ven las asignadas a ellos.
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                const res = await bulkAutoAssign();
                if (!res.success) { toast.error(res.message ?? "Error."); return; }
                const n = res.assigned ?? 0;
                toast.success(n > 0 ? `${n} conversación${n !== 1 ? 'es' : ''} asignada${n !== 1 ? 's' : ''}.` : "No hay conversaciones pendientes.");
              });
            }}
          >
            <Users className="w-4 h-4 mr-2" />
            Asignar sin atender
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
            <UserCheck className="w-4 h-4 mr-2" />
            Vincular existente
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Agregar asesor
          </Button>
        </div>
      </div>

      {advisors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <UserCheck className="w-10 h-10 opacity-30" />
          <p className="text-sm">No tienes asesores aún. Agrega el primero.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead className="text-center">Disponible</TableHead>
              <TableHead className="text-center">Asignados</TableHead>
              <TableHead className="text-center">Activos</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {advisors.map((advisor) => (
              <TableRow key={advisor.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white shrink-0 ${colorFor(advisor.id)}`}>
                      {getInitials(advisor.name, advisor.email)}
                    </span>
                    <span className="font-medium">{advisor.name ?? "—"}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{advisor.email}</TableCell>
                <TableCell>
                  <Select
                    value={advisor.advisorRole ?? "agente"}
                    onValueChange={(val) => {
                      startTransition(async () => {
                        const res = await updateAdvisorRole(advisor.id, val as "agente" | "administrador");
                        if (!res.success) { toast.error(res.message); return; }
                        setAdvisors((prev) => prev.map((a) => a.id === advisor.id ? { ...a, advisorRole: val } : a));
                      });
                    }}
                  >
                    <SelectTrigger className="h-7 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agente">🕵️ Agente</SelectItem>
                      <SelectItem value="administrador">🛡️ Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={advisor.advisorAvailable}
                    onCheckedChange={(val) => {
                      setAdvisors((prev) => prev.map((a) => a.id === advisor.id ? { ...a, advisorAvailable: val } : a));
                      toggleAdvisorAvailability(advisor.id, val).then((res) => {
                        if (!res.success) {
                          toast.error(res.message);
                          setAdvisors((prev) => prev.map((a) => a.id === advisor.id ? { ...a, advisorAvailable: !val } : a));
                        }
                      });
                    }}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <span className={`inline-flex items-center justify-center h-6 min-w-[1.5rem] rounded-full px-1.5 text-xs font-semibold ${advisor.assignedCount > 0 ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'text-muted-foreground'}`}>
                    {advisor.assignedCount}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <span className={`inline-flex items-center justify-center h-6 min-w-[1.5rem] rounded-full px-1.5 text-xs font-semibold ${advisor.activeCount > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'text-muted-foreground'}`}>
                    {advisor.activeCount}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {new Date(advisor.createdAt).toLocaleDateString("es-CO", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="icon"
                      title="Módulos"
                      onClick={() => openModules(advisor)}
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      title="Cambiar contraseña"
                      onClick={() =>
                        setPwForm({ advisorId: advisor.id, advisorName: advisor.name ?? advisor.email, newPassword: "" })
                      }
                    >
                      <KeyRound className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      title="Eliminar asesor"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteTarget(advisor)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Team metrics */}
      {teamMetrics && <TeamMetricsPanel metrics={teamMetrics} />}

      {/* Modules dialog */}
      <Dialog open={Boolean(modulesForm)} onOpenChange={(open) => !open && setModulesForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Módulos — {modulesForm?.advisorName}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {modulesForm?.loading ? (
              <p className="text-sm text-muted-foreground">Cargando módulos...</p>
            ) : ownerModules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay módulos disponibles.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {modulesForm?.enabledIds.length ?? 0} de {ownerModules.length} habilitados
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => setModulesForm((prev) => prev ? { ...prev, enabledIds: ownerModules.map((m) => m.id) } : null)}
                    >
                      Todos
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => setModulesForm((prev) => prev ? { ...prev, enabledIds: [] } : null)}
                    >
                      Ninguno
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                  {ownerModules.map((mod) => (
                    <div key={mod.id} className="flex items-center justify-between gap-2 pr-2">
                      <Label className="text-xs">{mod.label}</Label>
                      <Switch
                        checked={modulesForm?.enabledIds.includes(mod.id) ?? false}
                        onCheckedChange={(val) =>
                          setModulesForm((prev) =>
                            prev
                              ? { ...prev, enabledIds: val ? [...prev.enabledIds, mod.id] : prev.enabledIds.filter((id) => id !== mod.id) }
                              : null
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModulesForm(null)}>Cancelar</Button>
            <Button onClick={handleSaveModules} disabled={isPending || modulesForm?.loading}>
              {isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link existing dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular usuario existente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="link-email">Email del usuario</Label>
              <Input
                id="link-email"
                type="email"
                placeholder="asesor@empresa.com"
                value={linkEmail}
                onChange={(e) => setLinkEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>Cancelar</Button>
            <Button onClick={handleLink} disabled={isPending || !linkEmail.trim()}>
              {isPending ? "Vinculando..." : "Vincular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo asesor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="adv-name">Nombre</Label>
              <Input
                id="adv-name"
                placeholder="Juan Pérez"
                value={createForm.name}
                onChange={(e) => handleCreateField("name", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adv-email">Email</Label>
              <Input
                id="adv-email"
                type="email"
                placeholder="asesor@empresa.com"
                value={createForm.email}
                onChange={(e) => handleCreateField("email", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adv-pw">Contraseña</Label>
              <Input
                id="adv-pw"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={createForm.password}
                onChange={(e) => handleCreateField("password", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adv-role">Rol</Label>
              <Select
                value={createForm.role}
                onValueChange={(val) => setCreateForm((prev) => ({ ...prev, role: val as "agente" | "administrador" }))}
              >
                <SelectTrigger id="adv-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agente">Agente — solo ve conversaciones asignadas</SelectItem>
                  <SelectItem value="administrador">Administrador — ve todas las conversaciones</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={isPending}>
              {isPending ? "Creando..." : "Crear asesor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change password dialog */}
      <Dialog open={Boolean(pwForm)} onOpenChange={(open) => !open && setPwForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar contraseña — {pwForm?.advisorName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="new-pw">Nueva contraseña</Label>
              <Input
                id="new-pw"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={pwForm?.newPassword ?? ""}
                onChange={(e) => setPwForm((prev) => prev ? { ...prev, newPassword: e.target.value } : null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwForm(null)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdatePassword} disabled={isPending}>
              {isPending ? "Actualizando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar asesor?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la cuenta de <strong>{deleteTarget?.name ?? deleteTarget?.email}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={isPending}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
