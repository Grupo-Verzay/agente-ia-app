'use client';

/**
 * Grabar una nota de voz. **Uno solo para toda la plataforma.**
 *
 * Vivia dentro de Chats (`app/(root)/chats/_components/hooks/`) y se mudo aqui
 * al usarlo tambien el chat del equipo. Copiarlo habria sido dos grabadores que
 * mantener a la par —el formato que se elige, el temporizador, apagar el
 * microfono al terminar— y eso se lee como «en el chat del equipo a veces no
 * funciona», que es el peor sintoma posible.
 *
 * Es headless a proposito: devuelve estado y no pinta nada, asi que cada
 * pantalla le pone los botones que le toquen.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { base64FromBlob } from '@/lib/audio-del-navegador';
import type { RecordedAudioData } from '@/lib/audio-del-navegador';

interface UseAudioRecordingReturn {
  isRecording: boolean;
  /** En pausa: el micrófono sigue abierto y el tiempo parado. */
  isPaused: boolean;
  /** Por qué no se pudo grabar (sin micrófono, permiso denegado). `null` si nada. */
  error: string | null;
  recordSecs: number;
  recordedAudio: RecordedAudioData | null;
  startRecording: () => Promise<void>;
  stopRecordingAndPreview: () => void;
  cancelRecording: () => void;
  clearRecordedAudio: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
}

export function useAudioRecording(isSending: boolean): UseAudioRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordSecs, setRecordSecs] = useState(0);
  const [recordedAudio, setRecordedAudio] = useState<RecordedAudioData | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const recordSecsRef = useRef(0);

  // Keep ref in sync with state for use inside callbacks
  useEffect(() => {
    recordSecsRef.current = recordSecs;
  }, [recordSecs]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Sigue contando desde donde iba: es lo que usa reanudar tras una pausa.
  const continueTimer = useCallback(() => {
    stopTimer();
    timerRef.current = window.setInterval(
      () => setRecordSecs((s) => s + 1),
      1000,
    ) as unknown as number;
  }, [stopTimer]);

  const startTimer = useCallback(() => {
    setRecordSecs(0);
    recordSecsRef.current = 0;
    continueTimer();
  }, [continueTimer]);

  const stopMicrophoneStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const cancelRecording = useCallback(() => {
    stopTimer();
    setIsRecording(false);
    setIsPaused(false);
    setRecordedAudio(null);
    audioChunksRef.current = [];

    const rec = mediaRecorderRef.current;
    if (rec) {
      try {
        if (rec.state !== 'inactive') rec.stop();
      } catch (error) {
        console.error("[cancelRecording] Error al detener MediaRecorder", error);
      }
      mediaRecorderRef.current = null;
    }
    stopMicrophoneStream();
  }, [stopTimer, stopMicrophoneStream]);

  const stopRecordingAndPreview = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  }, []);

  // Pausar NO cierra el micrófono ni suelta lo grabado: al reanudar sigue en
  // el MISMO archivo. El tiempo se para con la grabación, o la duración
  // contaría los segundos en pausa.
  const pauseRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state !== 'recording') return;
    try {
      rec.pause();
      stopTimer();
      setIsPaused(true);
    } catch (err) {
      console.error('[pauseRecording] el navegador no pudo pausar la grabación', err);
    }
  }, [stopTimer]);

  const resumeRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state !== 'paused') return;
    try {
      rec.resume();
      continueTimer();
      setIsPaused(false);
    } catch (err) {
      console.error('[resumeRecording] el navegador no pudo reanudar la grabación', err);
    }
  }, [continueTimer]);

  const startRecording = useCallback(async () => {
    if (isSending) return;

    cancelRecording();
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeCandidates = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/webm',
        'audio/ogg',
      ];
      const chosenMime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, chosenMime ? { mimeType: chosenMime } : undefined);

      audioChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      rec.onstart = () => {
        setIsRecording(true);
        startTimer();
      };

      rec.onstop = async () => {
        stopTimer();
        setIsRecording(false);
        setIsPaused(false);
        mediaRecorderRef.current = null;

        const finalMimeType = rec.mimeType || chosenMime || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: finalMimeType });
        audioChunksRef.current = [];

        if (blob.size === 0) {
          stopMicrophoneStream();
          return;
        }

        try {
          const base64Pure = await base64FromBlob(blob);
          const dataUrlWithPrefix = `data:${finalMimeType};base64,${base64Pure}`;
          setRecordedAudio({
            base64Pure,
            dataUrlWithPrefix,
            mimetype: finalMimeType,
            durationSecs: recordSecsRef.current,
          });
        } catch (err) {
          console.error('Error preparando audio base64:', err);
        } finally {
          stopMicrophoneStream();
        }
      };

      rec.start();
      mediaRecorderRef.current = rec;
    } catch (err) {
      console.error('Error al iniciar grabación:', err);
      cancelRecording();
      const nombre = (err as { name?: string } | null)?.name;
      setError(
        nombre === 'NotAllowedError' || nombre === 'SecurityError'
          ? 'El navegador no dio permiso para usar el micrófono. Actívalo desde el candado de la barra de direcciones.'
          : nombre === 'NotFoundError'
            ? 'No se encontró ningún micrófono en este equipo.'
            : 'No se pudo empezar a grabar. Revisa el micrófono e inténtalo otra vez.',
      );
    }
  }, [cancelRecording, startTimer, stopTimer, stopMicrophoneStream, isSending]);

  // Cleanup on unmount
  useEffect(() => cancelRecording, [cancelRecording]);

  const clearRecordedAudio = useCallback(() => setRecordedAudio(null), []);

  return {
    isRecording,
    isPaused,
    error,
    recordSecs,
    recordedAudio,
    startRecording,
    stopRecordingAndPreview,
    cancelRecording,
    clearRecordedAudio,
    pauseRecording,
    resumeRecording,
  };
}
