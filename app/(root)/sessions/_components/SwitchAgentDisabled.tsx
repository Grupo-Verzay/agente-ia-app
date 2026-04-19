'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { BotIcon } from 'lucide-react';
import { toggleAgentDisabled } from '@/actions/session-action';
import { cn } from '@/lib/utils';

type Props = {
    agentDisabled: boolean;
    userId: string;
    sessionId: number;
    mutateSessions: () => void;
};

export const SwitchAgentDisabled = ({
    agentDisabled,
    userId,
    sessionId,
    mutateSessions,
}: Props) => {
    const [checked, setChecked] = useState(!agentDisabled);
    const [isPending, startTransition] = useTransition();

    const onChange = (nextChecked: boolean) => {
        const prev = checked;
        setChecked(nextChecked);

        startTransition(async () => {
            const res = await toggleAgentDisabled(userId, sessionId, !nextChecked);

            if (!res?.success) {
                setChecked(prev);
                toast.error(res?.message || 'No se pudo actualizar el agente.');
                return;
            }

            mutateSessions();
            toast.success(
                nextChecked
                    ? 'Agente habilitado para esta sesión.'
                    : 'Agente deshabilitado para esta sesión.'
            );
        });
    };

    return (
        <SwitchPrimitive.Root
            checked={checked}
            onCheckedChange={onChange}
            disabled={isPending}
            aria-label={checked ? 'Deshabilitar agente' : 'Habilitar agente'}
            className={cn(
                'relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-300',
                'border-input bg-input/60',
                'data-[state=checked]:border-primary data-[state=checked]:bg-primary',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50'
            )}
        >
            <SwitchPrimitive.Thumb
                className={cn(
                    'pointer-events-none flex h-6 w-6 items-center justify-center rounded-full bg-background shadow-sm ring-0',
                    'transition-transform duration-300 will-change-transform',
                    'translate-x-1 data-[state=checked]:translate-x-7'
                )}
            >
                <BotIcon
                    className={cn(
                        'h-3.5 w-3.5 transition-colors duration-300',
                        'text-muted-foreground',
                        'data-[state=checked]:text-primary'
                    )}
                />
            </SwitchPrimitive.Thumb>
        </SwitchPrimitive.Root>
    );
};