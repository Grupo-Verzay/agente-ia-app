'use client';

import { useState, useEffect, useCallback } from 'react';
import { FaWhatsapp } from 'react-icons/fa';
import { Loader2, QrCode, CheckCircle2, RefreshCw, ArrowLeftRight } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { switchInstanceAdapter } from '@/actions/instances-actions';
import { toast } from 'sonner';

interface BaileysInstanceCardProps {
  instanceName: string;
}

interface StatusResponse {
  instanceName?: string;
  connected: boolean;
  hasQr: boolean;
}

const POLL_INTERVAL_MS = 8000;

export const BaileysInstanceCard = ({ instanceName }: BaileysInstanceCardProps) => {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [qrTimestamp, setQrTimestamp] = useState(Date.now());
  const [loadingQr, setLoadingQr] = useState(true);
  const [showSwitchDialog, setShowSwitchDialog] = useState(false);
  const [switchingAdapter, setSwitchingAdapter] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/baileys/status/${encodeURIComponent(instanceName)}`, {
        cache: 'no-store',
      });
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

  const handleSwitchToEvolution = async () => {
    setSwitchingAdapter(true);
    const result = await switchInstanceAdapter(instanceName, 'Whatsapp');
    setSwitchingAdapter(false);
    setShowSwitchDialog(false);
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };

  const qrSrc = `/api/baileys/qr/${encodeURIComponent(instanceName)}?t=${qrTimestamp}`;
  const connected = status?.connected ?? false;
  const hasQr = status?.hasQr ?? false;

  return (
    <>
      <Card className="border-border flex-1">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>{instanceName}</CardTitle>
            <Badge variant="outline" className="text-green-500 border-green-500 gap-1">
              <FaWhatsapp className="w-3 h-3" />
              Baileys
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex items-center gap-3 min-h-[48px]">
            {status === null ? (
              <Loader2 className="animate-spin w-4 h-4 text-muted-foreground" />
            ) : connected ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span className="text-sm font-medium text-green-600">Conectado a WhatsApp</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">
                {hasQr ? 'QR listo — escanea para conectar' : 'Desconectado'}
              </span>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex gap-2 justify-between">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowSwitchDialog(true)}
            disabled={switchingAdapter}
          >
            {switchingAdapter
              ? <Loader2 className="animate-spin w-4 h-4 mr-1" />
              : <ArrowLeftRight className="w-4 h-4 mr-1" />}
            Cambiar a Evolution
          </Button>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={fetchStatus}
              title="Actualizar estado"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            {!connected && (
              <Button
                size="sm"
                onClick={() => {
                  setLoadingQr(true);
                  setQrTimestamp(Date.now());
                  setShowQrDialog(true);
                }}
              >
                <QrCode className="w-4 h-4 mr-1" />
                Ver QR
              </Button>
            )}
          </div>
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
    </>
  );
};
