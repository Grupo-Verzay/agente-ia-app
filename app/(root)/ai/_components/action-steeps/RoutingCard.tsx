"use client";

import { FC, useState } from "react";
import { nanoid } from "nanoid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, GitBranch, AlertTriangle, ChevronDown, Info, Tag, ArrowRight } from "lucide-react";
import {
    Popover,
    PopoverTrigger,
    PopoverContent,
} from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { PropsRouting, RoutingRule } from "@/types/agentAi";

export const RoutingCard: FC<PropsRouting> = ({
    el,
    onRemove,
    steps,
    onUpdateRules,
    isManagement,
}) => {
    const [expanded, setExpanded] = useState(false);
    const otherSteps = steps.filter((s) => s.title && s.title.trim() !== "");

    const addRule = () => {
        onUpdateRules([
            ...el.rules,
            { id: nanoid(), keywords: "", targetStepName: "" },
        ]);
    };

    const removeRule = (id: string) => {
        onUpdateRules(el.rules.filter((r) => r.id !== id));
    };

    const updateKeywords = (id: string, value: string) => {
        onUpdateRules(
            el.rules.map((r) => (r.id === id ? { ...r, keywords: value } : r))
        );
    };

    const updateTarget = (id: string, stepName: string) => {
        onUpdateRules(
            el.rules.map((r) =>
                r.id === id ? { ...r, targetStepName: stepName } : r
            )
        );
    };

    return (
        <Card className="bg-muted/20 border-muted/60">
            <CardHeader className="py-3 flex-row items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="flex items-center gap-2 flex-1 min-w-0"
                >
                    <GitBranch className="h-4 w-4 text-blue-500 shrink-0" />
                    <CardTitle className="text-sm font-semibold uppercase tracking-wide">
                        Enrutamiento por paso
                    </CardTitle>
                    {el.rules.length > 0 && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0">
                            {el.rules.length}
                        </Badge>
                    )}
                    <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground ml-auto transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>
                {!isManagement && (
                    <Button
                        variant="destructive"
                        size="icon"
                        onClick={onRemove}
                        className="shrink-0"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
            </CardHeader>

            {expanded && <CardContent className="space-y-3 pt-0">
                <div className="flex items-start gap-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 px-3 py-2">
                    <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-blue-700 dark:text-blue-300 leading-relaxed">
                        Define palabras clave específicas y el paso destino. Tiene prioridad sobre el modo de inicio del flujo.
                    </p>
                </div>

                {el.rules.length > 0 && (
                    <div className="space-y-2">
                        {el.rules.map((rule, idx) => {
                            const targetExists = otherSteps.some(
                                (s) => s.title?.toUpperCase() === rule.targetStepName.toUpperCase()
                            );
                            const showWarning = !!rule.targetStepName && !targetExists;

                            return (
                                <div
                                    key={rule.id}
                                    className="rounded-lg border bg-background overflow-hidden"
                                >
                                    {/* Header de regla */}
                                    <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b">
                                        <div className="flex items-center gap-2">
                                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 text-[10px] font-bold">
                                                {idx + 1}
                                            </span>
                                            <span className="text-xs font-semibold">Regla {idx + 1}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeRule(rule.id)}
                                            className="text-muted-foreground/40 hover:text-destructive transition-colors"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>

                                    {/* Cuerpo */}
                                    <div className="p-3 space-y-3">
                                        <div className="space-y-1.5">
                                            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80">
                                                <Tag className="h-3 w-3 shrink-0" />
                                                Palabras clave <span className="font-normal text-muted-foreground">(separadas por coma)</span>
                                            </label>
                                            <Input
                                                value={rule.keywords}
                                                onChange={(e) => updateKeywords(rule.id, e.target.value)}
                                                placeholder="ej: plan básico, empezar, vz-basic"
                                                className="h-9 text-sm"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80">
                                                <ArrowRight className="h-3 w-3 shrink-0" />
                                                Ir al paso
                                            </label>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        className={`w-full justify-between h-9 text-sm font-normal ${showWarning ? "border-amber-400 text-amber-600" : ""}`}
                                                    >
                                                        {rule.targetStepName || <span className="text-muted-foreground">Seleccionar paso…</span>}
                                                        <ChevronDown className="h-4 w-4 opacity-50" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent align="start" side="bottom" className="p-0 w-[var(--radix-popover-trigger-width)]">
                                                    <Command>
                                                        <CommandInput placeholder="Buscar paso…" />
                                                        <CommandList>
                                                            <CommandEmpty className="text-xs py-3 text-center">Sin resultados</CommandEmpty>
                                                            <CommandGroup>
                                                                {otherSteps.map((s) => (
                                                                    <CommandItem
                                                                        key={s.id}
                                                                        onSelect={() => updateTarget(rule.id, s.title ?? "")}
                                                                    >
                                                                        {s.title}
                                                                    </CommandItem>
                                                                ))}
                                                            </CommandGroup>
                                                        </CommandList>
                                                    </Command>
                                                </PopoverContent>
                                            </Popover>
                                            {showWarning && (
                                                <p className="flex items-center gap-1 text-xs text-amber-500">
                                                    <AlertTriangle className="h-3 w-3 shrink-0" />
                                                    El paso &quot;{rule.targetStepName}&quot; fue renombrado o eliminado
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="flex items-center justify-between !mt-4 mb-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>Si el mensaje contiene</span>
                        <ArrowRight className="h-3 w-3 shrink-0" />
                        <span>ir al paso seleccionado</span>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addRule}
                        className="gap-1.5 border-dashed border-primary/40 text-primary hover:bg-primary/10 hover:border-primary hover:text-primary"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Agregar regla
                    </Button>
                </div>
            </CardContent>}
        </Card>
    );
};
