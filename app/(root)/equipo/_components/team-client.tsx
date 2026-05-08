"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, KeyRound, UserCheck } from "lucide-react";

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

import type { AdvisorRow } from "@/actions/team-actions";
import {
  createAdvisor,
  updateAdvisorPassword,
  deleteAdvisor,
} from "@/actions/team-actions";

type Props = {
  initialAdvisors: AdvisorRow[];
};

type CreateForm = { name: string; email: string; password: string };
type PasswordForm = { advisorId: string; advisorName: string; newPassword: string };

export function TeamClient({ initialAdvisors }: Props) {
  const [advisors, setAdvisors] = useState<AdvisorRow[]>(initialAdvisors);
  const [isPending, startTransition] = useTransition();

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({ name: "", email: "", password: "" });

  // Password dialog
  const [pwForm, setPwForm] = useState<PasswordForm | null>(null);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<AdvisorRow | null>(null);

  function handleCreateField(field: keyof CreateForm, value: string) {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
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
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Agregar asesor
        </Button>
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
