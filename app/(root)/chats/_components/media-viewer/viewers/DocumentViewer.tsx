'use client';

import React from 'react';
import { Download, ExternalLink, FileArchive, FileCode, FileSpreadsheet, FileText, FileType } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ViewerProps } from '../viewer-types';

const ICON_MAP: Array<{ mimes: string[]; icon: React.FC<{ className?: string }> }> = [
  { mimes: ['application/pdf'], icon: FileType },
  { mimes: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'], icon: FileSpreadsheet },
  { mimes: ['application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed', 'application/x-7z-compressed'], icon: FileArchive },
  { mimes: ['text/html', 'text/javascript', 'application/json', 'application/xml', 'text/xml'], icon: FileCode },
];

function getDocIcon(mimeType: string): React.FC<{ className?: string }> {
  for (const { mimes, icon } of ICON_MAP) {
    if (mimes.some((m) => mimeType.startsWith(m) || mimeType === m)) return icon;
  }
  return FileText;
}

function getExtLabel(mimeType: string) {
  const part = mimeType.split('/')[1] ?? '';
  return part.replace('vnd.openxmlformats-officedocument.', '').replace('vnd.ms-', '').toUpperCase() || 'ARCHIVO';
}

function isPdf(mimeType: string) {
  return mimeType === 'application/pdf' || mimeType.endsWith('/pdf');
}

export const DocumentViewer: React.FC<ViewerProps> = ({ url, mimeType, caption }) => {
  const DocIcon = getDocIcon(mimeType);

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
    <div className="w-full h-full flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="w-24 h-24 rounded-2xl bg-white/8 border border-white/15 flex items-center justify-center">
          <DocIcon className="h-11 w-11 text-blue-400" />
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-white font-medium text-base leading-snug max-w-xs truncate">
            {caption || 'Documento'}
          </p>
          <p className="text-white/35 text-xs uppercase tracking-widest font-mono">
            {getExtLabel(mimeType)}
          </p>
        </div>

        <div className="flex gap-3">
          <Button asChild className="bg-blue-500 hover:bg-blue-400 text-white gap-2">
            <a href={url} download aria-label="Descargar archivo">
              <Download className="h-4 w-4" />
              Descargar
            </a>
          </Button>
          <Button
            variant="outline"
            asChild
            className="border-white/20 text-white/80 hover:text-white hover:bg-white/10 gap-2"
          >
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
