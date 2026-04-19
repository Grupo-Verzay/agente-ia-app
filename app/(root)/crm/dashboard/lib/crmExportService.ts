/**
 * CRM Export Service — SRP
 *
 * Pure function that receives already-loaded registros + export options
 * and triggers an Excel download in the browser. No UI, no side-effects
 * beyond the file download itself.
 */

import * as XLSX from "xlsx";

import type { RegistroWithSession } from "@/types/session";
import { getDisplayNombreFromRegistro } from "../helpers/getDisplayNombreFromRegistro";
import { getDisplayWhatsappFromSession } from "../helpers/getDisplayWhatsappFromSession";

// ─── Exportable column definitions ─────────────────────────────────────────

export type ExportColumnId =
    | "whatsapp"
    | "nombre"
    | "tipo"
    | "fecha"
    | "detalle"
    | "leadStatus"
    | "crmFollowUp"
    | "estado";

export const EXPORT_COLUMN_LABELS: Record<ExportColumnId, string> = {
    whatsapp: "WhatsApp",
    nombre: "Nombre",
    tipo: "Tipo",
    fecha: "Fecha",
    detalle: "Detalle",
    leadStatus: "Estado del lead",
    crmFollowUp: "Follow-up",
    estado: "Estado",
};

export const EXPORT_ALL_COLUMNS: ExportColumnId[] = Object.keys(
    EXPORT_COLUMN_LABELS
) as ExportColumnId[];

// ─── Export options ─────────────────────────────────────────────────────────

export type CrmExportOptions = {
    /** Columns to include in the export (order preserved). */
    columns: ExportColumnId[];
    /** Max records to export. `"all"` = no limit. */
    limit: number | "all";
    /** Optional client-side date filter (ISO date strings: "YYYY-MM-DD"). */
    dateFrom?: string;
    dateTo?: string;
};

// ─── Cell extractor map (OCP — add a column without touching the loop) ──────

type CellExtractor = (registro: RegistroWithSession) => string | number;

const CELL_EXTRACTORS: Record<ExportColumnId, CellExtractor> = {
    whatsapp: (r) => getDisplayWhatsappFromSession(r.session),
    nombre: (r) => getDisplayNombreFromRegistro(r),
    tipo: (r) => r.tipo,
    fecha: (r) =>
        r.fecha
            ? new Date(r.fecha).toLocaleString("es-ES", {
                  dateStyle: "short",
                  timeStyle: "short",
              })
            : "",
    detalle: (r) => r.detalles ?? "",
    leadStatus: (r) => r.session.leadStatus ?? "Sin clasificar",
    crmFollowUp: (r) =>
        r.session.crmFollowUpSummary?.latestStatus ?? "Sin follow-up",
    estado: (r) => r.estado ?? "",
};

// ─── Date filtering helper ───────────────────────────────────────────────────

function isWithinDateRange(
    registro: RegistroWithSession,
    dateFrom?: string,
    dateTo?: string
): boolean {
    if (!dateFrom && !dateTo) return true;

    const fecha = registro.fecha ? new Date(registro.fecha) : null;
    if (!fecha) return true;

    if (dateFrom) {
        const from = new Date(`${dateFrom}T00:00:00.000`);
        if (fecha < from) return false;
    }

    if (dateTo) {
        const to = new Date(`${dateTo}T23:59:59.999`);
        if (fecha > to) return false;
    }

    return true;
}

// ─── Main export function ────────────────────────────────────────────────────

export function exportRegistrosToExcel(
    registros: RegistroWithSession[],
    options: CrmExportOptions,
    filename = "crm-registros"
): void {
    const { columns, limit, dateFrom, dateTo } = options;

    if (columns.length === 0) {
        throw new Error("Debes seleccionar al menos una columna para exportar.");
    }

    // 1. Filter by date (client-side, on already-loaded data)
    const filtered = registros.filter((r) =>
        isWithinDateRange(r, dateFrom, dateTo)
    );

    // 2. Apply record limit
    const slice = limit === "all" ? filtered : filtered.slice(0, limit);

    // 3. Build header row
    const header = columns.map((col) => EXPORT_COLUMN_LABELS[col]);

    // 4. Build data rows
    const rows = slice.map((registro) =>
        columns.map((col) => CELL_EXTRACTORS[col](registro))
    );

    // 5. Create worksheet
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

    // Auto-width columns (heuristic)
    const colWidths = header.map((h, colIdx) => {
        const maxLen = Math.max(
            h.length,
            ...rows.map((row) => String(row[colIdx] ?? "").length)
        );
        return { wch: Math.min(maxLen + 4, 60) };
    });
    ws["!cols"] = colWidths;

    // Style header row (bold)
    for (let c = 0; c < header.length; c++) {
        const cellAddr = XLSX.utils.encode_cell({ r: 0, c });
        if (ws[cellAddr]) {
            ws[cellAddr].s = { font: { bold: true } };
        }
    }

    // 6. Create workbook and download
    const wb = XLSX.utils.book_new();
    const dateLabel = new Date().toISOString().split("T")[0];
    XLSX.utils.book_append_sheet(wb, ws, "Registros");
    XLSX.writeFile(wb, `${filename}-${dateLabel}.xlsx`);
}
