// components/training/cards/NotificarAsesorCard.tsx
"use client";

import { FC } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Bell } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PropsNotifyAsesor } from "@/types/agentAi";
import { ElementMenu } from "./ElementMenu";
import { TituloDelElemento } from "./TituloDelElemento";

export const NotificarAsesorCard: FC<PropsNotifyAsesor> = ({ el, onRemove, isManagement }) => {
    return (
        <Card className="bg-muted/20 border-muted/60">
            <CardHeader className="py-2 px-3 flex-row items-center justify-between">
                <TituloDelElemento icono={Bell}>Notificar asesor</TituloDelElemento>
                {!isManagement && (
                    <ElementMenu onRemove={onRemove} />
                )}
            </CardHeader>

            <CardContent className="space-y-2 px-3 pb-3 pt-0">
                <Input value={el.notificationNumber ?? ""} readOnly placeholder="No disponible" />
            </CardContent>
        </Card>
    );
};