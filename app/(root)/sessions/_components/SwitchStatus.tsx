'use client';

import { useState } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { updateSessionStatus } from '@/actions/session-action';
import { toast } from 'sonner';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  sessionId: number;
  checked: boolean;
  mutateSessions?: (updater: (prevData: any) => any, shouldRevalidate?: boolean) => void;
}

export const SwitchStatus = ({ sessionId, checked, mutateSessions }: Props) => {
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

      if (mutateSessions) {
        mutateSessions((prev: any) => {
          if (!prev) return prev;
          return prev.map((page: any) =>
            page.map((session: any) => {
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

  return (
    <SwitchPrimitive.Root
      checked={localChecked}
      disabled={isLoading}
      onCheckedChange={handleUpdateClientStatus}
      aria-label={localChecked ? 'Desactivar cliente' : 'Activar cliente'}
      className={cn(
        'relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-300',
        'border-gray-300 bg-gray-400',
        'data-[state=checked]:border-green-500 data-[state=checked]:bg-green-500',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/30 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50'
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none flex h-6 w-6 items-center justify-center rounded-full bg-background shadow-sm',
          'transition-transform duration-300 will-change-transform',
          'translate-x-1 data-[state=checked]:translate-x-7'
        )}
      >
        <User
          className={cn(
            'h-3.5 w-3.5 transition-colors duration-300',
            'text-gray-500',
            'data-[state=checked]:text-green-500'
          )}
        />
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  );
};