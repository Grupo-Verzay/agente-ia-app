'use client';

import React from 'react';
import { Clock, PencilLine, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ContactEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  phoneLabel?: string;
  draft: string;
  onDraftChange: (value: string) => void;
  onSave: () => void | Promise<void>;
  isPending: boolean;
}

export const ContactEditDialog: React.FC<ContactEditDialogProps> = ({
  open,
  onOpenChange,
  currentName,
  phoneLabel,
  draft,
  onDraftChange,
  onSave,
  isPending,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span className="rounded-xl bg-primary/10 p-2 text-primary">
            <UserRound className="h-4 w-4" />
          </span>
          Editar contacto
        </DialogTitle>
        <DialogDescription>
          Actualiza el nombre del lead sincronizado en CRM para que se refleje en esta conversación.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="rounded-2xl border bg-muted/30 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Vista previa</p>
          <div className="mt-3 space-y-1">
            <p className="text-base font-semibold text-foreground">{draft.trim() || 'Sin nombre'}</p>
            {phoneLabel && <p className="text-xs text-muted-foreground">{phoneLabel}</p>}
            <p className="text-xs text-muted-foreground">
              Nombre actual:{' '}
              <span className="font-medium text-foreground/80">{currentName || 'Sin nombre'}</span>
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="chat-contact-name">Nombre del contacto</Label>
          <Input
            id="chat-contact-name"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder="Ej. Maria Fernanda"
            maxLength={120}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            Este cambio actualiza la sesion CRM y los registros asociados a este lead.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={() => void onSave()}
          disabled={isPending || !draft.trim()}
          className="gap-2"
        >
          {isPending ? <Clock className="h-4 w-4 animate-spin" /> : <PencilLine className="h-4 w-4" />}
          Guardar nombre
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
