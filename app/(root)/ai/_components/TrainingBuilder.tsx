"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, GripVertical, ChevronDown, Copy } from "lucide-react";
import { StepTemplatePicker } from "./StepTemplatePicker";

import {
  AnyStep,
  DataSubtype,
  ElementItem,
  PedidoFunctionEl,
  RoutingRule,
  StepTraining,
  TrainingBuilderProps,
} from "@/types/agentAi";
import { Workflow } from "@prisma/client";
import { useTrainingAutosave, AutosaveStatus } from "./hooks/useTrainingAutosave";
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

const WELCOME_TITLE = "BIENVENIDA";

const WELCOME_MAIN_MESSAGE = `🔒 CONDICIÓN DE CHAT NUEVO (GATE): collected == {} AND current_step == 1
🚨 PRIORIDAD ABSOLUTA — PRIMER TURNO. Se ejecuta ante cualquier intención del usuario.

🔀 OVERRIDE DE ENRUTAMIENTO (se evalúa ANTES de la lógica de ejecución):
   → SI existe una Regla/parámetro de enrutamiento cuya condición se cumple con el primer mensaje:
      • OMITIR toda la lógica de BIENVENIDA (pasos 1️⃣ y 2️⃣).
      • Ir al PASO indicado por NOMBRE en esa regla (el sistema resuelve su posición).
      • Si el paso nombrado no existe → ejecutar BIENVENIDA como respaldo.
   → SI NINGUNA Regla/parámetro de enrutamiento aplica:
      • Continuar con la LÓGICA DE EJECUCIÓN normal (1️⃣ / 2️⃣).

✅ LÓGICA DE EJECUCIÓN (en orden estricto):
1️⃣ SI el flujo 'BIENVENIDA' está disponible:
   → EJECUTARLO de inmediato, ANTES de responder.
   → Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2).
   → SIN parafrasear, SIN omitir, SIN modificar.
2️⃣ SI el flujo 'BIENVENIDA' NO está disponible:
   → Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (1).
   → SIN reformular, SIN inventar, SIN agregar texto.

⏸️ DESPUÉS de ejecutar (cualquiera de los dos casos): ESPERAR respuesta del usuario.

➡️ TRANSICIÓN:
   A) Si se activó el OVERRIDE DE ENRUTAMIENTO:
      → Ir al PASO de destino por nombre.
      → El paso de destino gestiona su propio current_step y transición.
   B) Si se ejecutó BIENVENIDA normal (sin override):
      → Guardar saludo_completado = true
      → current_step = 2
      → El siguiente turno evalúa el gate del Paso 2.

⚠️ EXCEPCIONES:
   1. Si el usuario hace una pregunta directa antes del saludo → ejecutar igual el GATE primero, luego responder en el Paso 2.
   2. Si el flujo 'BIENVENIDA' falla a mitad de ejecución → emitir Regla/parámetro (1) como respaldo.
   3. Si el mensaje del usuario llega vacío o es un sticker/audio sin texto → ejecutar GATE normal, no saltar paso.

🚫 PROHIBIDO:
- Responder sin ejecutar primero el GATE.
- Usar el "Comportamiento obligatorio" como sustituto de la ejecución del flujo.
- Reformular, inventar o parafrasear el texto.
- Enviar más de un (1) mensaje en este turno.
- Emitir Regla/parámetro (1) si 'BIENVENIDA' SÍ está disponible.
- Emitir Regla/parámetro (2) si 'BIENVENIDA' NO está disponible.
- Ejecutar BIENVENIDA si una Regla/parámetro de enrutamiento SÍ aplica.`;

/* utilidad: type-guard para pedidos */
function isPedidoFn(el: ElementItem): el is PedidoFunctionEl {
  return (
    el.kind === "function" &&
    el.fn === "captura_datos"
  );
}

/** -------------------- Sortables -------------------- */

function SortableStepCard({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (args: { dragHandleProps: any; isDragging: boolean }) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled,
    data: { type: "step" },
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
      {children({
        dragHandleProps: { ...attributes, ...listeners },
        isDragging,
      })}
    </div>
  );
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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
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
      {children({
        dragHandleProps: { ...attributes, ...listeners },
        isDragging,
      })}
    </div>
  );
}

export function TrainingBuilder({
  flows = [],
  notificationNumber,
  onChange,
  values,
  handleChange,
  promptId,
  version,
  onVersionChange,
  initialSteps,
  registerSaveHandler,
}: TrainingBuilderProps) {
  // Compute initial state once (handles auto-init for new agents where initialSteps === undefined)
  const _initOnce = useRef<StepTraining[] | null>(null);
  if (_initOnce.current === null) {
    if (initialSteps === undefined) {
      const welcomeId = nanoid();
      _initOnce.current = [{
        id: welcomeId,
        title: WELCOME_TITLE,
        mainMessage: WELCOME_MAIN_MESSAGE,
        elements: [],
        openPicker: false,
      }];
    } else {
      _initOnce.current = initialSteps.length > 0 ? (initialSteps as StepTraining[]) : [];
    }
  }
  const _initSteps = _initOnce.current;

  const [steps, setSteps] = useState<StepTraining[]>(() => _initSteps);

  // estado de autosave
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");

  // acordeón: IDs de pasos expandidos (por defecto todos)
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(
    () => _initSteps.length <= 1 ? new Set(_initSteps.map((s) => s.id)) : new Set<string>()
  );

  const [expandedMotor, setExpandedMotor] = useState<Set<string>>(new Set());
  const toggleMotor = useCallback((id: string) => {
    setExpandedMotor((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

  const handleConflict = useCallback(
    (serverState: any) => {
      const serverSteps = serverState?.sections?.training?.steps ?? [];
      setSteps(serverSteps);
    },
    [setSteps]
  );

  const { forceSave } = useTrainingAutosave({
    promptId,
    version,
    steps,
    onVersionChange,
    onConflict: handleConflict,
    onStatusChange: setAutosaveStatus,
    mode: "manual",
  });

  useEffect(() => {
    if (!registerSaveHandler) return;
    registerSaveHandler(forceSave);
  }, [registerSaveHandler, forceSave]);

  // Reset visual de "Cambios guardados" después de un rato
  useEffect(() => {
    if (autosaveStatus === "saved") {
      const t = setTimeout(() => setAutosaveStatus("idle"), 1500);
      return () => clearTimeout(t);
    }
  }, [autosaveStatus]);

  const firstStep = steps[0];

  /* -------------------- Construcción del trainingPrompt -------------------- */
  const trainingPrompt = useMemo(() => {
    return buildSectionedPrompt(steps as AnyStep[], {
      emptyMessage: "Aun no has agregado pasos de entrenamiento. Usa Agregar paso para comenzar.",
      sectionLabel: (n: number, step: AnyStep) => `### PASO ${n} - ${(step.title || "Sin titulo").toUpperCase()}`,
      elementsLabel: (n: number) => `#### ELEMENTOS DEL PASO ${n}:`,
      mainMessageLabel: (n: number) => `OBJETIVO/RESPUESTA PRINCIPAL DEL PASO ${n}:`,
      joinSeparator: "\n",
      showMotorFlujo: true,
    });
  }, [steps]);

  /* --------- Propagar cambios: onChange (compat) + values.training --------- */
  useEffect(() => {
    if (firstStep) {
      onChange?.({
        mainMessage: firstStep.mainMessage ?? "",
        elements: firstStep.elements,
      });
    }

    if (values.training !== trainingPrompt) {
      const setTraining = handleChange("training");
      setTraining({
        target: { value: trainingPrompt },
      } as React.ChangeEvent<HTMLTextAreaElement>);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainingPrompt, onChange]);

  /* -------------------- Acciones por PASO -------------------- */
  const addStep = () => {
    const newId = nanoid();
    if (steps.length === 0) {
      setSteps((prev) => [
        ...prev,
        {
          id: newId,
          title: WELCOME_TITLE,
          mainMessage: WELCOME_MAIN_MESSAGE,
          elements: [],
          openPicker: false,
        },
      ]);
      setExpandedSteps((prev) => new Set(Array.from(prev).concat(newId)));
      return;
    }

    setSteps((prev) => [
      ...prev,
      { id: newId, title: ``, mainMessage: "", elements: [], openPicker: false },
    ]);
    setExpandedSteps((prev) => new Set(Array.from(prev).concat(newId)));
  };

  const removeStep = (stepId: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== stepId));
  };

  const duplicateStep = (stepId: string) => {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === stepId);
      if (idx < 0) return prev;
      const original = prev[idx];
      const copy: StepTraining = {
        ...original,
        id: nanoid(),
        title: `${original.title} (COPIA)`,
        elements: original.elements.map((el) => ({ ...el, id: nanoid() })),
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      setExpandedSteps((es) => new Set([...es, copy.id]));
      return next;
    });
  };

  const updateStepTitle = (stepId: string, title: string) => {
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, title: title.toUpperCase() } : s)));
  };

  const updateStepMainMessage = (stepId: string, mainMessage: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, mainMessage } : s))
    );
  };

  const removeElement = (stepId: string, elId: string) => {
    setSteps((prev) =>
      prev.map((s) =>
        s.id === stepId
          ? { ...s, elements: s.elements.filter((e) => e.id !== elId) }
          : s
      )
    );
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
              e.id === elId && e.kind === "function" && e.fn === "ejecutar_flujo"
                ? { ...e, flowId: flow.id, flowName: flow.name }
                : e
            ),
          }
          : s
      )
    );
  };

  /* ----- Campos personalizados para "Pedidos" dentro de captura_datos ----- */
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

  const updateStepVariable = (stepId: string, value: string) => {
    setSteps((prev) => prev.map((s) => s.id === stepId ? { ...s, variableQueRecoge: value } : s));
  };

  const updateStepCondicion = (stepId: string, value: string) => {
    setSteps((prev) => prev.map((s) => s.id === stepId ? { ...s, condicionParaAvanzar: value } : s));
  };

  const updateRoutingRules = (stepId: string, elId: string, rules: RoutingRule[]) => {
    setSteps((prev) =>
      prev.map((s) =>
        s.id === stepId
          ? {
              ...s,
              elements: s.elements.map((e) =>
                e.id === elId && e.kind === "function" && e.fn === "enrutamiento"
                  ? { ...e, rules }
                  : e
              ),
            }
          : s
      )
    );
  };

  const onSubtypeChange = (stepId: string, elId: string, subtype: DataSubtype) => {
    setSteps((prev) =>
      prev.map((s) =>
        s.id === stepId
          ? {
            ...s,
            elements: s.elements.map((e) => (e.id === elId ? { ...e, subtype } : e)),
          }
          : s
      )
    );
  };

  /** -------------------- dnd-kit config -------------------- */
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const stepIds = useMemo(() => steps.map((s) => s.id), [steps]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeType = active.data.current?.type;

      // 1) Reordenar pasos
      if (activeType === "step") {
        if (active.id === over.id) return;
        setSteps((prev) => {
          const oldIndex = prev.findIndex((s) => s.id === active.id);
          const newIndex = prev.findIndex((s) => s.id === over.id);
          if (oldIndex < 0 || newIndex < 0) return prev;
          return arrayMove(prev, oldIndex, newIndex);
        });
        return;
      }

      // 2) Reordenar elementos dentro del mismo paso
      if (activeType === "element") {
        const activeStepId = active.data.current?.stepId as string | undefined;
        const overStepId = over.data.current?.stepId as string | undefined;

        // Solo reordenamos si están dentro del mismo step (mínimo cambio / sin mover entre pasos)
        if (!activeStepId || !overStepId || activeStepId !== overStepId) return;
        if (active.id === over.id) return;

        setSteps((prev) =>
          prev.map((s) => {
            if (s.id !== activeStepId) return s;
            const oldIndex = s.elements.findIndex((e) => e.id === active.id);
            const newIndex = s.elements.findIndex((e) => e.id === over.id);
            if (oldIndex < 0 || newIndex < 0) return s;
            return { ...s, elements: arrayMove(s.elements, oldIndex, newIndex) };
          })
        );
      }
    },
    [setSteps]
  );

  /* --------------------------------- UI --------------------------------- */
  return (
    <Card className="border-muted/60">
      <CardHeader className="pb-2 flex items-center justify-between gap-2 flex-row">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base uppercase">Entrenamiento</CardTitle>

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

        <div className="flex items-center gap-2">
          {steps.length > 1 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              onClick={expandedSteps.size === 0 ? expandAll : collapseAll}
            >
              {expandedSteps.size === 0 ? "Expandir todo" : "Colapsar todo"}
            </Button>
          )}
          {steps.length < 1 && (
            <Button size="sm" onClick={addStep} className="gap-2">
              <Plus className="w-4 h-4" />
              Agregar paso
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {steps.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-2">
            No has creado pasos. Crea tu primer paso con Agregar paso.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={stepIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-4">
                {steps.map((step, idx) => {
                  const lockWelcome = step.title === WELCOME_TITLE; // bloquea drag del welcome (opcional)

                  return (
                    <SortableStepCard
                      key={step.id}
                      id={step.id}
                      disabled={lockWelcome}
                    >
                      {({ dragHandleProps, isDragging }) => {
                        const isExpanded = expandedSteps.has(step.id) && !isDragging;

                        return (
                          <Card className="bg-muted/20 border-muted/60 overflow-hidden">
                            {/* ---- Header siempre visible ---- */}
                            <div className="flex items-center justify-between gap-1 px-3 py-3">
                              {/* Izquierda: drag + número + título */}
                              <div className="flex items-center gap-1 min-w-0 flex-1">
                                {/* Drag handle */}
                                <div
                                  className={[
                                    "h-8 w-6 flex items-center justify-center rounded text-muted-foreground shrink-0",
                                    lockWelcome
                                      ? "opacity-30 cursor-not-allowed"
                                      : "cursor-grab active:cursor-grabbing hover:text-foreground hover:bg-muted/50",
                                  ].join(" ")}
                                  title={lockWelcome ? "Paso fijo" : "Arrastrar paso"}
                                  {...(!lockWelcome ? dragHandleProps : {})}
                                >
                                  <GripVertical className="h-4 w-4" />
                                </div>

                                {/* Número */}
                                <span className="text-sm font-semibold shrink-0">
                                  Paso {idx + 1}
                                </span>

                                {/* Título */}
                                {isExpanded ? (
                                  <Input
                                    id={step.id}
                                    value={step.title}
                                    onChange={(e) => updateStepTitle(step.id, e.target.value)}
                                    className="h-7 text-sm w-1/2"
                                    placeholder="Título del paso"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    className="flex-1 text-left text-sm font-medium truncate hover:text-foreground transition-colors"
                                    onClick={() => toggleStep(step.id)}
                                  >
                                    {step.title || (
                                      <span className="text-muted-foreground italic">Sin título</span>
                                    )}
                                  </button>
                                )}

                                {/* Badge colapsado */}
                                {!isExpanded && step.elements.length > 0 && (
                                  <Badge variant="secondary" className="shrink-0 text-xs">
                                    {step.elements.length} {step.elements.length === 1 ? "elemento" : "elementos"}
                                  </Badge>
                                )}
                              </div>

                              {/* Derecha: chevron + duplicar + eliminar */}
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
                                  onClick={() => toggleStep(step.id)}
                                  title={isExpanded ? "Colapsar" : "Expandir"}
                                >
                                  <ChevronDown
                                    className="h-4 w-4 transition-transform duration-200"
                                    style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                                  />
                                </button>
                                {!lockWelcome && (
                                  <button
                                    type="button"
                                    className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
                                    onClick={() => duplicateStep(step.id)}
                                    title="Duplicar paso"
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>

                              {/* Eliminar */}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <button
                                    type="button"
                                    className="h-9 w-9 flex items-center justify-center rounded bg-destructive text-white hover:bg-destructive/90 transition-colors shrink-0"
                                    title="Eliminar paso"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Eliminar entrenamiento</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      ¿Seguro que quieres eliminar este entrenamiento? Esta
                                      acción no se puede deshacer.
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

                            {/* ---- Contenido colapsable (animado con grid trick) ---- */}
                            <div
                              style={{
                                display: "grid",
                                gridTemplateRows: isExpanded ? "1fr" : "0fr",
                                transition: "grid-template-rows 200ms ease",
                              }}
                            >
                              <div className="overflow-hidden">
                                <CardContent className="space-y-3 pt-0 pb-3 px-0">
                                  <div className="pl-10 pr-3 space-y-2">
                                    <StepTemplatePicker
                                      label={`Objetivo/respuesta principal del paso ${idx + 1}`}
                                      disabled={step.title === WELCOME_TITLE}
                                      onApply={(content) => updateStepMainMessage(step.id, content)}
                                    />
                                    <Textarea
                                      value={step.mainMessage}
                                      onChange={(e) => updateStepMainMessage(step.id, e.target.value)}
                                      placeholder="Escribe el mensaje inicial para este paso…"
                                      className="min-h-[32px]"
                                      disabled={step.title === WELCOME_TITLE}
                                    />
                                  </div>

                                  {/* Motor de Flujo */}
                                  <div className="pl-10 pr-3">
                                    <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/10 px-3 py-2 space-y-2">
                                      <button
                                        type="button"
                                        onClick={() => toggleMotor(step.id)}
                                        className="flex items-center justify-between w-full"
                                      >
                                        <p className="text-xs font-semibold text-foreground/60 uppercase tracking-widest">Motor de Flujo</p>
                                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                      </button>
                                      {expandedMotor.has(step.id) && (
                                        <div className="grid grid-cols-2 gap-3">
                                          <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-foreground/70">Variable que recoge</label>
                                            <Input
                                              value={step.variableQueRecoge ?? ""}
                                              onChange={(e) => updateStepVariable(step.id, e.target.value)}
                                              placeholder="ej: nombre_usuario"
                                              className="h-8 text-sm"
                                            />
                                          </div>
                                          <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-foreground/70">Condicion para avanzar</label>
                                            <Input
                                              value={step.condicionParaAvanzar ?? ""}
                                              onChange={(e) => updateStepCondicion(step.id, e.target.value)}
                                              placeholder="ej: datos completos"
                                              className="h-8 text-sm"
                                            />
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <Separator />

                                  <div className="space-y-2">
                                    {step.elements.length === 0 ? (
                                      <div className="text-center text-sm text-muted-foreground py-2">
                                        No hay elementos en este paso. Agrega funciones o textos
                                        usando los botones de abajo.
                                      </div>
                                    ) : (
                                      <SortableContext
                                        items={step.elements.map((e) => e.id)}
                                        strategy={verticalListSortingStrategy}
                                      >
                                        <div className="space-y-3">
                                          {step.elements.map((el) => (
                                            <SortableElementRow key={el.id} id={el.id} stepId={step.id}>
                                              {({ dragHandleProps: elDragHandleProps }) => (
                                                <div className="flex items-start gap-2">
                                                  <div
                                                    className="h-8 w-8 mt-2 flex items-center justify-center rounded text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing hover:text-foreground hover:bg-muted/50"
                                                    title="Arrastrar elemento"
                                                    {...elDragHandleProps}
                                                  >
                                                    <GripVertical className="h-4 w-4" />
                                                  </div>
                                                  <div className="flex-1">
                                                    <ElementRenderer
                                                      stepId={step.id}
                                                      el={el}
                                                      flows={flows}
                                                      removeElement={removeElement}
                                                      updateText={updateText}
                                                      setFlowOnElement={setFlowOnElement}
                                                      addPedidoField={addPedidoField}
                                                      removePedidoField={removePedidoField}
                                                      onSubtypeChange={onSubtypeChange}
                                                      steps={steps}
                                                      updateRoutingRules={updateRoutingRules}
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

                                  <div className="pl-10 pr-3 flex items-center justify-between flex-wrap gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-semibold">Elementos del paso</span>
                                      <Badge variant="secondary">{idx + 1}</Badge>
                                    </div>
                                    <div className="flex gap-2">
                                      <FunctionSelector
                                        step={step}
                                        setSteps={setSteps}
                                        notificationNumber={notificationNumber ?? ""}
                                        steps={steps}
                                      />
                                    </div>
                                  </div>
                                </CardContent>
                              </div>
                            </div>
                          </Card>
                        );
                      }}
                    </SortableStepCard>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>

      {steps.length > 0 && (
        <CardFooter className="pb-2 flex justify-end">
          <Button size="sm" onClick={addStep} className="gap-2">
            <Plus className="w-4 h-4" />
            Agregar paso
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}