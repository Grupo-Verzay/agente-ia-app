// app/(root)/ai/_components/ProductBuilder.tsx
"use client";

import { useCallback, useEffect, useMemo, useState, ChangeEvent } from "react";
import { nanoid } from "nanoid";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Trash2, Plus, GripVertical, ChevronDown } from "lucide-react";

import { Workflow } from "@prisma/client";
import { useProductsAutosave, AutosaveStatus } from "./hooks/useProductsAutosave";
import { FunctionSelector } from "./";
import ElementRenderer from "./action-steeps/ElementRenderer";

import type {
    ElementItem,
    PedidoFunctionEl,
    ProductItemType,
    ProductBuilderProps,
    DataSubtype,
} from "@/types/agentAi";
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

function isPedidoFn(el: ElementItem): el is PedidoFunctionEl {
    return el.kind === "function" && (el as any).fn === "captura_datos" && (el as any).subtype === "Pedidos";
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

export const ProductBuilder = ({
    values,
    handleChange,
    onChange,
    promptId,
    version,
    onVersionChange,
    onConflict,
    initialItems = [],
    flows = [],
    notificationNumber,
    registerSaveHandler
}: ProductBuilderProps) => {
    const [items, setItems] = useState<ProductItemType[]>(
        Array.isArray(initialItems) && initialItems.length > 0
            ? (initialItems as ProductItemType[])
            : []
    );
    const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
    const [expandedItems, setExpandedItems] = useState<Set<string>>(
        () => new Set((Array.isArray(initialItems) ? initialItems : []).map((s: any) => s.id))
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

    const stableOnConflict = useCallback(
        (serverState: any) => {
            const serverItems = serverState?.sections?.products?.items ?? [];
            setItems(serverItems);
            onConflict?.(serverState);
        },
        [onConflict]
    );

    const { forceSave } = useProductsAutosave({
        promptId,
        version,
        items,
        onVersionChange,
        onConflict: stableOnConflict,
        onStatusChange: setAutosaveStatus,
        mode: "manual",
    });

    useEffect(() => {
        registerSaveHandler?.(forceSave);
    }, [registerSaveHandler, forceSave]);

    useEffect(() => {
        if (autosaveStatus === "saved") {
            const t = setTimeout(() => setAutosaveStatus("idle"), 1500);
            return () => clearTimeout(t);
        }
    }, [autosaveStatus]);

    const prompt = useMemo(() => {
        return buildSectionedPrompt(items as any, {
            emptyMessage: "Aún no has agregado productos. Usa “Agregar producto” para comenzar.",
            sectionLabel: (n, step) => `### PRODUCTO ${n} — ${(step.title || "Sin título").toUpperCase()}`,
            elementsLabel: (n) => `#### ELEMENTOS DEL PRODUCTO ${n}:`,
            mainMessageLabel: (n) => `OBJETIVO/RESPUESTA PRINCIPAL DEL PRODUCTO ${n}:`,
            joinSeparator: "\n",
        });
    }, [items]);

    useEffect(() => {
        const first = items[0];
        if (first && onChange) {
            onChange({ mainMessage: first.mainMessage ?? "", elements: first.elements ?? [] });
        }
        if (values.products !== prompt) {
            handleChange("products")({
                target: { value: prompt },
            } as ChangeEvent<HTMLTextAreaElement>);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prompt, items]);

    const addProduct = () => {
        const newId = nanoid();
        setItems((prev) => [
            ...prev,
            { id: newId, title: "", mainMessage: "", elements: [], openPicker: true },
        ]);
        setExpandedItems((prev) => new Set(Array.from(prev).concat(newId)));
    };

    const removeProduct = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

    const updateTitle = (id: string, v: string) =>
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, title: v.toUpperCase() } : it)));

    const updateMain = (id: string, v: string) =>
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, mainMessage: v } : it)));

    const removeElement = (productId: string, elId: string) => {
        setItems((prev) =>
            prev.map((s) =>
                s.id === productId
                    ? { ...s, elements: s.elements.filter((e) => e.id !== elId) }
                    : s
            )
        );
    };

    const updateText = (productId: string, elId: string, text: string) => {
        setItems((prev) =>
            prev.map((s) =>
                s.id === productId
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

    const setFlowOnElement = (productId: string, elId: string, flow: Workflow) => {
        setItems((prev) =>
            prev.map((s) =>
                s.id === productId
                    ? {
                        ...s,
                        elements: s.elements.map((e) =>
                            e.id === elId && e.kind === "function" && (e as any).fn === "ejecutar_flujo"
                                ? { ...(e as any), flowId: flow.id, flowName: flow.name }
                                : e
                        ),
                    }
                    : s
            )
        );
    };

    const addPedidoField = (productId: string, elId: string, field: string) => {
        const name = field.trim();
        if (!name) return;
        setItems((prev) =>
            prev.map((s) => {
                if (s.id !== productId) return s;
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

    const removePedidoField = (productId: string, elId: string, field: string) => {
        setItems((prev) =>
            prev.map((s) => {
                if (s.id !== productId) return s;
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

    const onSubtypeChange = (stepId: string, elementId: string, subtype: DataSubtype) => {
        setItems((prev) =>
            prev.map((product) => ({
                ...product,
                elements: product.elements.map((el) =>
                    el.id === elementId ? { ...el, subtype } : el
                ),
            }))
        );
    };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const itemIds = useMemo(() => items.map((s) => s.id), [items]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        setItems((prev) => {
            const oldIndex = prev.findIndex((s) => s.id === active.id);
            const newIndex = prev.findIndex((s) => s.id === over.id);
            if (oldIndex < 0 || newIndex < 0) return prev;
            return arrayMove(prev, oldIndex, newIndex);
        });
    }, []);

    return (
        <Card className="border-muted/60">
            <CardHeader className="pb-2 flex items-center justify-between gap-2 flex-row">
                <div className="flex items-center gap-2">
                    <CardTitle className="text-base uppercase">Productos</CardTitle>
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
                <div className="flex items-center gap-2">
                    {items.length > 1 && (
                        <button
                            type="button"
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors rounded"
                            onClick={expandedItems.size === 0 ? expandAll : collapseAll}
                        >
                            {expandedItems.size === 0 ? "Expandir todo" : "Colapsar todo"}
                        </button>
                    )}
                    {items.length < 1 && (
                        <Button size="sm" onClick={addProduct} className="gap-2">
                            <Plus className="w-4 h-4" />
                            Agregar producto
                        </Button>
                    )}
                </div>
            </CardHeader>

            <CardContent className="space-y-3">
                {items.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-8">
                        No has creado productos. Crea tu primer producto con &quot;Agregar producto&quot;.
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
                                                                Producto {idx + 1}
                                                            </span>
                                                            {isExpanded ? (
                                                                <Input
                                                                    value={step.title ?? ""}
                                                                    onChange={(e) => updateTitle(step.id, e.target.value)}
                                                                    className="h-7 text-sm w-1/2"
                                                                    placeholder="Título del Producto"
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
                                                                        title="Eliminar producto"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </button>
                                                                </AlertDialogTrigger>
                                                                <AlertDialogContent>
                                                                    <AlertDialogHeader>
                                                                        <AlertDialogTitle>Eliminar producto</AlertDialogTitle>
                                                                        <AlertDialogDescription>
                                                                            ¿Seguro que quieres eliminar este producto? Esta acción no se puede deshacer.
                                                                        </AlertDialogDescription>
                                                                    </AlertDialogHeader>
                                                                    <AlertDialogFooter>
                                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                        <AlertDialogAction
                                                                            className="bg-red-600 hover:bg-red-700"
                                                                            onClick={() => removeProduct(step.id)}
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
                                                                    <label className="text-sm font-semibold">{`Objetivo/respuesta principal del producto ${idx + 1}`}</label>
                                                                    <Textarea
                                                                        value={step.mainMessage ?? ""}
                                                                        onChange={(e) => updateMain(step.id, e.target.value)}
                                                                        className="min-h-[32px]"
                                                                    />
                                                                </div>
                                                                <Separator />
                                                                <div className="space-y-2">
                                                                    {!step.elements || step.elements.length === 0 ? (
                                                                        <div className="px-6 text-center text-sm text-muted-foreground">
                                                                            No hay elementos.
                                                                        </div>
                                                                    ) : (
                                                                        <div className="space-y-2">
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
                                                                <div className="px-6 flex items-center justify-end flex-wrap gap-2">
                                                                    <FunctionSelector
                                                                        step={step as any}
                                                                        setSteps={setItems as any}
                                                                        notificationNumber={notificationNumber ?? ""}
                                                                    />
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

            {items.length > 0 && (
                <CardFooter className="pb-2 flex items-center justify-between gap-2 flex-row">
                    <CardTitle className="text-base uppercase">Productos</CardTitle>
                    <Button size="sm" onClick={addProduct} className="gap-2">
                        <Plus className="w-4 h-4" />
                        Agregar producto
                    </Button>
                </CardFooter>
            )}
        </Card>
    );
};
