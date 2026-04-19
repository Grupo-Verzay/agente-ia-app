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
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CRM_LEAD_FUNNEL_PROMPT_DEFAULTS,
  CRM_LEAD_NAME_JSON_PLACEHOLDER,
  CRM_PROMPT_RECORD_TYPES,
  buildLeadFunnelPromptFromConfig,
  type CrmLeadFunnelPromptConfig,
  type CrmPromptRecord,
} from "@/lib/crm-ai-prompt-rules";
import { toast } from "sonner";
import { getTipoLabel } from "@/app/(root)/crm/helpers/getTipoLabel";
import { CrmWizardStep, CrmWizardStepper } from "./CrmWizardStepper";

const STEPS: CrmWizardStep[] = [
  {
    id: "base",
    title: "Marco base",
    description: "Define el rol del clasificador y la tarea principal.",
  },
  {
    id: "rules",
    title: "Reglas globales",
    description: "Controla guardrails, prioridad e instrucciones finales.",
  },
  {
    id: "types",
    title: "Tipos CRM",
    description: "Ajusta como reconocer solicitudes, pedidos, reservas y pagos.",
  },
  {
    id: "preview",
    title: "Previsualización",
    description: "Revisa el prompt final que consumira el backend.",
  },
];

function serializeConfig(config: CrmLeadFunnelPromptConfig) {
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

export function CrmLeadFunnelPromptWizard({
  userId,
  record,
  onSaved,
}: {
  userId: string;
  record: CrmPromptRecord<CrmLeadFunnelPromptConfig>;
  onSaved: (record: CrmPromptRecord<CrmLeadFunnelPromptConfig>) => void;
}) {
  const [currentStep, setCurrentStep] = useState<string>(STEPS[0].id);
  const [draft, setDraft] = useState<CrmLeadFunnelPromptConfig>(record.config);
  const [isSaving, startSavingTransition] = useTransition();

  useEffect(() => {
    setDraft(record.config);
  }, [record]);

  const promptPreview = useMemo(
    () => buildLeadFunnelPromptFromConfig(draft),
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
      | Partial<CrmLeadFunnelPromptConfig>
      | ((current: CrmLeadFunnelPromptConfig) => CrmLeadFunnelPromptConfig)
  ) => {
    setDraft((current) =>
      typeof patch === "function" ? patch(current) : { ...current, ...patch }
    );
  };

  const patchTypeInstruction = (
    type: (typeof CRM_PROMPT_RECORD_TYPES)[number],
    value: string
  ) => {
    setDraft((current) => ({
      ...current,
      typeInstructions: {
        ...current.typeInstructions,
        [type]: value,
      },
    }));
  };

  const handleSave = () => {
    if (!hasChanges) {
      toast.message("No hay cambios pendientes en el sintetizador.");
      return;
    }

    startSavingTransition(async () => {
      const result = await updateCrmPromptRule({
        userId,
        kind: "leadFunnel",
        config: draft,
      });

      if (!result.success || !result.data) {
        toast.error(result.message);
        return;
      }

      onSaved(result.data);
      toast.success("Prompt del sintetizador actualizado.");
    });
  };

  let content = null;

  if (currentStep === "base") {
    content = (
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] [&>*]:min-w-0">
        <Card className="min-w-0 border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Rol y decisiones base</CardTitle>
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
              <Label>Regla para caso REPORTE</Label>
              <Textarea
                rows={4}
                value={draft.reportTask}
                onChange={(event) =>
                  patchDraft({ reportTask: event.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Regla para caso REGISTRO</Label>
              <Textarea
                rows={4}
                value={draft.recordTask}
                onChange={(event) =>
                  patchDraft({ recordTask: event.target.value })
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Contrato de salida</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Salida para la sintesis</Label>
              <Textarea
                rows={4}
                value={draft.reportOutputInstruction}
                onChange={(event) =>
                  patchDraft({
                    reportOutputInstruction: event.target.value,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Resumen del registro</Label>
              <Input
                value={draft.recordSummaryInstruction}
                onChange={(event) =>
                  patchDraft({
                    recordSummaryInstruction: event.target.value,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Detalles del registro</Label>
              <Textarea
                rows={4}
                value={draft.recordDetailsInstruction}
                onChange={(event) =>
                  patchDraft({
                    recordDetailsInstruction: event.target.value,
                  })
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentStep === "rules") {
    content = (
      <div className="grid min-w-0 gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        <Card className="min-w-0 border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Reglas obligatorias</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Guardrails globales</Label>
              <Textarea
                rows={10}
                placeholder="Una regla por linea"
                value={draft.mandatoryRules}
                onChange={(event) =>
                  patchDraft({ mandatoryRules: event.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Prioridad entre tipos</Label>
              <Input
                value={draft.priorityOrder}
                onChange={(event) =>
                  patchDraft({ priorityOrder: event.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Regla especial del tipo PAGO</Label>
              <Textarea
                rows={4}
                value={draft.paymentStateRule}
                onChange={(event) =>
                  patchDraft({ paymentStateRule: event.target.value })
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Cierre del prompt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Reglas finales</Label>
              <Textarea
                rows={8}
                placeholder="Una regla por linea"
                value={draft.importantRules}
                onChange={(event) =>
                  patchDraft({ importantRules: event.target.value })
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
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentStep === "types") {
    content = (
      <div className="grid min-w-0 gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        {CRM_PROMPT_RECORD_TYPES.map((type) => (
          <Card key={type} className="border-border/70">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">{getTipoLabel(type)}</CardTitle>
                <Badge variant="outline">{type}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={6}
                value={draft.typeInstructions[type]}
                onChange={(event) =>
                  patchTypeInstruction(type, event.target.value)
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
              <Label>Placeholder dinamico</Label>
              <Input readOnly value={CRM_LEAD_NAME_JSON_PLACEHOLDER} />
            </div>

            <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 text-foreground">
              <p className="text-sm font-medium">
                El nombre del lead se inyecta de forma segura al ejecutar.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                El front define el prompt y el backend solo reemplaza el token
                `{CRM_LEAD_NAME_JSON_PLACEHOLDER}` por el valor serializado.
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
                aria-label="Informacion sobre Sintetizador IA"
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Badge
                  variant="outline"
                  className="border-primary/20 bg-primary/5 text-primary"
                >
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  Sintetizador IA
                </Badge>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-72 sm:hidden">
              Controla como la IA decide si un mensaje es reporte o registro del
              CRM y como resume cada caso.
            </TooltipContent>
          </Tooltip>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            Controla como la IA decide si un mensaje es reporte o registro del
            CRM y como resume cada caso.
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
          <div className="min-w-0 space-y-4">{content}</div>
        </ScrollArea>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
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
            onClick={() => setDraft(CRM_LEAD_FUNNEL_PROMPT_DEFAULTS)}
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
            Guardar sintetizador
          </Button>
        </div>
      </div>
    </div>
  );
}
