"use client";

import { FC } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Split } from "lucide-react";
import { CAMPOS_DEL_CASO } from "@/lib/maqueta-del-paso";
import { ElementMenu } from "./ElementMenu";
import { TituloDelElemento } from "./TituloDelElemento";

/**
 * «Agregar caso»: una fila de la tabla de casos del paso. Se guarda en el
 * elemento (`fn: "caso"`) y la tabla la escribe en el prompt
 * `lib/casos-y-transicion-del-paso`. La pintan el editor de verdad y la
 * maqueta de `/ia/maqueta`.
 *
 * Misma anatomía que `TextRuleCard` (cabecera con icono y papelera, campos
 * debajo) porque ocupa su mismo puesto: un paso lleva una Respuesta fija o
 * varios casos, cada uno con cuándo aplica y qué se envía.
 */
export const CasoCard: FC<{
    numero: number;
    escenario: string;
    respuesta: string;
    onChange: (cambio: { escenario?: string; respuesta?: string }) => void;
    onRemove: () => void;
}> = ({ numero, escenario, respuesta, onChange, onRemove }) => (
    <Card className="bg-muted/10 border-muted/60" data-tarjeta-caso>
        <CardHeader className="py-2 px-3 flex-row items-center justify-between">
            <TituloDelElemento icono={Split}>
                {CAMPOS_DEL_CASO.titulo} {numero}
            </TituloDelElemento>
            <ElementMenu onRemove={onRemove} label="Eliminar caso" />
        </CardHeader>
        <CardContent className="space-y-2 px-3 pb-3 pt-0">
            <div className="space-y-1">
                <Label className="text-xs font-medium text-foreground/70">{CAMPOS_DEL_CASO.escenario.rotulo}</Label>
                <Input
                    value={escenario}
                    onChange={(e) => onChange({ escenario: e.target.value })}
                    placeholder={CAMPOS_DEL_CASO.escenario.placeholder}
                    aria-label={CAMPOS_DEL_CASO.escenario.rotulo}
                    data-campo="escenario"
                />
            </div>
            <div className="space-y-1">
                <Label className="text-xs font-medium text-foreground/70">{CAMPOS_DEL_CASO.respuesta.rotulo}</Label>
                <Textarea
                    value={respuesta}
                    onChange={(e) => onChange({ respuesta: e.target.value })}
                    placeholder={CAMPOS_DEL_CASO.respuesta.placeholder}
                    aria-label={CAMPOS_DEL_CASO.respuesta.rotulo}
                    className="min-h-[32px]"
                    data-campo="respuesta"
                />
            </div>
        </CardContent>
    </Card>
);
