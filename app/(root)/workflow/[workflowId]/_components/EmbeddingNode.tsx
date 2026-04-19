'use client';

import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

import type { WorkflowNodeDB } from '@/types/workflow-node';
import { updateIntentionNodeConfig } from '@/actions/workflow-node-action';

type Props = { node: WorkflowNodeDB };

export const EmbeddingNode = ({ node }: Props) => {
    const router = useRouter();

    const [message, setMessage] = useState(node.message ?? '');

    const [intentionPrompt, setIntentionPrompt] = useState(node.intentionPrompt ?? '');

    const [maxAttempts, setMaxAttempts] = useState<number>(node.intentionMaxAttempts ?? 3);

    useEffect(() => {
        setMessage(node.message ?? '');
        setIntentionPrompt(node.intentionPrompt ?? '');
        setMaxAttempts(node.intentionMaxAttempts ?? 3);
    }, [node.message, node.intentionPrompt, node.intentionMaxAttempts]);

    const savingRef = useRef(false);
    const lastSavedRef = useRef({
        message: (node.message ?? '').trim(),
        intentionPrompt: (node.intentionPrompt ?? '').trim(),
        maxAttempts: node.intentionMaxAttempts ?? 3,
    });

    const save: () => Promise<void> = async () => {
        const payload = {
            message: message.trim(),
            intentionPrompt: intentionPrompt.trim(),
            maxAttempts,
        };

        // evita guardar si no cambió
        if (
            lastSavedRef.current.message === payload.message &&
            lastSavedRef.current.intentionPrompt === payload.intentionPrompt &&
            lastSavedRef.current.maxAttempts === payload.maxAttempts
        ) {
            return;
        }

        if (savingRef.current) return;
        savingRef.current = true;

        const toastId = toast.loading('Guardando nodo de intención...');
        try {
            const res = await updateIntentionNodeConfig({
                nodeId: node.id,
                message: payload.message,
                intentionPrompt: payload.intentionPrompt,
                intentionMaxAttempts: payload.maxAttempts,
            });

            if (!res?.success) {
                if (res.message.startsWith('NO_TOAST')) {
                    toast.dismiss(toastId);
                    return;
                }
                toast.error(res?.message ?? 'No se pudo guardar', { id: toastId });
                return;
            }

            lastSavedRef.current = payload;
            toast.success('Guardado', { id: toastId });
            router.refresh();
        } catch (e: any) {
            toast.error(e?.message ?? 'Error guardando', { id: toastId });
        } finally {
            savingRef.current = false;
        }
    };

    const onBlurSave: () => void = () => {
        if (maxAttempts < 1 || maxAttempts > 10) return;
        void save();
    };

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label className="text-xs">Mensaje al usuario (message)</Label>
                <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onBlur={onBlurSave}
                    placeholder="Ej: Perfecto. Por favor dime tu nombre y qué servicio necesitas."
                    className="min-h-[90px]"
                />
                <p className="text-[11px] text-muted-foreground">
                    Este texto es lo que el bot le envía al usuario mientras el nodo está “esperando” respuesta.
                </p>
            </div>

            <div className="space-y-2">
                <Label className="text-xs">Prompt del modelo (intentionPrompt)</Label>
                <Textarea
                    value={intentionPrompt}
                    onChange={(e) => setIntentionPrompt(e.target.value)}
                    onBlur={onBlurSave}
                    placeholder='Ej: Debes decidir si el usuario ya entregó su nombre y el servicio. Responde {"ok":true} o {"ok":false}.'
                    className="min-h-[120px]"
                />
                <p className="text-[11px] text-muted-foreground">
                    Este prompt lo usa la IA para decidir <b>sí / no</b>. No se muestra al usuario.
                </p>
            </div>

            <div className="space-y-2">
                <Label className="text-xs">Cantidad máxima de intentos</Label>
                <Input
                    type="number"
                    min={1}
                    max={10}
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(Number(e.target.value))}
                    onBlur={onBlurSave}
                    className="h-9"
                />
                <p className="text-[11px] text-muted-foreground">
                    Si el usuario no cumple en estos intentos, se irá por la rama <b>No</b>.
                </p>
            </div>
        </div>
    );
}
