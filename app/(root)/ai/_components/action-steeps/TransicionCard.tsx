"use client";

import { FC } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ArrowRightLeft } from "lucide-react";
import { CAMPO_DE_LA_TRANSICION } from "@/lib/maqueta-del-paso";
import { ElementMenu } from "./ElementMenu";
import { TituloDelElemento } from "./TituloDelElemento";

/**
 * «Transición» — MAQUETA, todavía sin lógica: elegir un paso no se guarda ni
 * cambia el recorrido del agente. Hoy solo se pinta en `/ia/maqueta`.
 *
 * Un solo campo: a qué paso se pasa cuando este tenga sus datos. La lista son
 * los pasos ya creados, por nombre, sin el propio (`pasosParaLaTransicion`).
 */
export const TransicionCard: FC<{
    pasos: Array<{ id: string; nombre: string }>;
    destino: string | null;
    onChange: (id: string) => void;
    onRemove: () => void;
}> = ({ pasos, destino, onChange, onRemove }) => (
    <Card className="bg-muted/20 border-muted/60" data-tarjeta-transicion>
        <CardHeader className="py-2 px-3 flex-row items-center justify-between">
            <TituloDelElemento icono={ArrowRightLeft}>{CAMPO_DE_LA_TRANSICION.titulo}</TituloDelElemento>
            <ElementMenu onRemove={onRemove} label="Eliminar transición" />
        </CardHeader>
        <CardContent className="space-y-1 px-3 pb-3 pt-0">
            <Label className="text-xs font-medium text-foreground/70">{CAMPO_DE_LA_TRANSICION.pregunta}</Label>
            <Select value={destino ?? undefined} onValueChange={onChange}>
                <SelectTrigger aria-label={CAMPO_DE_LA_TRANSICION.pregunta} data-campo="destino">
                    <SelectValue placeholder={CAMPO_DE_LA_TRANSICION.vacio} />
                </SelectTrigger>
                <SelectContent>
                    {pasos.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="uppercase">
                            {p.nombre}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </CardContent>
    </Card>
);
