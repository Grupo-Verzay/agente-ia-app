"use client";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { RegistroWithSession } from "@/types/session";
import { getEstadoOptions } from "../../helpers";

export function CrmRecordStatusCell({
    registro,
    disabled,
    onChangeEstado,
}: {
    registro: RegistroWithSession;
    disabled?: boolean;
    onChangeEstado?: (registroId: number, nuevoEstado: string) => void;
}) {
    const estadoOptions = getEstadoOptions(registro.tipo);
    const currentValue =
        registro.estado && estadoOptions.includes(registro.estado)
            ? registro.estado
            : undefined;

    return (
        <div className="flex justify-end">
            <Select
                value={currentValue}
                onValueChange={(value) => {
                    if (value === registro.estado) return;
                    onChangeEstado?.(registro.id, value);
                }}
                disabled={disabled || !onChangeEstado}
            >
                <SelectTrigger className="h-8 w-[170px] justify-between">
                    <SelectValue placeholder="Seleccionar estado" />
                </SelectTrigger>
                <SelectContent>
                    {estadoOptions.map((estado) => (
                        <SelectItem key={estado} value={estado}>
                            {estado}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
