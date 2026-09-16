// components/training/cards/NotaInternaCard.tsx
"use client";

import { FC } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Lock } from "lucide-react";
import { PropsNotaInterna } from "@/types/agentAi";
import { TOPE_DE_NOTA_INTERNA } from "@/lib/nota-interna-de-paso";
import { ElementMenu } from "./ElementMenu";

/**
 * La nota interna del paso: el agente la lee, el cliente no la ve nunca.
 *
 * Misma anatomía que `TextRuleCard` —cabecera con icono y su menú, un
 * `Textarea` debajo—, y a propósito: son hermanas y se usan una al lado de la
 * otra. Lo que las distingue es el candado y la línea de abajo.
 *
 * Esa línea es lo único que hay de texto de ayuda, y va porque el error de uso
 * es previsible: alguien escribe aquí una regla de todo el agente —«nunca
 * hables de precios»— y luego no entiende por qué solo se cumple en un paso.
 * Se dice dónde va eso en vez de dejar que se descubra.
 *
 * El campo es **opcional**: vacío no escribe nada en el prompt (lo decide
 * `envolverLaNotaInterna`), así que una tarjeta recién puesta y sin rellenar no
 * le mete al modelo una regla sobre la nada.
 */
export const NotaInternaCard: FC<PropsNotaInterna> = ({
    el,
    onRemove,
    onChangeNota,
    isManagement,
}) => {
    const nota = el.nota ?? "";

    return (
        <Card className="bg-muted/10 border-muted/60">
            <CardHeader className="py-2 px-3 flex-row items-center justify-between">
                <CardTitle className="text-md flex items-center gap-2">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    NOTA INTERNA
                </CardTitle>
                {!isManagement && <ElementMenu onRemove={onRemove} />}
            </CardHeader>

            <CardContent className="space-y-1.5 px-3 pb-3 pt-0">
                <Textarea
                    value={nota}
                    // Se recorta al escribir y no al guardar: un tope que solo
                    // salta al final deja escribir un folio y luego lo tira.
                    onChange={(e) => onChangeNota(e.target.value.slice(0, TOPE_DE_NOTA_INTERNA))}
                    placeholder="Lo que el agente debe tener en cuenta aquí, sin decírselo al cliente…"
                    aria-label="Nota interna de este paso"
                    className="min-h-[32px]"
                />
                <p className="text-xs text-muted-foreground">
                    Aplica solo a este paso. Para reglas de todo el agente, usa
                    Notas adicionales del perfil.
                </p>
            </CardContent>
        </Card>
    );
};
