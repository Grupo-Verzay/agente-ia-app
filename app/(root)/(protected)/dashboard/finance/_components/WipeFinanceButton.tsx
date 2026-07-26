'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
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
import { wipeFinanceTransactions } from '@/actions/finance-wipe-actions';

const CONFIRM_WORD = 'VACIAR';

/**
 * Vacía las ventas y gastos de la cuenta que se está viendo, para recargarlas
 * desde cero. Exige escribir "VACIAR" porque afecta a toda la contabilidad de
 * la cuenta; el nombre de la cuenta se muestra para evitar hacerlo en la que no
 * es (Finanzas escopa por la cuenta activa).
 */
export function WipeFinanceButton({ accountLabel }: { accountLabel?: string | null }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const canConfirm = confirmText.trim().toUpperCase() === CONFIRM_WORD;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setConfirmText('');
  }

  function handleWipe() {
    if (!canConfirm || isPending) return;

    startTransition(async () => {
      const res = await wipeFinanceTransactions();
      if (!res.success) {
        toast.error(res.message);
        return;
      }
      toast.success(res.message);
      handleOpenChange(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Vaciar contabilidad
      </Button>

      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vaciar la contabilidad de esta cuenta</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Se eliminarán <strong>todas las ventas y gastos</strong>
                  {accountLabel ? (
                    <>
                      {' '}de <strong>{accountLabel}</strong>
                    </>
                  ) : null}
                  , para que puedas cargarlos desde cero.
                </p>
                <p>
                  Se conservan tus cuentas, categorías, clientes y proveedores. Si administras
                  varias cuentas, esto solo afecta a la que estás viendo ahora.
                </p>
                <p>
                  Escribe <strong>{CONFIRM_WORD}</strong> para confirmar.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={CONFIRM_WORD}
            autoComplete="off"
            disabled={isPending}
          />

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canConfirm || isPending}
              onClick={(e) => {
                e.preventDefault();
                handleWipe();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? 'Vaciando…' : 'Vaciar contabilidad'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
