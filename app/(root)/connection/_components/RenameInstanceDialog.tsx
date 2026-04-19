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
import { sanitizeInstanceNameInput, sanitizeInstanceName } from '@/schema/connection';

interface RenameInstanceDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  userId: string;
  instanceType: string;
  currentName: string;
}

export const RenameInstanceDialog = ({
  open,
  setOpen,
  userId,
  instanceType,
  currentName,
}: RenameInstanceDialogProps) => {
  const router = useRouter();
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) setName(currentName);
  }, [open, currentName]);

  const mutation = useMutation({
    mutationFn: (newName: string) => renameInstance(userId, instanceType, newName),
    onSuccess: (res) => {
      if (!res?.success) {
        toast.error(res?.message || 'Error al renombrar la instancia.');
        return;
      }
      toast.success(res.message);
      setOpen(false);
      router.refresh();
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Error inesperado al renombrar.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sanitized = sanitizeInstanceName(name);
    if (sanitized.length < 2) {
      toast.error('El nombre debe tener al menos 2 caracteres válidos.');
      return;
    }
    if (sanitized === currentName) {
      toast.error('El nombre es igual al actual.');
      return;
    }
    mutation.mutate(sanitized);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md border-border">
        <DialogHeader>
          <DialogTitle>Editar nombre de instancia</DialogTitle>
          <DialogDescription>
            Ingresa el nuevo nombre para tu instancia.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="instance-name">Nombre</Label>
            <Input
              id="instance-name"
              value={name}
              onChange={(e) => setName(sanitizeInstanceNameInput(e.target.value))}
              placeholder="NOMBRE_INSTANCIA"
              maxLength={60}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Solo letras mayúsculas, números, guion bajo y guion medio.
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
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
