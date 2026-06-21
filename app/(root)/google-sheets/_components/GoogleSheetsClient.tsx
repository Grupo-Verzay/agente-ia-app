'use client';

import { useState } from 'react';
import { TableIcon, ExternalLink, Save, Loader2, CheckCircle2, Sheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { db } from '@/lib/db';

async function saveSheetsUrl(userId: string, url: string) {
  const res = await fetch('/api/user/sheets-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, url }),
  });
  return res.ok;
}

interface Props {
  userId: string;
  initialSheetsUrl: string | null;
}

function getEmbedUrl(url: string): string | null {
  if (!url) return null;
  // Extraer spreadsheet ID y construir URL de embed
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) return null;
  const id = match[1];
  // Extraer gid si existe
  const gidMatch = url.match(/[#&]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  return `https://docs.google.com/spreadsheets/d/${id}/edit?rm=minimal#gid=${gid}`;
}

export function GoogleSheetsClient({ userId, initialSheetsUrl }: Props) {
  const [url, setUrl] = useState(initialSheetsUrl ?? '');
  const [saved, setSaved] = useState(!!initialSheetsUrl);
  const [saving, setSaving] = useState(false);

  const embedUrl = getEmbedUrl(saved ? url : '');

  async function handleSave() {
    if (!url.trim()) {
      toast.error('Ingresa la URL de tu Google Sheet');
      return;
    }
    setSaving(true);
    try {
      const res = await import('@/actions/google-sheets-actions').then((m) => m.saveUserSheetsUrl(userId, url.trim()));
      if (res.success) {
        setSaved(true);
        toast.success('Google Sheets vinculado correctamente');
      } else {
        toast.error(res.error ?? 'Error al guardar');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header + config */}
      <div className="flex shrink-0 flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
            <Sheet className="h-4 w-4 text-emerald-500" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Google Sheets</p>
            <p className="text-xs text-muted-foreground">Vincula tu hoja de cálculo para sincronizar datos automáticamente</p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-xs text-muted-foreground">URL de Google Sheets</Label>
            <Input
              value={url}
              onChange={(e) => { setUrl(e.target.value); setSaved(false); }}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="h-9 text-sm font-mono"
            />
          </div>
          <div className="flex gap-2">
            {saved && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir
              </a>
            )}
            <Button size="sm" onClick={handleSave} disabled={saving || saved}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : saved ? (
                <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Vinculado</>
              ) : (
                <><Save className="h-3.5 w-3.5" /> Guardar</>
              )}
            </Button>
          </div>
        </div>

        {saved && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            ✓ Las respuestas del formulario de precalificación se sincronizarán automáticamente en la hoja "Registro reunión".
          </p>
        )}
      </div>

      {/* Embed */}
      {embedUrl ? (
        <div className="flex-1 min-h-0 overflow-hidden rounded-xl border shadow-sm">
          <iframe
            src={embedUrl}
            className="h-full w-full"
            title="Google Sheets"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-muted-foreground">
          <TableIcon className="h-10 w-10 opacity-20" />
          <div className="text-center">
            <p className="text-sm font-medium">Sin hoja vinculada</p>
            <p className="text-xs">Pega la URL de tu Google Sheet arriba y guarda</p>
          </div>
        </div>
      )}
    </div>
  );
}
