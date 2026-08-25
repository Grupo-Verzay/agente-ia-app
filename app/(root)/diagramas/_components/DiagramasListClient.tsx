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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Diagramas</h1>
          <p className="text-sm text-muted-foreground">Diseña procesos visuales para mostrarle a tus clientes.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuevo diagrama
        </Button>
      </div>

      {flows === null ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : flows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <DiagramIcon className="h-10 w-10 opacity-40" />
          <p className="text-sm">Aún no tienes diagramas.</p>
          <Button variant="outline" onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Crear el primero
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {flows.map((flow) => (
            <Card key={flow.id} className="group relative cursor-pointer transition hover:border-primary/50" onClick={() => router.push(`/diagramas/${flow.id}`)}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                  <DiagramIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{flow.name}</span>
                </CardTitle>
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
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
                    className="h-7 w-7 text-destructive"
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
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Actualizado {new Date(flow.updatedAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
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
