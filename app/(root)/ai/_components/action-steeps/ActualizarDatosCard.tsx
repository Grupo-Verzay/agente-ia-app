// components/training/cards/CapturaDatosCard.tsx
"use client";

import { FC, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, X } from "lucide-react";
import { PedidoFieldsEditor } from "../";
import { CapturaDatosCardProps, DataSubtype, SUBTYPE_OPTIONS } from "@/types/agentAi";

// shadcn/ui Select
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from "@/components/ui/select";

export const ActualizarDatosCard: FC<CapturaDatosCardProps> = ({
    el,
    onRemove,
    onAddField,
    onRemoveField,
    onSubtypeChange,
    isManagement
}) => {
    // Estado local para manejar el subtipo
    const [localSubtype, setLocalSubtype] = useState<DataSubtype>(el.subtype as DataSubtype);

    // Cuando el valor de el.subtype cambie, actualizamos el estado local
    useEffect(() => {
        setLocalSubtype(el.subtype as DataSubtype);
    }, [el.subtype]);

    // Función que maneja el cambio del subtipo
    const handleSubtypeChange = (v: string) => {
        const newSubtype = v as DataSubtype;
        setLocalSubtype(newSubtype);
        // Llamamos a onSubtypeChange para propagar el cambio al padre
        onSubtypeChange(newSubtype); // Aquí también pasas el subtype correctamente
    };

    return (
        <Card className="bg-muted/20 border-muted/60">
            <CardHeader className="py-3 flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <CardTitle className="text-md uppercase">Actualizar datos</CardTitle>

                    {/* Selector de subtipo */}
                    <Select
                        value={localSubtype}
                        onValueChange={handleSubtypeChange}  // Usamos handleSubtypeChange para manejar el cambio
                    >
                        <SelectTrigger className="h-8 w-[148px] text-xs">
                            <SelectValue placeholder="Selecciona tipo" />
                        </SelectTrigger>
                        <SelectContent>
                            {SUBTYPE_OPTIONS.map((opt) => (
                                <SelectItem key={opt} value={opt} className="text-xs">
                                    {opt}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <Button variant="destructive" size="icon" onClick={onRemove}>
                    {!isManagement &&
                        <Trash2 className="h-4 w-4" />
                    }
                </Button>
            </CardHeader>

            <CardContent className="p-0 m-0">
                <div className="px-4 pb-3">
                    <PedidoFieldsEditor
                        stepId={(el as any).stepId ?? ""}
                        elId={el.id}
                        element={el}
                        onAdd={onAddField}
                        onRemove={onRemoveField}
                    />
                </div>
            </CardContent>
        </Card>
    );
};
