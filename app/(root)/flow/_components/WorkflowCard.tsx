"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { IntentTrigger, Workflow } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { PencilLine, FileTextIcon, Zap, Pencil, Trash2, HomeIcon, ListOrderedIcon } from "lucide-react";
import { toast } from "sonner";
import { updateWorkflow, setWelcomeWorkflow, unsetWelcomeWorkflow, toggleFunnelStep } from "@/actions/workflow-actions";
import { deleteIntentTrigger, toggleIntentTrigger } from "@/actions/intent-trigger-actions";
import { WorkflowAction } from ".";
import { IntentTriggerDialog } from "../../workflow/_components/IntentTriggerDialog";
import { Form, FormField, FormItem, FormControl } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { workflowShema } from "@/lib/zod";
import { z } from "zod";
import { getWorkflowEditorPath } from "@/types/workflow";

type MatchType = "Exacta" | "Contiene";

const MAX_KEYWORDS = 20;

export const WorkflowCard = ({
    workflow,
    userId,
    trigger,
}: {
    workflow: Workflow;
    userId: string;
    trigger?: IntentTrigger | null;
}) => {
    const router = useRouter();
    const editorPath = getWorkflowEditorPath(workflow.id, workflow.isPro);
    const [editing, setEditing] = useState(false);
    const [loading, setLoading] = useState(false);

    const [localTrigger, setLocalTrigger] = useState<IntentTrigger | null>(trigger ?? null);
    const [triggerDialogOpen, setTriggerDialogOpen] = useState(false);
    const [editingTrigger, setEditingTrigger] = useState<IntentTrigger | null>(null);

    const [welcomeActive, setWelcomeActive] = useState<boolean>(workflow.triggerOnNewSession ?? false);
    const [welcomeLoading, setWelcomeLoading] = useState(false);

    const [funnelActive, setFunnelActive] = useState<boolean>(workflow.isFunnelStep ?? false);

    const handleToggleFunnel = async () => {
        const next = !funnelActive;
        setFunnelActive(next);
        const res = await toggleFunnelStep(workflow.id, next);
        if (!res.success) {
            setFunnelActive(!next);
            toast.error("Error al actualizar el paso de embudo.");
        } else {
            toast.success(next ? "Marcado como paso de embudo." : "Quitado del embudo.");
            router.refresh();
        }
    };

    const handleToggleWelcome = async () => {
        const next = !welcomeActive;
        setWelcomeActive(next);
        setWelcomeLoading(true);
        const res = next
            ? await setWelcomeWorkflow(workflow.id)
            : await unsetWelcomeWorkflow(workflow.id);
        setWelcomeLoading(false);
        if (!res.success) {
            setWelcomeActive(!next);
            toast.error("Error al cambiar la configuración.");
        } else {
            toast.success(next ? "Flujo de bienvenida activado." : "Flujo de bienvenida desactivado.");
            router.refresh();
        }
    };

    const handleTriggerSaved = async () => {
        const { getIntentTriggersByUser } = await import("@/actions/intent-trigger-actions");
        const res = await getIntentTriggersByUser(userId);
        if (res.success && res.data) {
            const updated = (res.data as IntentTrigger[]).find(t => t.workflowId === workflow.id) ?? null;
            setLocalTrigger(updated);
        }
    };

    const handleToggleTrigger = async () => {
        if (!localTrigger) return;
        const next = !localTrigger.isActive;
        setLocalTrigger(prev => prev ? { ...prev, isActive: next } : null);
        const res = await toggleIntentTrigger(localTrigger.id, next);
        if (!res.success) {
            setLocalTrigger(prev => prev ? { ...prev, isActive: !next } : null);
            toast.error("Error al cambiar estado.");
        }
    };

    const handleDeleteTrigger = async () => {
        if (!localTrigger) return;
        if (!confirm("¿Eliminar el disparador IA de este flujo?")) return;
        setLocalTrigger(null);
        const res = await deleteIntentTrigger(localTrigger.id);
        if (!res.success) {
            setLocalTrigger(localTrigger);
            toast.error("Error al eliminar el disparador.");
        }
    };

    // --- Parseamos description para obtener keywords[] y matchType ---
    let initialKeywords: string[] = [];
    let initialMatchType: MatchType = "Exacta";

    if (workflow.description) {
        try {
            const parsed = JSON.parse(workflow.description);
            if (parsed && typeof parsed === "object") {
                if (Array.isArray(parsed.keywords)) {
                    initialKeywords = parsed.keywords;
                } else if (
                    typeof parsed.keyword === "string" &&
                    parsed.keyword.trim()
                ) {
                    initialKeywords = [parsed.keyword];
                }

                const mt = String(parsed.matchType ?? "").toLowerCase();
                if (mt === "exacta") initialMatchType = "Exacta";
                if (mt === "contiene") initialMatchType = "Contiene";
            } else {
                initialKeywords = [workflow.description];
            }
        } catch {
            initialKeywords = [workflow.description];
        }
    }

    const [matchType, setMatchType] = useState<MatchType>(initialMatchType);
    const [keywords, setKeywords] = useState<string[]>(initialKeywords);
    const [keywordInput, setKeywordInput] = useState("");

    const form = useForm<z.infer<typeof workflowShema>>({
        resolver: zodResolver(workflowShema),
        defaultValues: {
            name: workflow.name.toUpperCase() ?? "",
            description: initialKeywords.join(", ") ?? "",
        },
    });

    // Para modo lectura: mostramos las palabras clave "bonitas"
    const getDescriptionLabel = () => {
        if (!workflow.description) return "Sin palabras clave";

        try {
            const parsed = JSON.parse(workflow.description);
            if (parsed && typeof parsed === "object") {
                if (Array.isArray(parsed.keywords)) {
                    const arr = parsed.keywords as string[];
                    return arr.length ? arr.join(", ") : "Sin palabras clave";
                }
                if (typeof parsed.keyword === "string") {
                    return parsed.keyword || "Sin palabras clave";
                }
            }
        } catch {
            return workflow.description;
        }

        return "Sin palabras clave";
    };

    const addKeyword = () => {
        const raw = keywordInput.trim();
        if (!raw) return;

        if (keywords.length >= MAX_KEYWORDS) {
            toast.error("Solo puedes agregar hasta 20 palabras clave por flujo");
            return;
        }

        const exists = keywords.some(
            (k) => k.toLowerCase() === raw.toLowerCase()
        );
        if (exists) {
            toast.error("Esta palabra clave ya fue agregada");
            return;
        }

        const next = [...keywords, raw];
        setKeywords(next);
        setKeywordInput("");
        form.setValue("description", next.join(", "));
    };

    const removeKeyword = (value: string) => {
        setKeywords((prev) => {
            const next = prev.filter((k) => k !== value);

            // Sincronizamos el form con el array actualizado
            form.setValue("description", next.join(", "));

            // 👇 Disparamos el submit usando los valores actuales del form
            handleSubmit();

            return next;
        });
    };

    const handleKeywordKeyDown = (
        e: React.KeyboardEvent<HTMLInputElement>
    ) => {
        if (e.key === "Enter") {
            e.preventDefault();
            addKeyword();
        }
        if (e.key === "Escape") {
            e.preventDefault();
            form.reset();
            setEditing(false);
        }
    };

    const handleSubmit = form.handleSubmit(async (values) => {
        // Sacamos las keywords a partir de description (que siempre está sync con los chips)
        const fromForm = (values.description || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

        // Normalizamos y limpiamos duplicados
        const cleanedKeywords = Array.from(
            new Set(fromForm.map((k) => k.toLowerCase()))
        );

        const descriptionJson =
            cleanedKeywords.length > 0
                ? JSON.stringify({
                    matchType: matchType.toLocaleLowerCase(), // "exacta" | "contiene"
                    keywords: cleanedKeywords,
                })
                : "";

        const nameChanged = values.name !== workflow.name.toUpperCase();
        const descChanged = descriptionJson !== (workflow.description ?? "");

        if (!nameChanged && !descChanged) {
            setEditing(false);
            return;
        }

        setLoading(true);
        const toastId = `workflow-${workflow.id}`;
        try {
            const res = await updateWorkflow(workflow.id, {
                name: values.name.toUpperCase(),
                description: descriptionJson,
            });

            if (!res.success) {
                toast.error(res.message, { id: toastId });
                form.reset(); // restaurar valores anteriores
            } else {
                toast.success("Flujo actualizado correctamente", { id: toastId });
            }
        } catch {
            toast.error("Error al actualizar el flujo", { id: toastId });
            form.reset();
        } finally {
            setLoading(false);
            setEditing(false);
            router.refresh();
        }
    });

    const handleKeyDown = (
        e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
        if (e.key === "Enter") handleSubmit();
        if (e.key === "Escape") {
            form.reset();
            setEditing(false);
        }
    };

    return (
        <Card className="rounded-xl border border-border/70 bg-card/90 shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="flex flex-1 flex-col gap-2 p-3">
                <div className="flex flex-1 gap-2 items-center justify-between">
                <div className="flex flex-1 gap-4 justify-center items-center">
                    <div
                        className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700"
                        onClick={() => router.push(editorPath)}
                    >
                        <FileTextIcon className="h-5 w-5" />
                    </div>

                    <div className="flex flex-col flex-1 gap-2">
                        {editing ? (
                            <Form {...form}>
                                <form
                                    onSubmit={handleSubmit}
                                    onBlur={handleSubmit}
                                    className="flex gap-2 flex-col"
                                >
                                    <FormField
                                        control={form.control}
                                        name="name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormControl>
                                                    <Input
                                                        {...field}
                                                        placeholder="Nombre del flujo"
                                                        className="text-base uppercase font-semibold"
                                                        disabled={loading}
                                                        onKeyDown={handleKeyDown}
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />

                                    {/* Select "Exacta / Contiene" */}
                                    <div className="flex gap-2 items-center">
                                        <select
                                            value={matchType}
                                            onChange={(e) =>
                                                setMatchType(e.target.value as MatchType)
                                            }
                                            onKeyDown={handleKeyDown}
                                            disabled={loading}
                                            className="flex h-9 rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        >
                                            <option value="Exacta">Exacta</option>
                                            <option value="Contiene">Contiene</option>
                                        </select>
                                        <span className="text-[11px] text-muted-foreground">
                                            Tipo de coincidencia
                                        </span>
                                    </div>

                                    {/* Palabras clave: input + chips */}
                                    <FormField
                                        control={form.control}
                                        name="description"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormControl>
                                                    <div className="space-y-2">
                                                        <Input
                                                            value={keywordInput}
                                                            onChange={(e) =>
                                                                setKeywordInput(e.target.value)
                                                            }
                                                            onKeyDown={handleKeywordKeyDown}
                                                            placeholder="Palabra o frase clave"
                                                            className="text-sm text-muted-foreground"
                                                            disabled={loading}
                                                        />
                                                        {/* mantenemos valor oculto para el form */}
                                                        <input
                                                            type="hidden"
                                                            {...field}
                                                            value={keywords.join(", ")}
                                                            readOnly
                                                        />
                                                        <div className="flex flex-wrap gap-2">
                                                            {keywords.map((kw) => (
                                                                <span
                                                                    key={kw}
                                                                    className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
                                                                >
                                                                    {kw}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeKeyword(kw)}
                                                                        className="ml-1 text-[10px] opacity-70 hover:opacity-100"
                                                                        aria-label={`Eliminar ${kw}`}
                                                                    >
                                                                        ✕
                                                                    </button>
                                                                </span>
                                                            ))}
                                                            {keywords.length === 0 && (
                                                                <p className="text-[11px] text-muted-foreground">
                                                                    Agrega una o varias palabras/frases que
                                                                    disparen este flujo.
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </form>
                            </Form>
                        ) : (
                            <>
                                <div
                                    className={`flex flex-wrap items-center gap-2 ${welcomeActive ? "" : "cursor-pointer group"}`}
                                    onClick={() => { if (!welcomeActive) setEditing(true); }}
                                >
                                    <h3 className={`app-item-title text-foreground ${welcomeActive ? "" : "group-hover:underline"}`}>
                                    {welcomeActive && (
                                        <HomeIcon className="w-3.5 h-3.5 text-green-500 inline mr-1.5 relative -top-px" />
                                    )}
                                    {funnelActive && !welcomeActive && (
                                        <ListOrderedIcon className="w-3.5 h-3.5 text-blue-500 inline mr-1.5 relative -top-px" />
                                    )}
                                        {workflow.name.toUpperCase()}
                                    </h3>
                                    <Badge
                                        variant="outline"
                                        className={`h-5 px-1.5 text-[10px] ${workflow.isPro
                                            ? "border-violet-200 bg-violet-50 text-violet-700"
                                            : "border-blue-200 bg-blue-50 text-blue-700"
                                            }`}
                                    >
                                        {workflow.isPro ? "Avanzado" : "Basico"}
                                    </Badge>
                                    {!welcomeActive && (
                                        <PencilLine className="w-4 h-4 text-muted-foreground opacity-60 group-hover:opacity-100 transition" />
                                    )}
                                </div>
                                <div
                                    className={`flex items-center gap-2 ${welcomeActive ? "" : "cursor-pointer group"}`}
                                    onClick={() => { if (!welcomeActive) setEditing(true); }}
                                >
                                    <p className={`max-w-2xl truncate text-xs text-muted-foreground ${welcomeActive ? "" : "group-hover:underline"}`}>
                                        {getDescriptionLabel()}
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex items-center">
                    <WorkflowAction
                        workflowId={workflow.id}
                        userId={userId}
                        isWelcome={welcomeActive}
                        onSetAsWelcome={handleToggleWelcome}
                        isFunnelStep={funnelActive}
                        onToggleFunnel={!welcomeActive ? handleToggleFunnel : undefined}
                    />
                </div>
                </div>

                {/* Sección disparador IA */}
                {localTrigger && (
                    <div className="pt-2 border-t border-border">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                                <Switch
                                    checked={localTrigger.isActive}
                                    onCheckedChange={handleToggleTrigger}
                                    className="shrink-0"
                                />
                                <Zap className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                                <span className="text-xs font-medium truncate">{localTrigger.name}</span>
                                <Badge
                                    variant="secondary"
                                    className="text-[10px] px-1.5 py-0 h-4 shrink-0 bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                                >
                                    Prompt IA
                                </Badge>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    onClick={() => { setEditingTrigger(localTrigger); setTriggerDialogOpen(true); }}
                                    className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                    title="Editar disparador"
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    onClick={handleDeleteTrigger}
                                    className="rounded p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                    title="Eliminar disparador"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>

            <IntentTriggerDialog
                userId={userId}
                workflows={[]}
                trigger={editingTrigger}
                open={triggerDialogOpen}
                onOpenChange={setTriggerDialogOpen}
                onSaved={handleTriggerSaved}
                fixedWorkflowId={workflow.id}
                fixedWorkflowName={workflow.name}
            />
        </Card>
    );
};
