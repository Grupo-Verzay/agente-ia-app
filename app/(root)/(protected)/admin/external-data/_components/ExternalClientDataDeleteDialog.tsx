'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { deleteExternalClientData } from '@/actions/external-client-data-actions';
import type { ExternalClientData } from '@/types/external-client-data';

// ─── Props (ISP) ──────────────────────────────────────────────────────────────

export interface ExternalClientDataDeleteDialogProps {
  record: ExternalClientData | null;
  onSuccess: () => void;
  onClose: () => void;
}

// ─── Component (SRP — only handles deletion confirmation) ─────────────────────

export function ExternalClientDataDeleteDialog({
  record,
  onSuccess,
  onClose,
}: ExternalClientDataDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!record) return;
    setIsDeleting(true);
    try {
      const ok = await deleteExternalClientData(record.userId, record.remoteJid);
      if (ok) {
        toast.success('Registro eliminado correctamente');
        onSuccess();
      } else {
        toast.error('No se pudo eliminar el registro');
        onClose();
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Error al eliminar el registro');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={!!record} onOpenChange={(v) => !v && !isDeleting && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar registro</AlertDialogTitle>
          <AlertDialogDescription>
            ¿Estás seguro de que deseas eliminar el registro para{' '}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
              {record?.remoteJid}
            </code>
            ? Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={isDeleting}>
            Cancelar
          </AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
            className="gap-2"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Eliminar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
