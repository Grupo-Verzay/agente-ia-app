'use client';

import { useState, useEffect, useCallback } from 'react';
import { FaWhatsapp } from 'react-icons/fa';
import { Loader2, QrCode, RefreshCw, ArrowLeftRight, Power, Trash2 } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { switchInstanceAdapter, startBaileysSession, stopBaileysSession, deleteBaileysInstance } from '@/actions/instances-actions';
import { toast } from 'sonner';

interface BaileysInstanceCardProps {
  instanceName: string;
}

interface StatusResponse {
  connected: boolean;
  hasQr: boolean;
  profileName?: string | null;
  phoneNumber?: string | null;
}

const POLL_INTERVAL_MS = 8000;

export const BaileysInstanceCard = ({ instanceName }: BaileysInstanceCardProps) => {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [qrTimestamp, setQrTimestamp] = useState(Date.now());
  const [loadingQr, setLoadingQr] = useState(true);
  const [showSwitchDialog, setShowSwitchDialog] = useState(false);
  const [switchingAdapter, setSwitchingAdapter] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/baileys/status/${encodeURIComponent(instanceName)}`, { cache: 'no-store' });
      if (res.ok) {
        const data: StatusResponse = await res.json();
        setStatus(data);
        if (data.connected && showQrDialog) setShowQrDialog(false);
      }
    } catch {}
  }, [instanceName, showQrDialog]);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchStatus]);

  useEffect(() => {
    if (!showQrDialog) return;
    const id = setInterval(() => setQrTimestamp(Date.now()), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [showQrDialog]);

  const handleStart = async () => {
    setStarting(true);
    const result = await startBaileysSession(instanceName);
    if (result.success) {
      setTimeout(() => {
        fetchStatus();
        setQrTimestamp(Date.now());
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
    const result = await stopBaileysSession(instanceName);
    setStopping(false);
    if (result.success) {
      toast.success('Sesión desconectada.');
      fetchStatus();
    } else {
      toast.error(result.message);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const result = await deleteBaileysInstance(instanceName);
    setDeleting(false);
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
      setShowDeleteDialog(false);
    }
  };

  const handleSwitchToEvolution = async () => {
    setSwitchingAdapter(true);
    const result = await switchInstanceAdapter(instanceName, 'Whatsapp');
    setSwitchingAdapter(false);
    setShowSwitchDialog(false);
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
  };

  const openQrDialog = () => {
    setLoadingQr(true);
    setQrTimestamp(Date.now());
    setShowQrDialog(true);
  };

  const connected = status?.connected ?? false;
  const hasQr = status?.hasQr ?? false;
  const profileName = status?.profileName;
  const phoneNumber = status?.phoneNumber;
  const userInitial = instanceName.charAt(0).toUpperCase();
  const qrSrc = `/api/baileys/qr/${encodeURIComponent(instanceName)}?t=${qrTimestamp}`;

  return (
    <>
      <Card className="border-border flex-1">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>{instanceName}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-green-500 border-green-500 gap-1">
                <FaWhatsapp className="w-3 h-3" />
                Baileys
              </Badge>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
                title="Eliminar instancia"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Fila de perfil */}
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
                  {profileName ? (
                    <>
                      <div className="text-sm font-medium">{profileName}</div>
                      <div className="text-xs text-muted-foreground">+{phoneNumber}</div>
                    </>
                  ) : (
                    <>
                      <Skeleton className="h-4 w-[120px] mb-1" />
                      <Skeleton className="h-3 w-[100px]" />
                    </>
                  )}
                </div>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">
                {starting ? 'Iniciando sesión...' : hasQr ? 'QR listo — escanea para conectar' : 'Desconectado'}
              </span>
            )}
          </div>

          {/* Fila de acciones principales */}
          <div className="flex gap-2">
            {connected ? (
              <>
                <Button
                  size="sm"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  onClick={openQrDialog}
                >
                  <QrCode className="w-4 h-4 mr-1" />
                  Conectado
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  onClick={handleStop}
                  disabled={stopping}
                >
                  {stopping
                    ? <Loader2 className="animate-spin w-4 h-4 mr-1" />
                    : <Power className="w-4 h-4 mr-1" />}
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
                {starting
                  ? <Loader2 className="animate-spin w-4 h-4 mr-1" />
                  : <RefreshCw className="w-4 h-4 mr-1" />}
                Reconectar
              </Button>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex justify-between items-center">
          <Button size="sm" variant="outline" onClick={() => setShowSwitchDialog(true)} disabled={switchingAdapter}>
            {switchingAdapter
              ? <Loader2 className="animate-spin w-4 h-4 mr-1" />
              : <ArrowLeftRight className="w-4 h-4 mr-1" />}
            Cambiar a Evolution
          </Button>
          <Button size="sm" variant="outline" onClick={fetchStatus} title="Actualizar estado">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Escanea con WhatsApp — {instanceName}</DialogTitle>
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
              alt="QR WhatsApp Baileys"
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

      <AlertDialog open={showSwitchDialog} onOpenChange={setShowSwitchDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cambiar a Evolution API?</AlertDialogTitle>
            <AlertDialogDescription>
              La instancia <strong>{instanceName}</strong> dejará de usar Baileys y pasará a conectarse
              por Evolution API. La sesión Baileys se cerrará.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={switchingAdapter}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSwitchToEvolution} disabled={switchingAdapter}>
              {switchingAdapter && <Loader2 className="animate-spin w-4 h-4 mr-1" />}
              Sí, cambiar a Evolution
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar instancia?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente <strong>{instanceName}</strong>, incluyendo todos sus
              contactos y mensajes almacenados. Esta acción no se puede deshacer.
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
