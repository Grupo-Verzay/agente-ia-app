'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { fmtPhone } from '@/lib/whatsapp-jid';
import { mergeLidContact, listMergeCandidates } from '@/actions/merge-lid-contact';

interface MergeLidDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lidJid: string;
  instanceName?: string;
}

type Candidate = { remoteJid: string; name: string };

export function MergeLidDialog({ open, onOpenChange, lidJid, instanceName }: MergeLidDialogProps) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);

  // Cargar / filtrar contactos de la misma línea al abrir y al escribir.
  useEffect(() => {
    if (!open || !instanceName) return;
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await listMergeCandidates({ instanceName, query });
        if (alive && res.ok) setItems(res.items);
      } finally {
        if (alive) setLoading(false);
      }
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [open, instanceName, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setItems([]);
    }
  }, [open]);

  const doMerge = async (phone: string) => {
    if (merging) return;
    setMerging(true);
    try {
      const res = await mergeLidContact({ lidJid, phone });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Contacto unido. Recargando…');
      onOpenChange(false);
      setTimeout(() => window.location.reload(), 800);
    } catch {
      toast.error('No se pudo unir el contacto. Intenta de nuevo.');
    } finally {
      setMerging(false);
    }
  };

  const queryDigits = query.replace(/\D/g, '');
  const manualNumberOption =
    queryDigits.length >= 8 && !items.some((it) => it.remoteJid.replace(/\D/g, '') === queryDigits);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Unir con el contacto real</DialogTitle>
          <DialogDescription>
            Elige el contacto real con el que se debe unir este chat (o escribe su número).
            Queda aprendido para siempre.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-1">
          <Input
            placeholder="Buscar por nombre o número…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            disabled={merging}
          />

          <div className="max-h-64 overflow-y-auto rounded-md border border-border">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando contactos…
              </div>
            ) : items.length === 0 && !manualNumberOption ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {query ? 'Sin resultados. Escribe el número completo.' : 'No hay contactos en esta línea.'}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {manualNumberOption && (
                  <li>
                    <button
                      type="button"
                      disabled={merging}
                      onClick={() => void doMerge(query)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 disabled:opacity-50"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">+</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">Unir con este número</span>
                        <span className="block text-xs text-muted-foreground">{fmtPhone(queryDigits) || `+${queryDigits}`}</span>
                      </span>
                    </button>
                  </li>
                )}
                {items.map((it) => (
                  <li key={it.remoteJid}>
                    <button
                      type="button"
                      disabled={merging}
                      onClick={() => void doMerge(it.remoteJid)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 disabled:opacity-50"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <UserRound className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {it.name || fmtPhone(it.remoteJid) || it.remoteJid.split('@')[0]}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {fmtPhone(it.remoteJid) || it.remoteJid.split('@')[0]}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {merging && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uniendo…
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
