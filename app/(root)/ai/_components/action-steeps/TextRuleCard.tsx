// components/training/cards/TextRuleCard.tsx
"use client";

import { FC, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { SlidersHorizontal } from "lucide-react";
import { PropsTextRule } from "@/types/agentAi";
import { ElementMenu } from "./ElementMenu";
import {
    conReglaDeVariable,
    VariablesDialog,
    type VariableDelSistema,
} from "./VariablesDialog";

export const TextRuleCard: FC<PropsTextRule> = ({ el, onRemove, onChange, isManagement }) => {
    const [showVariables, setShowVariables] = useState(false);
    const areaRef = useRef<HTMLTextAreaElement | null>(null);
    // Donde estaba el cursor cuando se abrio el menu: al hacer clic en los tres
    // puntos el textarea pierde el foco, asi que la posicion hay que guardarla
    // antes o la variable terminaria siempre al principio del texto.
    const cursorRef = useRef<number | null>(null);

    const recordarCursor = () => {
        cursorRef.current = areaRef.current?.selectionStart ?? null;
    };

    const insertarVariable = (variable: VariableDelSistema) => {
        const texto = el.text ?? "";
        const corte = cursorRef.current ?? texto.length;
        const conToken = `${texto.slice(0, corte)}${variable.token}${texto.slice(corte)}`;

        onChange(conReglaDeVariable(conToken, variable));
        setShowVariables(false);

        // Devolver el cursor justo detras de lo insertado, para poder seguir
        // escribiendo la frase sin buscar el sitio con el mouse.
        const siguiente = corte + variable.token.length;
        requestAnimationFrame(() => {
            areaRef.current?.focus();
            areaRef.current?.setSelectionRange(siguiente, siguiente);
        });
    };

    return (
        <Card className="bg-muted/10 border-muted/60">
            <CardHeader className="py-2 px-3 flex-row items-center justify-between">
                <CardTitle className="text-md flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                    REGLA/PARÁMETRO
                </CardTitle>
                <ElementMenu onRemove={onRemove} onVariables={() => setShowVariables(true)} />
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
                <Textarea
                    ref={areaRef}
                    // Aquí va lo que el cliente recibe: las plantillas hablan del
                    // "PRIMER elemento de TEXTO" y este es ese elemento. Decía
                    // solo "regla adicional", así que quien buscaba dónde escribir
                    // la respuesta pasaba de largo y la dejaba en blanco.
                    placeholder="Respuesta que recibe el cliente, o una regla adicional para este paso…"
                    value={el.text}
                    onChange={(e) => onChange(e.target.value)}
                    onSelect={recordarCursor}
                    onKeyUp={recordarCursor}
                    onBlur={recordarCursor}
                    className="min-h-[32px]"
                />
            </CardContent>

            <VariablesDialog
                open={showVariables}
                onOpenChange={setShowVariables}
                onPick={insertarVariable}
            />
        </Card>
    );
};
