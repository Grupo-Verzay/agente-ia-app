'use client';

import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Phone, Loader2, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
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
    if (!res.success) { toast.error(res.message || 'No se pudo vincular.'); setPairing(false); return; }
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
      <Card>
        <CardContent className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent>
      </Card>
    );
  }
  if (!isConfigured) return null; // llamadas no habilitadas en el servidor

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Phone className="h-4 w-4 text-green-600" /> Llamadas por WhatsApp
        </CardTitle>
        <CardDescription className="text-xs">
          Vincula tu número para hacer llamadas de voz desde los chats (escanea como un dispositivo más).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3 pb-5">
        {linked && state === 'open' ? (
          <>
            <div className="flex items-center gap-2 font-medium text-green-600">
              <CheckCircle2 className="h-5 w-5" /> Conectado
            </div>
            {jid && <p className="text-xs text-muted-foreground">+{jid.split('@')[0]}</p>}
            <Button variant="outline" size="sm" onClick={unlink}>Desvincular</Button>
          </>
        ) : qr ? (
          <>
            <p className="max-w-[280px] text-center text-xs text-muted-foreground">
              Abre WhatsApp → <b>Dispositivos vinculados</b> → <b>Vincular dispositivo</b> y escanea:
            </p>
            <div className="rounded-lg border bg-white p-3">
              <QRCodeSVG value={qr} size={220} marginSize={1} />
            </div>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Esperando escaneo…
            </p>
          </>
        ) : (
          <Button onClick={startPairing} disabled={pairing} className="gap-2">
            {pairing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
            {pairing ? 'Generando QR…' : 'Vincular número'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
