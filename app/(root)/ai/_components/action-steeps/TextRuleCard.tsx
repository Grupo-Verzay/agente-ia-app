// components/training/cards/TextRuleCard.tsx
"use client";

import { FC } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, X } from "lucide-react";
import { PropsTextRule } from "@/types/agentAi";

export const TextRuleCard: FC<PropsTextRule> = ({ el, onRemove, onChange, isManagement }) => {
    return (
        <Card className="bg-muted/30 border-muted/60">
            <CardHeader className="py-3 flex-row items-center justify-between">
                <CardTitle className="text-md uppercase">Regla/parámetro</CardTitle>
                <Button variant="destructive" size="icon" onClick={onRemove}>
                    {!isManagement &&
                        <Trash2 className="h-4 w-4" />
                    }
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