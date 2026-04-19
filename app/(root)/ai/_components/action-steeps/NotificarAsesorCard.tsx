// components/training/cards/NotificarAsesorCard.tsx
"use client";

import { FC } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PropsNotifyAsesor } from "@/types/agentAi";

export const NotificarAsesorCard: FC<PropsNotifyAsesor> = ({ el, onRemove, isManagement }) => {
    return (
        <Card className="bg-muted/20 border-muted/60">
            <CardHeader className="py-3 flex-row items-center justify-between">
                <CardTitle className="text-md uppercase">Notificar asesor</CardTitle>
                <Button variant="destructive" size="icon" onClick={onRemove}>
                    {!isManagement &&
                        <Trash2 className="h-4 w-4" />
                    }
                </Button>
            </CardHeader>

            <CardContent className="space-y-2">
                <Input value={el.notificationNumber ?? ""} readOnly placeholder="No disponible" />
            </CardContent>
        </Card>
    );
};