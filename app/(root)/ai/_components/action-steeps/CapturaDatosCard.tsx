// components/training/cards/CapturaDatosCard.tsx
"use client";

import { FC, useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, X } from "lucide-react";
import { PedidoFieldsEditor } from "../";
import { CapturaDatosCardProps, DataSubtype, ElementoDeDatos, SUBTYPE_OPTIONS } from "@/types/agentAi";

// shadcn/ui Select
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from "@/components/ui/select";
import { ElementMenu } from "./ElementMenu";
import { TituloDelElemento } from "./TituloDelElemento";

export const CapturaDatosCard: FC<CapturaDatosCardProps> = ({
    el,
    onRemove,
    onAddField,
    onRemoveField,
    onSubtypeChange,
    isManagement,
    onAddRule,
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
            {/* `px-3` como el resto de tarjetas de elemento: sin él la cabecera
                tomaba el `px-6` de fábrica y el título y la papelera quedaban
                12 px más adentro que los de la tarjeta de al lado. */}
            <CardHeader className="py-2 px-3 flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <TituloDelElemento icono={ClipboardList}>Captura de datos</TituloDelElemento>

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
                                    {opt.toUpperCase()}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <ElementMenu onRemove={onRemove} />
            </CardHeader>

            <CardContent className="p-0 m-0">
                <div className="px-3 pb-3">
                    <PedidoFieldsEditor
                        stepId={(el as ElementoDeDatos & { stepId?: string }).stepId ?? ""}
                        elId={el.id}
                        element={el}
                        onAdd={onAddField}
                        onRemove={onRemoveField}
                    />
                    {onAddRule && (
                        <div className="flex justify-end mt-2">
                            <Button type="button" variant="outline" onClick={onAddRule}>
                                Agregar regla
                            </Button>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};
