'use client'

import { User, Workflow } from '@prisma/client';

import { Layers2Icon } from 'lucide-react';
import { CardCreateRr } from './';
import { GenericEditDialog } from '@/components/shared/GenericEditDialog';

interface AutoReplies {
    user: User;
    Workflows: Workflow[];
    triggerText: string;
};

export const CreateAutoReplies = ({ user, Workflows, triggerText = 'Crear' }: AutoReplies) => {

    return (
        <GenericEditDialog
            icon={Layers2Icon}
            title="CREAR RESPUESTA RÁPIDA"
            triggerText={triggerText}
        >
            {({ onClose }) => (
                <CardCreateRr
                    user={user}
                    Workflows={Workflows}
                    onSuccessClose={onClose}
                />
            )}
        </GenericEditDialog>
    )
}