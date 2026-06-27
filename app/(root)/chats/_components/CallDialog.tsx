'use client';

import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { startAstraCall, astraCallWebrtc, endAstraCall } from '@/actions/astracalls-actions';

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

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const callRef = useRef<{ sid: string; callId: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { micRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { pcRef.current?.close(); } catch { /* ignore */ }
    micRef.current = null;
    pcRef.current = null;
  };

  const hangup = () => {
    const c = callRef.current;
    if (c) { void endAstraCall(c.sid, c.callId); callRef.current = null; }
    cleanup();
  };

  const handleClose = () => {
    hangup();
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState('connecting');
    setSeconds(0);
    setErrorMsg('');

    (async () => {
      // 1) Crear la llamada en AstraCalls
      const started = await startAstraCall(`+${phone}`);
      if (cancelled) return;
      if (!started.success || !started.sid || !started.callId) {
        setErrorMsg(started.message || 'No se pudo iniciar la llamada.');
        setState('error');
        return;
      }
      callRef.current = { sid: started.sid, callId: started.callId };

      // 2) WebRTC: micrófono + oferta + intercambio SDP
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { mic.getTracks().forEach((t) => t.stop()); return; }
        micRef.current = mic;

        const pc = new RTCPeerConnection({ iceServers: [] });
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
          pc.addEventListener('icegatheringstatechange', () => {
            if (pc.iceGatheringState === 'complete') resolve();
          });
        });

        const res = await astraCallWebrtc(started.sid, started.callId, pc.localDescription!.sdp);
        if (cancelled) return;
        if (!res.success || !res.sdpAnswer) {
          setErrorMsg(res.message || 'Falló la conexión de audio.');
          setState('error');
          cleanup();
          return;
        }
        await pc.setRemoteDescription({ type: 'answer', sdp: res.sdpAnswer });
        setState('in-call');
        timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      } catch (e: any) {
        if (cancelled) return;
        setErrorMsg(
          e?.name === 'NotAllowedError'
            ? 'Permiso de micrófono denegado. Actívalo para llamar.'
            : (e?.message || 'Error de audio.'),
        );
        setState('error');
        cleanup();
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cleanup al desmontar
  useEffect(() => () => cleanup(), []);

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

        <audio ref={audioRef} autoPlay />
      </DialogContent>
    </Dialog>
  );
}
