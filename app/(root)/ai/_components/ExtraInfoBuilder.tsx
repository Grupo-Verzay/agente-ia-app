// app/(root)/ai/_components/ExtraInfoBuilder.tsx
"use client";

import { useCallback, useEffect, useMemo, useState, ChangeEvent } from "react";
import { nanoid } from "nanoid";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Trash2, Plus, PenSquare, X } from "lucide-react";

import { useExtrasAutosave, AutosaveStatus } from "./hooks/useExtrasAutosave"; // 👈 actualizado
import { FunctionSelector } from "./FunctionSelector";
import ElementRenderer from "./action-steeps/ElementRenderer";
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

import type {
    DataSubtype,
    ElementItem,
    ExtraInfoBuilderProps,
    ExtraItemType,
    PedidoFunctionEl,
} from "@/types/agentAi";
import type { Workflow } from "@prisma/client";
import { buildSectionedPrompt } from "./helpers";

/* ========= Firma por defecto ========= */
const PROMPT_SIGNATURE_DEFAULT =
    "### Extra - FIRMA EN LAS RESPUESTAS\n" +
    "Debes poner siempre la firma *“*@signature_name”* al inicio de cada mensaje o respuesta que le des al usuario, **nunca al final*. Esto permite mantener una identidad clara del agente y una conversación ordenada.\n\n" +
    "### Ejemplo de uso real:\n\n" +
    "*Usuario:*\n" +
    "¿Quien eres?\n\n" +
    "*Respuesta del agente:*\n" +
    "@signature_name\n" +
    "Soy un asistente virtual. ¿En qué puedo ayudarte hoy?";

/* ========= type-guard para captura_datos:Pedidos ========= */
function isPedidoFn(el: ElementItem): el is PedidoFunctionEl {
    return (
        el.kind === "function" &&
        (el as any).fn === "captura_datos" &&
        (el as any).subtype === "Pedidos"
    );
}

export function ExtraInfoBuilder({
    values,
    handleChange,
    onChange,
    promptId,
    version,
    onVersionChange,
    onConflict,
    initialExtras,
    flows = [],
    notificationNumber,
    registerSaveHandler
}: ExtraInfoBuilderProps & { flows?: Workflow[] }) {
    /* ====== Estado: pasos (antes "items") ====== */
    const [items, setItems] = useState<ExtraItemType[]>(
        initialExtras?.items && initialExtras.items.length > 0
            ? (initialExtras.items as ExtraItemType[])
            : []
    );

    /* ====== Estado: firma ====== */
    const userSignaturePrompt =
        initialExtras?.firmaText === ""
            ? PROMPT_SIGNATURE_DEFAULT
            : initialExtras?.firmaText ?? PROMPT_SIGNATURE_DEFAULT;

    const [firmaEnabled, setFirmaEnabled] = useState<boolean>(
        initialExtras?.firmaEnabled ?? false
    );

    const match = userSignaturePrompt.match(/@([a-zA-Z0-9_]+)/);
    const initialSignatureName = match
        ? match[1]
        : initialExtras?.firmaName ?? "Asistente virtual";
    const [signatureName, setSignatureName] = useState<string>(initialSignatureName);

    const firmaText = useMemo(
        () => PROMPT_SIGNATURE_DEFAULT.replaceAll("@signature_name", signatureName),
        [signatureName]
    );

    // 🔹 Estado de autosave
    const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");

    /* ====== AUTOSAVE (sections.extras.steps + firma*) ====== */
    const stableOnConflict = useCallback(
        (serverState: any) => {
            const s = serverState?.sections?.extras ?? {};
            setItems((s.steps ?? []) as ExtraItemType[]);
            setFirmaEnabled(Boolean(s.firmaEnabled));

            const savedText = s.firmaText ?? PROMPT_SIGNATURE_DEFAULT;
            const m = savedText.match(/@([a-zA-Z0-9_]+)/);
            setSignatureName(m ? m[1] : s.firmaName ?? "Asistente virtual");

            onConflict?.(serverState);
        },
        [onConflict]
    );

    const { forceSave } = useExtrasAutosave({
        promptId,
        version,
        items,
        firmaEnabled,
        firmaText,
        firmaName: signatureName,
        onVersionChange,
        onConflict: stableOnConflict,
        onStatusChange: setAutosaveStatus, // 👈 NUEVO
        mode: "manual"
    });

    useEffect(() => {
        registerSaveHandler?.(forceSave);
    }, [registerSaveHandler, forceSave]);

    // Reset visual “Cambios guardados”
    useEffect(() => {
        if (autosaveStatus === "saved") {
            const t = setTimeout(() => setAutosaveStatus("idle"), 1500);
            return () => clearTimeout(t);
        }
    }, [autosaveStatus]);

    /* ====== PREVIEW (markdown) ====== */
    const prompt = useMemo(() => {
        return buildSectionedPrompt(items as any, {
            emptyMessage:
                "Aún no has agregado información extra. Usa Agregar extra para comenzar.",
            sectionLabel: (n, step) => `### Extra ${n} — ${step.title || "Sin título"}`,
            elementsLabel: (n) => `#### Elementos del extra: ${n}`,
            mainMessageLabel: "Objetivo/respuesta principal del extra:",
            joinSeparator: "\n",
            firma: { enabled: !!firmaEnabled, text: String(firmaText || "") },
        });
    }, [items, firmaEnabled, firmaText]);

    /* ====== SYNC con padre (values.more) y compat onChange ====== */
    useEffect(() => {
        const first = items[0];
        onChange?.({
            mainMessage: first?.mainMessage ?? "",
            elements: first?.elements ?? [],
            firmaEnabled,
            firmaText,
            firmaName: signatureName,
            prompt,
        });

        if (values.more !== prompt) {
            handleChange("more")({
                target: { value: prompt },
            } as ChangeEvent<HTMLTextAreaElement>);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prompt, items, firmaEnabled, firmaText, signatureName]);

    /* ====== Mutadores de ITEM (paso extra) ====== */
    const addItem = () =>
        setItems((p) => [
            ...p,
            { id: nanoid(), title: "", mainMessage: "", elements: [], openPicker: true },
        ]);

    const removeItem = (id: string) =>
        setItems((p) => p.filter((x) => x.id !== id));

    const toggleOpen = (id: string, v?: boolean) =>
        setItems((prev) =>
            prev.map((i) => (i.id === id ? { ...i, openPicker: v ?? !i.openPicker } : i))
        );

    const updateTitle = (id: string, v: string) =>
        setItems((p) => p.map((x) => (x.id === id ? { ...x, title: v } : x)));

    const updateMain = (id: string, v: string) =>
        setItems((p) => p.map((x) => (x.id === id ? { ...x, mainMessage: v } : x)));

    /* ====== Mutadores de ELEMENTOS ====== */
    const removeElement = (extraId: string, elId: string) => {
        setItems((prev) =>
            prev.map((s) =>
                s.id === extraId
                    ? { ...s, elements: s.elements.filter((e) => e.id !== elId) }
                    : s
            )
        );
    };

    const updateText = (extraId: string, elId: string, text: string) => {
        setItems((prev) =>
            prev.map((s) =>
                s.id === extraId
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

    const setFlowOnElement = (extraId: string, elId: string, flow: Workflow) => {
        setItems((prev) =>
            prev.map((s) =>
                s.id === extraId
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

    const addPedidoField = (extraId: string, elId: string, field: string) => {
        const name = field.trim();
        if (!name) return;
        setItems((prev) =>
            prev.map((s) => {
                if (s.id !== extraId) return s;
                return {
                    ...s,
                    elements: s.elements.map((e) => {
                        if (e.id !== elId || !isPedidoFn(e)) return e;
                        const next = new Set([...(e.fields ?? []), name]);
                        return { ...e, fields: Array.from(next) };
                    }),
                };
            })
        );
    };

    const removePedidoField = (extraId: string, elId: string, field: string) => {
        setItems((prev) =>
            prev.map((s) => {
                if (s.id !== extraId) return s;
                return {
                    ...s,
                    elements: s.elements.map((e) => {
                        if (e.id !== elId || !isPedidoFn(e)) return e;
                        return { ...e, fields: (e.fields ?? []).filter((f) => f !== field) };
                    }),
                };
            })
        );
    };

    const appendToMain = (id: string, frag: string) =>
        setItems((p) =>
            p.map((x) =>
                x.id === id
                    ? {
                        ...x,
                        mainMessage:
                            (x.mainMessage ?? "").trim().length
                                ? `${x.mainMessage}\n\n${frag}`
                                : frag,
                    }
                    : x
            )
        );

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

    /* ====== UI ====== */
    return (
        <Card className="border-muted/60">
            <CardHeader className="pb-2 flex items-center justify-between gap-2 flex-row">
                <div className="flex items-center gap-2">
                    <CardTitle className="text-base">Extras</CardTitle>

                    {/* 🔹 Indicador autosave */}
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
            </CardHeader>

            <>
                {/* ====== Bloque Firma ====== */}
                <div className="space-y-2 px-6 pb-2">
                    <div className="flex items-center justify-between">
                        <label className="text-sm">Nombre en la firma</label>
                        {firmaEnabled ? (
                            <Button variant="ghost" onClick={() => setFirmaEnabled(false)}>
                                <Trash2 className="h-4 w-4 mr-2" />
                                Eliminar
                            </Button>
                        ) : (
                            <Button variant="secondary" onClick={() => setFirmaEnabled(true)}>
                                <PenSquare className="h-4 w-4" />
                                Agregar firma
                            </Button>
                        )}
                    </div>

                    {firmaEnabled && (
                        <>
                            <Input
                                placeholder="Ej. Asistente Virtual"
                                value={signatureName}
                                onChange={(e) => setSignatureName(e.target.value)}
                            />

                            <Textarea
                                className="min-h-[32px] text-xs opacity-80 hidden"
                                readOnly
                                value={firmaText}
                            />
                        </>
                    )}

                    {items.length < 1 && (
                        <div className="flex w-full justify-end">
                            <Button size="sm" onClick={addItem} className="gap-2">
                                <Plus className="w-4 h-4" />
                                Agregar extra
                            </Button>
                        </div>
                    )}
                </div>

                {/* ====== Pasos/Items extra ====== */}
                <CardContent className="space-y-3">
                    {items.length === 0 ? (
                        <div className="text-center text-sm text-muted-foreground py-8">
                            No has creado ningún extra. Crea tu primer extra con Agregar extra.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {items.map((step, idx) => (
                                <Card key={step.id} className="bg-muted/10 border-muted/60">
                                    <CardHeader className="py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="grid w_full max-w-sm items-center gap-3">
                                                <Label htmlFor={step.id}>{`Extra ${idx + 1}`}</Label>
                                                <Input
                                                    id={step.id}
                                                    value={step.title ?? ""}
                                                    onChange={(e) =>
                                                        updateTitle(step.id, e.target.value)
                                                    }
                                                    className="h-8"
                                                    placeholder="Título del extra"
                                                />
                                            </div>

                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        title="Eliminar extra"
                                                        className="ml-auto"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>

                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>
                                                            Eliminar extra
                                                        </AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            ¿Seguro que quieres eliminar esta
                                                            información?
                                                            Esta acción no se puede deshacer.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>

                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
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
                                            <div className="flex items-center justify-between">
                                                <label className="text-sm font-medium">{`Descripción ${idx + 1
                                                    }`}</label>
                                            </div>

                                            <Textarea
                                                value={step.mainMessage ?? ""}
                                                onChange={(e) =>
                                                    updateMain(step.id, e.target.value)
                                                }
                                                className="min-h-[32px]"
                                            />
                                        </div>

                                        <Separator />

                                        <div className="rounded-lg border border-dashed border-muted/60 p-1">
                                            {!step.elements || step.elements.length === 0 ? (
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
                                                    Elementos del extra adicional
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
            </>
            {items.length > 0 && (
                <CardFooter className="pb-2 flex items-center justify-between gap-2 flex-row">
                    <CardTitle className="text-base">Extras</CardTitle>

                    <Button size="sm" onClick={addItem} className="gap-2">
                        <Plus className="w-4 h-4" />
                        Agregar extra
                    </Button>
                </CardFooter>
            )}
        </Card>
    );
}