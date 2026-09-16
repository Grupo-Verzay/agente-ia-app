"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    aMinutos,
    MINUTOS_DE_UNA_JORNADA,
    NOMBRE_DE_LA_UNIDAD,
    UNIDADES_DE_TIEMPO,
    type UnidadDeTiempo,
} from "@/lib/tiempo-de-tarea";

/**
 * Cuánto costó la tarea: un número y su unidad.
 *
 * Es el mismo par que la agenda y los seguimientos —Minutos / Horas / Días— y
 * con las mismas palabras a propósito: quien ya rellenó uno no tiene que
 * aprender otro.
 *
 * **Se usa en los DOS caminos de cierre**, el botón de Tareas y arrastrar a
 * «Hecho» en el tablero. Si cada uno tuviera el suyo, el día que se afine algo
 * —el tope, la conversión, el texto de ayuda— se afinaría en uno y el otro
 * seguiría guardando otra cosa; y como los dos escriben en la misma columna de
 * minutos, eso no se vería como un error sino como unos totales raros.
 *
 * Quien decide qué vale es `aMinutos`, que es puro: aquí no se convierte nada a
 * mano. Sube los minutos ya convertidos, o `null` mientras no haya un número
 * usable, y quien lo usa **tiene que mirar ese `null`** para no dejar cerrar.
 */
export function TiempoDeTarea({
    minutos,
    onChange,
    autoFocus,
}: {
    minutos: number | null;
    onChange: (minutos: number | null) => void;
    autoFocus?: boolean;
}) {
    const [texto, setTexto] = useState("");
    const [unidad, setUnidad] = useState<UnidadDeTiempo>("minutos");

    const recalcular = (nuevoTexto: string, nuevaUnidad: UnidadDeTiempo) => {
        setTexto(nuevoTexto);
        setUnidad(nuevaUnidad);
        // Una coma es lo que se teclea en español para los decimales, y
        // `Number("1,5")` es `NaN`: sin esto, «1,5 horas» no valdría y no
        // diría por qué.
        const limpio = nuevoTexto.trim().replace(",", ".");
        onChange(limpio === "" ? null : aMinutos(Number(limpio), nuevaUnidad));
    };

    // Vacío no se avisa: todavía no ha escrito nada, y regañar antes de que
    // empiece es ruido. Solo cuando hay algo escrito que no sirve.
    const malEscrito = texto.trim() !== "" && minutos === null;

    return (
        <div className="space-y-1.5">
            <Label htmlFor="tiempo-de-tarea">
                ¿Cuánto tiempo tomó? <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
                <Input
                    id="tiempo-de-tarea"
                    inputMode="decimal"
                    autoFocus={autoFocus}
                    placeholder="0"
                    value={texto}
                    onChange={(e) => recalcular(e.target.value, unidad)}
                    aria-invalid={malEscrito}
                    className={malEscrito ? "border-destructive focus-visible:ring-destructive" : undefined}
                />
                <Select value={unidad} onValueChange={(v) => recalcular(texto, v as UnidadDeTiempo)}>
                    <SelectTrigger className="w-[7.5rem] shrink-0">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {UNIDADES_DE_TIEMPO.map((u) => (
                            <SelectItem key={u} value={u}>
                                {NOMBRE_DE_LA_UNIDAD[u]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            {malEscrito ? (
                <p className="text-xs text-destructive">Escribe un número mayor que cero.</p>
            ) : (
                // Que un día son ocho horas se dice aquí y no se deja adivinar:
                // es lo único de este control que no es obvio, y de ahí salen
                // los totales.
                unidad === "dias" && (
                    <p className="text-xs text-muted-foreground">
                        Un día son {MINUTOS_DE_UNA_JORNADA / 60} horas de trabajo.
                    </p>
                )
            )}
        </div>
    );
}
