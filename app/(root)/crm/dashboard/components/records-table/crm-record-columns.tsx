"use client";

import { type CSSProperties } from "react";
import type { Column, ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";

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
import { LeadStatusBadge } from "./LeadStatusBadge";

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
            className="-ml-3 h-8 px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
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
                            "min-w-[80px] cursor-pointer text-blue-600 hover:text-blue-800 transition-colors",
                            onNavigateToChat && "hover:bg-blue-50 rounded p-1"
                        )}
                        onClick={() => onNavigateToChat?.(row.original.session.remoteJid)}
                    >
                        <p className="font-medium">{whatsapp}</p>
                        <p className="text-xs text-muted-foreground">
                            {row.original.session.instanceId}
                        </p>
                    </div>
                );
            },
        },
        {
            id: "nombre",
            accessorFn: (row) => getDisplayNombreFromRegistro(row),
            enableHiding: false,
            header: ({ column }) => <SortableHeader column={column} label="Nombre" />,
            cell: ({ row }) => {
                const nombre = getDisplayNombreFromRegistro(row.original);
                const sessionName = row.original.session.pushName;
                const showSessionName =
                    !!sessionName &&
                    sessionName.trim() !== "" &&
                    sessionName.trim() !== nombre.trim();

                return (
                    <div className="max-w-[150px] truncate">
                        <p className="font-medium">{nombre}</p>
                        {showSessionName ? (
                            <p className="text-xs text-muted-foreground">
                                Sesión: {sessionName}
                            </p>
                        ) : null}
                    </div>
                );
            },
        },
        {
            id: "tipo",
            accessorFn: (row) => getTipoLabel(row.tipo),
            header: ({ column }) => <SortableHeader column={column} label="Tipo" />,
            cell: ({ row }) => {
                const tipo = row.original.tipo as TipoRegistro;
                const tipoColor = CRM_TAB_COLORS[tipo];

                return (
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
                );
            },
        },
        {
            id: "fecha",
            accessorFn: (row) =>
                row.fecha ? new Date(row.fecha).getTime() : Number.NEGATIVE_INFINITY,
            header: ({ column }) => <SortableHeader column={column} label="Fecha" />,
            cell: ({ row }) => (
                <span className="whitespace-nowrap text-sm">
                    {formatFecha(row.original.fecha || "")}
                </span>
            ),
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
            accessorFn: (row) => row.session.leadStatus ?? "",
            header: ({ column }) => <SortableHeader column={column} label="Lead" />,
            cell: ({ row }) => (
                <div className="min-w-[120px]">
                    <LeadStatusBadge status={row.original.session.leadStatus ?? null} />
                </div>
            ),
        },
        {
            id: "crmFollowUp",
            accessorFn: (row) => {
                const latestScheduledFor = row.session.crmFollowUpSummary?.latestScheduledFor;
                return latestScheduledFor ? new Date(latestScheduledFor).getTime() : 0;
            },
            header: ({ column }) => (
                <SortableHeader column={column} label="Follow-up" />
            ),
            cell: ({ row }) => (
                <div className="min-w-[240px]">
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
            accessorFn: (row) => row.estado ?? "",
            header: ({ column }) => <SortableHeader column={column} label="Estado" />,
            cell: ({ row }) => (
                <CrmRecordStatusCell
                    registro={row.original}
                    disabled={isUpdatingRegistros}
                    onChangeEstado={onChangeEstado}
                />
            ),
        },
        {
            id: "actions",
            enableSorting: false,
            header: () => (
                <span className="text-xs font-medium text-muted-foreground">
                    Acciones
                </span>
            ),
            cell: ({ row }) => (
                <div className="flex justify-end">
                    <CrmRecordActionsCell
                        registro={row.original}
                        onUpdated={onRecordsChanged}
                    />
                </div>
            ),
        },
    ];
}
