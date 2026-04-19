"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ChevronLeft,
    ChevronRight,
    Loader2,
    RotateCcw,
    Settings2,
    Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TimeInput } from "@/components/shared/TimeInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
    CRM_FOLLOW_UP_RULE_STATUS_ORDER,
    CRM_FOLLOW_UP_WEEKDAY_OPTIONS,
    type CrmFollowUpRuleConfig,
} from "@/lib/crm-follow-up-rules";
import { cn, SERVER_TIME_ZONE } from "@/lib/utils";
import { getLeadStatusLabel } from "../../dashboard/helpers";
import { LoadingState } from "./LoadingState";
import { CrmWizardStep, CrmWizardStepper } from "./CrmWizardStepper";

type CrmFollowUpWizardProps = {
    rules: CrmFollowUpRuleConfig[];
    loading: boolean;
    timezone: string | null;
    timeOptions: string[];
    hasChanges: boolean;
    isSaving: boolean;
    handleResetAll: () => void;
    handleSave: () => void;
    onPatchRule: (
        leadStatus: CrmFollowUpRuleConfig["leadStatus"],
        patch: Partial<CrmFollowUpRuleConfig>
    ) => void;
    onToggleWeekday: (
        leadStatus: CrmFollowUpRuleConfig["leadStatus"],
        weekday: number
    ) => void;
    onResetRuleToDefault: (
        leadStatus: CrmFollowUpRuleConfig["leadStatus"]
    ) => void;
};

const MAX_DELAY_MINUTES = 43_200;

function formatDelayMinutesForTimeInput(delayMinutes: number) {
    const safeDelayMinutes = Math.min(
        Math.max(Number(delayMinutes) || 0, 0),
        MAX_DELAY_MINUTES
    );

    if (safeDelayMinutes > 0 && safeDelayMinutes % (24 * 60) === 0) {
        return `days-${safeDelayMinutes / (24 * 60)}`;
    }

    if (safeDelayMinutes > 0 && safeDelayMinutes % 60 === 0) {
        return `hours-${safeDelayMinutes / 60}`;
    }

    return `minutes-${safeDelayMinutes}`;
}

function parseTimeInputValueToDelayMinutes(value: string) {
    const [unit, rawAmount] = value.split("-");
    const amount = Math.max(Number.parseInt(rawAmount ?? "0", 10) || 0, 0);

    switch (unit) {
        case "seconds":
            return Math.min(Math.floor(amount / 60), MAX_DELAY_MINUTES);
        case "minutes":
            return Math.min(amount, MAX_DELAY_MINUTES);
        case "hours":
            return Math.min(amount * 60, MAX_DELAY_MINUTES);
        case "days":
            return Math.min(amount * 24 * 60, MAX_DELAY_MINUTES);
        default:
            return 0;
    }
}

function DelayTimeInput({
    value,
    disabled,
    onChange,
}: {
    value: number;
    disabled: boolean;
    onChange: (delayMinutes: number) => void;
}) {
    const safeValue = Math.min(Math.max(Number(value) || 0, 0), MAX_DELAY_MINUTES);
    const [draftValue, setDraftValue] = useState(() =>
        formatDelayMinutesForTimeInput(safeValue)
    );
    const [instanceKey, setInstanceKey] = useState(0);

    useEffect(() => {
        if (parseTimeInputValueToDelayMinutes(draftValue) === safeValue) {
            return;
        }

        setDraftValue(formatDelayMinutesForTimeInput(safeValue));
        setInstanceKey((current) => current + 1);
    }, [draftValue, safeValue]);

    const handleChange = useCallback(
        (nextValue: string) => {
            setDraftValue(nextValue);
            const nextDelayMinutes = parseTimeInputValueToDelayMinutes(nextValue);

            if (!disabled && nextDelayMinutes !== safeValue) {
                onChange(nextDelayMinutes);
            }
        },
        [disabled, onChange, safeValue]
    );

    return (
        <fieldset disabled={disabled} className={cn(disabled && "opacity-60 h-full")}>
            <TimeInput
                key={instanceKey}
                className={cn("text-lg", disabled && "pointer-events-none")}
                currentValue={draftValue}
                onChange={handleChange}
            />
        </fieldset>
    );
}

export function CrmFollowUpWizard({
    rules,
    loading,
    timezone,
    timeOptions,
    hasChanges,
    isSaving,
    handleResetAll,
    handleSave,
    onPatchRule,
    onToggleWeekday,
    onResetRuleToDefault,
}: CrmFollowUpWizardProps) {
    const steps = useMemo<CrmWizardStep[]>(
        () => [
            ...CRM_FOLLOW_UP_RULE_STATUS_ORDER.map((status) => ({
                id: status,
                title: getLeadStatusLabel(status),
                description:
                    status === "FINALIZADO" || status === "DESCARTADO"
                        ? "Estados de cierre con comportamiento especial."
                        : "Configura la ventana, reglas y mensaje de follow-up.",
            })),
            {
                id: "summary",
                title: "Resumen",
                description: "Revisa la configuracion final antes de guardar.",
            },
        ],
        []
    );

    const [currentStep, setCurrentStep] = useState<string>(steps[0]?.id ?? "summary");

    const stepIndex = steps.findIndex((step) => step.id === currentStep);
    const canGoBack = stepIndex > 0;
    const canGoForward = stepIndex < steps.length - 1;

    const currentRule =
        currentStep !== "summary"
            ? rules.find((item) => item.leadStatus === currentStep)
            : null;
    const currentLeadStatus = currentRule?.leadStatus ?? null;
    const handleDelayMinutesChange = useCallback(
        (delayMinutes: number) => {
            if (!currentLeadStatus) return;

            onPatchRule(currentLeadStatus, { delayMinutes });
        },
        [currentLeadStatus, onPatchRule]
    );

    if (loading && rules.length === 0) {
        return <LoadingState label="Cargando reglas de follow-up..." />;
    }

    let content = null;

    if (currentStep === "summary") {
        content = (
            <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
                <Card className="border-border/70">
                    <CardHeader>
                        <CardTitle className="text-base">Resumen general</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                        <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                            <p className="font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                Zona horaria activa
                            </p>
                            <p className="mt-2 text-sm font-medium">
                                {SERVER_TIME_ZONE || "America/Bogota"}
                            </p>
                        </div>

                        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 text-foreground">
                            <p className="text-sm font-medium">
                                Cada estado tiene su propia regla de recontacto.
                            </p>
                            <p className="mt-2 text-sm text-muted-foreground">
                                El sistema usa delay, dias habilitados, ventana horaria, prompt y fallback
                                para decidir cuando y como enviar cada follow-up.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/70">
                    <CardHeader>
                        <CardTitle className="text-base">Estados configurados</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {CRM_FOLLOW_UP_RULE_STATUS_ORDER.map((leadStatus) => {
                            const rule = rules.find((item) => item.leadStatus === leadStatus);
                            if (!rule) return null;

                            return (
                                <div
                                    key={leadStatus}
                                    className="rounded-2xl border border-border/70 bg-background p-4"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="space-y-1">
                                            <p className="font-medium">{getLeadStatusLabel(leadStatus)}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {rule.enabled
                                                    ? `${rule.delayMinutes} min · ${rule.maxAttempts} intentos · ${rule.sendStartTime} - ${rule.sendEndTime}`
                                                    : "Regla desactivada"}
                                            </p>
                                        </div>

                                        <Badge variant={rule.enabled ? "default" : "outline"}>
                                            {rule.enabled ? "Activa" : "Inactiva"}
                                        </Badge>
                                    </div>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            </div>
        );
    } else if (currentRule) {
        const leadStatus = currentRule.leadStatus;

        content = (
            <Card className="border-border/70">
                <CardHeader className="pb-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                            <CardTitle className="text-base">
                                {getLeadStatusLabel(leadStatus)}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                                {leadStatus === "FINALIZADO" || leadStatus === "DESCARTADO"
                                    ? "Estados de cierre: por defecto no generan nuevos follow-ups."
                                    : "El mensaje se programa despues del delay y se mueve a la siguiente ventana habilitada."}
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            <Label
                                htmlFor={`rule-enabled-${leadStatus}`}
                                className="text-sm"
                            >
                                Activa
                            </Label>
                            <Switch
                                id={`rule-enabled-${leadStatus}`}
                                checked={currentRule.enabled}
                                onCheckedChange={(checked) =>
                                    onPatchRule(leadStatus, { enabled: checked })
                                }
                            />
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="space-y-2">
                            <DelayTimeInput
                                value={currentRule.delayMinutes}
                                disabled={!currentRule.enabled}
                                onChange={handleDelayMinutesChange}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Max intentos</Label>
                            <Input
                                type="number"
                                min={0}
                                max={10}
                                value={currentRule.maxAttempts}
                                disabled={!currentRule.enabled}
                                onChange={(event) =>
                                    onPatchRule(leadStatus, {
                                        maxAttempts: Math.max(
                                            Number(event.target.value || 0),
                                            0
                                        ),
                                    })
                                }
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Desde</Label>
                            <Select
                                value={currentRule.sendStartTime}
                                disabled={!currentRule.enabled}
                                onValueChange={(value) =>
                                    onPatchRule(leadStatus, { sendStartTime: value })
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Hora inicio" />
                                </SelectTrigger>
                                <SelectContent>
                                    {timeOptions.map((option) => (
                                        <SelectItem key={option} value={option}>
                                            {option}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Hasta</Label>
                            <Select
                                value={currentRule.sendEndTime}
                                disabled={!currentRule.enabled}
                                onValueChange={(value) =>
                                    onPatchRule(leadStatus, { sendEndTime: value })
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Hora fin" />
                                </SelectTrigger>
                                <SelectContent>
                                    {timeOptions.map((option) => (
                                        <SelectItem key={option} value={option}>
                                            {option}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Dias habilitados</Label>
                        <div className="flex flex-wrap gap-2">
                            {CRM_FOLLOW_UP_WEEKDAY_OPTIONS.map((option) => {
                                const selected = currentRule.allowedWeekdays.includes(option.value);

                                return (
                                    <button
                                        key={`${leadStatus}-${option.value}`}
                                        type="button"
                                        disabled={!currentRule.enabled}
                                        className={cn(
                                            "rounded-full border px-3 py-1 text-sm transition-colors",
                                            selected
                                                ? "border-primary/25 bg-primary/10 text-primary"
                                                : "border-border bg-background text-muted-foreground",
                                            !currentRule.enabled && "cursor-not-allowed opacity-60"
                                        )}
                                        onClick={() => onToggleWeekday(leadStatus, option.value)}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-3">
                        <div className="space-y-2">
                            <Label>Objetivo</Label>
                            <Textarea
                                rows={5}
                                disabled={!currentRule.enabled}
                                value={currentRule.goal}
                                onChange={(event) =>
                                    onPatchRule(leadStatus, { goal: event.target.value })
                                }
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Prompt interno</Label>
                            <Textarea
                                rows={5}
                                disabled={!currentRule.enabled}
                                value={currentRule.prompt}
                                onChange={(event) =>
                                    onPatchRule(leadStatus, { prompt: event.target.value })
                                }
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Mensaje fallback</Label>
                            <Textarea
                                rows={5}
                                disabled={!currentRule.enabled}
                                value={currentRule.fallbackMessage}
                                onChange={(event) =>
                                    onPatchRule(leadStatus, {
                                        fallbackMessage: event.target.value,
                                    })
                                }
                            />
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onResetRuleToDefault(leadStatus)}
                        >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Restaurar defaults
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            <div className="shrink-0 space-y-4">
                {/* <div className="flex items-center gap-2 text-sm">
                    <Badge
                        variant="outline"
                        className="border-primary/20 bg-primary/5 text-primary"
                    >
                        <Sparkles className="mr-1 h-3.5 w-3.5" />
                        IA CRM
                    </Badge>
                    <span className="text-muted-foreground">
                        Zona horaria actual: {SERVER_TIME_ZONE || "America/Bogota"}
                    </span>
                </div> */}

                <CrmWizardStepper
                    steps={steps}
                    currentStep={currentStep}
                    onStepChange={setCurrentStep}
                />
            </div>

            <div className="min-h-0 flex-1">
                <ScrollArea className="h-full pr-4">
                    <div className="space-y-4">{content}</div>
                </ScrollArea>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        disabled={!canGoBack}
                        onClick={() => setCurrentStep(steps[Math.max(stepIndex - 1, 0)].id)}
                    >
                        <ChevronLeft className="mr-2 h-4 w-4" />
                        Anterior
                    </Button>

                    <Button
                        type="button"
                        variant="outline"
                        disabled={!canGoForward}
                        onClick={() =>
                            setCurrentStep(steps[Math.min(stepIndex + 1, steps.length - 1)].id)
                        }
                    >
                        Siguiente
                        <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="ghost"
                        onClick={handleResetAll}
                        disabled={!hasChanges || isSaving}
                    >
                        Resetear cambios
                    </Button>

                    <Button
                        onClick={handleSave}
                        disabled={!hasChanges || isSaving || loading}
                    >
                        {isSaving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Settings2 className="mr-2 h-4 w-4" />
                        )}
                        Guardar reglas
                    </Button>
                </div>
            </div>
        </div>
    );
}
