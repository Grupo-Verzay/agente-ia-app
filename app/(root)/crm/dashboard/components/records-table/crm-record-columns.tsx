"use client";

import { type CSSProperties } from "react";
import type { Column, ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RegistroWithSession, TipoRegistro } from "@/types/session";
import { CrmFollowUpSummaryBadge } from "../CrmFollowUpSummaryBadge";
import { formatFecha, getTipoLabel } from "../../../helpers";
import {
    getDisplayNombreFromRegistro,
    getDisplayWhatsappFromSession,
} from "../../helpers";
import { CRM_TAB_COLORS } from "./constants";

import { CrmRecordDetailCell } from "./CrmRecordDetailCell";
import { CrmRecordActionsCell } from "./CrmRecordActionsCell";
import { CrmRecordStatusCell } from "./CrmRecordStatusCell";
import { CrmRecordNameCell } from "./CrmRecordNameCell";
import { LeadStatusBadge } from "./LeadStatusBadge";

function DateCell({ value }: { value: string }) {
    const { state } = useSidebar();
    const d = new Date(value);
    const date = d.toLocaleDateString("es-CO", { year: "2-digit", month: "2-digit", day: "2-digit" });
    const time = d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", hour12: true });

    if (state === "expanded") {
        return (
            <div className="leading-tight text-center">
                <div className="whitespace-nowrap text-xs">{date}</div>
                <div className="whitespace-nowrap text-xs text-muted-foreground">{time}</div>
            </div>
        );
    }
    return <span className="block whitespace-nowrap text-center text-sm">{date}, {time}</span>;
}

const TIPO_ABBR: Record<string, string> = {
    REPORTE:   "REP",
    SOLICITUD: "SOL",
    PEDIDO:    "PED",
    RECLAMO:   "REC",
    PAGO:      "PAG",
    RESERVA:   "RES",
    PRODUCTO:  "PRO",
};

function SortableHeader({
    column,
    label,
}: {
    column: Column<RegistroWithSession>;
    label: string;
}) {
    return (
        <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
            {label}
            <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
    );
}

export function createCrmRecordColumns({
    userId,
    isUpdatingRegistros,
    onChangeEstado,
    onChangeDetalle,
    onFollowUpChanged,
    onRecordsChanged,
    onNavigateToChat,
}: {
    userId: string;
    isUpdatingRegistros?: boolean;
    onChangeEstado?: (registroId: number, nuevoEstado: string) => void;
    onChangeDetalle?: (registroId: number, nuevoDetalle: string) => Promise<boolean>;
    onFollowUpChanged?: () => Promise<void> | void;
    onRecordsChanged?: () => Promise<void> | void;
    onNavigateToChat?: (remoteJid: string) => void;
}): ColumnDef<RegistroWithSession>[] {
    return [
        {
            id: "whatsapp",
            accessorFn: (row) => getDisplayWhatsappFromSession(row.session),
            enableHiding: false,
            header: ({ column }) => (
                <SortableHeader column={column} label="WhatsApp" />
            ),
            cell: ({ row }) => {
                const whatsapp = getDisplayWhatsappFromSession(row.original.session);

                return (
                    <div
                        className={cn(
                            "cursor-pointer text-blue-600 hover:text-blue-800 transition-colors",
                            onNavigateToChat && "hover:bg-blue-50 rounded p-1"
                        )}
                        onClick={() => onNavigateToChat?.(row.original.session.remoteJid)}
                    >
                        <p className="font-medium">{whatsapp}</p>
                    </div>
                );
            },
        },
        {
            id: "nombre",
            accessorFn: (row) => getDisplayNombreFromRegistro(row),
            enableHiding: false,
            header: ({ column }) => <SortableHeader column={column} label="Nombre" />,
            cell: ({ row }) => (
                <CrmRecordNameCell
                    registro={row.original}
                    onUpdated={onRecordsChanged}
                />
            ),
        },
        {
            id: "tipo",
            accessorFn: (row) => getTipoLabel(row.tipo),
            header: ({ column }) => <SortableHeader column={column} label="Tipo" />,
            cell: ({ row }) => {
                const tipo = row.original.tipo as TipoRegistro;
                const tipoColor = CRM_TAB_COLORS[tipo];
                return (
                    <div className="flex justify-center">
                        <span
                            className="inline-flex rounded-full border px-2 py-1 text-xs font-medium text-white"
                            style={
                                {
                                    backgroundColor: tipoColor,
                                    borderColor: tipoColor,
                                } as CSSProperties
                            }
                        >
                            {getTipoLabel(tipo)}
                        </span>
                    </div>
                );
            },
        },
        {
            id: "fecha",
            accessorFn: (row) =>
                row.fecha ? new Date(row.fecha).getTime() : Number.NEGATIVE_INFINITY,
            header: ({ column }) => <SortableHeader column={column} label="Fecha" />,
            cell: ({ row }) => row.original.fecha
                ? <DateCell value={row.original.fecha.toISOString()} />
                : <span className="text-sm">-</span>,
        },
        {
            id: "detalle",
            accessorFn: (row) => row.resumen ?? row.detalles ?? "",
header: () => (
                <span className="text-xs font-medium text-muted-foreground">
                    Detalle
                </span>
            ),
            enableSorting: false,
            cell: ({ row }) => (
                <CrmRecordDetailCell
                    registro={row.original}
                    onChangeDetalle={onChangeDetalle}
                />
            ),
        },
        {
            id: "leadStatus",
            size: 120,
            minSize: 120,
            accessorFn: (row) => row.session.leadStatus ?? "",
            header: ({ column }) => <SortableHeader column={column} label="Lead" />,
            cell: ({ row }) => (
                <div className="flex w-full justify-center">
                    <LeadStatusBadge status={row.original.session.leadStatus ?? null} />
                </div>
            ),
        },
        {
            id: "crmFollowUp",
            size: 40,
            minSize: 40,
            accessorFn: (row) => {
                const latestScheduledFor = row.session.crmFollowUpSummary?.latestScheduledFor;
                return latestScheduledFor ? new Date(latestScheduledFor).getTime() : 0;
            },
            header: ({ column }) => (
                <SortableHeader column={column} label="Follow" />
            ),
            cell: ({ row }) => (
                <div className="flex justify-center min-w-[24px]">
                    <CrmFollowUpSummaryBadge
                        summary={row.original.session.crmFollowUpSummary}
                        userId={userId}
                        remoteJid={row.original.session.remoteJid}
                        instanceId={row.original.session.instanceId}
                        onUpdated={onFollowUpChanged}
                    />
                </div>
            ),
        },
        {
            id: "estado",
            size: 116,
            minSize: 116,
            accessorFn: (row) => row.estado ?? "",
            header: ({ column }) => <SortableHeader column={column} label="Estado" />,
            cell: ({ row }) => (
                <div className="flex w-full justify-center">
                    <CrmRecordStatusCell
                        registro={row.original}
                        disabled={isUpdatingRegistros}
                        onChangeEstado={onChangeEstado}
                    />
                </div>
            ),
        },
        {
            id: "actions",
            size: 48,
            minSize: 48,
            enableSorting: false,
            header: () => (
                <span className="text-xs font-medium text-muted-foreground">
                    Acciones
                </span>
            ),
            cell: ({ row }) => (
                <div className="flex justify-center min-w-[32px]">
                    <CrmRecordActionsCell
                        registro={row.original}
                        onUpdated={onRecordsChanged}
                    />
                </div>
            ),
        },
    ];
}
