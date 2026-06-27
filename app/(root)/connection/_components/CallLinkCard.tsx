'use client';

import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Phone, Loader2, RefreshCw, Trash2, QrCode, CheckCircle2, Power } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  getMyCallSession,
  linkMyCallSession,
  getMyCallQr,
  unlinkMyCallSession,
} from '@/actions/astracalls-actions';

export function CallLinkCard() {
  const [loading, setLoading] = useState(true);
  const [isConfigured, setIsConfigured] = useState(true);
  const [linked, setLinked] = useState(false);
  const [state, setState] = useState<string | undefined>();
  const [jid, setJid] = useState<string | undefined>();
  const [name, setName] = useState<string | undefined>();
  const [qr, setQr] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  const refresh = async () => {
    const s = await getMyCallSession();
    setIsConfigured(s.configured);
    setLinked(s.linked);
    setState(s.state);
    setJid(s.jid);
    setName(s.name);
    setLoading(false);
    return s;
  };

  useEffect(() => {
    void refresh();
    return () => stopPoll();
  }, []);

  const tick = async () => {
    const st = await getMyCallSession();
    if (st.state === 'open') {
      setLinked(true); setState('open'); setJid(st.jid); setQr(null); setPairing(false);
      stopPoll();
      toast.success('Número vinculado para llamadas. ✅');
      return;
    }
    const q = await getMyCallQr();
    if (q.state === 'open') {
      await refresh(); setQr(null); setPairing(false); stopPoll();
      toast.success('Número vinculado para llamadas. ✅');
      return;
    }
    if (q.qr) setQr(q.qr);
  };

  const startPairing = async () => {
    setPairing(true); setQr(null);
    const res = await linkMyCallSession();
    if (!res.success) { toast.error(res.message || 'No se pudo conectar.'); setPairing(false); return; }
    await tick();
    stopPoll();
    pollRef.current = setInterval(() => { void tick(); }, 20_000);
  };

  const unlink = async () => {
    if (!confirm('¿Desvincular el número de llamadas?')) return;
    stopPoll();
    await unlinkMyCallSession();
    setLinked(false); setState(undefined); setJid(undefined); setQr(null); setPairing(false);
    toast.message('Número desvinculado.');
  };

  if (loading) {
    return (
      <Card className="border-border flex-1">
        <CardContent className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  if (!isConfigured) return null; // llamadas no habilitadas en el servidor

  const connected = linked && state === 'open';

  return (
    <Card className="border-border flex h-full flex-col">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex min-w-0 items-center gap-2">
            <Phone className="h-4 w-4 shrink-0 text-green-600" />
            <span className="truncate">Llamadas WhatsApp</span>
          </CardTitle>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => void refresh()} title="Actualizar">
              <RefreshCw className="h-4 w-4" />
            </Button>
            {linked && (
              <Button variant="destructive" size="icon" onClick={unlink} title="Desvincular">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col">
        {connected ? (
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex items-center gap-3">
              <Avatar className="rounded-lg">
                <AvatarFallback className="rounded-lg bg-green-100 text-green-600 dark:bg-green-950/40">
                  <Phone className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{name || 'WhatsApp'}</div>
                {jid && <div className="truncate text-xs text-muted-foreground">+{jid.split('@')[0].split(':')[0]}</div>}
              </div>
            </div>
            <div className="mt-auto grid grid-cols-2 gap-2">
              <Button className="w-full gap-2 bg-green-600 text-white hover:bg-green-700" onClick={() => void refresh()}>
                <CheckCircle2 className="h-4 w-4" /> Conectado
              </Button>
              <Button variant="destructive" className="w-full gap-2" onClick={unlink}>
                <Power className="h-4 w-4" /> Desvincular
              </Button>
            </div>
          </div>
        ) : qr ? (
          <div className="flex flex-col items-center gap-2">
            <p className="max-w-[280px] text-center text-xs text-muted-foreground">
              WhatsApp → <b>Dispositivos vinculados</b> → <b>Vincular dispositivo</b>, y escanea:
            </p>
            <div className="rounded-lg border bg-white p-3">
              <QRCodeSVG value={qr} size={200} marginSize={1} />
            </div>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Esperando escaneo…
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Vincula tu número para hacer llamadas de voz por WhatsApp desde los chats.
            </p>
            <Button
              className="w-full gap-2 bg-green-600 text-white hover:bg-green-700"
              onClick={startPairing}
              disabled={pairing}
            >
              {pairing ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
              {pairing ? 'Generando QR…' : 'Conectar'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
