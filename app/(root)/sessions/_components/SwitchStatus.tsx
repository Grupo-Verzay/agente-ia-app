'use client';

import { useState } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { updateSessionStatus } from '@/actions/session-action';
import { toast } from 'sonner';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';

type SessionLike = { id: number; [key: string]: unknown };

interface Props {
  sessionId: number;
  checked: boolean;
  mutateSessions?: (updater: (prevData: SessionLike[][] | undefined) => SessionLike[][] | undefined, shouldRevalidate?: boolean) => void;
  /**
   * Se llama cuando el servidor YA guardo el cambio, para que quien nos pinta
   * lo apunte en su estado local.
   *
   * Sin esto, en Chats el interruptor volvia a verse apagado al salir de la
   * conversacion y volver: la barra lateral guarda su propia copia de la sesion
   * y nadie se la actualizaba, asi que al reabrir el chat se sembraba con la
   * copia vieja. Solo se corregia cuando el reloj de sesiones (60s) traia la
   * lista otra vez, y de ahi el "tarda mucho".
   */
  onChanged?: (status: boolean) => void;
  /** Version corta (h-5 w-9) para ir junto al nombre. Sin ella, la de siempre. */
  compact?: boolean;
  /**
   * La pastilla ES el interruptor: un solo elemento que dice «Activa» (verde) o
   * «Pausada» (gris) y se pulsa para cambiar. Sin control al lado.
   */
  pastilla?: boolean;
}

export const SwitchStatus = ({ sessionId, checked, mutateSessions, onChanged, compact, pastilla }: Props) => {
  const [localChecked, setLocalChecked] = useState(checked);
  const [isLoading, setIsLoading] = useState(false);

  const handleUpdateClientStatus = async (status: boolean) => {
    const previous = localChecked;
    setLocalChecked(status);
    setIsLoading(true);

    const toastId = 'updating-client';
    toast.loading('Actualizando estado del cliente...', { id: toastId });

    const result = await updateSessionStatus(sessionId, status);

    if (result.success) {
      toast.success('Actualizado!', { id: toastId });
      onChanged?.(status);

      if (mutateSessions) {
        mutateSessions((prev) => {
          if (!prev) return prev;
          return prev.map((page) =>
            page.map((session) => {
              if (session.id === sessionId) {
                return { ...session, status };
              }
              return session;
            })
          );
        }, false);
      }
    } else {
      toast.error(result.message || 'Error al editar cliente', { id: toastId });
      setLocalChecked(previous);
    }

    setIsLoading(false);
  };

  if (pastilla) {
    return (
      <SwitchPrimitive.Root
        checked={localChecked}
        disabled={isLoading}
        onCheckedChange={handleUpdateClientStatus}
        aria-label={localChecked ? 'Pausar la sesión del cliente' : 'Activar la sesión del cliente'}
        data-estado-de-sesion
        className={cn(
          'inline-flex shrink-0 cursor-pointer items-center rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors duration-300',
          'border-slate-300 bg-slate-200 text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200',
          'data-[state=checked]:border-emerald-300 data-[state=checked]:bg-emerald-100 data-[state=checked]:text-emerald-800',
          'dark:data-[state=checked]:border-emerald-700 dark:data-[state=checked]:bg-emerald-950 dark:data-[state=checked]:text-emerald-300',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        {localChecked ? 'Activa' : 'Pausada'}
      </SwitchPrimitive.Root>
    );
  }

  return (
    <SwitchPrimitive.Root
      checked={localChecked}
      disabled={isLoading}
      onCheckedChange={handleUpdateClientStatus}
      aria-label={localChecked ? 'Desactivar cliente' : 'Activar cliente'}
      className={cn(
        compact ? 'relative inline-flex h-5 w-9 shrink-0' : 'relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-300',
        'border-gray-300 bg-gray-400',
        'data-[state=checked]:border-green-500 data-[state=checked]:bg-green-500',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/30 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50'
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none flex items-center justify-center rounded-full bg-background shadow-sm',
          compact ? 'h-3.5 w-3.5' : 'h-6 w-6',
          'transition-transform duration-300 will-change-transform',
          compact ? 'translate-x-0.5 data-[state=checked]:translate-x-[18px]' : 'translate-x-1 data-[state=checked]:translate-x-7'
        )}
      >
        <User
          className={cn(
            compact ? 'h-2 w-2 transition-colors duration-300' : 'h-3.5 w-3.5 transition-colors duration-300',
            'text-gray-500',
            'data-[state=checked]:text-green-500'
          )}
        />
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  );
};