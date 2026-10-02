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
 * «Agregar transición»: a qué paso se pasa cuando este tenga sus datos. Se
 * guarda en el elemento (`fn: "transicion"`) y la línea ➡️ TRANSICIÓN la
 * escribe en el prompt `lib/casos-y-transicion-del-paso`. Sin destino, pasa
 * al paso siguiente. La pintan el editor de verdad y la maqueta.
 *
 * Un solo campo: a qué paso se pasa cuando este tenga sus datos. La lista son
 * los pasos ya creados, por nombre, sin el propio (`pasosParaLaTransicion`).
 */
export const TransicionCard: FC<{
    pasos: Array<{ id: string; nombre: string }>;
    destino: string | null;
    onChange: (id: string) => void;
    onRemove: () => void;
    /** Fuera de Inicio el destino es un paso de Inicio y no hay «siguiente». */
    fueraDeInicio?: boolean;
}> = ({ pasos, destino, onChange, onRemove, fueraDeInicio = false }) => {
    const pregunta = fueraDeInicio ? CAMPO_DE_LA_TRANSICION.preguntaFueraDeInicio : CAMPO_DE_LA_TRANSICION.pregunta;
    return (
    <Card className="bg-muted/20 border-muted/60" data-tarjeta-transicion>
        <CardHeader className="py-2 px-3 flex-row items-center justify-between">
            <TituloDelElemento icono={ArrowRightLeft}>{CAMPO_DE_LA_TRANSICION.titulo}</TituloDelElemento>
            <ElementMenu onRemove={onRemove} label="Eliminar transición" />
        </CardHeader>
        <CardContent className="space-y-1 px-3 pb-3 pt-0">
            <Label className="text-xs font-medium text-foreground/70">{pregunta}</Label>
            <Select value={destino ?? undefined} onValueChange={onChange}>
                <SelectTrigger aria-label={pregunta} data-campo="destino">
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
            <p className="text-xs text-muted-foreground" data-ayuda-transicion>
                {fueraDeInicio ? CAMPO_DE_LA_TRANSICION.ayudaFueraDeInicio : CAMPO_DE_LA_TRANSICION.ayuda}
            </p>
        </CardContent>
    </Card>
    );
};
