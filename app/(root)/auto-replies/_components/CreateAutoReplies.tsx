'use client'

import { Workflow } from '@prisma/client';
import type { CurrentUser } from '@/lib/auth';

import { Layers2Icon } from 'lucide-react';
import { CardCreateRr } from './CardCreateRr';
import { GenericEditDialog } from '@/components/shared/GenericEditDialog';

interface AutoReplies {
    user: CurrentUser;
    Workflows: Workflow[];
    /** Controlado desde la pantalla: la abren el botón «Nuevo» y el de la lista vacía. */
    open: boolean;
    setOpen: (open: boolean) => void;
};

/**
 * La ventana de crear una respuesta rápida. Sin disparador propio: el botón es
 * el `BotonDeCrear` de la barra —«Nuevo», como en el resto de pantallas de
 * lista—, y la pantalla vacía abre esta misma ventana. Con un disparador aquí
 * dentro habría dos botones de crear con dos formas distintas.
 */
export const CreateAutoReplies = ({ user, Workflows, open, setOpen }: AutoReplies) => {

    return (
        <GenericEditDialog
            icon={Layers2Icon}
            title="CREAR RESPUESTA RÁPIDA"
            open={open}
            setOpen={setOpen}
            hideTrigger
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
