// components/training/cards/EjecutarFlujoCard.tsx
"use client";

import { FC } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Popover, PopoverTrigger, PopoverContent,
} from "@/components/ui/popover";
import {
    Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Plus, SquareArrowOutUpRight } from "lucide-react";
import { PropsExecuteFlow } from "@/types/agentAi";
import { getWorkflowEditorPath } from "@/types/workflow";
import { ElementMenu } from "./ElementMenu";

export const EjecutarFlujoCard: FC<PropsExecuteFlow> = ({ el, flows, onRemove, onSelectFlow, isManagement }) => {
    // El elemento guarda el id y el nombre, no el flujo entero, asi que para
    // saber a donde lleva "Abrir" hay que buscarlo en la lista. Se busca tambien
    // por nombre porque las plantillas crean el elemento con el nombre puesto y
    // el id vacio: el flujo se crea despues, y hasta que alguien lo vuelve a
    // elegir a mano el id sigue en blanco.
    const flujo =
        flows.find((f) => f.id === el.flowId) ??
        (el.flowName ? flows.find((f) => f.name === el.flowName) : undefined);

    const elegido = el.flowName ?? flujo?.name ?? null;

    return (
        <Card className="bg-muted/20 border-muted/60">
            <CardHeader className="py-2 px-3 flex-row items-center justify-between">
                <CardTitle className="text-md uppercase">Ejecutar flujo</CardTitle>
                {!isManagement && (
                    <ElementMenu onRemove={onRemove} />
                )}
            </CardHeader>

            <CardContent className="space-y-2 px-3 pb-3 pt-0">
                {flows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay flujos</p>
                ) : (
                    <div className="flex items-center gap-2">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="min-w-0 flex-1 justify-between" title={elegido ? "Cambiar de flujo" : "Elegir flujo"}>
                                    <span className="truncate">{elegido ?? "Elegir flujo…"}</span>
                                    {elegido
                                        ? <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
                                        : <Plus className="h-4 w-4 shrink-0 opacity-60" />}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="p-0 w-[320px]">
                                <Command>
                                    <CommandInput placeholder="Buscar flujo…" />
                                    <CommandList>
                                        <CommandEmpty>Sin resultados…</CommandEmpty>
                                        <CommandGroup>
                                            {flows.map((f) => (
                                                <CommandItem key={f.id} onSelect={() => onSelectFlow(f)}>
                                                    <Check className={`mr-2 h-4 w-4 ${f.id === flujo?.id ? "opacity-100" : "opacity-0"}`} />
                                                    <span className="truncate">{f.name}</span>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>

                        {/* En otra pestaña a proposito: el entrenamiento se guarda a mano,
                            y salir de la pagina para ver el flujo se llevaria por delante
                            lo que se estuviera escribiendo. */}
                        {flujo && (
                            <Button asChild variant="outline" size="icon" className="shrink-0" title={`Abrir el flujo ${flujo.name}`}>
                                <Link
                                    href={getWorkflowEditorPath(flujo.id, flujo.isPro)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Abrir el flujo ${flujo.name}`}
                                >
                                    <SquareArrowOutUpRight className="h-4 w-4" />
                                </Link>
                            </Button>
                        )}
                    </div>
                )}

                {/* El nombre esta puesto pero no coincide con ningun flujo: pasa con
                    las plantillas antes de crear los flujos, y con el flujo que
                    alguien borro despues. Sin este aviso la tarjeta se ve normal y
                    en la conversacion no pasa nada. */}
                {elegido && !flujo && (
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                        No hay ningún flujo llamado “{elegido}”. Elige uno de la lista.
                    </p>
                )}
            </CardContent>
        </Card>
    );
};
