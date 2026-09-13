'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { ClientInterface } from '@/lib/types';
import { setUserConnectionType } from '@/actions/instances-actions';

interface Props {
    open: boolean;
    setOpen: (v: boolean) => void;
    user: ClientInterface;
}

export function CanalDialog({ open, setOpen, user }: Props) {
    const waInstance = (user.instancias ?? []).find(
        (i) => i.instanceType !== 'Instagram' && i.instanceType !== 'Facebook',
    );

    const [applying, setApplying] = useState(false);

    const handleApply = async () => {
        setApplying(true);
        const res = await setUserConnectionType(user.id, user.company ?? undefined);
        setApplying(false);
        if (res.success) {
            toast.success(res.message);
            setOpen(false);
        } else {
            toast.error(res.message);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Canal WhatsApp</DialogTitle>
                    <DialogDescription>
                        {user.company ?? user.name} — cambia el tipo de conexión WhatsApp.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 py-2">
                    <div className="flex flex-col gap-2">
                        {/* El selector Evolution/Baileys se fue con Baileys: ya
                            no hay entre que elegir, solo confirmar. */}
                        {waInstance && (
                            <p className="text-xs text-muted-foreground">
                                Instancia actual: {waInstance.instanceName} ({waInstance.instanceType})
                            </p>
                        )}
                    </div>

                    <div className="flex justify-between gap-2">
                        <Button variant="outline" onClick={() => setOpen(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleApply} disabled={applying}>
                            {applying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Aplicar
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
