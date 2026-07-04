'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Loader2, Mic, MicOff, Volume2, RotateCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { startAstraCall, astraCallWebrtc, endAstraCall, logOutgoingCallAction } from '@/actions/astracalls-actions';
import { endMetaWhatsAppCall, getMetaWhatsAppCallAnswer, startMetaWhatsAppCall } from '@/actions/meta-calls-actions';
import { setCallDisposition } from '@/actions/calls-crm-actions';
import { sendMissedOutgoingCallReply } from '@/actions/missed-call-reply-actions';
import { processCallRecordingAction } from '@/actions/calls-recording-actions';
import { CALL_DISPOSITIONS } from '@/lib/call-dispositions';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Solo dígitos del número, ej. "573001234567" */
  phone: string;
  contactName?: string;
  instanceType?: string;
  instanceName?: string;
}

type CallState = 'connecting' | 'ringing' | 'in-call' | 'ended' | 'error';

export function CallDialog({ open, onClose, phone, contactName, instanceType, instanceName }: Props) {
  const [state, setState] = useState<CallState>('connecting');
  const [seconds, setSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [disposition, setDisposition] = useState<string | null>(null);
  const [savingDisp, setSavingDisp] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const callRef = useRef<{ provider: 'astra'; sid: string; callId: string } | { provider: 'meta'; callId: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answerPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const secondsRef = useRef(0);
  const loggedRef = useRef(false);
  const loggedIdRef = useRef<string | null>(null);
  // Evita enviar el auto-mensaje de "no contestó" más de una vez por llamada.
  const replySentRef = useRef(false);
  // sid/callId de AstraCalls (persisten tras colgar, para bajar la grabación)
  const astraMetaRef = useRef<{ sid: string; callId: string } | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (answerPollRef.current) { clearInterval(answerPollRef.current); answerPollRef.current = null; }
    try { micRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { pcRef.current?.close(); } catch { /* ignore */ }
    micRef.current = null;
    pcRef.current = null;
  }, []);

  const hangup = useCallback(() => {
    const c = callRef.current;
    if (c?.provider === 'astra') void endAstraCall(c.sid, c.callId);
    if (c?.provider === 'meta') void endMetaWhatsAppCall({ instanceName, callId: c.callId });
    callRef.current = null;
    cleanup();
  }, [cleanup, instanceName]);

  // Dispara la transcripción+resumen de la grabación. La grabación se finaliza
  // en el servidor al colgar, así que reintenta un par de veces con espera.
  const processRecording = (chatMessageId: string | null) => {
    const meta = astraMetaRef.current;
    if (!chatMessageId || !meta || secondsRef.current <= 0) return;
    let attempts = 0;
    const tryProcess = async () => {
      attempts += 1;
      const res = await processCallRecordingAction({
        chatMessageId,
        astraSid: meta.sid,
        astraCallId: meta.callId,
      });
      if (!res.success && attempts < 3) {
        setTimeout(() => { void tryProcess(); }, 2500);
      }
    };
    setTimeout(() => { void tryProcess(); }, 1500);
  };

  // Envía (una sola vez) el auto-mensaje al contacto cuando la llamada saliente
  // no fue contestada. La propia acción respeta el on/off configurado por cuenta.
  const maybeSendMissedReply = () => {
    if (replySentRef.current) return;
    replySentRef.current = true;
    void sendMissedOutgoingCallReply(phone);
  };

  const handleClose = () => {
    cancelledRef.current = true;
    // Registrar la llamada saliente en los Chats si de verdad se colocó (astraMeta).
    // Contestada (>0s) → "realizada"; colocada pero sin contestar (0s) → "No contesta",
    // y se dispara el auto-mensaje (si está habilitado).
    if (!loggedRef.current && astraMetaRef.current) {
      loggedRef.current = true;
      const m = astraMetaRef.current;
      const meta = { astraSid: m.sid, astraCallId: m.callId };
      const answered = secondsRef.current > 0;
      void logOutgoingCallAction(phone, secondsRef.current, false, answered ? undefined : 'no_contesta', meta).then((res) => {
        loggedIdRef.current = res.id;
        processRecording(res.id);
      });
      if (!answered && state !== 'error') maybeSendMissedReply();
    }
    hangup();
    onClose();
  };

  // Registrar/actualizar la disposición (resultado) de la llamada. Si la llamada
  // aún no se registró (p. ej. "no contesta", 0s), la registra ahora con el
  // resultado; si ya estaba registrada, sólo actualiza la disposición.
  const chooseDisposition = async (value: string) => {
    if (savingDisp) return;
    setDisposition(value);
    setSavingDisp(true);
    try {
      if (!loggedRef.current) {
        loggedRef.current = true;
        const m = astraMetaRef.current;
        const meta = m ? { astraSid: m.sid, astraCallId: m.callId } : undefined;
        const res = await logOutgoingCallAction(phone, secondsRef.current, false, value, meta);
        loggedIdRef.current = res.id;
        processRecording(res.id);
      } else if (loggedIdRef.current) {
        await setCallDisposition(loggedIdRef.current, value);
      }
      // Auto-mensaje al contacto si la llamada no se contestó (No contesta / Buzón).
      if (value === 'no_contesta' || value === 'buzon') maybeSendMissedReply();
    } catch {
      /* best-effort */
    } finally {
      setSavingDisp(false);
    }
  };

  const startCall = useCallback(async () => {
    cancelledRef.current = false;
    hangup();
    setState('connecting');
    setSeconds(0);
    secondsRef.current = 0;
    loggedRef.current = false;
    loggedIdRef.current = null;
    replySentRef.current = false;
    astraMetaRef.current = null;
    setDisposition(null);
    setErrorMsg('');
    setMuted(false);

    // 1) Crear la llamada en AstraCalls
    if (instanceType === 'meta') {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelledRef.current) { mic.getTracks().forEach((t) => t.stop()); return; }
        micRef.current = mic;

        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
          ],
        });
        pcRef.current = pc;
        mic.getAudioTracks().forEach((t) => pc.addTrack(t, mic));
        pc.ontrack = (ev) => {
          if (audioRef.current && ev.streams[0]) audioRef.current.srcObject = ev.streams[0];
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await new Promise<void>((resolve) => {
          if (pc.iceGatheringState === 'complete') return resolve();
          const to = setTimeout(resolve, 1200);
          pc.addEventListener('icegatheringstatechange', () => {
            if (pc.iceGatheringState === 'complete') {
              clearTimeout(to);
              resolve();
            }
          }, { once: true });
        });

        const started = await startMetaWhatsAppCall({
          instanceName,
          phone,
          sdpOffer: pc.localDescription!.sdp,
        });
        if (cancelledRef.current) return;
        if (!started.success || !started.callId) {
          setErrorMsg(started.message || 'No se pudo iniciar la llamada por Meta.');
          setState('error');
          cleanup();
          return;
        }

        callRef.current = { provider: 'meta', callId: started.callId };
        setErrorMsg('Meta aceptó la solicitud. Falta conectar la respuesta del webhook para el audio.');
        let sdpAnswer = '';
        for (let attempt = 0; attempt < 20; attempt += 1) {
          if (cancelledRef.current) return;
          const answer = await getMetaWhatsAppCallAnswer({
            instanceName,
            callId: started.callId,
          });
          if (answer.success && answer.sdpAnswer) {
            sdpAnswer = answer.sdpAnswer;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        if (!sdpAnswer) {
          setErrorMsg('Meta aceptó la llamada, pero no llegó la respuesta de audio.');
          setState('error');
          cleanup();
          return;
        }

        await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });
        setState('ringing');

        answerPollRef.current = setInterval(() => {
          const cur = pcRef.current;
          if (!cur) return;
          void cur.getStats().then((stats) => {
            let answered = false;
            stats.forEach((r: any) => {
              if (r.type === 'inbound-rtp' && (r.kind === 'audio' || r.mediaType === 'audio') && (r.bytesReceived ?? 0) > 0) {
                answered = true;
              }
            });
            if (answered) {
              if (answerPollRef.current) { clearInterval(answerPollRef.current); answerPollRef.current = null; }
              setState('in-call');
              secondsRef.current = 0;
              setSeconds(0);
              timerRef.current = setInterval(() => {
                secondsRef.current += 1;
                setSeconds(secondsRef.current);
              }, 1000);
            }
          }).catch(() => { /* ignore */ });
        }, 1000);
      } catch (e: any) {
        if (cancelledRef.current) return;
        setErrorMsg(
          e?.name === 'NotAllowedError'
            ? 'Permiso de micrófono denegado. Actívalo para llamar.'
            : (e?.message || 'Error iniciando llamada por Meta.'),
        );
        setState('error');
        cleanup();
      }
      return;
    }

    const started = await startAstraCall(`+${phone}`);
    if (cancelledRef.current) return;
    if (!started.success || !started.sid || !started.callId) {
      setErrorMsg(started.message || 'No se pudo iniciar la llamada.');
      setState('error');
      return;
    }
    callRef.current = { provider: 'astra', sid: started.sid, callId: started.callId };
    astraMetaRef.current = { sid: started.sid, callId: started.callId };

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
        let done = false;
        const finish = () => { if (!done) { done = true; clearTimeout(to); resolve(); } };
        // Enviar la oferta cuanto antes para que la llamada no expire (evita el
        // 404). Basta el primer candidato público (srflx) del STUN; si no llega,
        // un tope de 1.2s.
        const to = setTimeout(finish, 1200);
        pc.addEventListener('icegatheringstatechange', () => {
          if (pc.iceGatheringState === 'complete') finish();
        });
        pc.addEventListener('icecandidate', (ev) => {
          if (ev.candidate && ev.candidate.candidate.includes('typ srflx')) finish();
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
      // Aún no es "en llamada": está sonando. El contador arranca cuando el otro
      // contesta, lo que detectamos en cuanto empieza a llegar audio (getStats).
      setState('ringing');
      answerPollRef.current = setInterval(() => {
        const cur = pcRef.current;
        if (!cur) return;
        void cur.getStats().then((stats) => {
          let answered = false;
          stats.forEach((r: any) => {
            if (r.type === 'inbound-rtp' && (r.kind === 'audio' || r.mediaType === 'audio') && (r.bytesReceived ?? 0) > 0) {
              answered = true;
            }
          });
          if (answered) {
            if (answerPollRef.current) { clearInterval(answerPollRef.current); answerPollRef.current = null; }
            setState('in-call');
            secondsRef.current = 0;
            setSeconds(0);
            timerRef.current = setInterval(() => {
              secondsRef.current += 1;
              setSeconds(secondsRef.current);
            }, 1000);
          }
        }).catch(() => { /* ignore */ });
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
  }, [phone, instanceType, instanceName, hangup, cleanup]);

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
            {state === 'ringing' && (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Llamando…
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

          {/* Resultado de la llamada (disposición) — al finalizar */}
          {finished && (
            <div className="w-full">
              <p className="mb-1.5 text-center text-xs font-medium text-muted-foreground">
                ¿Cómo resultó la llamada?
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {CALL_DISPOSITIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    disabled={savingDisp}
                    onClick={() => void chooseDisposition(d.value)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                      disposition === d.value
                        ? d.badgeClass
                        : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
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
