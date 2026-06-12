import { ESTADOS_POR_TIPO } from "@/types/registro";
import type { CrmFollowUpStatus } from "@/types/session";
import { LEAD_STATUS_FILTER_OPTIONS } from "../../helpers";

import type { CrmDashboardTab, CrmTableColumnId } from "./types";

export const CRM_TABS = [
    "TODOS",
    "REPORTE",
    "SOLICITUD",
    "PEDIDO",
    "RECLAMO",
    "PAGO",
    "RESERVA",
    "PRODUCTO",
] as const;

export const CRM_TAB_COLORS: Record<CrmDashboardTab, string> = {
    TODOS: "#374151",
    REPORTE: "#5288E0",
    SOLICITUD: "#8E67E9",
    PEDIDO: "#E67A33",
    RECLAMO: "#E05252",
    PAGO: "#32BD65",
    RESERVA: "#24A1DB",
    PRODUCTO: "#A663E8",
};

export const CRM_FOLLOW_UP_FILTER_OPTIONS: Array<{
    value: CrmFollowUpStatus | "none";
    label: string;
}> = [
    { value: "PENDING", label: "Pendiente" },
    { value: "PROCESSING", label: "Procesando" },
    { value: "SENT", label: "Enviado" },
    { value: "FAILED", label: "Fallido" },
    { value: "CANCELLED", label: "Cancelado" },
    { value: "SKIPPED", label: "Omitido" },
    { value: "none", label: "Sin follow-up" },
];

export const CRM_TABLE_COLUMN_LABELS: Record<CrmTableColumnId, string> = {
    whatsapp: "WhatsApp",
    nombre: "Nombre",
    tipo: "Tipo",
    fecha: "Fecha",
    detalle: "Detalle",
    leadStatus: "Lead",
    crmFollowUp: "Follow-up",
    estado: "Estado",
    actions: "Acciones",
};

export const CRM_DEFAULT_COLUMN_VISIBILITY: Record<CrmTableColumnId, boolean> = {
    whatsapp: true,
    nombre: true,
    tipo: true,
    fecha: true,
    detalle: true,
    leadStatus: true,
    crmFollowUp: true,
    estado: true,
    actions: true,
};

export { LEAD_STATUS_FILTER_OPTIONS };

export const CRM_COLUMN_VISIBILITY_STORAGE_KEY =
    "crm-dashboard-records-column-visibility-v2";

export function isCrmTabValue(value: string): value is CrmDashboardTab {
    return (CRM_TABS as readonly string[]).includes(value);
}

export function canUseLeadFilter(tab: CrmDashboardTab) {
    return tab === "TODOS" || tab === "REPORTE";
}

export function getEstadoOptionsForTab(activeTab: CrmDashboardTab) {
    if (activeTab === "TODOS") {
        const all = new Set<string>();

        for (const estados of Object.values(ESTADOS_POR_TIPO)) {
            for (const estado of estados) {
                all.add(estado);
            }
        }

        return Array.from(all).sort((a, b) => a.localeCompare(b, "es"));
    }

    return ESTADOS_POR_TIPO[activeTab] ?? [];
}
