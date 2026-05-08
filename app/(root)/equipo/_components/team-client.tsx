"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, KeyRound, UserCheck, LayoutGrid } from "lucide-react";

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
import type { AdvisorRow, ModuleOption } from "@/actions/team-actions";
import {
  createAdvisor,
  updateAdvisorPassword,
  deleteAdvisor,
  linkExistingAdvisor,
  getAdvisorModuleIds,
  saveAdvisorModules,
} from "@/actions/team-actions";

type ModulesForm = { advisorId: string; advisorName: string; enabledIds: string[]; loading: boolean };

type Props = {
  initialAdvisors: AdvisorRow[];
  ownerModules: ModuleOption[];
};

type CreateForm = { name: string; email: string; password: string };
type PasswordForm = { advisorId: string; advisorName: string; newPassword: string };

export function TeamClient({ initialAdvisors, ownerModules }: Props) {
  const [advisors, setAdvisors] = useState<AdvisorRow[]>(initialAdvisors);
  const [isPending, startTransition] = useTransition();

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({ name: "", email: "", password: "" });

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
      setCreateForm({ name: "", email: "", password: "" });
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Los asesores pueden ver todas las conversaciones y enviar mensajes usando tu instancia.
        </p>
        <div className="flex gap-2">
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
              <TableHead>Creado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {advisors.map((advisor) => (
              <TableRow key={advisor.id}>
                <TableCell className="font-medium">{advisor.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{advisor.email}</TableCell>
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
              <div className="grid grid-cols-2 gap-3">
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
