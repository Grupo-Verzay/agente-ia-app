'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

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
 *
 * # Es solo el diálogo, y el botón lo pone el `⋯`
 *
 * Tenía su propio botón gris al final de la página, que es el último sitio
 * donde alguien busca una acción destructiva. Ahora lo abre el menú de acciones
 * de la barra, como el resto de los borrados en bloque de la plataforma, así
 * que aquí queda lo único que era suyo: la confirmación.
 *
 * Y el diálogo vive FUERA del menú: Radix desmonta el contenido de un
 * `DropdownMenu` al cerrarse, así que dentro se iría con él en cuanto se
 * pulsara la opción —o sea, antes de que nadie pudiera escribir la palabra—.
 */
export function VaciarContabilidad({
  accountLabel,
  abierto,
  onAbiertoChange,
}: {
  accountLabel?: string | null;
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const canConfirm = confirmText.trim().toUpperCase() === CONFIRM_WORD;

  function handleOpenChange(next: boolean) {
    onAbiertoChange(next);
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
    <AlertDialog open={abierto} onOpenChange={handleOpenChange}>
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
  );
}
