'use client';

import { useState, useEffect, useCallback } from 'react';
import { FaWhatsapp } from 'react-icons/fa';
import { Loader2, QrCode, RefreshCw, Power, Trash2 } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  startWahaInstance,
  stopWahaInstance,
  logoutWahaInstance,
  deleteWahaInstance,
} from '@/actions/instances-actions';
import { toast } from 'sonner';

interface WahaInstanceCardProps {
  instanceName: string;
  displayName?: string | null;
}

interface StatusResponse {
  status: string;
  connected: boolean;
  hasQr: boolean;
  pushName?: string | null;
  phoneNumber?: string | null;
}

const POLL_INTERVAL_MS = 8000;

/** Texto de la fila de estado cuando la sesión no está conectada. */
const textoDeEstado = (status: string | undefined, starting: boolean): string => {
  if (starting) return 'Iniciando sesión...';
  switch (status) {
    case 'STARTING':
      return 'Iniciando sesión...';
    case 'SCAN_QR_CODE':
      return 'QR listo — escanea para conectar';
    case 'STOPPED':
      return 'Detenida';
    case 'FAILED':
      return 'La sesión falló — reconecta para reintentar';
    default:
      return 'Desconectado';
  }
};

export const WahaInstanceCard = ({ instanceName, displayName }: WahaInstanceCardProps) => {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [qrTimestamp, setQrTimestamp] = useState(Date.now());
  const [loadingQr, setLoadingQr] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/waha/status/${encodeURIComponent(instanceName)}`, { cache: 'no-store' });
      if (res.ok) {
        const data: StatusResponse = await res.json();
        setStatus(data);
        if (data.connected && showQrDialog) setShowQrDialog(false);
      }
    } catch {
      // El ciclo sigue: un fallo suelto de red no puede dejar la tarjeta muda.
    }
  }, [instanceName, showQrDialog]);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchStatus]);

  // Mientras el diálogo del QR está abierto se refresca la imagen: WAHA rota el
  // código cada pocos segundos y el navegador cachearía el anterior sin el `?t=`.
  useEffect(() => {
    if (!showQrDialog) return;
    const id = setInterval(() => setQrTimestamp(Date.now()), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [showQrDialog]);

  const handleStart = async () => {
    setStarting(true);
    const result = await startWahaInstance(instanceName);
    if (result.success) {
      setTimeout(() => {
        fetchStatus();
        setQrTimestamp(Date.now());
        setLoadingQr(true);
        setShowQrDialog(true);
        setStarting(false);
      }, 3000);
    } else {
      toast.error(result.message);
      setStarting(false);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    const result = await stopWahaInstance(instanceName);
    setStopping(false);
    if (result.success) {
      toast.success(result.message);
      fetchStatus();
    } else {
      toast.error(result.message);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    const result = await logoutWahaInstance(instanceName);
    setLoggingOut(false);
    if (result.success) {
      toast.success(result.message);
      fetchStatus();
    } else {
      toast.error(result.message);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const result = await deleteWahaInstance(instanceName);
    setDeleting(false);
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
      setShowDeleteDialog(false);
    }
  };

  const openQrDialog = () => {
    setLoadingQr(true);
    setQrTimestamp(Date.now());
    setShowQrDialog(true);
  };

  const connected = status?.connected ?? false;
  const hasQr = status?.hasQr ?? false;
  const visibleName = displayName ?? instanceName;
  const userInitial = visibleName.charAt(0).toUpperCase();
  const qrSrc = `/api/waha/qr/${encodeURIComponent(instanceName)}?t=${qrTimestamp}`;

  return (
    <>
      <Card className="border-border flex-1">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2 min-w-0">
              <FaWhatsapp className="w-5 h-5 shrink-0 text-green-500" />
              <span className="truncate">WhatsApp V2</span>
            </CardTitle>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              title="Eliminar instancia"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            {status === null ? (
              <>
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div>
                  <Skeleton className="h-4 w-[120px] mb-1" />
                  <Skeleton className="h-3 w-[100px]" />
                </div>
              </>
            ) : connected ? (
              <>
                <Avatar className="rounded-lg">
                  <AvatarFallback className="rounded-lg">{userInitial}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-sm font-medium">{status.pushName ?? visibleName}</div>
                  {status.phoneNumber && (
                    <div className="text-xs text-muted-foreground">+{status.phoneNumber}</div>
                  )}
                </div>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">
                {textoDeEstado(status.status, starting)}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            {connected ? (
              <>
                <Button
                  size="sm"
                  className="flex-1 text-white"
                  style={{ backgroundColor: '#16a34a' }}
                  disabled
                >
                  <QrCode className="w-4 h-4 mr-1" />
                  Conectado
                </Button>
                <Button
                  size="sm"
                  className="flex-1 text-white"
                  style={{ backgroundColor: '#dc2626' }}
                  onClick={handleStop}
                  disabled={stopping}
                >
                  {stopping ? (
                    <Loader2 className="animate-spin w-4 h-4 mr-1" />
                  ) : (
                    <Power className="w-4 h-4 mr-1" />
                  )}
                  Apagar
                </Button>
              </>
            ) : hasQr ? (
              <Button size="sm" className="flex-1" onClick={openQrDialog}>
                <QrCode className="w-4 h-4 mr-1" />
                Ver QR
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="flex-1" onClick={handleStart} disabled={starting}>
                {starting ? (
                  <Loader2 className="animate-spin w-4 h-4 mr-1" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-1" />
                )}
                Reconectar
              </Button>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex justify-between items-center">
          <Button size="sm" variant="outline" onClick={handleLogout} disabled={loggingOut}>
            {loggingOut ? (
              <Loader2 className="animate-spin w-4 h-4 mr-1" />
            ) : (
              <Power className="w-4 h-4 mr-1" />
            )}
            Cerrar sesión
          </Button>
          <Button size="sm" variant="outline" onClick={fetchStatus} title="Actualizar estado">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Escanea con WhatsApp — {visibleName}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            {loadingQr && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="animate-spin w-4 h-4" />
                Cargando QR...
              </div>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={qrTimestamp}
              src={qrSrc}
              alt="QR WhatsApp V2"
              width={320}
              height={320}
              onLoad={() => setLoadingQr(false)}
              onError={() => setLoadingQr(false)}
              className={`rounded-lg border-4 border-black${loadingQr ? ' hidden' : ''}`}
            />
            <p className="text-xs text-muted-foreground text-center">
              El QR se actualiza automáticamente cada 8 segundos
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar instancia?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{visibleName}</strong> y su sesión de WhatsApp V2. Tendrás que
              volver a escanear el QR si quieres conectarla de nuevo. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="animate-spin w-4 h-4 mr-1" />}
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
