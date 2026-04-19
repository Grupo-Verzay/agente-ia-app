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
import { Workflow } from "@prisma/client";
import { useManagementAutosave, AutosaveStatus } from "./hooks/useManagementAutosave";
import ElementRenderer from "./action-steeps/ElementRenderer";
import { FunctionSelector } from "./FunctionSelector";
import { PromptFragment } from "./helpers/prompt-fragments";
import { getUserAppointmentUrl } from "@/actions/userClientDataActions"; // 👈 NUEVO
// import { ManagementPromptBuilder } from "./ManagementPromptBuilder";

import type {
    ElementItem,
    ManagementBuilderProps,
    ManagementItem,
    PedidoFunctionEl,
    DataSubtype,
    AnyEl,
} from "@/types/agentAi";
import { buildSectionedPrompt, transformSubtype } from "./helpers";

/* type-guard genérico para funciones (Gestión puede incluir varias) */
function isPedidoFn(el: ElementItem): el is PedidoFunctionEl {
    return el.kind === "function";
}

/* Inferir label legible del primer elemento para titular el bloque */
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

/* Utils locales */
function extractTitle(txt: string) {
    const firstLine = (txt || "").split(/\r?\n/).find(Boolean) || "";
    const h1 = firstLine.replace(/^#+\s*/, "").trim();
    if (h1) return h1.slice(0, 80);
    const short = txt.replace(/\s+/g, " ").trim().slice(0, 80);
    return short || "Bloque";
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
    // cada card = un "bloque" de gestión
    const [steps, setSteps] = useState<ManagementItem[]>(
        Array.isArray(initialItems) && initialItems.length > 0
            ? (initialItems as ManagementItem[])
            : []
    );
    const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
    const [appointmentUrl, setAppointmentUrl] = useState<string>(""); // 👈 NUEVO

    // Obtener la URL de agenda una sola vez
    useEffect(() => {
        let cancelled = false;

        const fetchUrl = async () => {
            try {
                const url = await getUserAppointmentUrl();
                if (!cancelled) {
                    setAppointmentUrl(url || "");
                }
            } catch (error) {
                console.error("[ManagementBuilder] Error obteniendo appointmentUrl:", error);
                if (!cancelled) setAppointmentUrl("");
            }
        };

        fetchUrl();

        return () => {
            cancelled = true;
        };
    }, []);

    // proxy que completa título y cierra picker tras elegir acción
    const setStepsAuto: React.Dispatch<React.SetStateAction<ManagementItem[]>> = (
        updater
    ) => {
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
                        return { ...s, title: String(label), openPicker: false };
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

    // Conflicto: rehidratar desde servidor
    const stableOnConflict = useCallback(
        (serverState: any) => {
            const serverSteps = serverState?.sections?.management?.steps ?? [];
            setSteps(serverSteps);
            onConflict?.(serverState);
        },
        [onConflict]
    );

    // AUTOSAVE
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

    // Reset visual de "Cambios guardados"
    useEffect(() => {
        if (autosaveStatus === "saved") {
            const t = setTimeout(() => setAutosaveStatus("idle"), 1500);
            return () => clearTimeout(t);
        }
    }, [autosaveStatus]);

    // PREVIEW markdown
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

                const objetivo =
                    (step.mainMessage ?? "").trim() || gestion;

                return [
                    `### Gestión ${_n} — ${etiqueta}`,
                    `* **Objetivo principal de la gestión:** ${_n}`,
                    `Cuando un usuario desee realizar ${info.articulo} **${info.label}**\n`,
                ].join("\n");
            },

            elementsLabel: (_n) => `#### Elementos de la gestión ${_n}`,
            mainMessageLabel: "Objetivo/respuesta principal de la gestión:",
            joinSeparator: "\n",
            appointmentUrl,
        });
    }, [steps, appointmentUrl]);

    // SYNC con parent
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

    /* Crear bloque a partir de una acción seleccionada (sin step vacío) */
    const createStepFromElement = (el: ElementItem) => {
        const element: ElementItem = { ...el, id: el.id ?? nanoid() };
        const title = getElementLabel(element) || "Bloque";
        const newStep: ManagementItem = {
            id: nanoid(),
            title,
            mainMessage: "",
            elements: [element],
            openPicker: false,
        };
        setStepsAuto((prev) => [...prev, newStep]);
    };

    /* Mutadores de STEP (bloque) */
    const addFragment = (snippet: PromptFragment) =>
        setSteps((prev) => [
            ...prev,
            {
                id: nanoid(),
                title: extractTitle(snippet.label),
                mainMessage: snippet.value,
                elements: [{ id: nanoid(), kind: "text", text: snippet.value } as ElementItem],
            },
        ]);

    const removeStep = (id: string) =>
        setSteps((prev) => prev.filter((s) => s.id !== id));

    const updateTitle = (id: string, v: string) =>
        setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, title: v } : s)));

    const updateMain = (id: string, v: string) =>
        setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, mainMessage: v } : s)));

    /* Mutadores de ELEMENTS (por step) */

    const removeElement = (stepId: string, elId: string) => {
        setSteps((prev) => {
            // 0) localizar el step y el elemento objetivo
            const step = prev.find((s) => s.id === stepId);
            if (!step) return prev;

            const target = (step.elements ?? []).find((e) => e.id === elId);
            if (!target) return prev;

            const isFnElement =
                (target as any)?.kind === "function" || typeof (target as any)?.fn === "string";

            // 1) si el elemento a eliminar es la fn -> eliminar tarea el step
            if (isFnElement) {
                return prev.filter((s) => s.id !== stepId);
            }

            // 2) si no es fn -> quitar solo ese elemento y, si queda vacío, eliminar el step
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

    const onSubtypeChange = (
        stepId: string,
        elementId: string,
        subtype: DataSubtype
    ) => {
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

    const handleInsertFromPicker = ({ id, label, value }: PromptFragment) => {
        addFragment({ id, label, value });
    };

    return (
        <Card className="border-muted/60">
            <CardHeader className="pb-2 flex items-center justify-between gap-2 flex-row">
                <CardTitle className="text-base">Gestión</CardTitle>
                <div className="flex items-center gap-2">
                    {/* {typeof ManagementPromptBuilder !== "undefined" && (
                        <ManagementPromptBuilder onInsert={handleInsertFromPicker} />
                    )} */}
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
                    {/* ⤵️ MODO RAÍZ: sin crear bloque vacío, abre lista y al elegir crea el bloque */}
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
                        No has agregado bloques de gestión. Usa “Agregar acción” para comenzar.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {steps.map((step, idx) => (
                            <Card key={step.id} className="bg-muted/10 border-muted/60">
                                <CardHeader className="py-3">
                                    <div className="flex items-center gap-2">
                                        {/* <div className="grid w-full max-w-sm items-center gap-3">
                                            <Label htmlFor={step.id}>{`Gestión ${idx + 1}`}</Label>
                                            <Input
                                                id={step.id}
                                                value={step.title ?? ""}
                                                onChange={(e) => updateTitle(step.id, e.target.value)}
                                                className="h-8"
                                                placeholder="Título del bloque de gestión"
                                            />
                                        </div> */}
                                        {/* <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium">Elementos de la gestión</span>
                                            <Badge variant="secondary">
                                                {step.elements?.length ?? 0}
                                            </Badge>
                                        </div> */}
                                        {/* <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeStep(step.id)}
                                            title="Eliminar bloque"
                                            className="ml-auto"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button> */}
                                    </div>
                                </CardHeader>

                                <CardContent className="space-y-3">
                                    {/* Objetivo / Mensaje principal */}
                                    {/* <div className="space-y-2">
                                        <label className="text-sm font-medium">{`Descripción ${idx + 1}`}</label>
                                        <Textarea
                                            value={step.mainMessage ?? ""}
                                            onChange={(e) => updateMain(step.id, e.target.value)}
                                            className="min-h-[32px]"
                                        />
                                    </div>

                                    <Separator /> */}

                                    {/* Lista de elementos */}
                                    <div className="rounded-lg border border-dashed border-muted/60 p-1">
                                        {!step.elements || step.elements.length === 0 ? (
                                            <div className="text-center text-sm text-muted-foreground">
                                                No hay elementos. Agrega funciones o textos con los botones de arriba.
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
                                                        onSubtypeChange={(_sid, eid, subtype) =>
                                                            onSubtypeChange(step.id, eid, subtype)
                                                        }
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Header elementos */}
                                    <div className="flex items-center justify-end flex-wrap gap-2">
                                        <div className="flex gap-2">
                                            <FunctionSelector
                                                step={step as any}
                                                setSteps={setStepsAuto as any}
                                                notificationNumber={notificationNumber ?? ""}
                                                isManagement={true}
                                                showRule={true}
                                                showAction={false}
                                            />
                                        </div>
                                    </div>


                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </CardContent>

            {steps.length > 0 && (
                <CardFooter className="pb-2 flex items-center justify-between gap-2 flex-row">
                    <CardTitle className="text-base">Gestión</CardTitle>

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
