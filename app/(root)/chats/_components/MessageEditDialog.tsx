'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface MessageEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialText: string;
  onSave: (newText: string) => void | Promise<void>;
}

export function MessageEditDialog({ open, onOpenChange, initialText, onSave }: MessageEditDialogProps) {
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setText(initialText);
  }, [open, initialText]);

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSave(trimmed);
    } finally {
      setSaving(false);
    }
  };

  const unchanged = text.trim() === initialText.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar mensaje</DialogTitle>
          <DialogDescription>
            WhatsApp solo permite editar tus propios mensajes recientes (aprox. 15 minutos).
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          autoFocus
          className="resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleSave();
          }}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || unchanged || !text.trim()}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
