"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Workflow } from "@prisma/client";
import { useManagementAutosave, AutosaveStatus } from "./hooks/useManagementAutosave";
import ElementRenderer from "./action-steeps/ElementRenderer";
import { FunctionSelector } from "./FunctionSelector";
import { PromptFragment } from "./helpers/prompt-fragments";
import { getUserAppointmentUrl } from "@/actions/userClientDataActions";
import { GripVertical, ChevronDown, Trash2 } from "lucide-react";

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

import type {
    ElementItem,
    ManagementBuilderProps,
    ManagementItem,
    PedidoFunctionEl,
    DataSubtype,
    AnyEl,
} from "@/types/agentAi";
import { buildSectionedPrompt, transformSubtype } from "./helpers";

function isPedidoFn(el: ElementItem): el is PedidoFunctionEl {
    return el.kind === "function";
}

function getElementLabel(el?: ElementItem): string {
    if (!el) return "";
    const anyEl = el as any;
    return (
        anyEl.label ||
        anyEl.name ||
        anyEl.flowName ||
        anyEl.fn ||
        (el.kind === "text" ? "Texto" : "Acción")
    );
}

function extractTitle(txt: string) {
    const firstLine = (txt || "").split(/\r?\n/).find(Boolean) || "";
    const h1 = firstLine.replace(/^#+\s*/, "").trim();
    if (h1) return h1.slice(0, 80);
    const short = txt.replace(/\s+/g, " ").trim().slice(0, 80);
    return short || "Bloque";
}

function getStepSubtypeLabel(step: ManagementItem): string {
    const captura = (step.elements ?? []).find(
        (el: any) => el.kind === "function" && el.fn === "captura_datos"
    ) as any | undefined;
    return captura?.subtype ?? step.title ?? "GESTIÓN";
}

function SortableElementRow({
    id,
    stepId,
    children,
}: {
    id: string;
    stepId: string;
    children: (args: { dragHandleProps: any; isDragging: boolean }) => React.ReactNode;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id,
        data: { type: "element", stepId },
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

function SortableStepCard({
    id,
    children,
}: {
    id: string;
    children: (args: { dragHandleProps: any; isDragging: boolean }) => React.ReactNode;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id, data: { type: "step" } });

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

export const ManagementBuilder = ({
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
}: ManagementBuilderProps) => {
    const [steps, setSteps] = useState<ManagementItem[]>(
        Array.isArray(initialItems) && initialItems.length > 0
            ? (initialItems as ManagementItem[])
            : []
    );
    const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
    const [appointmentUrl, setAppointmentUrl] = useState<string>("");

    const [expandedSteps, setExpandedSteps] = useState<Set<string>>(
        () => new Set((Array.isArray(initialItems) ? initialItems : []).map((s: any) => s.id))
    );

    const toggleStep = useCallback((id: string) => {
        setExpandedSteps((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const collapseAll = useCallback(() => setExpandedSteps(new Set()), []);
    const expandAll = useCallback(
        () => setExpandedSteps(new Set(steps.map((s) => s.id))),
        [steps]
    );

    useEffect(() => {
        let cancelled = false;
        const fetchUrl = async () => {
            try {
                const url = await getUserAppointmentUrl();
                if (!cancelled) setAppointmentUrl(url || "");
            } catch {
                if (!cancelled) setAppointmentUrl("");
            }
        };
        fetchUrl();
        return () => { cancelled = true; };
    }, []);

    const setStepsAuto: React.Dispatch<React.SetStateAction<ManagementItem[]>> = (updater) => {
        setSteps((prev) => {
            const next =
                typeof updater === "function"
                    ? (updater as (p: ManagementItem[]) => ManagementItem[])(prev)
                    : updater;

            let changed = false;
            const patched = next.map((s) => {
                if (!s.title?.trim() && (s.elements?.length ?? 0) > 0) {
                    const label = getElementLabel(s.elements[0]);
                    if (label) {
                        changed = true;
                        return { ...s, title: String(label).toUpperCase(), openPicker: false };
                    }
                }
                if (s.openPicker && (s.elements?.length ?? 0) > 0) {
                    changed = true;
                    return { ...s, openPicker: false };
                }
                return s;
            });

            return changed ? patched : next;
        });
    };

    const stableOnConflict = useCallback(
        (serverState: any) => {
            const serverSteps = serverState?.sections?.management?.steps ?? [];
            setSteps(serverSteps);
            onConflict?.(serverState);
        },
        [onConflict]
    );

    const { forceSave } = useManagementAutosave({
        promptId,
        version,
        steps,
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

    const managementPreview = useMemo(() => {
        return buildSectionedPrompt(steps as any, {
            mode: "management",
            emptyMessage:
                "Aún no has agregado bloques de gestión. Usa “Agregar acción” para comenzar.",

            sectionLabel: (_n, step) => {
                const gestion = step.title || "Gestión sin nombre";

                const captura = (step.elements || []).find(
                    (el: AnyEl) => el.kind === "function" && el.fn === "captura_datos"
                ) as AnyEl | undefined;

                const rawSubtype = captura?.subtype ?? "";
                const subtype = transformSubtype(rawSubtype);

                const pluralMap: Record<string, string> = {
                    solicitud: "Solicitudes",
                    pedido: "Pedidos",
                    reserva: "Reservas",
                    reclamo: "Reclamos",
                    cita: "Citas",
                };

                const etiqueta = subtype ? pluralMap[subtype] ?? subtype : "Gestión";

                const generoMap: Record<string, { articulo: string; label: string }> = {
                    solicitud: { articulo: "una", label: "solicitud" },
                    reserva: { articulo: "una", label: "reserva" },
                    cita: { articulo: "una", label: "cita" },
                    pedido: { articulo: "un", label: "pedido" },
                    reclamo: { articulo: "un", label: "reclamo" },
                };

                const info = subtype
                    ? generoMap[subtype] ?? { articulo: "una", label: subtype }
                    : { articulo: "una", label: "gestión" };

                const objetivo = (step.mainMessage ?? "").trim() || gestion;

                return [
                    `### GESTIÓN ${_n} — ${etiqueta.toUpperCase()}`,
                    `* **Objetivo principal de la gestión:** ${_n}`,
                    `Cuando un usuario desee realizar ${info.articulo} **${info.label}**\n`,
                ].join("\n");
            },

            elementsLabel: (_n) => `#### ELEMENTOS DE LA GESTIÓN ${_n}`,
            mainMessageLabel: "OBJETIVO/RESPUESTA PRINCIPAL DE LA GESTIÓN:",
            joinSeparator: "\n",
            appointmentUrl,
        });
    }, [steps, appointmentUrl]);

    useEffect(() => {
        const first = steps[0];
        if (first && onChange) {
            onChange({
                mainMessage: first.mainMessage ?? "",
                elements: (first.elements ?? []) as ElementItem[],
            });
        }

        if (values.management !== managementPreview) {
            handleChange("management")({
                target: { value: managementPreview },
            } as ChangeEvent<HTMLTextAreaElement>);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [managementPreview, steps]);

    const createStepFromElement = (el: ElementItem) => {
        const element: ElementItem = { ...el, id: el.id ?? nanoid() };
        const title = (getElementLabel(element) || "Bloque").toUpperCase();
        const newId = nanoid();
        const newStep: ManagementItem = {
            id: newId,
            title,
            mainMessage: "",
            elements: [element],
            openPicker: false,
        };
        setStepsAuto((prev) => [...prev, newStep]);
        setExpandedSteps((prev) => new Set(Array.from(prev).concat(newId)));
    };

    const addFragment = (snippet: PromptFragment) =>
        setSteps((prev) => [
            ...prev,
            {
                id: nanoid(),
                title: extractTitle(snippet.label).toUpperCase(),
                mainMessage: snippet.value,
                elements: [{ id: nanoid(), kind: "text", text: snippet.value } as ElementItem],
            },
        ]);

    const removeStep = (id: string) =>
        setSteps((prev) => prev.filter((s) => s.id !== id));

    const updateTitle = (id: string, v: string) =>
        setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, title: v.toUpperCase() } : s)));

    const updateMain = (id: string, v: string) =>
        setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, mainMessage: v } : s)));

    const removeElement = (stepId: string, elId: string) => {
        setSteps((prev) => {
            const step = prev.find((s) => s.id === stepId);
            if (!step) return prev;

            const target = (step.elements ?? []).find((e) => e.id === elId);
            if (!target) return prev;

            const isFnElement =
                (target as any)?.kind === "function" || typeof (target as any)?.fn === "string";

            if (isFnElement) {
                return prev.filter((s) => s.id !== stepId);
            }

            const next = prev.map((s) => {
                if (s.id !== stepId) return s;
                const elements = (s.elements ?? []).filter((e) => e.id !== elId);
                return { ...s, elements };
            });

            return next.filter((s) =>
                s.id === stepId ? ((s.elements?.length ?? 0) > 0) : true
            );
        });
    };

    const updateText = (stepId: string, elId: string, text: string) => {
        setSteps((prev) =>
            prev.map((s) =>
                s.id === stepId
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

    const setFlowOnElement = (stepId: string, elId: string, flow: Workflow) => {
        setSteps((prev) =>
            prev.map((s) =>
                s.id === stepId
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

    const addPedidoField = (stepId: string, elId: string, field: string) => {
        const name = field.trim();
        if (!name) return;
        setSteps((prev) =>
            prev.map((s) => {
                if (s.id !== stepId) return s;
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

    const removePedidoField = (stepId: string, elId: string, field: string) => {
        setSteps((prev) =>
            prev.map((s) => {
                if (s.id !== stepId) return s;
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
        setSteps((prev) =>
            prev.map((s) =>
                s.id === stepId
                    ? {
                        ...s,
                        elements: s.elements.map((el) =>
                            el.id === elementId ? { ...el, subtype } : el
                        ),
                    }
                    : s
            )
        );
    };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const stepIds = useMemo(() => steps.map((s) => s.id), [steps]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;
        const activeType = active.data.current?.type;
        if (activeType === "element") {
            const activeStepId = active.data.current?.stepId as string | undefined;
            const overStepId = over.data.current?.stepId as string | undefined;
            if (!activeStepId || !overStepId || activeStepId !== overStepId) return;
            if (active.id === over.id) return;
            setSteps((prev) => prev.map((s) => {
                if (s.id !== activeStepId) return s;
                const oldIndex = s.elements.findIndex((e) => e.id === active.id);
                const newIndex = s.elements.findIndex((e) => e.id === over.id);
                if (oldIndex < 0 || newIndex < 0) return s;
                return { ...s, elements: arrayMove(s.elements, oldIndex, newIndex) };
            }));
            return;
        }
        if (active.id === over.id) return;
        setSteps((prev) => {
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
                    <CardTitle className="text-base uppercase">Gestión</CardTitle>
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
                    {steps.length > 1 && (
                        <button
                            type="button"
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors rounded"
                            onClick={expandedSteps.size === 0 ? expandAll : collapseAll}
                        >
                            {expandedSteps.size === 0 ? "Expandir todo" : "Colapsar todo"}
                        </button>
                    )}
                    {steps.length < 1 && (
                        <FunctionSelector
                            notificationNumber={notificationNumber ?? ""}
                            isManagement={true}
                            onCreateBlock={(el) => createStepFromElement(el)}
                            showRule={false}
                            showAction={true}
                        />
                    )}
                </div>
            </CardHeader>

            <CardContent className="space-y-3">
                {steps.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-8">
                        No has agregado bloques de gestión. Usa &quot;Agregar acción&quot; para comenzar.
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext items={stepIds} strategy={verticalListSortingStrategy}>
                            <div className="space-y-4">
                                {steps.map((step, idx) => (
                                    <SortableStepCard key={step.id} id={step.id}>
                                        {({ dragHandleProps, isDragging }) => {
                                            const isExpanded = expandedSteps.has(step.id) && !isDragging;
                                            const subtypeLabel = getStepSubtypeLabel(step);
                                            const elementCount = (step.elements ?? []).length;

                                            return (
                                                <Card className="bg-muted/20 border-muted/60 overflow-hidden">
                                                    {/* Fila de cabecera siempre visible */}
                                                    <div className="flex items-center justify-between gap-1 px-3 py-3">
                                                        <div className="flex items-center gap-1 min-w-0 flex-1">
                                                            {/* Drag handle */}
                                                            <div
                                                                className="h-8 w-6 flex items-center justify-center rounded text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing hover:text-foreground hover:bg-muted/50"
                                                                title="Arrastrar"
                                                                {...dragHandleProps}
                                                            >
                                                                <GripVertical className="h-4 w-4" />
                                                            </div>

                                                            {/* Número */}
                                                            <span className="text-sm font-semibold shrink-0">
                                                                Gestión {idx + 1}
                                                            </span>

                                                            {/* Subtipo / título */}
                                                            <button
                                                                type="button"
                                                                className="flex-1 text-left text-sm font-medium truncate hover:text-foreground transition-colors"
                                                                onClick={() => toggleStep(step.id)}
                                                            >
                                                                {subtypeLabel ? (
                                                                    <span>{subtypeLabel.toUpperCase()}</span>
                                                                ) : (
                                                                    <span className="text-muted-foreground italic">Sin tipo</span>
                                                                )}
                                                            </button>

                                                            {/* Badge colapsado */}
                                                            {!isExpanded && elementCount > 0 && (
                                                                <Badge variant="secondary" className="shrink-0 text-xs">
                                                                    {elementCount} {elementCount === 1 ? "elemento" : "elementos"}
                                                                </Badge>
                                                            )}
                                                        </div>

                                                        {/* Chevron + eliminar */}
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <button
                                                                type="button"
                                                                className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                                                                onClick={() => toggleStep(step.id)}
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
                                                                        title="Eliminar gestión"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </button>
                                                                </AlertDialogTrigger>
                                                                <AlertDialogContent>
                                                                    <AlertDialogHeader>
                                                                        <AlertDialogTitle>Eliminar gestión</AlertDialogTitle>
                                                                        <AlertDialogDescription>
                                                                            ¿Seguro que quieres eliminar esta gestión? Esta acción no se puede deshacer.
                                                                        </AlertDialogDescription>
                                                                    </AlertDialogHeader>
                                                                    <AlertDialogFooter>
                                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                        <AlertDialogAction
                                                                            className="bg-red-600 hover:bg-red-700"
                                                                            onClick={() => removeStep(step.id)}
                                                                        >
                                                                            Eliminar
                                                                        </AlertDialogAction>
                                                                    </AlertDialogFooter>
                                                                </AlertDialogContent>
                                                            </AlertDialog>
                                                        </div>
                                                    </div>

                                                    {/* Contenido colapsable */}
                                                    <div
                                                        style={{
                                                            display: "grid",
                                                            gridTemplateRows: isExpanded ? "1fr" : "0fr",
                                                            transition: "grid-template-rows 200ms ease",
                                                        }}
                                                    >
                                                        <div className="overflow-hidden">
                                                            <CardContent className="space-y-3 pt-0 pb-3 px-3">
                                                                {!step.elements || step.elements.length === 0 ? (
                                                                    <div className="text-center text-sm text-muted-foreground py-4">
                                                                        No hay elementos en esta gestión. Agrega funciones o textos usando los botones de abajo.
                                                                    </div>
                                                                ) : (
                                                                    <SortableContext
                                                                        items={step.elements.map((e) => e.id)}
                                                                        strategy={verticalListSortingStrategy}
                                                                    >
                                                                        <div className="space-y-3">
                                                                            {step.elements.map((el) => (
                                                                                <SortableElementRow key={el.id} id={el.id} stepId={step.id}>
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
                                                                                                    onSubtypeChange={(_sid, eid, subtype) =>
                                                                                                        onSubtypeChange(step.id, eid, subtype)
                                                                                                    }
                                                                                                    isManagement={true}
                                                                                                    onAddRule={
                                                                                                        el.kind === "function"
                                                                                                            ? () => {
                                                                                                                  setStepsAuto((prev) =>
                                                                                                                      prev.map((s) =>
                                                                                                                          s.id === step.id
                                                                                                                              ? {
                                                                                                                                    ...s,
                                                                                                                                    elements: [
                                                                                                                                        ...s.elements,
                                                                                                                                        {
                                                                                                                                            id: nanoid(),
                                                                                                                                            kind: "text" as const,
                                                                                                                                            text: "",
                                                                                                                                        },
                                                                                                                                    ],
                                                                                                                                }
                                                                                                                              : s
                                                                                                                      )
                                                                                                                  );
                                                                                                              }
                                                                                                            : undefined
                                                                                                    }
                                                                                                />
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                </SortableElementRow>
                                                                            ))}
                                                                        </div>
                                                                    </SortableContext>
                                                                )}
                                                                <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-sm font-semibold">Elementos de la gestión</span>
                                                                        <Badge variant="secondary">{idx + 1}</Badge>
                                                                    </div>
                                                                </div>
                                                            </CardContent>
                                                        </div>
                                                    </div>
                                                </Card>
                                            );
                                        }}
                                    </SortableStepCard>
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}
            </CardContent>

            {steps.length > 0 && (
                <CardFooter className="pb-2 flex items-center justify-between gap-2 flex-row">
                    <CardTitle className="text-base uppercase">Gestión</CardTitle>
                    <FunctionSelector
                        notificationNumber={notificationNumber ?? ""}
                        isManagement={true}
                        onCreateBlock={(el) => createStepFromElement(el)}
                        showRule={false}
                        showAction={true}
                    />
                </CardFooter>
            )}
        </Card>
    );
};
