"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Trash2, Send, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  onCancel: () => void;
  /** Llamado al terminar y confirmar. PTT = true */
  onConfirm: (file: File) => void | Promise<void>;
  className?: string;
  filename?: string; // ej: "ptt.webm"
};

export const AudioRecorderPTT: React.FC<Props> = ({
  onCancel,
  onConfirm,
  className,
  filename = "recording.webm",
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [recording, setRecording] = useState(false);
  const [cancelHint, setCancelHint] = useState(false);
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<number | null>(null);
  const startX = useRef<number | null>(null);
  const canceled = useRef<boolean>(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [blobObj, setBlobObj] = useState<Blob | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const st = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!mounted) return;
        setStream(st);
      } catch (e) {
        console.error("[AudioRecorderPTT] mic error:", e);
        onCancel();
      }
    })();
    return () => { mounted = false; };
  }, [onCancel]);

  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [stream, blobUrl]);

  function startTimer() {
    stopTimer();
    const started = Date.now();
    timerRef.current = window.setInterval(() => {
      setDuration(Math.floor((Date.now() - started) / 1000));
    }, 200) as unknown as number;
  }
  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  const startRecord = async () => {
    if (!stream) return;
    try {
      chunksRef.current = [];
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
      rec.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data); };
      rec.onstop = () => {
        stopTimer();
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (!canceled.current) {
          setBlobObj(blob);
          const url = URL.createObjectURL(blob);
          setBlobUrl(url);
        } else {
          setBlobObj(null);
          setBlobUrl(null);
        }
      };
      rec.start();
      setRecorder(rec);
      setRecording(true);
      setDuration(0);
      startTimer();
      canceled.current = false;
      setCancelHint(true);
    } catch (e) {
      console.error("[AudioRecorderPTT] start error:", e);
    }
  };

  const stopRecord = () => {
    setRecording(false);
    setCancelHint(false);
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };

  const handlePointerDown = (clientX: number) => {
    startX.current = clientX;
    void startRecord();
  };
  const handlePointerMove = (clientX: number) => {
    if (startX.current == null || !recording) return;
    const delta = clientX - startX.current;
    if (delta < -80) { // deslizar a la izquierda para cancelar
      canceled.current = true;
      setCancelHint(false);
    } else {
      canceled.current = false;
    }
  };
  const handlePointerUp = () => { stopRecord(); };

  const resetAll = () => {
    setBlobObj(null);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setDuration(0);
  };

  const confirmSend = async () => {
    if (!blobObj) return;
    const f = new File([blobObj], filename, { type: "audio/webm" });
    await onConfirm(f);
    resetAll();
    onCancel();
  };

  return (
    <div className={cn("p-4 w-full max-w-[420px] rounded-xl border bg-white dark:bg-gray-900", className)}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">Grabar audio</div>
        <Button variant="ghost" size="icon" onClick={onCancel}><X className="w-4 h-4" /></Button>
      </div>

      {!blobObj ? (
        <div className="flex flex-col items-center gap-3">
          <div className="text-xs text-muted-foreground">
            Mantén presionado para grabar · Desliza a la izquierda para cancelar
          </div>

          <Button
            variant="default"
            className={cn("rounded-full w-20 h-20", canceled.current ? "bg-red-600 hover:bg-red-700" : "")}
            onMouseDown={(e) => handlePointerDown(e.clientX)}
            onMouseMove={(e) => handlePointerMove(e.clientX)}
            onMouseUp={handlePointerUp}
            onMouseLeave={() => recording && handlePointerUp()}
            onTouchStart={(e) => handlePointerDown(e.touches[0].clientX)}
            onTouchMove={(e) => handlePointerMove(e.touches[0].clientX)}
            onTouchEnd={handlePointerUp}
          >
            {recording ? <Square className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
          </Button>

          <div className="text-sm">
            {recording
              ? <span className="font-mono">{String(Math.floor(duration/60)).padStart(2,"0")}:{String(duration%60).padStart(2,"0")}</span>
              : <span className="text-muted-foreground">Listo para grabar</span>}
          </div>

          {cancelHint && recording && (
            <div className="text-xs text-muted-foreground">⇠ Desliza para cancelar</div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <audio src={blobUrl || undefined} controls className="w-full" />
          <div className="flex gap-2">
            <Button variant="destructive" onClick={resetAll}>
              <Trash2 className="w-4 h-4 mr-1" /> Borrar
            </Button>
            <Button onClick={confirmSend}>
              <Send className="w-4 h-4 mr-1" /> Enviar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
