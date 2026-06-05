"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QuickReply, Workflow } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { AutoRepliesActions } from "./";
import { Hash, MessageCircleMoreIcon, PencilLine } from "lucide-react";
import { Input } from "@/components/ui/input";
import { updateRR } from "@/actions/rr-actions";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
    getQuickReplyCategoryLabel,
    normalizeQuickReplyCategory,
    QUICK_REPLY_CATEGORIES,
} from "@/lib/quick-reply-categories";

interface autoReplies {
    autoReplie: QuickReply;
    workflows: Workflow[];
}

export const AutoRepliesCard = ({ autoReplie, workflows }: autoReplies) => {
    const router = useRouter();
    const [editing, setEditing] = useState(false);
    const [mensaje, setMensaje] = useState(autoReplie.mensaje ?? "");
    const [editingName, setEditingName] = useState(false);
    const [name, setName] = useState(autoReplie.name ?? "");
    const [loading, setLoading] = useState(false);
    const category = normalizeQuickReplyCategory(autoReplie.category);

    const relatedWorkflow = workflows.find((wf) => wf.id === autoReplie.workflowId);

    const handleSaveName = async () => {
        if (name === (autoReplie.name ?? "")) {
            setEditingName(false);
            return;
        }

        setLoading(true);
        const toastId = `rr-name-${autoReplie.id}`;

        try {
            const res = await updateRR(autoReplie.id, { name: name || undefined });

            if (!res.success) {
                toast.error(res.message, { id: toastId });
                setName(autoReplie.name ?? "");
            } else {
                toast.success("Atajo actualizado", { id: toastId });
                router.refresh();
            }
        } catch (error) {
            toast.error("Error al actualizar", { id: toastId });
            setName(autoReplie.name ?? "");
        } finally {
            setLoading(false);
            setEditingName(false);
        }
    };

    const handleSave = async () => {
        if (mensaje === autoReplie.mensaje) {
            setEditing(false);
            return;
        }

        setLoading(true);
        const toastId = `rr-${autoReplie.id}`;

        try {
            const res = await updateRR(autoReplie.id, { mensaje });

            if (!res.success) {
                toast.error(res.message, { id: toastId });
                setMensaje(autoReplie.mensaje ?? "");
            } else {
                toast.success("Mensaje actualizado", { id: toastId });
            }
        } catch (error) {
            toast.error("Error al actualizar", { id: toastId });
            setMensaje(autoReplie.mensaje ?? "");
        } finally {
            setLoading(false);
            setEditing(false);
        }
    };

    return (
        <Card className="rounded-xl border border-border/70 bg-card/90 shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="flex min-h-[82px] flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                        <MessageCircleMoreIcon className="h-5 w-5" />
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                        {autoReplie.name && (
                            editingName ? (
                                <Input
                                    autoFocus
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    onBlur={handleSaveName}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSaveName();
                                        if (e.key === "Escape") {
                                            setName(autoReplie.name ?? "");
                                            setEditingName(false);
                                        }
                                    }}
                                    disabled={loading}
                                    className="h-6 w-full max-w-[220px] px-1.5 text-xs sm:w-40"
                                />
                            ) : (
                                <Badge
                                    variant="secondary"
                                    className="flex w-fit max-w-full items-center gap-1 overflow-hidden px-1.5 py-0 text-xs hover:bg-muted"
                                    onClick={() => setEditingName(true)}
                                >
                                    <Hash size={10} className="shrink-0" />
                                    <span className="truncate">{name}</span>
                                    <PencilLine size={10} className="ml-0.5 shrink-0 text-blue-500" />
                                </Badge>
                            )
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                            <Select
                                value={category}
                                onValueChange={async (newCategory) => {
                                    if (newCategory === category) return;

                                    const toastId = `rr-category-${autoReplie.id}`;
                                    toast.loading("Actualizando categoria...", { id: toastId });

                                    try {
                                        const res = await updateRR(autoReplie.id, { category: newCategory });
                                        if (res.success) {
                                            toast.success("Categoria actualizada", { id: toastId });
                                        } else {
                                            toast.error(res.message, { id: toastId });
                                        }
                                    } catch {
                                        toast.error("Error al actualizar categoria", { id: toastId });
                                    } finally {
                                        router.refresh();
                                    }
                                }}
                            >
                                <SelectTrigger className="h-7 w-fit min-w-[118px] rounded-full border-muted px-2 py-0 text-xs">
                                    <SelectValue>{getQuickReplyCategoryLabel(category)}</SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {QUICK_REPLY_CATEGORIES.map((item) => (
                                        <SelectItem key={item.value} value={item.value} className="text-xs">
                                            {item.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {!autoReplie.workflowId && (editing ? (
                            <Textarea
                                autoFocus
                                value={mensaje}
                                onChange={(e) => setMensaje(e.target.value)}
                                onBlur={handleSave}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSave();
                                    }
                                    if (e.key === "Escape") {
                                        setMensaje(autoReplie.mensaje ?? "");
                                        setEditing(false);
                                    }
                                }}
                                disabled={loading}
                                className="min-h-[88px] w-full resize-none text-sm leading-5"
                            />
                        ) : (
                            <div
                                className="flex min-w-0 items-start gap-2 cursor-pointer group"
                                onClick={() => setEditing(true)}
                            >
                                <h3 className="app-item-title truncate text-muted-foreground group-hover:underline">
                                    {mensaje.length > 80 ? `${mensaje.slice(0, 80)}…` : mensaje}
                                </h3>
                                <PencilLine size={16} className="mt-0.5 shrink-0 text-blue-500" />
                            </div>
                        ))}

                        {!!autoReplie.workflowId && (
                            <div className="flex min-w-0 items-center gap-2">
                                <Select
                                    value={autoReplie.workflowId ?? ""}
                                    onValueChange={async (newWorkflowId) => {
                                        if (newWorkflowId === (autoReplie.workflowId ?? "")) return;

                                        const toastId = `workflow-update-${autoReplie.id}`;
                                        toast.loading("Actualizando flujo...", { id: toastId });

                                        try {
                                            const res = await updateRR(autoReplie.id, {
                                                workflowId: newWorkflowId || undefined,
                                            });
                                            if (res.success) {
                                                toast.success("Flujo actualizado correctamente", { id: toastId });
                                            } else {
                                                toast.error(res.message, { id: toastId });
                                            }
                                        } catch (err) {
                                            toast.error("Error al actualizar el flujo", { id: toastId });
                                        } finally {
                                            router.refresh();
                                        }
                                    }}
                                >
                                    <SelectTrigger className="h-7 w-full max-w-full rounded-md border-muted px-2 py-0 text-xs sm:max-w-[220px]">
                                        <SelectValue placeholder="Sin flujo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {workflows.map((wf) => (
                                            <SelectItem key={wf.id} value={wf.id} className="text-xs">
                                                {wf.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap">
                    <AutoRepliesActions
                        hasWorkflow={!!autoReplie.workflowId}
                        mensaje={autoReplie.mensaje ?? ""}
                        autoReplieId={autoReplie.id}
                        workflowId={relatedWorkflow?.id ?? "404"}
                        workflowIsPro={relatedWorkflow?.isPro ?? false}
                    />
                </div>
            </CardContent>
        </Card>
    );
};
