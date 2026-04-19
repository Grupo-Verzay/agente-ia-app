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
import { ScrollArea } from "@/components/ui/scroll-area";

export const RegistrosTable = ({
    tipo,
    registros,
    whatsapp,
    onNew,
    onEdit,
    onDelete,
}: {
    tipo: TipoRegistro;
    registros: Registro[];
    whatsapp: string;
    onNew: (tipo: TipoRegistro) => void;
    onEdit: (registro: Registro) => void;
    onDelete: (registro: Registro) => void;
}) => {
    const isReporte = tipo === "REPORTE";

    return (
        <div className="flex flex-col gap-2 h-[260px] sm:h-[300px] md:h-[320px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                    {getTipoLabel(tipo)} ({registros.length})
                </p>

                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => onNew(tipo)}
                >
                    <Plus className="h-3 w-3 mr-1" />
                    Nuevo {getTipoLabel(tipo).slice(0, -1)}
                </Button>
            </div>

            <ScrollArea className="flex-1 rounded-md border">
                <div className="min-w-[720px]">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="h-8 py-1.5">Fecha</TableHead>
                                <TableHead className="h-8 py-1.5">WhatsApp</TableHead>

                                {isReporte ? (
                                    <>
                                        <TableHead className="h-8 py-1.5">Nombre</TableHead>
                                        <TableHead className="h-8 py-1.5">Resumen</TableHead>
                                        <TableHead className="h-8 py-1.5 text-center">Lead</TableHead>
                                    </>
                                ) : (
                                    <TableHead className="h-8 py-1.5">Detalles</TableHead>
                                )}

                                <TableHead className="h-8 py-1.5 text-right">Estado</TableHead>
                                <TableHead className="h-8 py-1.5 text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {registros.length === 0 && (
                                <TableRow>
                                    <TableCell
                                        colSpan={isReporte ? 8 : 6}
                                        className="h-16 text-center text-muted-foreground"
                                    >
                                        No hay registros para este módulo.
                                    </TableCell>
                                </TableRow>
                            )}

                            {registros.map((r) => (
                                <TableRow key={r.id} className="hover:bg-accent/40">
                                    <TableCell className="py-1.5 align-top whitespace-nowrap">
                                        {formatFecha(r.fecha || "")}
                                    </TableCell>
                                    <TableCell className="py-1.5 align-top whitespace-nowrap">
                                        {whatsapp}
                                    </TableCell>

                                    {isReporte ? (
                                        <>
                                            <TableCell className="py-1.5 align-top whitespace-nowrap">
                                                {r.nombre || "-"}
                                            </TableCell>
                                            <TableCell className="py-1.5 align-top max-w-[220px]">
                                                <span className="line-clamp-2">
                                                    {r.resumen || "Sin resumen"}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-1.5 align-top text-center">
                                                {r.lead ? (
                                                    <Badge variant="default" className="px-2 py-0">
                                                        Sí
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground">No</span>
                                                )}
                                            </TableCell>
                                        </>
                                    ) : (
                                        <TableCell className="py-1.5 align-top max-w-[260px]">
                                            <span className="line-clamp-2">
                                                {r.detalles || "Sin detalles"}
                                            </span>
                                        </TableCell>
                                    )}

                                    <TableCell className="py-1.5 align-top text-right">
                                        <Badge variant="outline" className="px-2 py-0 capitalize">
                                            {r.estado}
                                        </Badge>
                                    </TableCell>

                                    <TableCell className="py-1.5 align-top text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>

                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => onEdit(r)}>
                                                    <Pencil className="h-4 w-4 mr-2" />
                                                    Editar
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => onDelete(r)}>
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