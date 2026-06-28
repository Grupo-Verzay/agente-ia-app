'use client';

import { ReactNode } from 'react';
import { QrCode, Loader2, CheckCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface QrScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** El QR ya renderizado (next/image o QRCodeSVG). Va dentro del recuadro estándar. */
  qr?: ReactNode;
  /** Pasos de "Lee antes de escanear" (lista numerada). */
  steps?: ReactNode[];
  loading?: boolean;
  error?: string | null;
  connected?: boolean;
  connectedText?: string;
  /** Muestra "Esperando escaneo…" bajo los pasos. */
  waiting?: boolean;
}

/**
 * Diálogo de escaneo de QR unificado para todas las vinculaciones de WhatsApp
 * (Evolution/Mensajería, Llamadas, etc.), para que se vean idénticos.
 */
export function QrScanDialog({
  open,
  onOpenChange,
  title,
  description,
  qr,
  steps = [],
  loading = false,
  error = null,
  connected = false,
  connectedText = 'Conectado correctamente',
  waiting = false,
}: QrScanDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : error ? (
          <p className="py-2 text-sm text-red-500">{error}</p>
        ) : connected ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <CheckCircle className="h-10 w-10 text-green-500" />
            <p className="font-medium text-green-600">{connectedText}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="flex h-[312px] w-[312px] items-center justify-center rounded-lg border bg-white p-2">
              {qr ?? (
                <span className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" /> Generando QR…
                </span>
              )}
            </div>
            {steps.length > 0 && (
              <div className="mt-4 w-full space-y-2 text-left text-sm">
                <h3 className="text-base font-semibold">🤚 Lee antes de escanear:</h3>
                <ol className="list-inside list-decimal space-y-1">
                  {steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>
            )}
            {waiting && (
              <p className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Esperando escaneo…
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
