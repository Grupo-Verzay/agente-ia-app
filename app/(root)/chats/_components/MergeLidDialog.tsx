'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { mergeLidContact } from '@/actions/merge-lid-contact';

interface MergeLidDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lidJid: string;
}

export function MergeLidDialog({ open, onOpenChange, lidJid }: MergeLidDialogProps) {
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const handleMerge = async () => {
    if (!phone.trim() || saving) return;
    setSaving(true);
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
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Unir con el contacto real</DialogTitle>
          <DialogDescription>
            Este chat usa un ID interno de WhatsApp. Escribe el número real de este contacto
            (con código de país) para unir las conversaciones. Queda aprendido para siempre.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-1">
          <label className="text-xs font-medium text-muted-foreground">Número real</label>
          <Input
            inputMode="tel"
            placeholder="Ej. 57 300 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleMerge();
            }}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Tip: cópialo del otro chat del mismo contacto (el que sí muestra el nombre).
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void handleMerge()} disabled={saving || !phone.trim()}>
            {saving ? 'Uniendo…' : 'Unir contacto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
