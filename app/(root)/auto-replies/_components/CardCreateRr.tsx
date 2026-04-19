'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { User, Workflow } from "@prisma/client";
import { createRR } from "@/actions/rr-actions";
import { toast } from "sonner";
import { ReplyTypeSelector, ReplyType } from "./ReplyTypeSelector";
import { Separator } from "@/components/ui/separator";

interface AutoReplies {
    user: User;
    Workflows: Workflow[];
    onSuccessClose?: () => void;
};

export const CardCreateRr = ({ user, Workflows, onSuccessClose }: AutoReplies) => {
    const router = useRouter();
    const [replyType, setReplyType] = useState<ReplyType>('text');
    const [phrase, setPhrase] = useState("");
    const [name, setName] = useState("");
    const [workflowId, setWorkflowId] = useState("");
    const [loading, setLoading] = useState(false);

    const isTextMode = replyType === 'text';

    const handleTypeChange = (type: ReplyType) => {
        setReplyType(type);
        setPhrase("");
        setWorkflowId("");
        setName("");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (isTextMode && !phrase.trim()) {
            return toast.warning("El mensaje es obligatorio para respuestas de texto.");
        }
        if (!isTextMode && !workflowId) {
            return toast.warning("Debes seleccionar un flujo.");
        }

        setLoading(true);
        const toastId = "respuesta-rapida";

        try {
            const res = await createRR({
                workflowId: !isTextMode ? workflowId : undefined,
                name: name.trim() || undefined,
                mensaje: isTextMode ? phrase : undefined,
                userId: user.id,
            });

            if (!res.success) {
                toast.error(res.message, { id: toastId });
                return;
            }
            toast.success(res.message, { id: toastId });
            router.refresh();
            onSuccessClose?.();
        } catch (error) {
            toast.error(`Error del servidor: ${error}`, { id: toastId });
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <div className="grid w-full items-center gap-5">

                {/* Selector de tipo */}
                <div className="flex flex-col space-y-2">
                    <Label className="text-sm font-medium">Tipo de respuesta</Label>
                    <ReplyTypeSelector
                        value={replyType}
                        onChange={handleTypeChange}
                        disabled={loading}
                    />
                </div>

                <Separator />

                {/* Nombre / atajo (siempre visible) */}
                <div className="flex flex-col space-y-1.5">
                    <Label htmlFor="name" className="flex gap-1 items-center">
                        {isTextMode ? "Atajo" : "Nombre"}{" "}
                        <span className="text-xs text-muted-foreground">
                            {isTextMode ? "(Opcional — ej: /bienvenida)" : "(Opcional — ej: Bienvenida al cliente)"}
                        </span>
                    </Label>
                    {isTextMode ? (
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">
                                /
                            </span>
                            <Input
                                id="name"
                                placeholder="bienvenida"
                                value={name}
                                onChange={(e) => setName(e.target.value.replace(/\s/g, "").toLowerCase())}
                                disabled={loading}
                                className="pl-6"
                            />
                        </div>
                    ) : (
                        <Input
                            id="name"
                            placeholder="Bienvenida al cliente"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={loading}
                        />
                    )}
                </div>

                {/* Campo de mensaje — solo modo texto */}
                {isTextMode && (
                    <div className="flex flex-col space-y-1.5">
                        <Label htmlFor="phrase" className="flex gap-1 items-center">
                            Mensaje{" "}
                            <span className="text-xs text-primary">(Obligatorio)</span>
                        </Label>
                        <Textarea
                            id="phrase"
                            placeholder="Ej: Fue un gusto atenderte."
                            value={phrase}
                            onChange={(e) => setPhrase(e.target.value)}
                            disabled={loading}
                            rows={4}
                        />
                    </div>
                )}

                {/* Selector de flujo — solo modo flujo */}
                {!isTextMode && (
                    <div className="flex flex-col space-y-1.5">
                        <Label htmlFor="workflow" className="flex gap-1 items-center">
                            Flujo a ejecutar{" "}
                            <span className="text-xs text-primary">(Obligatorio)</span>
                        </Label>
                        <Select
                            value={workflowId}
                            onValueChange={setWorkflowId}
                            disabled={loading}
                        >
                            <SelectTrigger id="workflow">
                                <SelectValue placeholder="Selecciona un flujo..." />
                            </SelectTrigger>
                            <SelectContent>
                                {Workflows.map((wf) => (
                                    <SelectItem key={wf.id} value={wf.id}>
                                        {wf.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {Workflows.length === 0 && (
                            <p className="text-xs text-destructive">
                                No tienes flujos disponibles. Crea uno primero.
                            </p>
                        )}
                    </div>
                )}
            </div>

            <div className="flex mt-5 gap-2">
                <Button
                    type="submit"
                    className="w-full"
                    disabled={loading || (!isTextMode && Workflows.length === 0)}
                >
                    {loading ? "Guardando..." : "Crear respuesta rápida"}
                </Button>
            </div>
        </form>
    );
};
