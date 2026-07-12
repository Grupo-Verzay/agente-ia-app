'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, FileText, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { listMetaTemplates, type MetaTemplateOption } from '@/actions/channel-chat-actions';

interface TemplatePickerDialogProps {
  instanceName: string;
  inline?: boolean;
  onSendTemplate: (
    template: MetaTemplateOption,
    params: string[],
  ) => Promise<{ success: boolean; message?: string }>;
}

/**
 * Selector de plantillas de WhatsApp Cloud.
 * En modo inline se muestra directo dentro del modal de nuevo mensaje.
 */
export const TemplatePickerDialog = ({
  instanceName,
  inline = false,
  onSendTemplate,
}: TemplatePickerDialogProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<MetaTemplateOption[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MetaTemplateOption | null>(null);
  const [params, setParams] = useState<string[]>([]);

  const loadTemplates = async () => {
    if (!instanceName) return;
    setLoading(true);
    const res = await listMetaTemplates(instanceName);
    setLoading(false);
    setTemplates(res.templates);
    if (!res.success) {
      toast.error('No se pudieron cargar las plantillas. Revisa que la WABA tenga plantillas aprobadas.');
    }
  };

  useEffect(() => {
    if (!inline) return;
    setSelected(null);
    setQuery('');
    void loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inline, instanceName]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setSelected(null);
      setQuery('');
      void loadTemplates();
    }
  };

  const pickTemplate = (template: MetaTemplateOption) => {
    setSelected(template);
    setParams(Array.from({ length: template.paramCount }, () => ''));
  };

  const handleSend = async () => {
    if (!selected) return;
    if (params.some((param) => !param.trim())) {
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

  const filtered = templates.filter((template) => {
    const term = query.toLowerCase();
    return (
      template.name.toLowerCase().includes(term) ||
      template.bodyText.toLowerCase().includes(term)
    );
  });

  const preview = selected
    ? selected.bodyText.replace(
        /\{\{\s*(\d+)\s*\}\}/g,
        (_, n) => params[Number(n) - 1] || `{{${n}}}`,
      )
    : '';

  const content = (
    <>
      {!selected ? (
        <div className="space-y-3 py-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar plantilla..."
              className="pl-8"
            />
          </div>

          <ScrollArea className={inline ? 'h-36 pr-2' : 'h-64 pr-2'}>
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
                {filtered.map((template) => (
                  <li key={`${template.name}_${template.language}`}>
                    <button
                      type="button"
                      onClick={() => pickTemplate(template)}
                      className="w-full rounded-md border p-3 text-left transition hover:bg-muted/60"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">{template.name}</span>
                        <span className="text-[10px] uppercase text-muted-foreground">
                          {template.language}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {template.bodyText}
                      </p>
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
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a la lista
          </button>

          <div className="max-h-28 overflow-auto rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
            {preview}
          </div>

          {selected.paramCount > 0 && (
            <div className="space-y-2">
              {Array.from({ length: selected.paramCount }, (_, index) => (
                <div key={index} className="space-y-1">
                  <Label className="text-xs">Parametro {`{{${index + 1}}}`}</Label>
                  <Input
                    value={params[index] ?? ''}
                    onChange={(event) =>
                      setParams((prev) =>
                        prev.map((param, paramIndex) =>
                          paramIndex === index ? event.target.value : param,
                        ),
                      )
                    }
                    placeholder={`Valor para {{${index + 1}}}`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );

  if (inline) {
    return (
      <div className="space-y-3">
        {content}
        {selected && (
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSend} disabled={sending}>
              {sending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Enviar plantilla
            </Button>
          </div>
        )}
      </div>
    );
  }

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
            Utiles para escribir fuera de la ventana de 24 h. Solo plantillas aprobadas por Meta.
          </DialogDescription>
        </DialogHeader>

        {content}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
            Cancelar
          </Button>
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
