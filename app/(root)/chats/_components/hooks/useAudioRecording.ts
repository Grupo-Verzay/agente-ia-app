'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { base64FromBlob } from '../chat-message-utils';
import type { RecordedAudioData } from '../chat-message-types';

interface UseAudioRecordingReturn {
  isRecording: boolean;
  recordSecs: number;
  recordedAudio: RecordedAudioData | null;
  startRecording: () => Promise<void>;
  stopRecordingAndPreview: () => void;
  cancelRecording: () => void;
  clearRecordedAudio: () => void;
}

export function useAudioRecording(isSending: boolean): UseAudioRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
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

  const startTimer = useCallback(() => {
    stopTimer();
    setRecordSecs(0);
    recordSecsRef.current = 0;
    timerRef.current = window.setInterval(
      () => setRecordSecs((s) => s + 1),
      1000,
    ) as unknown as number;
  }, [stopTimer]);

  const stopMicrophoneStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const cancelRecording = useCallback(() => {
    stopTimer();
    setIsRecording(false);
    setRecordedAudio(null);
    audioChunksRef.current = [];

    const rec = mediaRecorderRef.current;
    if (rec) {
      try {
        if (rec.state !== 'inactive') rec.stop();
      } catch {}
      mediaRecorderRef.current = null;
    }
    stopMicrophoneStream();
  }, [stopTimer, stopMicrophoneStream]);

  const stopRecordingAndPreview = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  }, []);

  const startRecording = useCallback(async () => {
    if (isSending) return;

    cancelRecording();

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
    }
  }, [cancelRecording, startTimer, stopTimer, stopMicrophoneStream, isSending]);

  // Cleanup on unmount
  useEffect(() => cancelRecording, [cancelRecording]);

  const clearRecordedAudio = useCallback(() => setRecordedAudio(null), []);

  return {
    isRecording,
    recordSecs,
    recordedAudio,
    startRecording,
    stopRecordingAndPreview,
    cancelRecording,
    clearRecordedAudio,
  };
}
