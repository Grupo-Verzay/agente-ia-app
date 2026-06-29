'use client';

import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Phone, Loader2, RefreshCw, Trash2, QrCode, CheckCircle2, Power, Bot } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QrScanDialog } from '@/components/shared/QrScanDialog';
import { toast } from 'sonner';
import {
  getMyCallSession,
  linkMyCallSession,
  getMyCallQr,
  unlinkMyCallSession,
} from '@/actions/astracalls-actions';
import { getVoicebotConfig, setVoicebotConfig } from '@/actions/voicebot-actions';
import { VOICEBOT_VOICES } from '@/lib/voicebot-voices';

export function CallLinkCard() {
  const [loading, setLoading] = useState(true);
  const [isConfigured, setIsConfigured] = useState(true);
  const [linked, setLinked] = useState(false);
  const [state, setState] = useState<string | undefined>();
  const [jid, setJid] = useState<string | undefined>();
  const [name, setName] = useState<string | undefined>();
  const [qr, setQr] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  const closeQrDialog = () => {
    stopPoll();
    setQrOpen(false);
    setPairing(false);
    setQr(null);
  };

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
      setLinked(true); setState('open'); setJid(st.jid);
      stopPoll(); setQrOpen(false); setQr(null); setPairing(false);
      toast.success('Número vinculado para llamadas. ✅');
      return;
    }
    const q = await getMyCallQr();
    if (q.state === 'open') {
      await refresh();
      stopPoll(); setQrOpen(false); setQr(null); setPairing(false);
      toast.success('Número vinculado para llamadas. ✅');
      return;
    }
    if (q.qr) setQr(q.qr);
  };

  const startPairing = async () => {
    setPairing(true); setQr(null); setQrOpen(true); // abre el diálogo con loader
    const res = await linkMyCallSession();
    if (!res.success) { toast.error(res.message || 'No se pudo conectar.'); closeQrDialog(); return; }
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
    <>
    <Card className="border-border flex h-full flex-col">
      <CardHeader className="p-4 pb-2">
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

      <CardContent className="flex flex-1 flex-col p-4 pt-0">
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

            <VoicebotSettings />

            <div className="mt-auto grid grid-cols-2 gap-2">
              <Button className="w-full gap-2 bg-green-600 text-white hover:bg-green-700" onClick={() => void refresh()}>
                <CheckCircle2 className="h-4 w-4" /> Conectado
              </Button>
              <Button variant="destructive" className="w-full gap-2" onClick={unlink}>
                <Power className="h-4 w-4" /> Desvincular
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Vincula tu número para hacer llamadas de voz por WhatsApp desde los chats.
            </p>
            <Button
              className="mt-auto w-full gap-2 bg-green-600 text-white hover:bg-green-700"
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

      {/* QR en diálogo (fuera de la tarjeta, grande y centrado) */}
      <QrScanDialog
        open={qrOpen}
        onOpenChange={(o) => { if (!o) closeQrDialog(); }}
        title="Vincular llamadas WhatsApp"
        description="Sigue las instrucciones antes de escanear el código QR."
        qr={qr ? <QRCodeSVG value={qr} size={296} marginSize={0} /> : undefined}
        steps={[
          <>Abre <span className="font-bold">WhatsApp</span> en tu teléfono.</>,
          <>Toca <span className="font-bold">Dispositivos vinculados</span>.</>,
          <><span className="font-bold">Vincular un nuevo dispositivo</span>.</>,
          <>Apunta la <span className="font-bold">cámara</span> y escanea el <span className="font-bold">QR</span>.</>,
        ]}
        waiting
      />
    </>
  );
}

/** Configuración del voicebot (Item 7): contestar llamadas entrantes con IA. */
function VoicebotSettings() {
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [voice, setVoice] = useState('alloy');
  const [transferTo, setTransferTo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getVoicebotConfig().then((r) => {
      if (r.success && r.data) {
        setEnabled(r.data.enabled);
        setVoice(r.data.voice ?? 'alloy');
        setTransferTo(r.data.transferTo ?? '');
      }
      setLoaded(true);
    });
  }, []);

  const save = async (patch: { enabled?: boolean; voice?: string; transferTo?: string }) => {
    setSaving(true);
    const res = await setVoicebotConfig(patch);
    setSaving(false);
    if (!res.success) toast.error(res.message ?? 'No se pudo guardar.');
  };

  const toggle = async (v: boolean) => {
    setEnabled(v);
    await save({ enabled: v });
  };

  if (!loaded) return null;

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Bot className="h-4 w-4 text-violet-600" /> Contestar con IA
        </span>
        <Switch checked={enabled} onCheckedChange={(v) => void toggle(v)} disabled={saving} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        El asistente de voz contesta las llamadas entrantes y conversa con tu Agente IA.
      </p>
      {enabled && (
        <div className="mt-3 flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Voz del asistente
            <Select value={voice} onValueChange={(v) => { setVoice(v); void save({ voice: v }); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {VOICEBOT_VOICES.map((vn) => (
                  <SelectItem key={vn} value={vn} className="capitalize">{vn}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Transferir a (número del asesor, opcional)
            <Input
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              onBlur={() => void save({ transferTo })}
              placeholder="573001234567"
              inputMode="tel"
              className="h-9"
            />
          </label>
        </div>
      )}
    </div>
  );
}
