"use client";

import { FC } from "react";
import { Braces, Smartphone } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

/**
 * Variables del sistema que se pueden meter dentro de una Regla/parámetro.
 *
 * No se reemplazan por código: viajan dentro del prompt y el que las resuelve
 * es el agente al leerlo. Por eso cada una trae, además del token, la `regla`:
 * una línea que se agrega UNA vez al final del texto explicándole al agente
 * qué puede y qué no puede hacer con ese dato. Sin esa línea el agente da por
 * bueno cualquier identificador del chat -incluido un `@lid`, que parece un
 * número pero no lo es- y termina hablándole al cliente de un teléfono que no
 * existe.
 */
export interface VariableDelSistema {
    id: string;
    token: string;
    nombre: string;
    ayuda: string;
    regla: string;
}

export const VARIABLES_DEL_SISTEMA: VariableDelSistema[] = [
    {
        id: "telefono",
        token: "{telefono}",
        nombre: "Número de celular del cliente",
        ayuda: "El número desde el que el cliente está escribiendo.",
        regla:
            "REGLA DE {telefono}: {telefono} es el número de celular desde el que escribe el cliente. " +
            "Úsalo solo si es un número real. Si la conversación llega identificada con un ID de privacidad " +
            "(termina en @lid) o solo con un nombre, NO hay número: no lo inventes ni le muestres ese ID al " +
            "cliente, pídele el celular.",
    },
];

/**
 * Deja la línea de regla al final del texto, una sola vez. Si ya está -porque
 * la variable se insertó antes-, el texto se devuelve igual.
 */
export function conReglaDeVariable(texto: string, variable: VariableDelSistema): string {
    if (texto.includes(variable.regla)) return texto;
    const base = texto.replace(/\s+$/, "");
    return base ? `${base}\n\n${variable.regla}` : variable.regla;
}

export const VariablesDialog: FC<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onPick: (variable: VariableDelSistema) => void;
}> = ({ open, onOpenChange, onPick }) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <Braces className="h-4 w-4 text-primary" />
                    Variables del sistema
                </DialogTitle>
                <DialogDescription>
                    Datos que el agente ya conoce de la conversación. Elige uno y se escribe donde
                    tengas el cursor.
                </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
                {VARIABLES_DEL_SISTEMA.map((variable) => (
                    <button
                        key={variable.id}
                        type="button"
                        onClick={() => onPick(variable)}
                        className="flex w-full items-start gap-3 rounded-md border border-border bg-muted/20 px-3 py-2.5 text-left transition-colors hover:border-primary/60 hover:bg-primary/5"
                    >
                        <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{variable.nombre}</span>
                            <span className="block text-xs text-muted-foreground">{variable.ayuda}</span>
                        </span>
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                            {variable.token}
                        </span>
                    </button>
                ))}
            </div>

            <p className="text-xs text-muted-foreground">
                Junto con la variable se agrega, una sola vez al final de la regla, la instrucción de
                cuándo puede usarla: si la conversación no trae un celular real, el agente lo pide en
                vez de inventarlo.
            </p>
        </DialogContent>
    </Dialog>
);
