"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
} from "lucide-react";

import { updateCrmPromptRule } from "@/actions/crm-prompt-rule-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CRM_LEAD_STATUS_PROMPT_DEFAULTS,
  CRM_PROMPT_LEAD_STATUS_ORDER,
  buildLeadStatusPromptFromConfig,
  type CrmLeadStatusPromptConfig,
  type CrmPromptRecord,
} from "@/lib/crm-ai-prompt-rules";
import { toast } from "sonner";
import { getLeadStatusLabel } from "../../dashboard/helpers";
import { CrmWizardStep, CrmWizardStepper } from "./CrmWizardStepper";

const STEPS: CrmWizardStep[] = [
  {
    id: "base",
    title: "Marco base",
    description: "Define el rol, la salida y las reglas generales.",
  },
  {
    id: "definitions",
    title: "Definiciones",
    description: "Ajusta como entiende la IA cada estado comercial.",
  },
  {
    id: "criteria",
    title: "Criterios",
    description: "Especifica como decide entre frio, tibio, caliente o cierre.",
  },
  {
    id: "preview",
    title: "Previsualización",
    description: "Audita el prompt final antes de publicarlo.",
  },
];

function serializeConfig(config: CrmLeadStatusPromptConfig) {
  return JSON.stringify(config);
}

function formatTimestamp(value: string | null) {
  if (!value) return "Sin publicar";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Sin publicar";

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export function CrmLeadStatusPromptWizard({
  userId,
  record,
  onSaved,
}: {
  userId: string;
  record: CrmPromptRecord<CrmLeadStatusPromptConfig>;
  onSaved: (record: CrmPromptRecord<CrmLeadStatusPromptConfig>) => void;
}) {
  const [currentStep, setCurrentStep] = useState<string>(STEPS[0].id);
  const [draft, setDraft] = useState<CrmLeadStatusPromptConfig>(record.config);
  const [isSaving, startSavingTransition] = useTransition();

  useEffect(() => {
    setDraft(record.config);
  }, [record]);

  const promptPreview = useMemo(
    () => buildLeadStatusPromptFromConfig(draft),
    [draft]
  );

  const hasChanges = useMemo(
    () => serializeConfig(draft) !== serializeConfig(record.config),
    [draft, record.config]
  );

  const stepIndex = STEPS.findIndex((step) => step.id === currentStep);
  const canGoBack = stepIndex > 0;
  const canGoForward = stepIndex < STEPS.length - 1;

  const patchDraft = (
    patch:
      | Partial<CrmLeadStatusPromptConfig>
      | ((current: CrmLeadStatusPromptConfig) => CrmLeadStatusPromptConfig)
  ) => {
    setDraft((current) =>
      typeof patch === "function" ? patch(current) : { ...current, ...patch }
    );
  };

  const patchDefinition = (
    status: (typeof CRM_PROMPT_LEAD_STATUS_ORDER)[number],
    value: string
  ) => {
    setDraft((current) => ({
      ...current,
      definitions: {
        ...current.definitions,
        [status]: value,
      },
    }));
  };

  const handleSave = () => {
    if (!hasChanges) {
      toast.message("No hay cambios pendientes en la clasificacion.");
      return;
    }

    startSavingTransition(async () => {
      const result = await updateCrmPromptRule({
        userId,
        kind: "leadStatus",
        config: draft,
      });

      if (!result.success || !result.data) {
        toast.error(result.message);
        return;
      }

      onSaved(result.data);
      toast.success("Prompt de clasificacion actualizado.");
    });
  };

  let content = null;

  if (currentStep === "base") {
    content = (
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] [&>*]:min-w-0">
        <Card className="min-w-0 border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Identidad y salida</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Rol del clasificador</Label>
              <Textarea
                rows={3}
                value={draft.role}
                onChange={(event) => patchDraft({ role: event.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Regla de formato de respuesta</Label>
              <Textarea
                rows={3}
                value={draft.responseFormatRule}
                onChange={(event) =>
                  patchDraft({ responseFormatRule: event.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Regla para el campo reason</Label>
              <Textarea
                rows={3}
                value={draft.reasonRule}
                onChange={(event) =>
                  patchDraft({ reasonRule: event.target.value })
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Guardrails</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between gap-3 rounded-2xl border border-border/70 bg-muted/30 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Usar solo la sintesis del CRM</p>
                <p className="text-sm text-muted-foreground">
                  Si esta activa, el prompt impide inventar contexto fuera del
                  resumen disponible.
                </p>
              </div>
              <Switch
                checked={draft.useOnlySummary}
                onCheckedChange={(checked) =>
                  patchDraft({ useOnlySummary: checked })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Instrucciones extra</Label>
              <Textarea
                rows={8}
                placeholder="Una instruccion por linea"
                value={draft.extraInstructions}
                onChange={(event) =>
                  patchDraft({ extraInstructions: event.target.value })
                }
              />
              <p className="text-sm text-muted-foreground">
                Cada linea adicional se agrega como una regla nueva del prompt.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentStep === "definitions") {
    content = (
      <div className="grid min-w-0 gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        {CRM_PROMPT_LEAD_STATUS_ORDER.map((status) => (
          <Card key={status} className="border-border/70">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">
                  {getLeadStatusLabel(status)}
                </CardTitle>
                <Badge variant="outline">{status}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={5}
                value={draft.definitions[status]}
                onChange={(event) =>
                  patchDefinition(status, event.target.value)
                }
              />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (currentStep === "criteria") {
    const criteriaFields = [
      { key: "discardedRule", label: "Cuando debe ser DESCARTADO" },
      { key: "finalizedRule", label: "Cuando debe ser FINALIZADO" },
      { key: "hotRule", label: "Cuando debe ser CALIENTE" },
      { key: "warmRule", label: "Cuando debe ser TIBIO" },
      { key: "coldRule", label: "Cuando debe ser FRIO" },
    ] as const;

    content = (
      <div className="grid min-w-0 gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        {criteriaFields.map((field) => (
          <Card key={field.key} className="border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{field.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={5}
                value={draft[field.key]}
                onChange={(event) =>
                  patchDraft({ [field.key]: event.target.value })
                }
              />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (currentStep === "preview") {
    content = (
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] [&>*]:min-w-0">
        <Card className="min-w-0 border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Resumen publicado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <p className="font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Ultima actualizacion
              </p>
              <p className="mt-2 text-sm font-medium">
                {formatTimestamp(record.updatedAt)}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Keyword de validacion</Label>
              <Input
                readOnly
                value={CRM_PROMPT_LEAD_STATUS_ORDER.join(", ")}
              />
            </div>

            <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 text-foreground">
              <p className="text-sm font-medium">
                El backend solo va a consumir este prompt final.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Si lo modificas desde el wizard, la clasificacion de estados por
                usuario cambia sin tocar codigo duro en `api-webhook`.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Prompt generado</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              readOnly
              rows={24}
              value={promptPreview}
              className="min-h-[520px] font-mono"
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-hidden">
      <div className="min-w-0 shrink-0 space-y-4">
        <div className="flex flex-row items-center gap-2 text-sm">
          <Tooltip delayDuration={120}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Informacion sobre Lead status IA"
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Badge
                  variant="outline"
                  className="border-primary/20 bg-primary/5 text-primary"
                >
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  Lead status IA
                </Badge>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-72 sm:hidden">
              Clasifica cada lead segun el criterio comercial definido por el
              cliente.
            </TooltipContent>
          </Tooltip>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            Clasifica cada lead segun el criterio comercial definido por el
            cliente.
          </span>
        </div>

        <CrmWizardStepper
          steps={STEPS}
          currentStep={currentStep}
          onStepChange={setCurrentStep}
        />
      </div>

      <div className="min-h-0 min-w-0 flex-1">
        <ScrollArea className="h-full min-w-0 pr-4">
          <div className="min-w-0 space-y-4">
            {content}
          </div>
        </ScrollArea>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/70 py-2">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!canGoBack}
            onClick={() => setCurrentStep(STEPS[Math.max(stepIndex - 1, 0)].id)}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canGoForward}
            onClick={() =>
              setCurrentStep(
                STEPS[Math.min(stepIndex + 1, STEPS.length - 1)].id
              )
            }
          >
            Siguiente
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setDraft(record.config)}
            disabled={!hasChanges || isSaving}
          >
            Resetear cambios
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setDraft(CRM_LEAD_STATUS_PROMPT_DEFAULTS)}
            disabled={isSaving}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Defaults actuales
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Guardar clasificacion
          </Button>
        </div>
      </div>
    </div>
  );
}
