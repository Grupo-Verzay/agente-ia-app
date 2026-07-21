'use client';

import React, { useCallback } from 'react';
import { Download, ExternalLink, FileArchive, FileCode, FileSpreadsheet, FileText, FileType } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ViewerProps } from '../viewer-types';

const ICON_MAP: Array<{ mimes: string[]; icon: React.FC<{ className?: string }>; ext: string }> = [
  { mimes: ['application/pdf'], icon: FileType, ext: 'pdf' },
  { mimes: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'], icon: FileSpreadsheet, ext: 'xlsx' },
  { mimes: ['application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed', 'application/x-7z-compressed'], icon: FileArchive, ext: 'zip' },
  { mimes: ['text/html', 'text/javascript', 'application/json', 'application/xml', 'text/xml'], icon: FileCode, ext: 'txt' },
  { mimes: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], icon: FileText, ext: 'docx' },
];

function getDocMeta(mimeType: string): { icon: React.FC<{ className?: string }>; ext: string } {
  for (const { mimes, icon, ext } of ICON_MAP) {
    if (mimes.some((m) => mimeType.startsWith(m) || mimeType === m)) return { icon, ext };
  }
  return { icon: FileText, ext: 'bin' };
}

function getExtLabel(mimeType: string) {
  const part = mimeType.split('/')[1] ?? '';
  return part.replace('vnd.openxmlformats-officedocument.', '').replace('vnd.ms-', '').toUpperCase() || 'ARCHIVO';
}

function isPdf(mimeType: string) {
  return mimeType === 'application/pdf' || mimeType.endsWith('/pdf');
}

/** Nombre de descarga: usa el caption (suele traer el nombre real) o uno genérico. */
function resolveDownloadName(caption: string | undefined, ext: string) {
  const clean = (caption ?? '').trim();
  if (clean && /\.[a-z0-9]{2,5}$/i.test(clean)) return clean;
  if (clean) return `${clean}.${ext}`;
  return `documento.${ext}`;
}

export const DocumentViewer: React.FC<ViewerProps> = ({ url, mimeType, caption }) => {
  const { icon: DocIcon, ext } = getDocMeta(mimeType);
  const downloadName = resolveDownloadName(caption, ext);

  const handleDownload = useCallback(async () => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  }, [url, downloadName]);

  if (isPdf(mimeType)) {
    return (
      <div className="w-full flex flex-col" style={{ minHeight: '100vh' }}>
        <iframe
          src={url}
          title={caption || 'Documento PDF'}
          className="w-full flex-1 bg-white"
          style={{ border: 'none', minHeight: '60vh' }}
        />
      </div>
    );
  }

  return (
    <div className="w-full flex items-center justify-center px-6 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
          <DocIcon className="h-10 w-10 text-primary" />
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <p className="max-w-full truncate text-base font-medium leading-snug text-foreground" title={caption || 'Documento'}>
            {caption || 'Documento'}
          </p>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {getExtLabel(mimeType)}
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={handleDownload} className="gap-2">
            <Download className="h-4 w-4" />
            Descargar
          </Button>
          <Button variant="outline" asChild className="gap-2">
            <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Abrir en nueva pestaña">
              <ExternalLink className="h-4 w-4" />
              Abrir
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
};
