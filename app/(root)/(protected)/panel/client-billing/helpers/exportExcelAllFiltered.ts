import * as XLSX from "xlsx";
import type { Table } from "@tanstack/react-table";

import type { ClientRow } from "@/types/billing";
import { DICTIONARY_COLS } from "@/types/ai-assistence-chat";
import { getExportValue } from "./getExportValue";

// Labels (puedes dejarlo aquí o exportarlo)
export const COLUMNS_LABELS = Object.fromEntries(
    DICTIONARY_COLS.map((col) => [col.key, col.label])
);

export function exportExcelAllFiltered(
    table: Table<ClientRow>,
    opts?: {
        fileNamePrefix?: string;
        sheetName?: string;
        excludeColumnIds?: string[];
    }
) {
    try {
        const exclude = new Set([...(opts?.excludeColumnIds ?? ["actions"])]);

        // Columnas visibles (excepto acciones)
        const visibleCols = table
            .getVisibleLeafColumns()
            .filter((c) => !exclude.has(c.id));

        // Filas filtradas (todas, no solo la página actual)
        const rows = table.getFilteredRowModel().rows;

        const json = rows.map((r) => {
            const u: ClientRow = r.original;
            const obj: Record<string, any> = {};

            for (const col of visibleCols) {
                const label = COLUMNS_LABELS[col.id] || col.id;
                obj[label] = getExportValue(u, col.id);
            }

            return obj;
        });

        const ws = XLSX.utils.json_to_sheet(json);
        const wb = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(wb, ws, opts?.sheetName ?? "Clientes");

        const date = new Date().toISOString().slice(0, 10);
        const prefix = opts?.fileNamePrefix ?? "billing-crm";
        XLSX.writeFile(wb, `${prefix}-${date}.xlsx`);

        console.log("[exportExcelAllFiltered]", "Exportación completada exitosamente.");

    } catch (e) {
        console.error("[exportExcelAllFiltered]", e);
    }
}