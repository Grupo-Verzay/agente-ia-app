'use client';

import { useState, useEffect, useCallback } from 'react';
import { FaWhatsapp } from 'react-icons/fa';
import { Loader2, QrCode, RefreshCw, Power, Trash2, AlertCircle } from 'lucide-react';
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
  restartWahaInstance,
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

/**
 * Cuanto se espera a que la sesion llegue a SCAN_QR_CODE tras reiniciarla.
 * Medido contra el servidor: el reinicio la deja lista en unos 3 segundos.
 */
const ESPERA_MAXIMA_PARA_EL_QR_MS = 40000;
const PASO_DE_ESPERA_MS = 2000;

/** Lo que puede estar pasando dentro del dialogo del QR. */
type EstadoDelQr =
  | { fase: 'preparando' }
  | { fase: 'listo' }
  | { fase: 'fallo'; motivo: string };

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
  const [estadoQr, setEstadoQr] = useState<EstadoDelQr>({ fase: 'preparando' });
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

  // Se refresca la imagen mientras hay QR de verdad: WAHA rota el código cada
  // pocos segundos y el navegador cachearía el anterior sin el `?t=`. Solo en
  // fase 'listo': si la sesión no está esperando escaneo, cada petición tarda
  // 10 s en contestar 422 y, con un refresco de 8 s, se pisan unas a otras y la
  // pantalla se queda girando para siempre. Fue justo lo que pasó.
  useEffect(() => {
    if (!showQrDialog || estadoQr.fase !== 'listo') return;
    const id = setInterval(() => setQrTimestamp(Date.now()), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [showQrDialog, estadoQr.fase]);

  /**
   * Deja la sesión en condiciones de dar el QR y solo entonces lo pide.
   *
   * WAHA entrega el QR ÚNICAMENTE en `SCAN_QR_CODE`; en cualquier otro estado
   * contesta 422. Pedirlo a ciegas era el error: la tarjeta enseñaba un spinner
   * eterno en vez de decir que había que reiniciar la sesión.
   */
  const prepararQr = useCallback(async () => {
    setEstadoQr({ fase: 'preparando' });

    const leerEstado = async (): Promise<string | null> => {
      try {
        const res = await fetch(`/api/waha/status/${encodeURIComponent(instanceName)}`, { cache: 'no-store' });
        if (!res.ok) return null;
        return ((await res.json()) as StatusResponse).status ?? null;
      } catch {
        return null;
      }
    };

    let estado = await leerEstado();

    if (estado !== 'SCAN_QR_CODE') {
      const res = await restartWahaInstance(instanceName);
      if (!res.success) {
        setEstadoQr({ fase: 'fallo', motivo: res.message });
        return;
      }

      const limite = Date.now() + ESPERA_MAXIMA_PARA_EL_QR_MS;
      while (Date.now() < limite) {
        await new Promise((r) => setTimeout(r, PASO_DE_ESPERA_MS));
        estado = await leerEstado();
        if (estado === 'SCAN_QR_CODE' || estado === 'WORKING') break;
      }
    }

    if (estado === 'WORKING') {
      setShowQrDialog(false);
      fetchStatus();
      return;
    }

    if (estado !== 'SCAN_QR_CODE') {
      setEstadoQr({
        fase: 'fallo',
        motivo: `La sesión no llegó a pedir el escaneo (se quedó en ${estado ?? 'desconocido'}). Vuelve a intentarlo.`,
      });
      return;
    }

    setQrTimestamp(Date.now());
    setEstadoQr({ fase: 'listo' });
  }, [instanceName, fetchStatus]);

  const handleStart = async () => {
    setStarting(true);
    const result = await startWahaInstance(instanceName);
    if (result.success) {
      setStarting(false);
      fetchStatus();
      setShowQrDialog(true);
      prepararQr();
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
    setShowQrDialog(true);
    prepararQr();
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
              <span className="truncate">WhatsApp Mensajería (QR)</span>
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
            <DialogTitle>Escanea con WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            {estadoQr.fase === 'preparando' && (
              <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="animate-spin w-5 h-5" />
                Preparando la sesión...
              </div>
            )}

            {/* Nunca un spinner sin final: si no se puede dar el QR, se dice por
                qué y se deja reintentar. */}
            {estadoQr.fase === 'fallo' && (
              <div className="flex flex-col items-center gap-3 py-6">
                <AlertCircle className="w-6 h-6 text-amber-600" />
                <p className="text-center text-sm text-muted-foreground">{estadoQr.motivo}</p>
                <Button size="sm" variant="outline" onClick={prepararQr}>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Reintentar
                </Button>
              </div>
            )}

            {estadoQr.fase === 'listo' && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={qrTimestamp}
                  src={qrSrc}
                  alt="QR WhatsApp Mensajería"
                  width={320}
                  height={320}
                  onError={() =>
                    setEstadoQr({
                      fase: 'fallo',
                      motivo: 'El código dejó de estar disponible. Reintenta para pedir uno nuevo.',
                    })
                  }
                  className="rounded-lg border-4 border-black"
                />
                <p className="text-xs text-muted-foreground text-center">
                  Abre WhatsApp → Dispositivos vinculados → Vincular dispositivo.
                  El código se renueva solo cada 8 segundos.
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar instancia?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{visibleName}</strong> y su sesión de WhatsApp Mensajeria. Tendrás que
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
