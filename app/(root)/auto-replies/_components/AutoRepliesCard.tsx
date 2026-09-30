"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Workflow } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { AutoRepliesActions } from "./AutoRepliesActions";
import { GitBranch, MessageSquareText, PencilLine, Plus, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { updateRR, type RespuestaRapida } from "@/actions/rr-actions";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
    getQuickReplyCategoryLabel,
    normalizeQuickReplyCategory,
    QUICK_REPLY_CATEGORIES,
} from "@/lib/quick-reply-categories";
import { comoAtajo, elNombreQueSeVe, elTipoDeLaRespuesta } from "@/lib/respuestas-rapidas";
import { COLOR_DEL_TIPO } from "./colores-de-las-respuestas";

interface autoReplies {
    autoReplie: RespuestaRapida;
    workflows: Workflow[];
}

/**
 * Una respuesta rápida en la lista.
 *
 * Lo que cambió, y por qué:
 *
 * - **El atajo se puede poner aunque no lo tuviera.** La pastilla solo salía si
 *   ya había nombre, así que una respuesta creada sin atajo se quedaba sin él
 *   para siempre — y sin atajo no sale en la barra «/» de Chats.
 * - **Se escribe como se teclea en Chats**, «/atajo» en minúsculas
 *   (`comoAtajo`). La tarjeta lo PASABA A MAYÚSCULAS al editarlo mientras crear
 *   lo pasaba a minúsculas.
 * - **Quien no puede tocarla la ve sin mandos.** Un asesor ve las de la cuenta y
 *   no las edita: antes se le ofrecía editar y el servidor contestaba «No
 *   autorizado».
 * - **El icono dice de qué clase es**, con el color de su pastilla de filtro.
 */
export const AutoRepliesCard = ({ autoReplie, workflows }: autoReplies) => {
    const router = useRouter();
    const editable = autoReplie.editable !== false;
    const tipo = elTipoDeLaRespuesta(autoReplie);
    const esTexto = tipo === "texto";
    const [editing, setEditing] = useState(false);
    const [mensaje, setMensaje] = useState(autoReplie.mensaje ?? "");
    const [editingName, setEditingName] = useState(false);
    const [name, setName] = useState(autoReplie.name ?? "");
    const [loading, setLoading] = useState(false);
    const category = normalizeQuickReplyCategory(autoReplie.category);

    const relatedWorkflow = workflows.find((wf) => wf.id === autoReplie.workflowId);
    const nombreQueSeVe = elNombreQueSeVe(name, tipo);
    const Icono = esTexto ? MessageSquareText : GitBranch;

    const handleSaveName = async () => {
        const antes = autoReplie.name ?? "";
        if (name.trim() === antes.trim()) {
            setName(antes);
            setEditingName(false);
            return;
        }

        setLoading(true);
        const toastId = `rr-name-${autoReplie.id}`;

        try {
            const res = await updateRR(autoReplie.id, { name: name.trim() || null });

            if (!res.success) {
                toast.error(res.message, { id: toastId });
                setName(antes);
            } else {
                toast.success(esTexto ? "Atajo actualizado" : "Nombre actualizado", { id: toastId });
                router.refresh();
            }
        } catch (error) {
            console.error("[respuestas] no se pudo guardar el nombre", error);
            toast.error("Error al actualizar", { id: toastId });
            setName(antes);
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
        // Una respuesta de texto sin texto no sale en ningún sitio de Chats. Se
        // dice aquí, antes de preguntarle al servidor, que dice lo mismo.
        if (!mensaje.trim()) {
            toast.warning("El mensaje no puede quedar vacío.");
            setMensaje(autoReplie.mensaje ?? "");
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
                router.refresh();
            }
        } catch (error) {
            console.error("[respuestas] no se pudo guardar el mensaje", error);
            toast.error("Error al actualizar", { id: toastId });
            setMensaje(autoReplie.mensaje ?? "");
        } finally {
            setLoading(false);
            setEditing(false);
        }
    };

    return (
        <Card
            data-respuesta-rapida={autoReplie.id}
            data-tipo={tipo}
            className="rounded-xl border border-border/70 bg-card/90 shadow-sm transition-shadow hover:shadow-md"
        >
            <CardContent className="flex min-h-[82px] flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
                        style={{ backgroundColor: COLOR_DEL_TIPO[tipo] }}
                        title={esTexto ? "Texto simple" : "Ejecuta un flujo"}
                    >
                        <Icono className="h-5 w-5" />
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-2" data-zona="cabecera-de-la-respuesta">
                            {editingName ? (
                                <div className="relative w-full max-w-[240px] sm:w-48">
                                    {esTexto && (
                                        <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                            /
                                        </span>
                                    )}
                                    <Input
                                        autoFocus
                                        aria-label={esTexto ? "Atajo" : "Nombre"}
                                        placeholder={esTexto ? "bienvenida" : "Bienvenida al cliente"}
                                        value={name}
                                        onChange={(e) => setName(esTexto ? comoAtajo(e.target.value) : e.target.value)}
                                        onBlur={handleSaveName}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") handleSaveName();
                                            if (e.key === "Escape") {
                                                setName(autoReplie.name ?? "");
                                                setEditingName(false);
                                            }
                                        }}
                                        disabled={loading}
                                        className={esTexto ? "h-7 pl-4 text-xs" : "h-7 px-1.5 text-xs"}
                                    />
                                </div>
                            ) : nombreQueSeVe ? (
                                <Badge
                                    variant="secondary"
                                    data-zona="atajo"
                                    className={
                                        "flex w-fit max-w-full items-center gap-1 overflow-hidden px-1.5 py-0 text-xs " +
                                        (editable ? "cursor-pointer hover:bg-muted" : "")
                                    }
                                    onClick={editable ? () => setEditingName(true) : undefined}
                                    title={editable ? (esTexto ? "Editar el atajo" : "Editar el nombre") : undefined}
                                >
                                    <span className={esTexto ? "truncate font-mono" : "truncate"}>{nombreQueSeVe}</span>
                                    {editable && <PencilLine size={10} className="ml-0.5 shrink-0 text-blue-500" />}
                                </Badge>
                            ) : editable ? (
                                <button
                                    type="button"
                                    data-zona="atajo"
                                    onClick={() => setEditingName(true)}
                                    className="inline-flex h-5 items-center gap-1 rounded-md border border-dashed border-border px-1.5 text-xs text-muted-foreground transition-colors hover:border-blue-400 hover:text-blue-600"
                                >
                                    <Plus size={10} />
                                    {esTexto ? "Atajo" : "Nombre"}
                                </button>
                            ) : null}

                            <Select
                                value={category}
                                disabled={!editable}
                                onValueChange={async (newCategory) => {
                                    if (newCategory === category) return;

                                    const toastId = `rr-category-${autoReplie.id}`;
                                    toast.loading("Actualizando categoría...", { id: toastId });

                                    try {
                                        const res = await updateRR(autoReplie.id, { category: newCategory });
                                        if (res.success) {
                                            toast.success("Categoría actualizada", { id: toastId });
                                        } else {
                                            toast.error(res.message, { id: toastId });
                                        }
                                    } catch (error) {
                                        console.error("[respuestas] no se pudo cambiar la categoría", error);
                                        toast.error("Error al actualizar la categoría", { id: toastId });
                                    } finally {
                                        router.refresh();
                                    }
                                }}
                            >
                                <SelectTrigger
                                    data-zona="categoria"
                                    aria-label="Categoría"
                                    className="h-7 w-fit min-w-[108px] rounded-full border-muted px-2 py-0 text-xs"
                                >
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

                            {autoReplie.grupo && autoReplie.grupo !== "de-la-cuenta" && (
                                <span
                                    className="inline-flex h-5 items-center gap-1 rounded-full bg-muted px-2 text-[11px] text-muted-foreground"
                                    title="Solo la ven quien la creó, el dueño y los administradores de la cuenta"
                                >
                                    <UserRound size={10} />
                                    {autoReplie.grupo === "mias" ? "Mía" : "De un asesor"}
                                </span>
                            )}
                        </div>

                        {esTexto && (editing ? (
                            <Textarea
                                autoFocus
                                aria-label="Mensaje"
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
                                data-zona="mensaje"
                                className={"flex min-w-0 items-start gap-2 " + (editable ? "group cursor-pointer" : "")}
                                onClick={editable ? () => setEditing(true) : undefined}
                                title={mensaje}
                            >
                                <h3 className="app-item-title truncate text-muted-foreground group-hover:underline">
                                    {mensaje.length > 80 ? `${mensaje.slice(0, 80)}…` : mensaje}
                                </h3>
                                {editable && <PencilLine size={16} className="mt-0.5 shrink-0 text-blue-500" />}
                            </div>
                        ))}

                        {!esTexto && (
                            <div className="flex min-w-0 items-center gap-2" data-zona="flujo">
                                <Select
                                    value={autoReplie.workflowId ?? ""}
                                    disabled={!editable}
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
                                        } catch (error) {
                                            console.error("[respuestas] no se pudo cambiar el flujo", error);
                                            toast.error("Error al actualizar el flujo", { id: toastId });
                                        } finally {
                                            router.refresh();
                                        }
                                    }}
                                >
                                    <SelectTrigger
                                        aria-label="Flujo que ejecuta"
                                        className="h-7 w-full max-w-full rounded-md border-muted px-2 py-0 text-xs sm:max-w-[240px]"
                                    >
                                        {/* Un flujo que ya no existe no sale en la lista, y el
                                            desplegable se quedaba en blanco sin decir por qué. */}
                                        <SelectValue placeholder={relatedWorkflow ? "Sin flujo" : "El flujo ya no existe"} />
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
                        autoReplieId={autoReplie.id}
                        workflow={relatedWorkflow ? { id: relatedWorkflow.id, isPro: relatedWorkflow.isPro ?? false } : null}
                        editable={editable}
                    />
                </div>
            </CardContent>
        </Card>
    );
};
