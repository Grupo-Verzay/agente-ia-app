'use client';

import { useState } from 'react';
import { TableIcon, Save, Loader2, Sheet, Pencil, ExternalLink, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface Props {
  userId: string;
  initialSheetsUrl: string | null;
  initialFormName?: string | null;
  initialRegistroName?: string | null;
}

function getSheetId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function getEmbedUrl(url: string): string | null {
  const id = getSheetId(url);
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit?rm=minimal` : null;
}

/** La hoja de verdad, sin el `rm=minimal` del incrustado: es el link que se
 *  abre en otra pestana y el que se copia. */
function getOpenUrl(url: string): string | null {
  const id = getSheetId(url);
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null;
}

export function GoogleSheetsClient({ userId, initialSheetsUrl }: Props) {
  const [url, setUrl] = useState(initialSheetsUrl ?? '');
  const [saved, setSaved] = useState(!!initialSheetsUrl);
  const [saving, setSaving] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const embedUrl = saved ? getEmbedUrl(url) : null;
  const openUrl = saved ? getOpenUrl(url) : null;

  async function copiarLink() {
    if (!openUrl) return;
    await navigator.clipboard.writeText(openUrl);
    setCopiado(true);
    toast.success('Link copiado');
    setTimeout(() => setCopiado(false), 2000);
  }

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
          {/* Abrir, copiar el link y cambiar de hoja. El link no se veia por
              ningun lado: la hoja se mostraba incrustada y para saber cual era
              habia que ir a buscarla a Drive. */}
          <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md border bg-background/80 px-1 py-1 backdrop-blur-sm transition-opacity opacity-40 hover:opacity-100">
            {openUrl && (
              <>
                <a
                  href={openUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir en Google Sheets"
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" />
                  Abrir
                </a>
                <button
                  onClick={copiarLink}
                  title="Copiar el link de la hoja"
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {copiado ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  Copiar link
                </button>
              </>
            )}
            {/* Cambiar de hoja deja la URL actual en el campo, no lo vacia: asi
                se puede ver cual esta puesta y volver atras sin perderla. */}
            <button
              onClick={() => setSaved(false)}
              title="Cambiar hoja de cálculo"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
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
