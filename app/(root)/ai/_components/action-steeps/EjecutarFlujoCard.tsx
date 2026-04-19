// components/training/cards/EjecutarFlujoCard.tsx
"use client";

import { FC } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Popover, PopoverTrigger, PopoverContent,
} from "@/components/ui/popover";
import {
    Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Plus, Trash2 } from "lucide-react";
import { PropsExecuteFlow } from "@/types/agentAi";

export const EjecutarFlujoCard: FC<PropsExecuteFlow> = ({ el, flows, onRemove, onSelectFlow, isManagement }) => {
    return (
        <Card className="bg-muted/20 border-muted/60">
            <CardHeader className="py-3 flex-row items-center justify-between">
                <CardTitle className="text-md uppercase">Ejecutar flujo</CardTitle>
                <Button variant="destructive" size="icon" onClick={onRemove}>
                    {!isManagement &&
                        <Trash2 className="h-4 w-4" />
                    }
                </Button>
            </CardHeader>

            <CardContent className="space-y-3">
                <div className="text-sm text-muted-foreground">
                    {flows.length === 0 ? "No hay flujos" : ""}
                </div>

                {flows.length > 0 && (
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-between">
                                {el.flowName ?? "Elegir flujo…"}
                                <Plus className="h-4 w-4 opacity-60" />
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
                                                {"name" in f ? f.name : (f as any).name}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                )}
            </CardContent>
        </Card>
    );
};