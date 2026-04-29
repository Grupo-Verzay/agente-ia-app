// components/training/cards/TextRuleCard.tsx
"use client";

import { FC } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, SlidersHorizontal } from "lucide-react";
import { PropsTextRule } from "@/types/agentAi";

export const TextRuleCard: FC<PropsTextRule> = ({ el, onRemove, onChange, isManagement }) => {
    return (
        <Card className="bg-muted/10 border-muted/60">
            <CardHeader className="py-3 px-3 flex-row items-center justify-between">
                <CardTitle className="text-md flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                    REGLA/PARÁMETRO
                </CardTitle>
                <Button variant="secondary" size="icon" onClick={onRemove} className="bg-gray-400 hover:bg-gray-500 text-white dark:bg-zinc-600 dark:hover:bg-zinc-500">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </CardHeader>
            <CardContent>
                <Textarea
                    placeholder="Regla adicional para este paso…"
                    value={el.text}
                    onChange={(e) => onChange(e.target.value)}
                    className="min-h-[32px]"
                />
            </CardContent>
        </Card>
    );
};