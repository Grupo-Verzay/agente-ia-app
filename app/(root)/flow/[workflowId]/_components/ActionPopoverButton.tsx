'use client';

import { Action } from '../types';
import { Button } from "@/components/ui/button";
import { PremiumModule } from "@/components/shared/PremiumModule";
import { Plan } from '@prisma/client';
import { useRouter } from 'next/navigation';

interface actionpopover {
    action: Action;
    onClick: () => void;
    disabled: boolean;
    plan: Plan;
}

export const ActionPopoverButton = ({
    action,
    onClick,
    disabled,
    plan
}: actionpopover) => {
    const router = useRouter();
    const isSeguimiento = action.type === 'seguimiento' || action.type.startsWith('seguimiento-');
    // const isPremium = plan === 'admin';

    const handleSeguimiento = () => {
        // if (isSeguimiento) return router.push('/credits');
        onClick();
    };

    return (
        <>
            <Button
                variant="outline"
                onClick={handleSeguimiento}
                className={`flex items-center justify-between gap-2 text-sm w-full ${isSeguimiento ? 'bg-blue-100 hover:bg-blue-200' : ''}`}
                disabled={disabled}
            >
                <span className="flex flex-row gap-2">
                    {action.icon}
                    {action.label}
                </span>
                {isSeguimiento && <PremiumModule />}
            </Button>
        </>
    );
}

