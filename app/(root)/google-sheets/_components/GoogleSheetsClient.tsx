'use client';

import { useState } from 'react';
import { TableIcon, Save, Loader2, Sheet, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface Props {
  userId: string;
  initialSheetsUrl: string | null;
}

function getEmbedUrl(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) return null;
  const id = match[1];
  return `https://docs.google.com/spreadsheets/d/${id}/edit?rm=minimal`;
}

export function GoogleSheetsClient({ userId, initialSheetsUrl }: Props) {
  const [url, setUrl] = useState(initialSheetsUrl ?? '');
  const [saved, setSaved] = useState(!!initialSheetsUrl);
  const [saving, setSaving] = useState(false);
  const embedUrl = saved ? getEmbedUrl(url) : null;

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
      {/* Config card — solo visible cuando no hay hoja vinculada */}
      {!saved && (
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

          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Pega aquí la URL de tu Google Sheet"
              className="h-9 flex-1 text-sm font-mono"
            />
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <><Save className="h-3.5 w-3.5" /> Guardar</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Embed o estado vacío */}
      {embedUrl ? (
        <div className="relative flex-1 min-h-0 overflow-hidden rounded-xl border shadow-sm" style={{ height: '520px' }}>
          <iframe
            src={embedUrl}
            className="h-full w-full"
            title="Google Sheets"
          />
          {/* Botón sutil para cambiar hoja */}
          <button
            onClick={() => { setSaved(false); setUrl(''); }}
            title="Cambiar hoja de cálculo"
            className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md border bg-background/80 backdrop-blur-sm px-2 py-1 text-xs text-muted-foreground transition-all opacity-30 hover:opacity-100 hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-12 text-muted-foreground">
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
