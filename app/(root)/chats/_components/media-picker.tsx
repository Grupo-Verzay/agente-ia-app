"use client";

import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { OutgoingMessagePayload } from "./chat-main";

/** Convierte File -> Data URL base64 (ej: data:image/png;base64,AAA...) */
async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

type Props = {
  onSend: (payload: OutgoingMessagePayload) => Promise<void> | void;
  prefixForUpload?: string;   // para el flujo S3 si desactivas base64
};

export const MediaPicker: React.FC<Props> = ({ onSend, prefixForUpload = "uploads" }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [caption, setCaption] = useState("");
  const [ptt, setPtt] = useState(false);            // para audio (nota de voz)
  const [loading, setLoading] = useState(false);
  const [useBase64, setUseBase64] = useState(true); //  enviar desde memoria local

  async function handleFileSelected(file: File) {
    if (!file) return;

    // Guardrails: base64 crece ~33%
    const hardLimitMB = useBase64 ? 8 : 25; // 8MB si base64, 25MB si S3
    if (file.size > hardLimitMB * 1024 * 1024) {
      alert(`El archivo excede ${hardLimitMB}MB para este modo.`);
      return;
    }

    setLoading(true);
    try {
      if (useBase64) {
        // ----- MODO LOCAL (BASE64) -----
        const dataUrl = await fileToDataUrl(file);
        const mimetype = file.type || "application/octet-stream";

        const mt = mimetype.startsWith("image/")
          ? "image"
          : mimetype.startsWith("video/")
          ? "video"
          : mimetype.startsWith("audio/")
          ? "audio"
          : "document";

        const payload: OutgoingMessagePayload = {
          kind: "media",
          mediatype: mt as any,
          mediaUrl: dataUrl,             // <<<<<< data URL base64
          mimetype,
          fileName: file.name,
          caption: caption || undefined,
          ptt: mt === "audio" ? ptt : undefined,
        };

        await onSend(payload);
        setCaption("");
        setPtt(false);
      } else {
        // ----- MODO S3 (SUBIDA + URL) -----
        const form = new FormData();
        form.append("file", file);
        form.append("prefix", prefixForUpload);
        form.append("caption", caption);

        const res = await fetch("/api/upload", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.message || "No se pudo subir el archivo");
        }

        const payload: OutgoingMessagePayload = {
          kind: "media",
          mediatype: json.mediatype,   // 'image' | 'video' | 'audio' | 'document'
          mediaUrl: json.url,
          mimetype: json.mimetype,
          fileName: json.fileName,
          caption: caption || undefined,
          ptt: json.mediatype === "audio" ? ptt : undefined,
        };

        await onSend(payload);
        setCaption("");
        setPtt(false);
      }
    } catch (e: any) {
      console.error("[MediaPicker] send error:", e);
      alert(
        useBase64
          ? (e?.message || "No se pudo enviar en base64. Tu instancia podría no soportarlo. Desactiva 'memoria local' y usa S3.")
          : (e?.message || "Error al subir/enviar el archivo")
      );
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      {/* Toggle: usar base64 directo */}
      <div className="flex items-center gap-2">
        <Label htmlFor="useBase64" className="text-xs text-muted-foreground">
          Usar memoria local (base64)
        </Label>
        <Switch id="useBase64" checked={useBase64} onCheckedChange={setUseBase64} />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFileSelected(f);
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title={useBase64 ? "Adjuntar y enviar sin subir (base64)" : "Adjuntar y subir a S3"}
        onClick={() => fileInputRef.current?.click()}
        disabled={loading}
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
      </Button>

      {/* Caption opcional */}
      <Input
        placeholder="Título/Caption (opcional)"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        className="w-[180px] md:w-[240px]"
      />

      {/* PTT solo aplica si el archivo es audio */}
      <div className="flex items-center gap-2">
        <Label htmlFor="ptt" className="text-xs text-muted-foreground">PTT (nota de voz)</Label>
        <Switch id="ptt" checked={ptt} onCheckedChange={setPtt} />
      </div>
    </div>
  );
};
