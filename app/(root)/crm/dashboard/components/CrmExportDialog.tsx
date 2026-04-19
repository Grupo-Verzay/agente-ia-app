"use client";

/**
 * CrmExportDialog — ISP / DIP
 *
 * Focused interface: only cares about registros + export options.
 * Delegates all I/O to the injected `onExport` callback (or the
 * default exportRegistrosToExcel service), so this component is
 * testable and decoupled from the xlsx library.
 */

import { useState } from "react";
import { Download, FileSpreadsheet, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { RegistroWithSession } from "@/types/session";
import { toast } from "sonner";

import {
    EXPORT_ALL_COLUMNS,
    EXPORT_COLUMN_LABELS,
    exportRegistrosToExcel,
    type CrmExportOptions,
    type ExportColumnId,
} from "../lib/crmExportService";

// ─── Props ───────────────────────────────────────────────────────────────────

export type CrmExportDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    registros: RegistroWithSession[];
    /** Override for testing / custom export logic. Defaults to xlsx export. */
    onExport?: (registros: RegistroWithSession[], options: CrmExportOptions) => void;
};

// ─── Limit presets ───────────────────────────────────────────────────────────

const LIMIT_PRESETS: Array<{ label: string; value: number | "all" }> = [
    { label: "100 registros", value: 100 },
    { label: "500 registros", value: 500 },
    { label: "1 000 registros", value: 1000 },
    { label: "Todos", value: "all" },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function CrmExportDialog({
    open,
    onOpenChange,
    registros,
    onExport,
}: CrmExportDialogProps) {
    // Column selection
    const [selectedColumns, setSelectedColumns] =
        useState<ExportColumnId[]>(EXPORT_ALL_COLUMNS);

    // Limit
    const [limitPreset, setLimitPreset] = useState<number | "all" | "custom">(
        "all"
    );
    const [customLimit, setCustomLimit] = useState("");

    // Date range (client-side filter on loaded data)
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    const [isExporting, setIsExporting] = useState(false);

    // ── Helpers ──────────────────────────────────────────────────────────────

    const toggleColumn = (col: ExportColumnId) => {
        setSelectedColumns((prev) =>
            prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
        );
    };

    const toggleAllColumns = () => {
        setSelectedColumns((prev) =>
            prev.length === EXPORT_ALL_COLUMNS.length ? [] : EXPORT_ALL_COLUMNS
        );
    };

    const resolvedLimit = (): number | "all" => {
        if (limitPreset === "custom") {
            const n = parseInt(customLimit, 10);
            return Number.isFinite(n) && n > 0 ? n : "all";
        }
        return limitPreset;
    };

    const previewCount = (): number => {
        const lim = resolvedLimit();
        const base = registros.length;
        return lim === "all" ? base : Math.min(lim, base);
    };

    // ── Handlers ─────────────────────────────────────────────────────────────

    const handleExport = async () => {
        if (selectedColumns.length === 0) {
            toast.error("Selecciona al menos una columna para exportar.");
            return;
        }

        setIsExporting(true);
        try {
            const options: CrmExportOptions = {
                columns: selectedColumns,
                limit: resolvedLimit(),
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
            };

            if (onExport) {
                onExport(registros, options);
            } else {
                exportRegistrosToExcel(registros, options);
            }

            toast.success(
                `Se exportaron ${previewCount()} registros en formato Excel.`
            );
            onOpenChange(false);
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : "Error al exportar el archivo."
            );
        } finally {
            setIsExporting(false);
        }
    };

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-lg">
                {/* Header */}
                <DialogHeader className="px-6 pt-6 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                            <FileSpreadsheet className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <DialogTitle className="text-base">Exportar registros</DialogTitle>
                            <DialogDescription className="text-xs">
                                Configura qué datos incluir en el archivo Excel.
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <Separator />

                {/* Body */}
                <ScrollArea className="flex-1 overflow-y-auto">
                    <div className="space-y-6 px-6 py-5">

                        {/* ── Columnas ─────────────────────────────────────── */}
                        <section className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-sm font-medium">Columnas a exportar</Label>
                                <button
                                    type="button"
                                    onClick={toggleAllColumns}
                                    className="text-xs text-primary underline-offset-2 hover:underline"
                                >
                                    {selectedColumns.length === EXPORT_ALL_COLUMNS.length
                                        ? "Deseleccionar todas"
                                        : "Seleccionar todas"}
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                {EXPORT_ALL_COLUMNS.map((col) => (
                                    <label
                                        key={col}
                                        className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm transition-colors hover:bg-muted/50 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5"
                                    >
                                        <Checkbox
                                            checked={selectedColumns.includes(col)}
                                            onCheckedChange={() => toggleColumn(col)}
                                            id={`export-col-${col}`}
                                        />
                                        <span>{EXPORT_COLUMN_LABELS[col]}</span>
                                    </label>
                                ))}
                            </div>

                            {selectedColumns.length === 0 && (
                                <p className="flex items-center gap-1.5 text-xs text-destructive">
                                    <Info className="h-3.5 w-3.5 shrink-0" />
                                    Selecciona al menos una columna.
                                </p>
                            )}
                        </section>

                        <Separator />

                        {/* ── Cantidad de registros ─────────────────────────── */}
                        <section className="space-y-3">
                            <Label className="text-sm font-medium">Cantidad de registros</Label>

                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {LIMIT_PRESETS.map((preset) => (
                                    <button
                                        key={String(preset.value)}
                                        type="button"
                                        onClick={() => setLimitPreset(preset.value)}
                                        className={[
                                            "rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                                            limitPreset === preset.value
                                                ? "border-primary bg-primary/10 text-primary"
                                                : "border-border/60 hover:bg-muted/50",
                                        ].join(" ")}
                                    >
                                        {preset.label}
                                    </button>
                                ))}

                                {/* Custom */}
                                <button
                                    type="button"
                                    onClick={() => setLimitPreset("custom")}
                                    className={[
                                        "col-span-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors sm:col-span-4",
                                        limitPreset === "custom"
                                            ? "border-primary bg-primary/10 text-primary"
                                            : "border-border/60 hover:bg-muted/50",
                                    ].join(" ")}
                                >
                                    Cantidad personalizada
                                </button>
                            </div>

                            {limitPreset === "custom" && (
                                <Input
                                    type="number"
                                    min={1}
                                    placeholder="Ej: 250"
                                    value={customLimit}
                                    onChange={(e) => setCustomLimit(e.target.value)}
                                    className="h-9"
                                    autoFocus
                                />
                            )}

                            <p className="text-xs text-muted-foreground">
                                Se exportarán{" "}
                                <span className="font-semibold text-foreground">
                                    {previewCount().toLocaleString("es-ES")}
                                </span>{" "}
                                de{" "}
                                <span className="font-semibold text-foreground">
                                    {registros.length.toLocaleString("es-ES")}
                                </span>{" "}
                                registros cargados actualmente.
                            </p>
                        </section>

                        <Separator />

                        {/* ── Rango de fechas (filtro cliente) ─────────────── */}
                        <section className="space-y-3">
                            <div>
                                <Label className="text-sm font-medium">
                                    Filtrar por fecha
                                </Label>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    Aplica un filtro adicional sobre los registros ya cargados.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="export-date-from" className="text-xs text-muted-foreground">
                                        Desde
                                    </Label>
                                    <Input
                                        id="export-date-from"
                                        type="date"
                                        className="h-9"
                                        value={dateFrom}
                                        max={dateTo || undefined}
                                        onChange={(e) => setDateFrom(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="export-date-to" className="text-xs text-muted-foreground">
                                        Hasta
                                    </Label>
                                    <Input
                                        id="export-date-to"
                                        type="date"
                                        className="h-9"
                                        value={dateTo}
                                        min={dateFrom || undefined}
                                        onChange={(e) => setDateTo(e.target.value)}
                                    />
                                </div>
                            </div>

                            {(dateFrom || dateTo) && (
                                <button
                                    type="button"
                                    onClick={() => { setDateFrom(""); setDateTo(""); }}
                                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                                >
                                    Limpiar fechas
                                </button>
                            )}
                        </section>
                    </div>
                </ScrollArea>

                <Separator />

                {/* Footer */}
                <DialogFooter className="flex-row items-center justify-between gap-3 px-6 py-4">
                    <p className="text-xs text-muted-foreground">
                        Formato: <span className="font-medium text-foreground">.xlsx</span>
                    </p>

                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenChange(false)}
                            disabled={isExporting}
                        >
                            Cancelar
                        </Button>

                        <Button
                            size="sm"
                            onClick={handleExport}
                            disabled={isExporting || selectedColumns.length === 0}
                            className="gap-2"
                        >
                            <Download className="h-4 w-4" />
                            {isExporting ? "Exportando…" : "Exportar Excel"}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
