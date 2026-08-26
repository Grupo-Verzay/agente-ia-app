'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Workflow as DiagramIcon, Trash2, Pencil, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import {
  listFlowsAction,
  createFlowAction,
  renameFlowAction,
  deleteFlowAction,
  type FlowSummary,
} from '@/actions/flow-actions';

/**
 * "Hoy", "Ayer" o la fecha. Un listado de diagramas se mira para retomar el
 * de anoche, asi que los primeros dias dicen mas en palabras que en numeros.
 */
function cuandoSeTocó(fecha: Date | string): string {
  const d = new Date(fecha);
  const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const hoy = new Date();
  const diasAtrás = Math.round((new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime() - dia.getTime()) / 86400000);

  if (diasAtrás <= 0) return 'Editado hoy';
  if (diasAtrás === 1) return 'Editado ayer';
  if (diasAtrás < 7) return `Editado hace ${diasAtrás} días`;
  return `Editado el ${d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}`;
}

export function DiagramasListClient() {
  const router = useRouter();
  const [flows, setFlows] = useState<FlowSummary[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<FlowSummary | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleting, setDeleting] = useState<FlowSummary | null>(null);

  const load = async () => {
    const res = await listFlowsAction();
    if (!res.success) {
      toast.error(res.message);
      setFlows([]);
      return;
    }
    setFlows(res.data);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return toast.error('Ponle un nombre al diagrama.');
    setCreating(true);
    const res = await createFlowAction(newName);
    setCreating(false);
    if (!res.success) return toast.error(res.message);
    setCreateOpen(false);
    setNewName('');
    router.push(`/diagramas/${res.data.id}`);
  };

  const handleRename = async () => {
    if (!renaming) return;
    if (!renameValue.trim()) return toast.error('Ponle un nombre al diagrama.');
    const res = await renameFlowAction(renaming.id, renameValue);
    if (!res.success) return toast.error(res.message);
    toast.success('Renombrado.');
    setRenaming(null);
    void load();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const res = await deleteFlowAction(deleting.id);
    if (!res.success) return toast.error(res.message);
    toast.success('Diagrama eliminado.');
    setDeleting(null);
    void load();
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Diagramas</h1>
          <p className="text-sm text-muted-foreground">
            Diseña procesos visuales para mostrarle a tus clientes.
            {flows && flows.length > 0 && (
              <span className="ml-1.5 text-muted-foreground/70">
                {flows.length === 1 ? '1 diagrama' : `${flows.length} diagramas`}
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Nuevo
        </Button>
      </div>

      {flows === null ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : flows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border/70 p-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <DiagramIcon className="h-7 w-7 text-primary" />
          </span>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Aún no tienes diagramas</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Un diagrama explica un proceso paso a paso, sin ejecutar nada. Sirve para enseñarle a
              un cliente cómo va a funcionar su atención.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Crear el primero
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {flows.map((flow) => (
            <Card
              key={flow.id}
              className="group relative cursor-pointer transition-colors hover:border-primary/60 hover:bg-accent/40"
              onClick={() => router.push(`/diagramas/${flow.id}`)}
            >
              <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <DiagramIcon className="h-4.5 w-4.5 text-primary" />
                </span>
                <CardTitle className="min-w-0 flex-1 pt-1 text-sm font-semibold leading-tight">
                  <span className="line-clamp-2">{flow.name}</span>
                </CardTitle>
                {/* En pantalla grande las acciones solo salen al pasar el mouse,
                    para que la rejilla se lea limpia; en tactil no hay mouse que
                    pasar, asi que ahi se quedan siempre puestas. */}
                <div className="flex shrink-0 gap-0.5 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenaming(flow);
                      setRenameValue(flow.name);
                    }}
                    title="Renombrar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleting(flow);
                    }}
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium tabular-nums text-foreground/70">
                  {flow.nodeCount === 1 ? '1 paso' : `${flow.nodeCount ?? 0} pasos`}
                </span>
                <span className="truncate">{cuandoSeTocó(flow.updatedAt)}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuevo diagrama</DialogTitle>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="ej. Proceso de atención al cliente"
            onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating}>{creating ? 'Creando...' : 'Crear'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renaming} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Renombrar diagrama</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleRename()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>Cancelar</Button>
            <Button onClick={handleRename}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar &quot;{deleting?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
