'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Loader2, Mic, MicOff, Volume2, RotateCcw, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { startAstraCall, astraCallWebrtc, endAstraCall, logOutgoingCallAction } from '@/actions/astracalls-actions';
import { endMetaWhatsAppCall, getMetaWhatsAppCallAnswer, startMetaWhatsAppCall, getPreferredCallInstance } from '@/actions/meta-calls-actions';
import { setCallDisposition } from '@/actions/calls-crm-actions';
import { sendMissedOutgoingCallReply } from '@/actions/missed-call-reply-actions';
import { processCallRecordingAction, processMetaCallRecordingAction } from '@/actions/calls-recording-actions';
import { CALL_DISPOSITIONS } from '@/lib/call-dispositions';
import { toast } from 'sonner';

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

/**
 * Cuánto dejamos sonar antes de darla por no contestada. Sin este tope el
 * diálogo se quedaba en "Llamando…" indefinidamente: el sondeo de respuesta
 * corre cada segundo y nada lo detenía si el contacto nunca atendía, así que
 * el asesor tenía que adivinar cuándo colgar. WhatsApp corta alrededor del
 * minuto; 45s es el punto habitual en que ya se sabe que no van a contestar.
 */
const RING_TIMEOUT_MS = 45_000;

export function CallDialog({ open, onClose, phone, contactName, instanceType, instanceName }: Props) {
  const [state, setState] = useState<CallState>('connecting');
  const [seconds, setSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [disposition, setDisposition] = useState<string | null>(null);
  const [savingDisp, setSavingDisp] = useState(false);
  // Mensaje "no contesté" al contacto: manual (lo decide el asesor con el botón).
  const [missedSent, setMissedSent] = useState(false);
  const [sendingMissed, setSendingMissed] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const callRef = useRef<{ provider: 'astra'; sid: string; callId: string } | { provider: 'meta'; callId: string } | null>(null);
  // Instancia Meta realmente usada para esta llamada (puede resolverse en
  // runtime cuando el call site no la pasa). Se usa al colgar/limpiar.
  const metaInstanceRef = useRef<string | undefined>(instanceName);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answerPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // true cuando la llamada se cerró por agotarse el tiempo de repique, para
  // distinguir "no respondió" de un colgado normal en el texto del diálogo.
  const [noAnswer, setNoAnswer] = useState(false);
  const cancelledRef = useRef(false);
  const secondsRef = useRef(0);
  const loggedRef = useRef(false);
  const loggedIdRef = useRef<string | null>(null);
  // sid/callId de AstraCalls (persisten tras colgar, para bajar la grabación)
  const astraMetaRef = useRef<{ sid: string; callId: string } | null>(null);
  const callLogMetaRef = useRef<{ astraSid?: string; astraCallId?: string; metaCallId?: string; provider?: string } | null>(null);

  // Grabación de llamadas Meta en el navegador (Meta NO ofrece grabación por su
  // API WebRTC, así que mezclamos mic local + audio remoto y lo grabamos aquí).
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const recMimeRef = useRef<string>('audio/webm');
  // Promesa (una sola vez) con el audio ya capturado, reusada por handleClose y
  // chooseDisposition (según cuál termine la llamada).
  const metaRecordingRef = useRef<Promise<{ base64: string; mimeType: string } | null> | null>(null);

  const startMetaRecording = () => {
    if (recorderRef.current) return; // ya grabando
    const local = micRef.current;
    const remote = remoteStreamRef.current;
    if (!local && !remote) return;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new AC();
      audioCtxRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();
      if (local) ctx.createMediaStreamSource(local).connect(dest);
      if (remote) ctx.createMediaStreamSource(remote).connect(dest);
      const mime = ['audio/webm', 'audio/ogg'].find(
        (m) => (window as any).MediaRecorder?.isTypeSupported?.(m),
      );
      recMimeRef.current = mime || 'audio/webm';
      const rec = mime ? new MediaRecorder(dest.stream, { mimeType: mime }) : new MediaRecorder(dest.stream);
      recordChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordChunksRef.current.push(e.data);
      };
      rec.start(1000); // fragmenta cada 1s (evita perder todo si algo se corta)
      recorderRef.current = rec;
    } catch {
      recorderRef.current = null;
    }
  };

  const stopMetaRecording = (): Promise<{ base64: string; mimeType: string } | null> => {
    const rec = recorderRef.current;
    if (!rec) return Promise.resolve(null);
    recorderRef.current = null;
    return new Promise((resolve) => {
      const finish = async () => {
        try {
          const blob = new Blob(recordChunksRef.current, { type: recMimeRef.current });
          recordChunksRef.current = [];
          try { audioCtxRef.current?.close(); } catch { /* ignore */ }
          audioCtxRef.current = null;
          if (blob.size < 256) return resolve(null);
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = '';
          const CH = 0x8000;
          for (let i = 0; i < bytes.length; i += CH) {
            binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH)));
          }
          resolve({ base64: btoa(binary), mimeType: recMimeRef.current });
        } catch {
          resolve(null);
        }
      };
      rec.onstop = () => { void finish(); };
      try { rec.stop(); } catch { void finish(); }
    });
  };

  // Captura la grabación una sola vez (la reusan handleClose y chooseDisposition).
  const captureMetaRecording = () => {
    if (!metaRecordingRef.current) metaRecordingRef.current = stopMetaRecording();
    return metaRecordingRef.current;
  };

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (answerPollRef.current) { clearInterval(answerPollRef.current); answerPollRef.current = null; }
    if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
    try { recorderRef.current?.stop(); } catch { /* ignore */ }
    recorderRef.current = null;
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    audioCtxRef.current = null;
    remoteStreamRef.current = null;
    try { micRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { pcRef.current?.close(); } catch { /* ignore */ }
    micRef.current = null;
    pcRef.current = null;
  }, []);

  const hangup = useCallback(() => {
    const c = callRef.current;
    if (c?.provider === 'astra') void endAstraCall(c.sid, c.callId);
    if (c?.provider === 'meta') void endMetaWhatsAppCall({ instanceName: metaInstanceRef.current ?? instanceName, callId: c.callId });
    callRef.current = null;
    cleanup();
  }, [cleanup, instanceName]);

  /**
   * Arranca la cuenta atrás de repique. Si se agota sin que el contacto
   * conteste, cierra la llamada y deja el diálogo en "no respondió" con los
   * botones de resultado, en vez de sonar para siempre.
   */
  const armRingTimeout = useCallback(() => {
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    ringTimeoutRef.current = setTimeout(() => {
      ringTimeoutRef.current = null;
      // Si ya contestaron entre medias, no tocamos nada.
      if (secondsRef.current > 0) return;
      hangup();
      setNoAnswer(true);
      setState('ended');
    }, RING_TIMEOUT_MS);
  }, [hangup]);

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

  // Envío MANUAL del mensaje "no contesté" al contacto: lo decide el asesor con
  // un botón al terminar la llamada (antes se enviaba automático). Cuando llame
  // la IA, ese envío sí será automático desde su propio flujo.
  const handleSendMissedMsg = async () => {
    if (sendingMissed || missedSent) return;
    setSendingMissed(true);
    try {
      const res = await sendMissedOutgoingCallReply(phone, { force: true });
      if (res.sent) {
        setMissedSent(true);
        toast.success('Mensaje enviado al contacto.');
      } else {
        toast.error(res.message || 'No se pudo enviar el mensaje.');
      }
    } catch {
      toast.error('No se pudo enviar el mensaje.');
    } finally {
      setSendingMissed(false);
    }
  };

  const handleClose = () => {
    cancelledRef.current = true;
    // Capturar la grabación Meta ANTES de cortar el micrófono (hangup/cleanup).
    if (callLogMetaRef.current?.provider === 'meta') void captureMetaRecording();
    // Registrar la llamada saliente en los Chats si de verdad se colocó (astraMeta).
    // Contestada (>0s) → "realizada"; colocada pero sin contestar (0s) → "No contesta",
    // y se dispara el auto-mensaje (si está habilitado).
    if (!loggedRef.current && callLogMetaRef.current) {
      loggedRef.current = true;
      const meta = callLogMetaRef.current;
      const answered = secondsRef.current > 0;
      void logOutgoingCallAction(phone, secondsRef.current, false, answered ? undefined : 'no_contesta', meta).then(async (res) => {
        loggedIdRef.current = res.id;
        processRecording(res.id); // Astra
        if (res.id && meta.provider === 'meta') {
          const rec = await captureMetaRecording();
          if (rec?.base64) {
            void processMetaCallRecordingAction({
              chatMessageId: res.id,
              audioBase64: rec.base64,
              mimeType: rec.mimeType,
            });
          }
        }
      });
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
        const meta = callLogMetaRef.current ?? undefined;
        const res = await logOutgoingCallAction(phone, secondsRef.current, false, value, meta);
        loggedIdRef.current = res.id;
        processRecording(res.id); // Astra
        if (res.id && meta?.provider === 'meta') {
          const rec = await captureMetaRecording();
          if (rec?.base64) {
            void processMetaCallRecordingAction({
              chatMessageId: res.id,
              audioBase64: rec.base64,
              mimeType: rec.mimeType,
            });
          }
        }
      } else if (loggedIdRef.current) {
        await setCallDisposition(loggedIdRef.current, value);
      }
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
    setMissedSent(false);
    setSendingMissed(false);
    astraMetaRef.current = null;
    callLogMetaRef.current = null;
    metaRecordingRef.current = null;
    recorderRef.current = null;
    recordChunksRef.current = [];
    remoteStreamRef.current = null;
    setDisposition(null);
    setErrorMsg('');
    setMuted(false);
    setNoAnswer(false);

    // Resolver la instancia/número desde el cual se llama. Si el call site ya
    // la pasó (Chats), se usa esa. Si no (CRM, "devolver llamada", otras
    // secciones), se resuelve la de la cuenta que se está gestionando (cuenta
    // efectiva), para que llamar funcione en cualquier cuenta administrada.
    let effType = instanceType;
    let effName = instanceName;
    if (!effType && !effName) {
      try {
        const pref = await getPreferredCallInstance();
        if (cancelledRef.current) return;
        effType = pref.instanceType;
        effName = pref.instanceName;
      } catch {
        /* si falla, cae al proveedor por defecto (AstraCalls) */
      }
    }
    metaInstanceRef.current = effName;

    // 1) Crear la llamada en AstraCalls
    if (effType === 'meta') {
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
          if (ev.streams[0]) {
            remoteStreamRef.current = ev.streams[0];
            if (audioRef.current) audioRef.current.srcObject = ev.streams[0];
          }
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
          instanceName: effName,
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
        callLogMetaRef.current = { provider: 'meta', metaCallId: started.callId };
        setErrorMsg('Meta aceptó la solicitud. Falta conectar la respuesta del webhook para el audio.');
        let sdpAnswer = '';
        for (let attempt = 0; attempt < 20; attempt += 1) {
          if (cancelledRef.current) return;
          const answer = await getMetaWhatsAppCallAnswer({
            instanceName: effName,
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
        armRingTimeout();

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
              if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
              setState('in-call');
              startMetaRecording(); // graba la conversación (mic + remoto) para transcribir
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
    callLogMetaRef.current = { provider: 'astra', astraSid: started.sid, astraCallId: started.callId };

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
      armRingTimeout();
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
            if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
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
  }, [phone, instanceType, instanceName, hangup, cleanup, armRingTimeout]);

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
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm overflow-x-hidden z-[70]">
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
            {state === 'ended' && (
              <span className={noAnswer ? 'text-amber-600' : 'text-muted-foreground'}>
                {noAnswer ? 'El contacto no respondió' : 'Llamada finalizada'}
              </span>
            )}
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

              {/* Enviar (manual) el mensaje de "no contesté" al contacto. Lo
                  decide el asesor; no se envía solo en la llamada humana. */}
              {state === 'ended' && (
                <button
                  type="button"
                  onClick={() => void handleSendMissedMsg()}
                  disabled={sendingMissed || missedSent}
                  className={cn(
                    'mt-3 flex w-full items-center justify-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60',
                    missedSent
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40'
                      : 'border-border bg-muted/40 text-foreground hover:bg-muted',
                  )}
                >
                  {sendingMissed ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {missedSent ? 'Mensaje enviado' : 'Enviar mensaje de que no contesté'}
                </button>
              )}
            </div>
          )}

          {/* Acciones principales */}
          <div className="flex flex-wrap items-center justify-center gap-2">
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
