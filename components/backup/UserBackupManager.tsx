"use client";

import { useRef, useState, useTransition } from "react";
import { Download, HardDriveUpload, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import {
  exportUserBackupAction,
  importUserBackupAction,
} from "@/actions/user-backup-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const RESTORE_CONFIRMATION_TEXT = "RESTAURAR";

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
    const parsed = JSON.parse(rawContent) as any;

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

export function UserBackupManager({
  targetUserId,
  subjectLabel,
  onImported,
}: {
  targetUserId: string;
  subjectLabel: string;
  onImported?: () => void | Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isExportPending, startExportTransition] = useTransition();
  const [isImportPending, startImportTransition] = useTransition();
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFileContent, setSelectedFileContent] = useState("");
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [isReplaceConfirmed, setIsReplaceConfirmed] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");

  const isReadyToImport =
    selectedFileContent.length > 0 &&
    isReplaceConfirmed &&
    confirmationText.trim().toUpperCase() === RESTORE_CONFIRMATION_TEXT;

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
      toast.error(
        "Confirma la restauración y escribe la palabra requerida antes de continuar."
      );
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

      setConfirmationText("");
      setIsReplaceConfirmed(false);
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
    <Card className="border-border">
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg">Copias de seguridad</CardTitle>
        <CardDescription>
          Exporta un respaldo completo de {subjectLabel} en JSON o restaura uno
          existente reemplazando los datos actuales.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Importación con reemplazo</AlertTitle>
          <AlertDescription>
            La restauración conserva la identidad del usuario actual, pero
            reemplaza su configuración y datos funcionales por el contenido del
            backup.
          </AlertDescription>
        </Alert>

        <div className="flex flex-col gap-3 rounded-lg border border-border/70 p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Exportar backup</p>
            <p className="text-sm text-muted-foreground">
              Descarga un archivo JSON con sesiones, CRM, workflows, finanzas,
              recordatorios y configuración asociada.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={handleExport}
              disabled={isExportPending || isImportPending}
            >
              {isExportPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Exportar respaldo
            </Button>
          </div>
        </div>

        <Separator />

        <div className="space-y-4 rounded-lg border border-border/70 p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Importar backup</p>
            <p className="text-sm text-muted-foreground">
              Selecciona un archivo generado por Verzay y valida la operación
              antes de restaurar.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`backup-file-${targetUserId}`}>Archivo de backup</Label>
            <Input
              id={`backup-file-${targetUserId}`}
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleSelectFile}
              disabled={isImportPending || isExportPending}
            />
          </div>

          {selectedFileName ? (
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{selectedFileName}</p>
              {preview ? (
                <div className="mt-2 space-y-2 text-muted-foreground">
                  <p>
                    Fuente: {preview.sourceCompany || preview.sourceName || "Sin nombre"}
                  </p>
                  <p>Exportado: {formatDate(preview.exportedAt)}</p>
                  <p>Versión del backup: {preview.version ?? "Desconocida"}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <p>Sesiones: {preview.counts.sessions}</p>
                    <p>Registros CRM: {preview.counts.registros}</p>
                    <p>Workflows: {preview.counts.workflows}</p>
                    <p>Recordatorios: {preview.counts.reminders}</p>
                    <p>Productos: {preview.counts.products}</p>
                    <p>Movimientos finanzas: {preview.counts.financeTransactions}</p>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50/60 p-3">
            <Checkbox
              id={`backup-confirm-${targetUserId}`}
              checked={isReplaceConfirmed}
              onCheckedChange={(checked) => setIsReplaceConfirmed(Boolean(checked))}
              disabled={isImportPending || isExportPending}
            />
            <div className="space-y-1">
              <Label htmlFor={`backup-confirm-${targetUserId}`}>
                Confirmo que deseo reemplazar los datos actuales de {subjectLabel}
              </Label>
              <p className="text-xs text-muted-foreground">
                Esta acción sobrescribe la información operativa guardada para
                este usuario.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`backup-phrase-${targetUserId}`}>
              Escribe <span className="font-semibold">{RESTORE_CONFIRMATION_TEXT}</span> para continuar
            </Label>
            <Input
              id={`backup-phrase-${targetUserId}`}
              value={confirmationText}
              onChange={(event) => setConfirmationText(event.target.value)}
              placeholder={RESTORE_CONFIRMATION_TEXT}
              disabled={isImportPending || isExportPending}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="destructive"
              onClick={handleImport}
              disabled={!isReadyToImport || isImportPending || isExportPending}
            >
              {isImportPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <HardDriveUpload className="mr-2 h-4 w-4" />
              )}
              Restaurar backup
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
