"use client";

import { useRef, useState, useTransition } from "react";
import { Download, HardDriveUpload, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  exportUserBackupAction,
  importUserBackupAction,
} from "@/actions/user-backup-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type BackupPreview = {
  exportedAt?: string;
  sourceName?: string | null;
  sourceCompany?: string | null;
  version?: number;
  counts: {
    sessions: number;
    registros: number;
    workflows: number;
    reminders: number;
    products: number;
    financeTransactions: number;
  };
};

function buildPreview(rawContent: string): BackupPreview | null {
  try {
    const parsed = JSON.parse(rawContent);

    return {
      exportedAt: parsed?.exportedAt,
      sourceName: parsed?.source?.name ?? null,
      sourceCompany: parsed?.source?.company ?? null,
      version: parsed?.version,
      counts: {
        sessions: Array.isArray(parsed?.data?.sessions) ? parsed.data.sessions.length : 0,
        registros: Array.isArray(parsed?.data?.registros) ? parsed.data.registros.length : 0,
        workflows: Array.isArray(parsed?.data?.workflows) ? parsed.data.workflows.length : 0,
        reminders: Array.isArray(parsed?.data?.reminders) ? parsed.data.reminders.length : 0,
        products: Array.isArray(parsed?.data?.products) ? parsed.data.products.length : 0,
        financeTransactions: Array.isArray(parsed?.data?.financeTransactions)
          ? parsed.data.financeTransactions.length
          : 0,
      },
    };
  } catch {
    return null;
  }
}

function downloadJson(fileName: string, content: string) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function formatDate(date?: string) {
  if (!date) return "Sin fecha";

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;

  return parsed.toLocaleString("es-CO");
}

/**
 * Exportar y restaurar el respaldo de un usuario.
 *
 * Vive siempre dentro de un diálogo, y el diálogo ya pone el título y la
 * descripción arriba: aquí no se repiten. Antes sí lo hacía —encabezado propio,
 * un aviso de cuatro líneas sobre el reemplazo y descripciones largas en cada
 * bloque— y el resultado era un modal de más de 600 px que obligaba a
 * desplazarse para llegar a los dos únicos botones que hay.
 *
 * El aviso de que restaurar reemplaza los datos no se pierde: pasa a una línea
 * dentro de "Restaurar", que es donde hace falta leerlo.
 *
 * Tampoco hay pie con "Cerrar": el diálogo ya trae su ✕ y aquí no hay nada que
 * guardar —cada botón actúa al pulsarlo—, así que un pie solo añadiría alto.
 */
export function UserBackupManager({
  targetUserId,
  onImported,
}: {
  targetUserId: string;
  onImported?: () => void | Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isExportPending, startExportTransition] = useTransition();
  const [isImportPending, startImportTransition] = useTransition();
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFileContent, setSelectedFileContent] = useState("");
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const isReadyToImport = selectedFileContent.length > 0;
  const ocupado = isExportPending || isImportPending;

  const handleExport = () => {
    startExportTransition(async () => {
      const toastId = `export-backup-${targetUserId}`;
      toast.loading("Generando backup...", { id: toastId });

      const result = await exportUserBackupAction(targetUserId);

      if (!result.success) {
        toast.error(result.message, { id: toastId });
        return;
      }

      downloadJson(result.fileName, result.fileContents);
      toast.success("Backup descargado.", { id: toastId });
    });
  };

  const handleSelectFile = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      setSelectedFileName("");
      setSelectedFileContent("");
      setPreview(null);
      return;
    }

    try {
      const rawContent = await file.text();
      const nextPreview = buildPreview(rawContent);

      if (!nextPreview) {
        toast.error("El archivo no tiene un formato de backup válido.");
        event.target.value = "";
        setSelectedFileName("");
        setSelectedFileContent("");
        setPreview(null);
        return;
      }

      setSelectedFileName(file.name);
      setSelectedFileContent(rawContent);
      setPreview(nextPreview);
    } catch (error) {
      console.error("[UserBackupManager] read file", error);
      toast.error("No se pudo leer el archivo seleccionado.");
    }
  };

  const handleImport = () => {
    if (!isReadyToImport) {
      toast.error("Selecciona un archivo de backup antes de restaurar.");
      return;
    }

    startImportTransition(async () => {
      const toastId = `import-backup-${targetUserId}`;
      toast.loading("Restaurando backup...", { id: toastId });

      const result = await importUserBackupAction({
        targetUserId,
        rawBackup: selectedFileContent,
      });

      if (!result.success) {
        toast.error(result.message, { id: toastId });
        return;
      }

      setSelectedFileName("");
      setSelectedFileContent("");
      setPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      await onImported?.();
      toast.success("Backup restaurado correctamente.", { id: toastId });
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border p-4">
        {/* `ml-auto` en el botón: al estrecharse la ventana la fila se parte y
            sin eso el botón caía debajo y pegado a la izquierda. */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-sm font-semibold">Exportar</p>
            <p className="text-xs text-muted-foreground">
              Sesiones, CRM, workflows, finanzas y recordatorios.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="ml-auto shrink-0"
            onClick={handleExport}
            disabled={ocupado}
          >
            {isExportPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Exportar
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <div>
          <p className="text-sm font-semibold">Restaurar</p>
          <p className="text-xs text-muted-foreground">
            Reemplaza la configuración y los datos actuales por los del archivo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Input
            id={`backup-file-${targetUserId}`}
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleSelectFile}
            disabled={ocupado}
            className="h-9 min-w-0 flex-1 basis-48 text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="ml-auto shrink-0"
            onClick={handleImport}
            disabled={!isReadyToImport || ocupado}
          >
            {isImportPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <HardDriveUpload className="mr-2 h-4 w-4" />
            )}
            Restaurar
          </Button>
        </div>

        {selectedFileName && preview ? (
          <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs">
            <p className="font-medium">{selectedFileName}</p>
            <div className="mt-1 text-muted-foreground">
              <p>
                {preview.sourceCompany || preview.sourceName || "Sin nombre"} ·{" "}
                {formatDate(preview.exportedAt)}
              </p>
              <div className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
                <p>Sesiones: {preview.counts.sessions}</p>
                <p>Registros CRM: {preview.counts.registros}</p>
                <p>Workflows: {preview.counts.workflows}</p>
                <p>Recordatorios: {preview.counts.reminders}</p>
                <p>Productos: {preview.counts.products}</p>
                <p>Movimientos: {preview.counts.financeTransactions}</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
