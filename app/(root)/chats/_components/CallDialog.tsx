'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Loader2, Mic, MicOff, Minus, Volume2, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PastillaDeLlamada, VentanaDeLlamada } from '@/components/shared/VentanaDeLlamada';
import { useVentanaArrastrable } from '@/hooks/useVentanaArrastrable';
import {
  GRACIA_DESCONECTADA_MS,
  elAudioSeCorto,
  loQueDiceLaConexion,
  losSegundosHablados,
  rastrearElAudio,
  type RastroDelAudio,
} from '@/lib/fin-de-la-llamada';
import { startAstraCall, astraCallWebrtc, endAstraCall, logOutgoingCallAction } from '@/actions/astracalls-actions';
import { endMetaWhatsAppCall, elEstadoDeLaLlamadaMeta, startMetaWhatsAppCall, getPreferredCallInstance } from '@/actions/meta-calls-actions';
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

/** Cada cuánto se le pregunta a Meta por el parte de la llamada. */
const CADA_CUANTO_SE_PREGUNTA_A_META_MS = 3_000;

/**
 * La tarjeta de una llamada de WhatsApp.
 *
 * # No bloquea la pantalla, y se pliega
 *
 * Era un `Dialog`: un modal encima de todo que no dejaba tocar nada mientras se
 * hablaba, que es justo lo que se hace durante una llamada —mirar la
 * conversación, buscar el dato que te están pidiendo—. Ahora flota, se arrastra
 * y se pliega a una pastilla con el rato, el nombre y el botón de colgar,
 * exactamente igual que la llamada del chat de equipo: **es el mismo
 * componente** (`components/shared/VentanaDeLlamada.tsx`), no una copia.
 *
 * Plegarse **solo se puede en llamada**, como allí: mientras suena son dos
 * botones y una decisión de un segundo, y poder esconder una llamada que está
 * sonando solo añade formas de perderla.
 *
 * # Y se entera de que el otro colgó
 *
 * El fallo era que no se enteraba de nada: el contador seguía corriendo con el
 * cliente ya colgado, y el asesor creía que seguía hablando. Quién decide vive
 * en `lib/fin-de-la-llamada.ts`, y ahí está escrito el porqué de la forma —en
 * corto: **aquí no hay Evolution ni Waha**, se llama por AstraCalls o por la
 * Cloud API de Meta, así que el detector que vale para los dos (y para el
 * siguiente que se añada) es **el audio**, y el parte del proveedor va encima
 * para ponerle nombre.
 */
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
  const [minimizada, setMinimizada] = useState(false);
  /** Lo que se enseña al acabar, cuando hay algo concreto que decir. */
  const [finTexto, setFinTexto] = useState('');

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const callRef = useRef<{ provider: 'astra'; sid: string; callId: string } | { provider: 'meta'; callId: string } | null>(null);
  // Instancia Meta realmente usada para esta llamada (puede resolverse en
  // runtime cuando el call site no la pasa). Se usa al colgar/limpiar.
  const metaInstanceRef = useRef<string | undefined>(instanceName);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /**
   * El reloj que vigila la llamada entera.
   *
   * Antes solo detectaba la respuesta y **se apagaba al contestar**, que es
   * exactamente por qué nadie se enteraba de que el otro colgaba. Ahora sigue
   * corriendo: antes de contestar busca el primer audio, y después vigila que
   * siga llegando.
   */
  const vigilanciaRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** El reloj que le pregunta a Meta por su parte de la llamada. */
  const partePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Cuándo contestaron. `null` mientras suena. */
  const contestoEnMsRef = useRef<number | null>(null);
  /** El rastro del audio que llega, para saber cuándo dejó de llegar. */
  const rastroRef = useRef<RastroDelAudio | null>(null);
  /** Desde cuándo la conexión está en `disconnected`, que puede recuperarse. */
  const esperaDesdeRef = useRef<number | null>(null);
  /** Para que la llamada se cierre UNA vez, la cierre quien la cierre. */
  const terminadaRef = useRef(false);
  /** El registro en curso, para que elegir resultado no llegue antes que él. */
  const registroRef = useRef<Promise<{ id: string | null }> | null>(null);
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

  /**
   * Para todos los relojes de la llamada.
   *
   * Va aparte de `cleanup` porque el fin de una llamada tiene dos mitades que
   * no ocurren a la vez: el contador se congela en cuanto se sabe que acabó
   * —si no, sigue subiendo mientras el asesor elige el resultado— y el micro y
   * la conexión se sueltan después. Con uno solo, o el contador seguía
   * corriendo o se cortaba el audio antes de poder grabarlo.
   */
  const pararLosRelojes = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (vigilanciaRef.current) { clearInterval(vigilanciaRef.current); vigilanciaRef.current = null; }
    if (partePollRef.current) { clearInterval(partePollRef.current); partePollRef.current = null; }
    if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (vigilanciaRef.current) { clearInterval(vigilanciaRef.current); vigilanciaRef.current = null; }
    if (partePollRef.current) { clearInterval(partePollRef.current); partePollRef.current = null; }
    if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
    try { recorderRef.current?.stop(); } catch { /* ignore */ }
    recorderRef.current = null;
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    audioCtxRef.current = null;
    remoteStreamRef.current = null;
    try { micRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    // El manejador se calla ANTES de cerrar. Cerrar la conexión a mano la deja
    // en `closed`, que es lo mismo que dice una conexión que se cayó sola: sin
    // esto, colgar nosotros podría leerse como que colgó el otro y escribir un
    // final que no fue. El guardián de `terminarLlamada` ya lo evita, pero una
    // señal que no puede ser ambigua es mejor que una que se desambigua fuera.
    try { if (pcRef.current) pcRef.current.onconnectionstatechange = null; } catch { /* ignore */ }
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
   * Deja el registro de la llamada en los Chats, con su duración.
   *
   * **Una sola vez**, y desde los tres caminos por los que una llamada acaba:
   * colgar, elegir resultado, y —lo nuevo— que la corte el otro. Antes solo se
   * escribía al cerrar la tarjeta, así que una llamada cuya pestaña se cerraba
   * sin pulsar nada no dejaba ni rastro; y si el cliente colgaba, la duración
   * que se escribía era la del rato que el asesor tardó en darse cuenta.
   */
  const registrarLaLlamada = useCallback((segundos: number, resultado?: string) => {
    if (loggedRef.current || !callLogMetaRef.current) return;
    loggedRef.current = true;
    const meta = callLogMetaRef.current;
    const contestada = segundos > 0;
    const p = logOutgoingCallAction(
      phone,
      segundos,
      false,
      resultado ?? (contestada ? undefined : 'no_contesta'),
      meta,
    ).then(async (res) => {
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
      return res;
    });
    registroRef.current = p;
    void p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  /**
   * La llamada se acabó sin que el asesor la colgara.
   *
   * Lo hace todo en el orden que importa: congelar el contador en los segundos
   * que de verdad se hablaron, desplegar la tarjeta —hay que elegir resultado y
   * una pastilla no tiene dónde—, capturar la grabación **antes** de que
   * `hangup` corte el micro, registrar la llamada y soltar la conexión.
   */
  const terminarLlamada = useCallback((segundos: number, texto?: string) => {
    if (terminadaRef.current) return;
    terminadaRef.current = true;
    pararLosRelojes();
    secondsRef.current = segundos;
    setSeconds(segundos);
    setNoAnswer(segundos <= 0);
    setFinTexto(texto ?? '');
    setState('ended');
    setMinimizada(false);
    if (callLogMetaRef.current?.provider === 'meta') void captureMetaRecording();
    registrarLaLlamada(segundos);
    hangup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hangup, pararLosRelojes, registrarLaLlamada]);

  /**
   * Arranca la cuenta atrás de repique. Si se agota sin que el contacto
   * conteste, cierra la llamada y deja la tarjeta en "no respondió" con los
   * botones de resultado, en vez de sonar para siempre.
   */
  const armRingTimeout = useCallback(() => {
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    ringTimeoutRef.current = setTimeout(() => {
      ringTimeoutRef.current = null;
      // Si ya contestaron entre medias, no tocamos nada.
      if (contestoEnMsRef.current !== null) return;
      terminarLlamada(0, 'El contacto no respondió');
    }, RING_TIMEOUT_MS);
  }, [terminarLlamada]);

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
    terminadaRef.current = true;
    pararLosRelojes();
    // Capturar la grabación Meta ANTES de cortar el micrófono (hangup/cleanup).
    if (callLogMetaRef.current?.provider === 'meta') void captureMetaRecording();
    // Registrar la llamada saliente en los Chats si de verdad se colocó.
    // Contestada (>0s) → "realizada"; colocada pero sin contestar (0s) → "No
    // contesta". Si la cortó el otro, esto ya se escribió con la duración de
    // verdad y `registrarLaLlamada` no vuelve a escribir.
    registrarLaLlamada(secondsRef.current);
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
        registrarLaLlamada(secondsRef.current, value);
        await registroRef.current;
      } else {
        // Se espera al registro en curso antes de ponerle el resultado. Sin
        // esto, elegirlo deprisa —que es lo normal, la tarjeta ya está
        // delante— llegaba antes de que hubiera fila a la que ponérselo y el
        // botón no hacía nada.
        const reg = await registroRef.current;
        const id = loggedIdRef.current ?? reg?.id ?? null;
        if (id) await setCallDisposition(id, value);
      }
    } catch {
      /* best-effort */
    } finally {
      setSavingDisp(false);
    }
  };

  /**
   * Vigila la llamada de principio a fin, y lo hace con el AUDIO.
   *
   * Es una sola función para los dos proveedores a propósito. Antes había dos
   * copias de esto —una en la rama de Meta y otra en la de AstraCalls—, las
   * dos solo miraban si había empezado a llegar audio, y las dos **se apagaban
   * al contestar**: de ahí que nadie se enterara de que el otro colgaba.
   *
   * Tres señales, y ninguna de ellas es «no me contestan»:
   *
   * 1. **`failed` o `closed`** en la conexión: firme, la otra punta se fue.
   * 2. **`disconnected` sostenido**: se perdió la ruta y no vuelve. Se aguanta
   *    su gracia aparte porque a veces se recupera sola al segundo.
   * 3. **El audio deja de llegar.** Es la que vale para cualquier pasarela:
   *    con una pasarela WebRTC, que el otro cuelgue **es** que el RTP se para.
   *
   * Y lo que no se hace: un `getStats` que falla no cuelga a nadie. Eso es «no
   * sé», y colgar por no saber corta una conversación en curso.
   */
  const vigilar = useCallback((pc: RTCPeerConnection, esMeta: boolean) => {
    pc.onconnectionstatechange = () => {
      const dice = loQueDiceLaConexion(pc.connectionState);
      if (dice === 'cortada') {
        const desde = contestoEnMsRef.current;
        const fin = rastroRef.current?.desdeMs ?? Date.now();
        terminarLlamada(
          desde === null ? 0 : losSegundosHablados(desde, fin),
          desde === null ? 'La llamada se cortó antes de contestar' : undefined,
        );
        return;
      }
      if (dice === 'espera') {
        if (esperaDesdeRef.current === null) esperaDesdeRef.current = Date.now();
        return;
      }
      esperaDesdeRef.current = null;
    };

    vigilanciaRef.current = setInterval(() => {
      const cur = pcRef.current;
      if (!cur) return;
      void cur.getStats().then((stats) => {
        let bytes = 0;
        stats.forEach((r: any) => {
          if (r.type === 'inbound-rtp' && (r.kind === 'audio' || r.mediaType === 'audio')) {
            bytes += r.bytesReceived ?? 0;
          }
        });
        const ahora = Date.now();

        // Todavía suena: lo que se busca es el PRIMER audio, que es la señal
        // de que descolgaron.
        if (contestoEnMsRef.current === null) {
          if (bytes <= 0) return;
          contestoEnMsRef.current = ahora;
          rastroRef.current = { bytes, desdeMs: ahora };
          if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
          setState('in-call');
          if (esMeta) startMetaRecording();
          secondsRef.current = 0;
          setSeconds(0);
          timerRef.current = setInterval(() => {
            secondsRef.current += 1;
            setSeconds(secondsRef.current);
          }, 1000);
          return;
        }

        rastroRef.current = rastrearElAudio(rastroRef.current, bytes, ahora);
        if (elAudioSeCorto(rastroRef.current, ahora)) {
          // Los segundos se cuentan hasta el ÚLTIMO audio, no hasta ahora: si
          // no, cada llamada de la plataforma sale unos segundos más larga de
          // lo que fue.
          terminarLlamada(losSegundosHablados(contestoEnMsRef.current, rastroRef.current.desdeMs));
          return;
        }
        const espera = esperaDesdeRef.current;
        if (espera !== null && ahora - espera >= GRACIA_DESCONECTADA_MS) {
          terminarLlamada(losSegundosHablados(contestoEnMsRef.current, espera));
        }
      }).catch(() => { /* no saber nunca cuelga */ });
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminarLlamada]);

  /**
   * Le pregunta a Meta por su parte de la llamada.
   *
   * Es lo único que de verdad **reporta** el fin en esta plataforma: su webhook
   * llega al backend y este lo deja en `chat_messages.raw.metaCall`. Va encima
   * del vigilante del audio, no en su lugar: llega más tarde —cada tres
   * segundos, y cuando el backend ya lo guardó— pero trae la duración que contó
   * el proveedor y, si algo fue mal, **sus palabras**, que es lo que permite
   * decirle al asesor por qué no se habló en vez de dejarle adivinando.
   */
  const preguntarleAMeta = useCallback((callId: string, linea?: string) => {
    partePollRef.current = setInterval(() => {
      void elEstadoDeLaLlamadaMeta({ instanceName: linea, callId })
        .then((r) => {
          const fin = r.fin;
          if (!fin?.terminada) return;
          const desde = contestoEnMsRef.current;
          // La duración del proveedor manda cuando la da; si no, la nuestra.
          // `undefined` es «no la dijo» y no es cero: dar por cero una llamada
          // de tres minutos la borraría del tiempo hablado.
          const segundos =
            fin.segundos ?? (desde === null ? 0 : losSegundosHablados(desde, Date.now()));
          terminarLlamada(
            segundos,
            fin.fallo ? (fin.motivo || 'La llamada no se pudo completar') : undefined,
          );
        })
        .catch(() => { /* no saber nunca cuelga */ });
    }, CADA_CUANTO_SE_PREGUNTA_A_META_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminarLlamada]);

  const startCall = useCallback(async () => {
    cancelledRef.current = false;
    // `hangup` va ANTES de soltar el guardián de abajo (`terminadaRef`): cierra
    // la conexión de la llamada anterior, y una conexión que se cierra es la
    // misma señal que una que se cae. Soltando el guardián primero, «Volver a
    // llamar» terminaría la llamada nueva antes de empezarla.
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
    setFinTexto('');
    setMinimizada(false);
    contestoEnMsRef.current = null;
    rastroRef.current = null;
    esperaDesdeRef.current = null;
    terminadaRef.current = false;
    registroRef.current = null;

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
        let rechazo = '';
        for (let attempt = 0; attempt < 20; attempt += 1) {
          if (cancelledRef.current) return;
          const parte = await elEstadoDeLaLlamadaMeta({
            instanceName: effName,
            callId: started.callId,
          });
          if (parte.success && parte.sdpAnswer) {
            sdpAnswer = parte.sdpAnswer;
            break;
          }
          // El proveedor ya dijo que esto no va a ninguna parte —rechazada, o
          // un error suyo—. Seguir esperando veinte segundos a algo que no va
          // a llegar es dejar al asesor mirando «Conectando…» sin motivo.
          if (parte.fin?.terminada) {
            rechazo = parte.message || 'La llamada no se pudo completar.';
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        if (!sdpAnswer) {
          setErrorMsg(rechazo || 'Meta aceptó la llamada, pero no llegó la respuesta de audio.');
          setState('error');
          cleanup();
          return;
        }

        await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });
        setErrorMsg('');
        setState('ringing');
        armRingTimeout();
        vigilar(pc, true);
        preguntarleAMeta(started.callId, effName);
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

    // La llamada sale por la linea de la conversacion, asi que el numero
    // con el que se llama es el de la cuenta dueña de esa linea.
    const started = await startAstraCall(`+${phone}`, instanceName);
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
      // AstraCalls no tiene parte de fin que consultar, así que aquí el único
      // que avisa de que el otro colgó es el audio. Es el mismo vigilante.
      vigilar(pc, false);
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
  }, [phone, instanceType, instanceName, hangup, cleanup, armRingTimeout, vigilar, preguntarleAMeta]);

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

  // Plegar y arrastrar, solo en llamada. Es la misma regla que en la llamada
  // del chat de equipo: mientras suena son dos botones y una decisión de un
  // segundo, y poder esconderla solo añade formas de perderla. El cómo se
  // arrastra vive en `useVentanaArrastrable`, que ya lo comparten la llamada
  // del directo y el panel de una reunión.
  const enLlamada = state === 'in-call';
  const { cajaRef, estilo, asa, posicion } = useVentanaArrastrable({
    activa: enLlamada,
    // Plegar y desplegar cambia el alto: una barra pegada al borde de abajo se
    // saldría por ahí al desplegarse, y fuera está el botón de colgar.
    tamano: minimizada,
  });

  // Se desmonta al cerrar, no se esconde: la tarjeta es la que sostiene el
  // `<audio>` y los relojes, y dejarla montada sin llamada es dejar corriendo
  // un `getStats` cada segundo por nada.
  if (!open) return null;

  const plegada = minimizada && enLlamada;

  return (
    <VentanaDeLlamada
      cajaRef={cajaRef}
      estilo={estilo}
      posicion={posicion}
      ancho={plegada ? 'w-fit' : 'w-[min(92vw,22rem)]'}
    >
      {/* El `<audio>` vive AQUÍ FUERA y no se mueve nunca. Metido dentro de la
          rama de plegado, plegar la llamada lo desmontaría y con él se iría el
          `srcObject`: la llamada seguiría abierta y muda. */}
      <audio ref={audioRef} autoPlay />

      {plegada ? (
        <PastillaDeLlamada
          asa={asa}
          segundos={seconds}
          conQuien={contactName || `+${phone}`}
          onAmpliar={() => setMinimizada(false)}
          onColgar={handleClose}
        />
      ) : (
        <div className="p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Llamada por WhatsApp</p>
            {/* Plegar va FUERA de cualquier asa: el asa captura el puntero y el
                `click` de un botón de dentro no llegaría a salir. */}
            {enLlamada ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setMinimizada(true)}
                aria-label="Plegar la llamada"
              >
                <Minus className="h-4 w-4" />
              </Button>
            ) : null}
          </div>

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
                <span className={cn('block max-w-[260px] text-center', noAnswer ? 'text-amber-600' : 'text-muted-foreground')}>
                  {/* Cuando el proveedor dijo por qué, se enseña con SUS
                      palabras. Traducirlo a un «no respondió» genérico es
                      quitarle al asesor lo único que explica qué pasó. */}
                  {finTexto || (noAnswer ? 'El contacto no respondió' : 'Llamada finalizada')}
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
        </div>
      )}
    </VentanaDeLlamada>
  );
}
