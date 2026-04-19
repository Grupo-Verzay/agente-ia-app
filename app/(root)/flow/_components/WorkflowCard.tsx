"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Workflow } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PencilLine, FileTextIcon } from "lucide-react";
import { toast } from "sonner";
import { updateWorkflow } from "@/actions/workflow-actions";
import { WorkflowAction } from ".";
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
}: {
    workflow: Workflow;
    userId: string;
}) => {
    const router = useRouter();
    const editorPath = getWorkflowEditorPath(workflow.id, workflow.isPro);
    const [editing, setEditing] = useState(false);
    const [loading, setLoading] = useState(false);

    // --- Parseamos description para obtener keywords[] y matchType ---
    let initialKeywords: string[] = [];
    let initialMatchType: MatchType = "Exacta";

    if (workflow.description) {
        try {
            const parsed = JSON.parse(workflow.description);
            if (parsed && typeof parsed === "object") {
                if (Array.isArray((parsed as any).keywords)) {
                    initialKeywords = (parsed as any).keywords;
                } else if (
                    typeof (parsed as any).keyword === "string" &&
                    (parsed as any).keyword.trim()
                ) {
                    initialKeywords = [(parsed as any).keyword];
                }

                const mt = String((parsed as any).matchType ?? "").toLowerCase();
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
                if (Array.isArray((parsed as any).keywords)) {
                    const arr = (parsed as any).keywords as string[];
                    return arr.length ? arr.join(", ") : "Sin palabras clave";
                }
                if (typeof (parsed as any).keyword === "string") {
                    return (parsed as any).keyword || "Sin palabras clave";
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
        <Card className="border-border">
            <CardContent className="p-4 flex flex-1 gap-2 items-center justify-between">
                <div className="flex flex-1 gap-4 justify-center items-center">
                    <div
                        className="w-10 h-10 rounded-sm flex items-center justify-center bg-blue-500 cursor-pointer"
                        onClick={() => router.push(editorPath)}
                    >
                        <FileTextIcon />
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
                                    className="flex items-center gap-2 cursor-pointer group"
                                    onClick={() => setEditing(true)}
                                >
                                    <h3 className="text-base font-semibold text-muted-foreground group-hover:underline">
                                        {workflow.name.toUpperCase()}
                                    </h3>
                                    <PencilLine className="w-4 h-4 text-muted-foreground opacity-60 group-hover:opacity-100 transition" />
                                </div>
                                <div
                                    className="flex items-center gap-2 cursor-pointer group"
                                    onClick={() => setEditing(true)}
                                >
                                    <p className="text-sm text-muted-foreground group-hover:underline">
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
                    />
                </div>
            </CardContent>
        </Card>
    );
};
