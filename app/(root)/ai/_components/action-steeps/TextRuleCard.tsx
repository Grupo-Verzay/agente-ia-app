// components/training/cards/TextRuleCard.tsx
"use client";

import { FC } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { SlidersHorizontal } from "lucide-react";
import { PropsTextRule } from "@/types/agentAi";
import { ElementMenu } from "./ElementMenu";

export const TextRuleCard: FC<PropsTextRule> = ({ el, onRemove, onChange, isManagement }) => {
    return (
        <Card className="bg-muted/10 border-muted/60">
            <CardHeader className="py-2 px-3 flex-row items-center justify-between">
                <CardTitle className="text-md flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                    REGLA/PARÁMETRO
                </CardTitle>
                <ElementMenu onRemove={onRemove} />
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
                <Textarea
                    // Aquí va lo que el cliente recibe: las plantillas hablan del
                    // "PRIMER elemento de TEXTO" y este es ese elemento. Decía
                    // solo "regla adicional", así que quien buscaba dónde escribir
                    // la respuesta pasaba de largo y la dejaba en blanco.
                    placeholder="Respuesta que recibe el cliente, o una regla adicional para este paso…"
                    value={el.text}
                    onChange={(e) => onChange(e.target.value)}
                    className="min-h-[32px]"
                />
            </CardContent>
        </Card>
    );
};