"use client";

import { useState } from "react";
import { Registro, TipoRegistro } from "@prisma/client";
import {
    Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import { Plus, MoreHorizontal, Pencil, Trash } from "lucide-react";
import { formatFecha, getTipoLabel } from "../helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getEstadoOptions } from "../dashboard/helpers";
import { updateRegistroEstado } from "@/actions/registro-action";
import { toast } from "sonner";

function EstadoSelect({
    registro,
    onUpdated,
}: {
    registro: Registro;
    onUpdated: () => void;
}) {
    const [saving, setSaving] = useState(false);
    const options = getEstadoOptions(registro.tipo as TipoRegistro);

    async function handleChange(value: string) {
        setSaving(true);
        const result = await updateRegistroEstado(registro.id, value);
        if (result.success) {
            toast.success("Estado actualizado");
            onUpdated();
        } else {
            toast.error("No se pudo actualizar el estado");
        }
        setSaving(false);
    }

    if (!options.length) {
        return (
            <Badge variant="outline" className="px-2 py-0 capitalize">
                {registro.estado ?? "-"}
            </Badge>
        );
    }

    return (
        <Select value={registro.estado ?? ""} onValueChange={handleChange} disabled={saving}>
            <SelectTrigger className="h-7 w-[130px] text-xs">
                <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
                {options.map((op) => (
                    <SelectItem key={op} value={op} className="text-xs">
                        {op}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

const NUEVO_TIPO_LABEL: Record<TipoRegistro, string> = {
    REPORTE:   "Nuevo Reporte",
    SOLICITUD: "Nueva Solicitud",
    PEDIDO:    "Nuevo Pedido",
    RECLAMO:   "Nuevo Reclamo",
    PAGO:      "Nuevo Pago",
    RESERVA:   "Nueva Reserva",
    PRODUCTO:  "Nuevo Producto",
};

export const RegistrosTable = ({
    tipo,
    registros,
    whatsapp,
    onNew,
    onEdit,
    onDelete,
    onStateChange,
}: {
    tipo: TipoRegistro;
    registros: Registro[];
    whatsapp: string;
    onNew: (tipo: TipoRegistro) => void;
    onEdit: (registro: Registro) => void;
    onDelete: (registro: Registro) => void;
    onStateChange?: () => void;
}) => {
    return (
        <div className="flex flex-col gap-2 h-full">
            <div className="flex items-center gap-2">
                <p className="font-medium">
                    {getTipoLabel(tipo)} ({registros.length})
                </p>
            </div>

            <ScrollArea className="flex-1 rounded-md border">
                <div className="min-w-[600px]">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="h-8 py-1.5 w-32">Fecha</TableHead>
                                <TableHead className="h-8 py-1.5">Detalles</TableHead>
                                <TableHead className="h-8 py-1.5 w-[140px] text-center">Estado</TableHead>
                                <TableHead className="h-8 py-1.5 w-16 text-center">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {registros.length === 0 && (
                                <TableRow>
                                    <TableCell
                                        colSpan={4}
                                        className="h-16 text-center text-muted-foreground"
                                    >
                                        No hay registros para este módulo.
                                    </TableCell>
                                </TableRow>
                            )}

                            {registros.map((r) => (
                                <TableRow key={r.id} className="hover:bg-accent/40">
                                    <TableCell className="py-1.5 align-middle whitespace-nowrap text-xs">
                                        {formatFecha(r.fecha || "")}
                                    </TableCell>

                                    <TableCell className="py-1.5 align-middle max-w-[240px]">
                                        <span className="line-clamp-2 text-xs">
                                            {r.detalles || r.resumen || "Sin detalles"}
                                        </span>
                                    </TableCell>

                                    <TableCell className="py-1.5 align-middle text-center">
                                        <div className="flex justify-center">
                                            <EstadoSelect
                                                registro={r}
                                                onUpdated={() => onStateChange?.()}
                                            />
                                        </div>
                                    </TableCell>

                                    <TableCell className="py-1.5 align-middle text-center">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 mx-auto flex">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => onEdit(r)}>
                                                    <Pencil className="h-4 w-4 mr-2" />
                                                    Editar
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => onDelete(r)}
                                                    className="text-destructive focus:text-destructive"
                                                >
                                                    <Trash className="h-4 w-4 mr-2" />
                                                    Eliminar
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </ScrollArea>
        </div>
    );
};
