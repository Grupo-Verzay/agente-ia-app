import type { RegistrosFilters } from "@/actions/registro-action";
import type { RegistroWithSession, TipoRegistro } from "@/types/session";
import type { RefObject } from "react";

export type CrmDashboardTab = "TODOS" | TipoRegistro;

export type CrmTableColumnId =
    | "whatsapp"
    | "nombre"
    | "tipo"
    | "fecha"
    | "detalle"
    | "leadStatus"
    | "crmFollowUp"
    | "estado"
    | "actions";

export type CrmRecordsSectionProps = {
    activeTab: CrmDashboardTab;
    registros: RegistroWithSession[];
    totalRegistros: number;
    countsByTipo: Record<TipoRegistro, number>;
    filters: RegistrosFilters;
    onActiveTabChange: (value: CrmDashboardTab) => void;
    onFiltersChange: (filters: RegistrosFilters) => void;
    onChangeEstado?: (registroId: number, nuevoEstado: string) => void;
    onChangeDetalle?: (registroId: number, nuevoDetalle: string) => Promise<boolean>;
    onFollowUpChanged?: () => Promise<void> | void;
    onRecordsChanged?: () => Promise<void> | void;
    isUpdatingRegistros?: boolean;
    userId: string;
    hasMore?: boolean;
    isLoadingMore?: boolean;
    sentinelRef: RefObject<HTMLDivElement>;
    onScrollRootReady: (el: HTMLDivElement | null) => void;
};
