'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Loader2, Mic, MicOff, Volume2, RotateCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { startAstraCall, astraCallWebrtc, endAstraCall, logOutgoingCallAction } from '@/actions/astracalls-actions';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Solo dígitos del número, ej. "573001234567" */
  phone: string;
  contactName?: string;
}

type CallState = 'connecting' | 'in-call' | 'ended' | 'error';

export function CallDialog({ open, onClose, phone, contactName }: Props) {
  const [state, setState] = useState<CallState>('connecting');
  const [seconds, setSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const callRef = useRef<{ sid: string; callId: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const secondsRef = useRef(0);
  const loggedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { micRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { pcRef.current?.close(); } catch { /* ignore */ }
    micRef.current = null;
    pcRef.current = null;
  }, []);

  const hangup = useCallback(() => {
    const c = callRef.current;
    if (c) { void endAstraCall(c.sid, c.callId); callRef.current = null; }
    cleanup();
  }, [cleanup]);

  const handleClose = () => {
    cancelledRef.current = true;
    // Registrar la llamada saliente en los Chats (solo si llegó a conectar)
    if (!loggedRef.current && secondsRef.current > 0) {
      loggedRef.current = true;
      void logOutgoingCallAction(phone, secondsRef.current);
    }
    hangup();
    onClose();
  };

  const startCall = useCallback(async () => {
    cancelledRef.current = false;
    hangup();
    setState('connecting');
    setSeconds(0);
    secondsRef.current = 0;
    loggedRef.current = false;
    setErrorMsg('');
    setMuted(false);

    // 1) Crear la llamada en AstraCalls
    const started = await startAstraCall(`+${phone}`);
    if (cancelledRef.current) return;
    if (!started.success || !started.sid || !started.callId) {
      setErrorMsg(started.message || 'No se pudo iniciar la llamada.');
      setState('error');
      return;
    }
    callRef.current = { sid: started.sid, callId: started.callId };

    // 2) WebRTC: micrófono + oferta + intercambio SDP
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelledRef.current) { mic.getTracks().forEach((t) => t.stop()); return; }
      micRef.current = mic;

      const pc = new RTCPeerConnection({
        // STUN: el navegador descubre su IP pública (srflx) para que el servidor
        // de AstraCalls pueda establecer el audio detrás de NAT (antes quedaba
        // "Conectando…" porque sin STUN no había ruta de media).
        iceServers: [
          { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
        ],
      });
      pcRef.current = pc;
      mic.getAudioTracks().forEach((t) => pc.addTrack(t, mic));
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.ontrack = (ev) => {
        if (audioRef.current && ev.streams[0]) audioRef.current.srcObject = ev.streams[0];
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') return resolve();
        // Fallback: no esperar indefinidamente el gathering (con STUN basta con
        // los candidatos reunidos en ~2s; algunos navegadores nunca marcan
        // 'complete' si un STUN no responde).
        const to = setTimeout(resolve, 2500);
        pc.addEventListener('icegatheringstatechange', () => {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(to);
            resolve();
          }
        });
      });

      const res = await astraCallWebrtc(started.sid, started.callId, pc.localDescription!.sdp);
      if (cancelledRef.current) return;
      if (!res.success || !res.sdpAnswer) {
        setErrorMsg(res.message || 'Falló la conexión de audio.');
        setState('error');
        cleanup();
        return;
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: res.sdpAnswer });
      setState('in-call');
      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
      }, 1000);
    } catch (e: any) {
      if (cancelledRef.current) return;
      setErrorMsg(
        e?.name === 'NotAllowedError'
          ? 'Permiso de micrófono denegado. Actívalo para llamar.'
          : (e?.message || 'Error de audio.'),
      );
      setState('error');
      cleanup();
    }
  }, [phone, hangup, cleanup]);

  useEffect(() => {
    if (!open) return;
    void startCall();
    return () => { cancelledRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cleanup al desmontar
  useEffect(() => () => cleanup(), [cleanup]);

  const toggleMute = () => {
    const next = !muted;
    micRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setMuted(next);
  };

  const toggleSpeaker = async () => {
    const a = audioRef.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    const next = !speakerOn;
    if (a) a.volume = 1;
    try {
      if (a && typeof a.setSinkId === 'function') {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outs = devices.filter((d) => d.kind === 'audiooutput');
        const speaker = outs.find((o) => /speaker|altavoz/i.test(o.label));
        await a.setSinkId(next ? (speaker?.deviceId ?? 'default') : 'default');
      }
    } catch { /* salida no controlable en este navegador (ej. iOS) */ }
    setSpeakerOn(next);
  };

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const finished = state === 'ended' || state === 'error';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Llamada por WhatsApp</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <div className={`flex h-16 w-16 items-center justify-center rounded-full ${state === 'in-call' ? 'bg-green-100 text-green-600 dark:bg-green-950/40' : 'bg-muted text-muted-foreground'}`}>
            <Phone className="h-7 w-7" />
          </div>

          <div className="text-center">
            <p className="text-base font-semibold capitalize">{contactName || `+${phone}`}</p>
            <p className="text-xs text-muted-foreground">+{phone}</p>
          </div>

          <div className="min-h-[20px] text-sm">
            {state === 'connecting' && (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Conectando…
              </span>
            )}
            {state === 'in-call' && <span className="font-mono text-base text-green-600">{mmss}</span>}
            {state === 'ended' && <span className="text-muted-foreground">Llamada finalizada</span>}
            {state === 'error' && <span className="block max-w-[260px] text-center text-xs text-destructive">{errorMsg}</span>}
          </div>

          {/* Controles en llamada: Silenciar / Altavoz */}
          {state === 'in-call' && (
            <div className="flex items-center gap-6">
              <button
                type="button"
                onClick={toggleMute}
                className="flex flex-col items-center gap-1 text-xs text-muted-foreground"
              >
                <span className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-full border transition-colors',
                  muted ? 'border-red-200 bg-red-100 text-red-600 dark:bg-red-950/40' : 'border-border bg-muted hover:bg-muted/70',
                )}>
                  {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </span>
                {muted ? 'Silenciado' : 'Silenciar'}
              </button>

              <button
                type="button"
                onClick={() => void toggleSpeaker()}
                className="flex flex-col items-center gap-1 text-xs text-muted-foreground"
              >
                <span className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-full border transition-colors',
                  speakerOn ? 'border-blue-200 bg-blue-100 text-blue-600 dark:bg-blue-950/40' : 'border-border bg-muted hover:bg-muted/70',
                )}>
                  <Volume2 className="h-5 w-5" />
                </span>
                Altavoz
              </button>
            </div>
          )}

          {/* Acciones principales */}
          <div className="flex items-center gap-2">
            {finished && (
              <Button
                variant="secondary"
                size="lg"
                className="gap-2 rounded-full"
                onClick={() => void startCall()}
              >
                <RotateCcw className="h-5 w-5" />
                Volver a llamar
              </Button>
            )}
            <Button
              variant={finished ? 'secondary' : 'destructive'}
              size="lg"
              className="gap-2 rounded-full"
              onClick={handleClose}
            >
              <PhoneOff className="h-5 w-5" />
              {finished ? 'Cerrar' : 'Colgar'}
            </Button>
          </div>
        </div>

        <audio ref={audioRef} autoPlay />
      </DialogContent>
    </Dialog>
  );
}
