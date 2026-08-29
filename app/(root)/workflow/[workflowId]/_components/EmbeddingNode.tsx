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

    /**
     * La tarjeta ocupaba media pantalla: tres campos altos, cada uno con su
     * parrafo de ayuda debajo, en un nodo que se mira dentro de un lienzo lleno
     * de otros nodos.
     *
     * Se aprieta sin quitar nada:
     *
     * - Los campos arrancan bajos y CRECEN al escribir en ellos (field-sizing),
     *   asi que ocupan lo que ocupa su contenido y no un alto fijo por si acaso.
     * - La ayuda pasa a una sola linea corta por campo. Decia lo mismo tres
     *   veces con mas palabras.
     * - Los intentos van en la misma fila que su etiqueta, que es un numero de
     *   dos digitos ocupando un renglon entero.
     *
     * Y las etiquetas dejan de arrastrar el nombre interno del campo
     * -"(message)", "(intentionPrompt)"-: eso es como se llama en la base, no
     * como se llama para quien arma el flujo.
     */
    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Lo que se le pregunta al cliente</Label>
                <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onBlur={onBlurSave}
                    rows={2}
                    placeholder="Ej: Perfecto. Dime tu nombre y qué servicio necesitas."
                    className="min-h-0 resize-y text-sm [field-sizing:content]"
                />
            </div>

            <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Cómo decide la IA si contestó bien</Label>
                <Textarea
                    value={intentionPrompt}
                    onChange={(e) => setIntentionPrompt(e.target.value)}
                    onBlur={onBlurSave}
                    rows={2}
                    placeholder={'Ej: Decide si ya dio su nombre y el servicio. Responde {"ok":true} o {"ok":false}.'}
                    className="min-h-0 resize-y text-sm [field-sizing:content]"
                />
                <p className="text-[11px] text-muted-foreground">
                    El cliente no ve este texto.
                </p>
            </div>

            <div className="flex items-center justify-between gap-3">
                <Label className="text-xs">
                    Intentos antes de rendirse
                    <span className="mt-0.5 block font-normal text-[11px] text-muted-foreground">
                        Después sale por la rama <b>No</b>.
                    </span>
                </Label>
                <Input
                    type="number"
                    min={1}
                    max={10}
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(Number(e.target.value))}
                    onBlur={onBlurSave}
                    className="h-8 w-16 shrink-0 text-center text-sm"
                />
            </div>
        </div>
    );
}
