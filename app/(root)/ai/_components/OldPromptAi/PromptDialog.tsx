"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PromptAiFormValues, PromptAiSchema, TYPE_AI_LABELS } from "@/schema/ai";
import { TypePromptAi } from "@prisma/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { createPromptAi, updatePromptAi } from "@/actions/ai-actions";
import { useRouter } from "next/navigation";

interface PromptDialogProps {
    open: boolean;
    setOpen: (open: boolean) => void;
    defaultValues?: PromptAiFormValues | null;
    userId: string;
}

export const PromptDialog = ({ open, setOpen, defaultValues, userId }: PromptDialogProps) => {
    const router = useRouter();

    const form = useForm<PromptAiFormValues>({
        resolver: zodResolver(PromptAiSchema),
        defaultValues: defaultValues || {
            title: '',
            message: '',
            userId,
            typePrompt: 'TRAINING',
        },
    });

    const { reset, handleSubmit, control, register } = form;

    useEffect(() => {
        if (open) {
            reset(
                defaultValues || {
                    title: '',
                    message: '',
                    userId,
                    typePrompt: 'TRAINING',
                }
            );
        }
    }, [open, defaultValues, userId, reset]);

    const isEditing = !!defaultValues?.id;

    const mutation = useMutation({
        mutationFn: async (data: PromptAiFormValues) => {
            if (isEditing) return await updatePromptAi({ ...data, id: defaultValues!.id });
            return await createPromptAi(data);
        },
        onSuccess: () => {
            toast.success(isEditing ? 'Mensaje actualizado con éxito.' : 'Mensaje creado con éxito.');
            setOpen(false);
            router.refresh();
        },
        onError: () => {
            toast.error("Ocurrió un error. Intenta nuevamente.");
        },
    });

    const onSubmit = (data: PromptAiFormValues) => mutation.mutate(data);


    const onError = (errors: typeof form.formState.errors) => {
        const messages = Object.values(errors).map(err => err?.message).filter(Boolean)
        toast.error("Revisa los campos obligatorios", {
            description: (
                <ul className="text-xs mt-2 space-y-1 list-disc list-inside">
                    {messages.map((msg, i) => <li key={i}>{msg}</li>)}
                </ul>
            )
        })
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-4xl h-[600px] flex flex-col border-border">
                <DialogHeader>
                    <DialogTitle>{isEditing ? 'Editar mensaje' : 'Nuevo mensaje'}</DialogTitle>
                    <DialogDescription>Completa los campos para personalizar tu IA</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit, onError)} className="flex flex-col gap-4 flex-1">
                    <input type="hidden" {...register('userId')} />

                    <div>
                        <label className="block text-sm font-medium mb-1">Título</label>
                        <Input placeholder="Ejemplo: Bienvenida" maxLength={100} {...register("title")} />
                    </div>

                    <div className="flex flex-1 flex-col gap-2">
                        <label className="block text-sm font-medium mb-1">Descripción</label>
                        <Textarea placeholder="Ejemplo: Saluda cordialmente al usuario..." className="flex-1 resize-none overflow-y-auto"
                            // className="flex-1 resize-none overflow-y-auto"
                            {...register("message")} />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Categoría</label>
                        <Controller
                            control={control}
                            name="typePrompt"
                            render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccionar categoría" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.values(TypePromptAi)
                                            .filter((cat) => cat === "TRAINING" || cat === "FAQs")
                                            .map((cat) => (
                                                <SelectItem key={cat} value={cat}>
                                                    {TYPE_AI_LABELS[cat]}
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                            )}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="submit" disabled={mutation.isPending}>
                            {mutation.isPending ? 'Guardando...' : isEditing ? 'Actualizar' : 'Guardar'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};