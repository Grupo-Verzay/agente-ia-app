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
import { Trash2, Plus, PenSquare, GripVertical, ChevronDown } from "lucide-react";

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

import {
    DndContext,
    closestCenter,
    PointerSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
    arrayMove,
    sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableElementRow({
    id,
    itemId,
    children,
}: {
    id: string;
    itemId: string;
    children: (args: { dragHandleProps: any; isDragging: boolean }) => React.ReactNode;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id,
        data: { type: "element", itemId },
    });
    const style: React.CSSProperties = {
        transform: transform ? CSS.Transform.toString({ ...transform, x: 0 }) : undefined,
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: "relative",
        zIndex: isDragging ? 999 : undefined,
    };
    return (
        <div ref={setNodeRef} style={style}>
            {children({ dragHandleProps: { ...attributes, ...listeners }, isDragging })}
        </div>
    );
}

function SortableItemCard({
    id,
    children,
}: {
    id: string;
    children: (args: { dragHandleProps: any; isDragging: boolean }) => React.ReactNode;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id,
        data: { type: "item" },
    });
    const style: React.CSSProperties = {
        transform: transform ? CSS.Transform.toString({ ...transform, x: 0 }) : undefined,
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: "relative",
        zIndex: isDragging ? 999 : undefined,
    };
    return (
        <div ref={setNodeRef} style={style}>
            {children({ dragHandleProps: { ...attributes, ...listeners }, isDragging })}
        </div>
    );
}

/* ========= Firma por defecto ========= */
const PROMPT_SIGNATURE_DEFAULT =
    "### IDENTIDAD DEL AGENTE\n" +
    "* **Nombre:** *“@signature_name”*.\n" +
    "* **Firma obligatoria:** Cada mensaje debe iniciar con `*“@signature_name”*` — NUNCA al final.\n" +
    "* **Siempre pon la firma:** *“@signature_name”* al inicio de cada mensaje o respuesta que le des al usuario. Esto permite mantener una identidad clara del agente y una conversación ordenada.\n\n" +
    "### Ejemplo de uso real:\n\n" +
    "**Usuario:**\n" +
    "¿Quien eres?\n\n" +
    "**Respuesta del agente:**\n" +
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

    const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");

    const [expandedItems, setExpandedItems] = useState<Set<string>>(
        () => new Set((initialExtras?.items ?? []).map((s: any) => s.id))
    );

    const toggleItem = useCallback((id: string) => {
        setExpandedItems((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const collapseAll = useCallback(() => setExpandedItems(new Set()), []);
    const expandAll = useCallback(() => setExpandedItems(new Set(items.map((s) => s.id))), [items]);

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
            sectionLabel: (n, step) => `### EXTRA ${n} — ${(step.title || "Sin título").toUpperCase()}`,
            elementsLabel: (n) => `#### ELEMENTOS DEL EXTRA ${n}:`,
            mainMessageLabel: (n) => `OBJETIVO/RESPUESTA PRINCIPAL DEL EXTRA ${n}:`,
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
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const itemIds = useMemo(() => items.map((s) => s.id), [items]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;
        const activeType = active.data.current?.type;
        if (activeType === "element") {
            const activeItemId = active.data.current?.itemId as string | undefined;
            const overItemId = over.data.current?.itemId as string | undefined;
            if (!activeItemId || !overItemId || activeItemId !== overItemId) return;
            if (active.id === over.id) return;
            setItems((prev) => prev.map((s) => {
                if (s.id !== activeItemId) return s;
                const oldIndex = s.elements.findIndex((e) => e.id === active.id);
                const newIndex = s.elements.findIndex((e) => e.id === over.id);
                if (oldIndex < 0 || newIndex < 0) return s;
                return { ...s, elements: arrayMove(s.elements, oldIndex, newIndex) };
            }));
            return;
        }
        if (active.id === over.id) return;
        setItems((prev) => {
            const oldIndex = prev.findIndex((s) => s.id === active.id);
            const newIndex = prev.findIndex((s) => s.id === over.id);
            if (oldIndex < 0 || newIndex < 0) return prev;
            return arrayMove(prev, oldIndex, newIndex);
        });
    }, []);

    const addItem = () => {
        const newId = nanoid();
        setItems((p) => [
            ...p,
            { id: newId, title: "", mainMessage: "", elements: [], openPicker: true },
        ]);
        setExpandedItems((prev) => new Set(Array.from(prev).concat(newId)));
    };

    const removeItem = (id: string) =>
        setItems((p) => p.filter((x) => x.id !== id));

    const toggleOpen = (id: string, v?: boolean) =>
        setItems((prev) =>
            prev.map((i) => (i.id === id ? { ...i, openPicker: v ?? !i.openPicker } : i))
        );

    const updateTitle = (id: string, v: string) =>
        setItems((p) => p.map((x) => (x.id === id ? { ...x, title: v.toUpperCase() } : x)));

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
                    <CardTitle className="text-base uppercase">Extras</CardTitle>
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
                {items.length > 1 && (
                    <button
                        type="button"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors rounded"
                        onClick={expandedItems.size === 0 ? expandAll : collapseAll}
                    >
                        {expandedItems.size === 0 ? "Expandir todo" : "Colapsar todo"}
                    </button>
                )}
            </CardHeader>

            <>
                {/* ====== Bloque Firma ====== */}
                <div className="pb-2 px-6">
                    <Card className="bg-muted/20 border-muted/60">
                        <CardHeader className="py-3 flex-row items-center justify-between">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <CardTitle className="text-sm font-semibold shrink-0">Firma</CardTitle>
                                {firmaEnabled && (
                                    <Input
                                        placeholder="Ej. Asistente Virtual"
                                        value={signatureName}
                                        onChange={(e) => setSignatureName(e.target.value)}
                                        className="h-8 w-1/2"
                                    />
                                )}
                            </div>
                            {firmaEnabled ? (
                                <Button variant="destructive" size="icon" onClick={() => setFirmaEnabled(false)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            ) : (
                                <Button variant="secondary" size="sm" onClick={() => setFirmaEnabled(true)}>
                                    <PenSquare className="h-4 w-4 mr-1" />
                                    Agregar firma
                                </Button>
                            )}
                        </CardHeader>
                        {firmaEnabled && (
                            <Textarea
                                className="min-h-[32px] text-xs opacity-80 hidden"
                                readOnly
                                value={firmaText}
                            />
                        )}
                    </Card>

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
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                                <div className="space-y-4">
                                    {items.map((step, idx) => (
                                        <SortableItemCard key={step.id} id={step.id}>
                                            {({ dragHandleProps, isDragging }) => {
                                                const isExpanded = expandedItems.has(step.id) && !isDragging;
                                                const elementCount = (step.elements ?? []).length;

                                                return (
                                                    <Card className="bg-muted/20 border-muted/60 overflow-hidden">
                                                        <div className="flex items-center justify-between gap-1 px-3 py-3">
                                                            <div className="flex items-center gap-1 min-w-0 flex-1">
                                                                <div
                                                                    className="h-8 w-6 flex items-center justify-center rounded text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing hover:text-foreground hover:bg-muted/50"
                                                                    title="Arrastrar"
                                                                    {...dragHandleProps}
                                                                >
                                                                    <GripVertical className="h-4 w-4" />
                                                                </div>
                                                                <span className="text-sm font-semibold shrink-0">
                                                                    Extra {idx + 1}
                                                                </span>
                                                                {isExpanded ? (
                                                                    <Input
                                                                        value={step.title ?? ""}
                                                                        onChange={(e) => updateTitle(step.id, e.target.value)}
                                                                        className="h-7 text-sm w-1/2"
                                                                        placeholder="Título del extra"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    />
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        className="flex-1 text-left text-sm font-medium truncate hover:text-foreground transition-colors"
                                                                        onClick={() => toggleItem(step.id)}
                                                                    >
                                                                        {step.title || <span className="text-muted-foreground italic">Sin título</span>}
                                                                    </button>
                                                                )}
                                                                {!isExpanded && elementCount > 0 && (
                                                                    <Badge variant="secondary" className="shrink-0 text-xs">
                                                                        {elementCount} {elementCount === 1 ? "elemento" : "elementos"}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <button
                                                                    type="button"
                                                                    className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                                                                    onClick={() => toggleItem(step.id)}
                                                                    title={isExpanded ? "Colapsar" : "Expandir"}
                                                                >
                                                                    <ChevronDown
                                                                        className="h-4 w-4 transition-transform duration-200"
                                                                        style={{ transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}
                                                                    />
                                                                </button>
                                                                <AlertDialog>
                                                                    <AlertDialogTrigger asChild>
                                                                        <button
                                                                            type="button"
                                                                            className="h-9 w-9 flex items-center justify-center rounded bg-destructive text-white hover:bg-destructive/90 transition-colors shrink-0"
                                                                            title="Eliminar extra"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </button>
                                                                    </AlertDialogTrigger>
                                                                    <AlertDialogContent>
                                                                        <AlertDialogHeader>
                                                                            <AlertDialogTitle>Eliminar extra</AlertDialogTitle>
                                                                            <AlertDialogDescription>
                                                                                ¿Seguro que quieres eliminar esta información? Esta acción no se puede deshacer.
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
                                                        </div>

                                                        <div
                                                            style={{
                                                                display: "grid",
                                                                gridTemplateRows: isExpanded ? "1fr" : "0fr",
                                                                transition: "grid-template-rows 200ms ease",
                                                            }}
                                                        >
                                                            <div className="overflow-hidden">
                                                                <CardContent className="space-y-3 px-0 pb-4 pt-0">
                                                                    <div className="px-6 space-y-2">
                                                                        <label className="text-sm font-semibold">{`Objetivo/respuesta principal del extra ${idx + 1}`}</label>
                                                                        <Textarea
                                                                            value={step.mainMessage ?? ""}
                                                                            onChange={(e) => updateMain(step.id, e.target.value)}
                                                                            className="min-h-[32px]"
                                                                        />
                                                                    </div>
                                                                    <Separator />
                                                                    <div className="space-y-2">
                                                                        {!step.elements || step.elements.length === 0 ? (
                                                                            <div className="px-6 text-center text-sm text-muted-foreground py-2">
                                                                                No hay elementos en este extra. Agrega funciones o textos usando los botones de abajo.
                                                                            </div>
                                                                        ) : (
                                                                            <SortableContext
                                                                                items={step.elements.map((e) => e.id)}
                                                                                strategy={verticalListSortingStrategy}
                                                                            >
                                                                                <div className="space-y-2">
                                                                                    {step.elements.map((el) => (
                                                                                        <SortableElementRow key={el.id} id={el.id} itemId={step.id}>
                                                                                            {({ dragHandleProps: elDragProps }) => (
                                                                                                <div className="flex items-start gap-2">
                                                                                                    <div
                                                                                                        className="h-8 w-8 mt-2 flex items-center justify-center rounded text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing hover:text-foreground hover:bg-muted/50"
                                                                                                        title="Arrastrar elemento"
                                                                                                        {...elDragProps}
                                                                                                    >
                                                                                                        <GripVertical className="h-4 w-4" />
                                                                                                    </div>
                                                                                                    <div className="flex-1">
                                                                                                        <ElementRenderer
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
                                                                                                    </div>
                                                                                                </div>
                                                                                            )}
                                                                                        </SortableElementRow>
                                                                                    ))}
                                                                                </div>
                                                                            </SortableContext>
                                                                        )}
                                                                    </div>
                                                                    <div className="px-6 flex items-center justify-between flex-wrap gap-2">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-sm font-semibold">Elementos del extra</span>
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
                                                            </div>
                                                        </div>
                                                    </Card>
                                                );
                                            }}
                                        </SortableItemCard>
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    )}
                </CardContent>
            </>
            {items.length > 0 && (
                <CardFooter className="pb-2 flex items-center justify-between gap-2 flex-row">
                    <CardTitle className="text-base uppercase">Extras</CardTitle>

                    <Button size="sm" onClick={addItem} className="gap-2">
                        <Plus className="w-4 h-4" />
                        Agregar extra
                    </Button>
                </CardFooter>
            )}
        </Card>
    );
}