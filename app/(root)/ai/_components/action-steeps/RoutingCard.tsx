"use client";

import { FC } from "react";
import { nanoid } from "nanoid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, GitBranch, AlertTriangle } from "lucide-react";
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
            <CardHeader className="py-3 flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-blue-500" />
                    <CardTitle className="text-md uppercase">Enrutamiento por campaña</CardTitle>
                </div>
                {!isManagement && (
                    <Button
                        variant="secondary"
                        size="icon"
                        onClick={onRemove}
                        className="bg-gray-400 hover:bg-gray-500 text-white dark:bg-zinc-600 dark:hover:bg-zinc-500"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
            </CardHeader>

            <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                    Define palabras clave y el paso destino. Se evalúa antes del saludo de bienvenida.
                </p>

                {el.rules.length === 0 && (
                    <p className="text-xs text-muted-foreground italic text-center py-2">
                        Sin reglas. Agrega una con el botón de abajo.
                    </p>
                )}

                <div className="space-y-2">
                    {el.rules.map((rule, idx) => {
                        const targetExists = otherSteps.some(
                            (s) => s.title?.toUpperCase() === rule.targetStepName.toUpperCase()
                        );
                        const showWarning = rule.targetStepName && !targetExists;

                        return (
                            <div key={rule.id} className="flex flex-col gap-1.5 p-2 rounded-lg border bg-background">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-muted-foreground">
                                        Regla {idx + 1}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => removeRule(rule.id)}
                                        className="text-muted-foreground hover:text-destructive transition-colors"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">
                                        Palabras clave (separadas por coma)
                                    </label>
                                    <Input
                                        value={rule.keywords}
                                        onChange={(e) => updateKeywords(rule.id, e.target.value)}
                                        placeholder='ej: vz-basico, básico, plan básico, empezar'
                                        className="h-8 text-xs"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">Ir al paso</label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                className={`w-full justify-between h-8 text-xs ${showWarning ? "border-amber-400" : ""}`}
                                            >
                                                {rule.targetStepName || "Seleccionar paso…"}
                                                <Plus className="h-3.5 w-3.5 opacity-60" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent align="start" className="p-0 w-[280px]">
                                            <Command>
                                                <CommandInput placeholder="Buscar paso…" />
                                                <CommandList>
                                                    <CommandEmpty>Sin resultados…</CommandEmpty>
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
                                            <AlertTriangle className="h-3 w-3" />
                                            El paso &quot;{rule.targetStepName}&quot; fue renombrado o eliminado
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addRule}
                    className="w-full gap-1"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Agregar regla
                </Button>
            </CardContent>
        </Card>
    );
};
