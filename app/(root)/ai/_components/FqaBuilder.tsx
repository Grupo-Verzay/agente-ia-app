// app/(root)/ai/_components/FqaBuilder.tsx
"use client";

import { ChangeEvent, useEffect, useMemo, useState, useCallback } from "react";
import { nanoid } from "nanoid";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { DataSubtype, FqaBuilderProps, PRESETS, QaItem } from "@/types/agentAi";
import { Workflow } from "@prisma/client";

import { useFaqAutosave, AutosaveStatus } from "./hooks/useFaqAutosave"; // 👈 import ampliado
import { FunctionSelector } from "./";
import ElementRenderer from "./action-steeps/ElementRenderer";
import { buildSectionedPrompt } from "./helpers";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/* ---------- type-guard para función de Pedidos ---------- */
function isPedidoFn(el: any): el is {
    id: string;
    kind: "function";
    fn: "captura_datos";
    subtype?: "Pedidos" | "Solicitudes" | "Reclamos" | "Reservas" | "Citas";
    prompt?: string;
    fields?: string[];
} {
    return el?.kind === "function" && el?.fn === "captura_datos" && el?.subtype === "Pedidos";
}

export function FqaBuilder({
    values,
    handleChange,
    promptId,
    version,
    onVersionChange,
    onConflict,
    initialItems = [],
    flows = [],
    notificationNumber,
    registerSaveHandler
}: FqaBuilderProps) {
    const [items, setItems] = useState<QaItem[]>(
        Array.isArray(initialItems) && initialItems.length > 0 ? initialItems : []
    );

    // 🔹 Estado de autosave
    const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");

    /* ------------------------- AUTOSAVE ------------------------- */
    const stableOnConflict = useCallback(
        (serverState: any) => {
            const serverItems = serverState?.sections?.faq?.items ?? [];
            setItems(serverItems);
            onConflict?.(serverState);
        },
        [onConflict]
    );

    const { forceSave } = useFaqAutosave({
        promptId,
        version,
        items,
        onVersionChange,
        onConflict: stableOnConflict,
        onStatusChange: setAutosaveStatus,
        mode: "manual",
    });

    useEffect(() => {
        if (!registerSaveHandler) return;
        registerSaveHandler(forceSave);
    }, [registerSaveHandler, forceSave]);


    // Reset visual de "Cambios guardados"
    useEffect(() => {
        if (autosaveStatus === "saved") {
            const t = setTimeout(() => setAutosaveStatus("idle"), 1500);
            return () => clearTimeout(t);
        }
    }, [autosaveStatus]);

    /* ------------------ PREVIEW (markdown) ------------------ */
    const prompt = useMemo(() => {
        return buildSectionedPrompt(items as any, {
            emptyMessage:
                "Aún no has agregado Preguntas. Usa “Agregar Pregunta” para comenzar.",
            sectionLabel: (n, step) => `### Pregunta ${n} — ${step.title || "Sin título"}`,
            elementsLabel: (n) => `#### Elementos de la pregunta: ${n}`,
            mainMessageLabel: "Objetivo/respuesta principal de la pregunta:",
            joinSeparator: "\n",
        });
    }, [items]);

    /* -------- Sincroniza string preview con el padre (values.faq) -------- */
    useEffect(() => {
        if (values.faq !== prompt) {
            handleChange("faq")({
                target: { value: prompt },
            } as ChangeEvent<HTMLTextAreaElement>);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prompt]);

    /* ----------------------- Helpers de Items (FAQs) ----------------------- */
    const addFaq = () =>
        setItems((prev) => [
            ...prev,
            {
                id: nanoid(),
                title: "",
                mainMessage: "",
                elements: [],
                openPicker: false,
            },
        ]);

    const addFromPreset = (title: string) => {
        const preset = PRESETS.find((p) => p.title === title);
        if (!preset) return;
        setItems((prev) => [
            ...prev,
            {
                id: nanoid(),
                title: preset.title,
                mainMessage: preset.answer,
                elements: [],
            },
        ]);
    };

    const removeItem = (id: string) =>
        setItems((prev) => prev.filter((i) => i.id !== id));

    const updateTitle = (id: string, v: string) =>
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, title: v } : it)));

    const updateMain = (id: string, v: string) =>
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, mainMessage: v } : it)));

    /* ------------------ Helpers de Elements dentro del Pregunta ------------------ */
    const removeElement = (faqId: string, elId: string) => {
        setItems((prev) =>
            prev.map((s) =>
                s.id === faqId
                    ? { ...s, elements: s.elements.filter((e) => e.id !== elId) }
                    : s
            )
        );
    };

    const updateText = (faqId: string, elId: string, text: string) => {
        setItems((prev) =>
            prev.map((s) =>
                s.id === faqId
                    ? {
                        ...s,
                        elements: s.elements.map((e) =>
                            e.id === elId && e.kind === "text" ? { ...e, text } : e
                        ),
                    }
                    : s
            )
        );
    };

    const setFlowOnElement = (faqId: string, elId: string, flow: Workflow) => {
        setItems((prev) =>
            prev.map((s) =>
                s.id === faqId
                    ? {
                        ...s,
                        elements: s.elements.map((e) =>
                            e.id === elId &&
                                e.kind === "function" &&
                                (e as any).fn === "ejecutar_flujo"
                                ? { ...(e as any), flowId: flow.id, flowName: flow.name }
                                : e
                        ),
                    }
                    : s
            )
        );
    };

    const addPedidoField = (faqId: string, elId: string, field: string) => {
        const name = field.trim();
        if (!name) return;

        setItems((prev) =>
            prev.map((s) => {
                if (s.id !== faqId) return s;
                return {
                    ...s,
                    elements: s.elements.map((e) => {
                        if (e.id !== elId || !isPedidoFn(e)) return e as any;
                        const next = new Set([...(e.fields ?? []), name]);
                        return { ...e, fields: Array.from(next) };
                    }),
                };
            })
        );
    };

    const removePedidoField = (faqId: string, elId: string, field: string) => {
        setItems((prev) =>
            prev.map((s) => {
                if (s.id !== faqId) return s;
                return {
                    ...s,
                    elements: s.elements.map((e) => {
                        if (e.id !== elId || !isPedidoFn(e)) return e as any;
                        return { ...e, fields: (e.fields ?? []).filter((f) => f !== field) };
                    }),
                };
            })
        );
    };

    const onSubtypeChange = (stepId: string, elementId: string, subtype: DataSubtype) => {
        setItems((prev) =>
            prev.map((step) => ({
                ...step,
                elements: step.elements.map((el) =>
                    el.id === elementId ? { ...el, subtype } : el
                ),
            }))
        );
    };

    return (
        <div className="gap-2 flex flex-col">
            <Card className="border-muted/60">
                <CardHeader className="pb-2 flex items-center justify-between gap-2 flex-row">
                    <div className="flex items-center gap-2">
                        <CardTitle className="text-base">Preguntas</CardTitle>

                        {/* 🔹 Indicador de autosave */}
                        {autosaveStatus !== "idle" && (
                            <span
                                className={
                                    "text-xs " +
                                    (autosaveStatus === "saving"
                                        ? "text-muted-foreground"
                                        : autosaveStatus === "saved"
                                            ? "text-emerald-500"
                                            : autosaveStatus === "error"
                                                ? "text-destructive"
                                                : "")
                                }
                            >
                                {autosaveStatus === "saving" && "Guardando..."}
                                {autosaveStatus === "saved" && "Cambios guardados"}
                                {autosaveStatus === "error" && "Error al guardar"}
                            </span>
                        )}
                    </div>

                    {items.length < 1 && (
                        <Button size="sm" onClick={addFaq}>
                            <Plus className="w-4 h-4" />
                            Agregar Pregunta
                        </Button>
                    )}
                </CardHeader>
                <CardContent className="space-y-4">
                    {items.length === 0 ? (
                        <div className="text-center text-sm text-muted-foreground py-8">
                            No has creado Preguntas. Crea tu primera Pregunta con “Agregar Pregunta”.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {items.map((step, idx) => (
                                <Card key={step.id} className="bg-muted/10 border-muted/60">
                                    <CardHeader className="py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="grid w-full max-w-sm items-center gap-3">
                                                <Label htmlFor={step.id}>{`Pregunta ${idx + 1}`}</Label>
                                                <Input
                                                    id={step.id}
                                                    value={step.title ?? ""}
                                                    onChange={(e) =>
                                                        updateTitle(step.id, e.target.value)
                                                    }
                                                    className="h-8"
                                                    placeholder="Título de la Pregunta"
                                                />
                                            </div>

                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        title="Eliminar Pregunta"
                                                        className="ml-auto"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>

                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>
                                                            Eliminar Pregunta
                                                        </AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            ¿Seguro que quieres eliminar esta Pregunta?
                                                            Esta acción no se puede deshacer.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>

                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>
                                                            Cancelar
                                                        </AlertDialogCancel>
                                                        <AlertDialogAction
                                                            className="bg-red-600 hover:bg-red-700"
                                                            onClick={() => removeItem(step.id)}
                                                        >
                                                            Eliminar
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </CardHeader>

                                    <CardContent className="space-y-3">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">{`Respuesta ${idx + 1
                                                }`}</label>
                                            <Textarea
                                                value={step.mainMessage ?? ""}
                                                onChange={(e) =>
                                                    updateMain(step.id, e.target.value)
                                                }
                                                placeholder="Describe la respuesta principal de esta pregunta…"
                                                className="min-h-[32px]"
                                            />
                                        </div>

                                        <Separator />

                                        <div className="rounded-lg border border-dashed border-muted/60 p-1">
                                            {!step.elements ||
                                                step.elements.length === 0 ? (
                                                <div className="text-center text-sm text-muted-foreground">
                                                    No hay elementos. Agrega funciones o textos con
                                                    los botones de arriba.
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {step.elements.map((el) => (
                                                        <ElementRenderer
                                                            key={el.id}
                                                            stepId={step.id}
                                                            el={el as any}
                                                            flows={flows}
                                                            removeElement={removeElement}
                                                            updateText={updateText}
                                                            setFlowOnElement={setFlowOnElement}
                                                            addPedidoField={addPedidoField}
                                                            removePedidoField={removePedidoField}
                                                            onSubtypeChange={onSubtypeChange}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between flex-wrap gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium">
                                                    Elementos de la pregunta
                                                </span>
                                                <Badge variant="secondary">{idx + 1}</Badge>
                                            </div>
                                            <div className="flex gap-2">
                                                <FunctionSelector
                                                    step={step as any}
                                                    setSteps={setItems as any}
                                                    notificationNumber={notificationNumber ?? ""}
                                                />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </CardContent>

                {items.length > 0 && (
                    <CardFooter className="pb-2 flex items-center justify-between gap-2 flex-row">
                        <CardTitle className="text-base">Preguntas</CardTitle>

                        <Button size="sm" onClick={addFaq} className="gap-2">
                            <Plus className="w-4 h-4" />
                            Agregar Pregunta
                        </Button>
                    </CardFooter>
                )}
            </Card>
        </div>
    );
}