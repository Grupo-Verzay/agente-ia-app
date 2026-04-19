"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { Paperclip, ImageIcon, Video, FileText, AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Tipos compartidos */
export type MediaType = "image" | "video" | "audio" | "document";

export type ComposeMedia = {
  mediatype: MediaType;
  dataUrl: string;     // data:<mime>;base64,...
  mimeType: string;
  fileName: string;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

export function AttachmentMenu({
  onComposeMediaChange,
  maxBase64MB = 8,
}: {
  onComposeMediaChange: (m: ComposeMedia | null) => void;
  maxBase64MB?: number;
}) {
  const [open, setOpen] = useState(false);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const vidInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const audInputRef = useRef<HTMLInputElement>(null);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

  const handlePick = useCallback((ref: React.RefObject<HTMLInputElement>) => {
    ref.current?.click();
  }, []);

  const handleFile = useCallback(
    async (file: File, mediatype: MediaType) => {
      try {
        const sizeMB = file.size / (1024 * 1024);
        if (sizeMB > maxBase64MB) {
          console.warn(
            `[AttachmentMenu] Archivo supera ${maxBase64MB}MB (size=${sizeMB.toFixed(
              2
            )}MB).`
          );
        }
        const dataUrl = await readFileAsDataUrl(file);
        onComposeMediaChange({
          mediatype,
          dataUrl,
          mimeType: file.type || "application/octet-stream",
          fileName: file.name || "file",
        });
        close();
      } catch (e) {
        console.error("[AttachmentMenu] Error leyendo archivo:", e);
      }
    },
    [close, maxBase64MB, onComposeMediaChange]
  );

  const onImgChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      handleFile(f, "image");
    },
    [handleFile]
  );

  const onVidChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      handleFile(f, "video");
    },
    [handleFile]
  );

  const onDocChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      handleFile(f, "document");
    },
    [handleFile]
  );

  const onAudChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      handleFile(f, "audio");
    },
    [handleFile]
  );

  return (
    <div className="relative">
      {/* Clip (está pensado para ir DENTRO de la barra del input, a la izquierda) */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={toggle}
        className="text-gray-600 dark:text-gray-300 hover:text-gray-900"
        aria-label="Adjuntar"
      >
        <Paperclip className="w-5 h-5" />
      </Button>

      {/* Popover simple */}
      {open && (
        <div
          className={cn(
            "absolute bottom-12 left-0 z-40 w-48 rounded-lg border bg-white dark:bg-gray-800 shadow-lg p-1",
            "animate-in fade-in-0 zoom-in-95"
          )}
          onMouseLeave={close}
        >
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => handlePick(imgInputRef)}
          >
            <ImageIcon className="w-4 h-4" />
            Imagen
          </button>
          {/* <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => handlePick(vidInputRef)}
          >
            <Video className="w-4 h-4" />
            Video
          </button> */}
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => handlePick(docInputRef)}
          >
            <FileText className="w-4 h-4" />
            Documento
          </button>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => handlePick(audInputRef)}
          >
            <AudioLines className="w-4 h-4" />
            Audio (archivo)
          </button>
        </div>
      )}

      {/* Inputs ocultos */}
      <input
        ref={imgInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onImgChange}
      />
      <input
        ref={vidInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={onVidChange}
      />
      <input
        ref={docInputRef}
        type="file"
        // acepta cualquier documento (pdf, docx, xls, etc.)
        className="hidden"
        onChange={onDocChange}
      />
      <input
        ref={audInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={onAudChange}
      />
    </div>
  );
}
