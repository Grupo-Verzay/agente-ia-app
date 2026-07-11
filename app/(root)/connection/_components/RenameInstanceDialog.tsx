'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { renameInstance } from '@/actions/api-action';
import { updateInstanceDisplayName } from '@/actions/instances-actions';
import { sanitizeInstanceNameInput, sanitizeInstanceName } from '@/schema/connection';

interface RenameInstanceDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  userId: string;
  instanceType: string;
  currentName: string;
  currentDisplayName?: string;
  displayOnly?: boolean;
}

export const RenameInstanceDialog = ({
  open,
  setOpen,
  userId,
  instanceType,
  currentName,
  currentDisplayName,
  displayOnly = false,
}: RenameInstanceDialogProps) => {
  const router = useRouter();
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) setName(currentDisplayName || currentName);
  }, [open, currentDisplayName, currentName]);

  const mutation = useMutation({
    mutationFn: (newName: string) => displayOnly
      ? updateInstanceDisplayName(currentName, newName)
      : renameInstance(userId, instanceType, newName),
    onSuccess: (res) => {
      if (!res?.success) {
        toast.error(res?.message || 'Error al guardar el nombre.');
        return;
      }
      toast.success(res.message);
      setOpen(false);
      router.refresh();
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Error inesperado al guardar.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = displayOnly ? name.trim() : sanitizeInstanceName(name);
    if (finalName.length < 2) {
      toast.error('El nombre debe tener al menos 2 caracteres.');
      return;
    }
    if (finalName === (displayOnly ? (currentDisplayName || currentName) : currentName)) {
      toast.error('El nombre es igual al actual.');
      return;
    }
    mutation.mutate(finalName);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md border-border">
        <DialogHeader>
          <DialogTitle>Editar nombre</DialogTitle>
          <DialogDescription>
            Ingresa el nombre que verás en la tarjeta.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="instance-name">Nombre</Label>
            <Input
              id="instance-name"
              value={name}
              onChange={(e) => setName(displayOnly ? e.target.value : sanitizeInstanceNameInput(e.target.value))}
              placeholder="Nombre visible"
              maxLength={60}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Este nombre es solo visual; no cambia la conexión técnica.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button variant="save" type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
