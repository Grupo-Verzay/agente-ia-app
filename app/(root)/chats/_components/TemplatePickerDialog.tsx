'use client';

import { useState } from 'react';
import { FileText, Loader2, Search, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { listMetaTemplates, type MetaTemplateOption } from '@/actions/channel-chat-actions';
import { toast } from 'sonner';

interface TemplatePickerDialogProps {
  instanceName: string;
  onSendTemplate: (
    template: MetaTemplateOption,
    params: string[],
  ) => Promise<{ success: boolean; message?: string }>;
}

/**
 * Selector de plantillas de WhatsApp Cloud. Permite al operador enviar una
 * plantilla aprobada (válida fuera de la ventana de 24h). Trae las plantillas
 * aprobadas de Meta con el wabaId de la instancia.
 */
export const TemplatePickerDialog = ({ instanceName, onSendTemplate }: TemplatePickerDialogProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<MetaTemplateOption[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MetaTemplateOption | null>(null);
  const [params, setParams] = useState<string[]>([]);

  const loadTemplates = async () => {
    setLoading(true);
    const res = await listMetaTemplates(instanceName);
    setLoading(false);
    setTemplates(res.templates);
    if (!res.success) {
      toast.error('No se pudieron cargar las plantillas. Revisa que la WABA tenga plantillas aprobadas.');
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setSelected(null);
      setQuery('');
      void loadTemplates();
    }
  };

  const pickTemplate = (t: MetaTemplateOption) => {
    setSelected(t);
    setParams(Array.from({ length: t.paramCount }, () => ''));
  };

  const handleSend = async () => {
    if (!selected) return;
    if (params.some((p) => !p.trim())) {
      toast.error('Completa todos los campos de la plantilla.');
      return;
    }
    setSending(true);
    const res = await onSendTemplate(selected, params);
    setSending(false);
    if (res.success) {
      toast.success('Plantilla enviada.');
      setOpen(false);
      setSelected(null);
    } else {
      toast.error(res.message || 'No se pudo enviar la plantilla.');
    }
  };

  const filtered = templates.filter((t) =>
    t.name.toLowerCase().includes(query.toLowerCase()) ||
    t.bodyText.toLowerCase().includes(query.toLowerCase()),
  );

  // Vista previa con los parámetros sustituidos
  const preview = selected
    ? selected.bodyText.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => params[Number(n) - 1] || `{{${n}}}`)
    : '';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Enviar plantilla de WhatsApp"
          aria-label="Enviar plantilla de WhatsApp"
          className="h-9 w-9 shrink-0"
        >
          <FileText className="h-5 w-5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Plantillas de WhatsApp</DialogTitle>
          <DialogDescription>
            Útiles para escribir fuera de la ventana de 24 h. Solo plantillas aprobadas por Meta.
          </DialogDescription>
        </DialogHeader>

        {!selected ? (
          <div className="space-y-3 py-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar plantilla…"
                className="pl-8"
              />
            </div>
            <ScrollArea className="h-64 pr-2">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No hay plantillas aprobadas disponibles.
                </p>
              ) : (
                <ul className="space-y-2">
                  {filtered.map((t) => (
                    <li key={`${t.name}_${t.language}`}>
                      <button
                        type="button"
                        onClick={() => pickTemplate(t)}
                        className="w-full rounded-md border p-3 text-left transition hover:bg-muted/60"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm">{t.name}</span>
                          <span className="text-[10px] uppercase text-muted-foreground">{t.language}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.bodyText}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>
        ) : (
          <div className="space-y-3 py-1">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Volver a la lista
            </button>

            <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">{preview}</div>

            {selected.paramCount > 0 && (
              <div className="space-y-2">
                {Array.from({ length: selected.paramCount }, (_, i) => (
                  <div key={i} className="space-y-1">
                    <Label className="text-xs">Parámetro {`{{${i + 1}}}`}</Label>
                    <Input
                      value={params[i] ?? ''}
                      onChange={(e) =>
                        setParams((prev) => prev.map((p, idx) => (idx === i ? e.target.value : p)))
                      }
                      placeholder={`Valor para {{${i + 1}}}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>Cancelar</Button>
          {selected && (
            <Button onClick={handleSend} disabled={sending}>
              {sending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Enviar plantilla
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
