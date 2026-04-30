'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { upsertExternalClientData } from '@/actions/external-client-data-actions';
import type { ExternalClientData, ExternalClientDataRecord } from '@/types/external-client-data';

// ─── Key-value pair types (SRP — data shape for the form) ─────────────────────

interface KeyValuePair {
  key: string;
  value: string;
}

function recordToKV(data: ExternalClientDataRecord): KeyValuePair[] {
  const pairs = Object.entries(data).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }));
  return pairs.length ? pairs : [{ key: '', value: '' }];
}

function kvToRecord(pairs: KeyValuePair[]): ExternalClientDataRecord {
  return Object.fromEntries(
    pairs.filter((p) => p.key.trim()).map((p) => [p.key.trim(), p.value]),
  );
}

// ─── Props (ISP) ──────────────────────────────────────────────────────────────

export interface ExternalClientDataFormDialogProps {
  open: boolean;
  userId: string;
  record?: ExternalClientData | null;
  onSuccess: () => void;
  onClose: () => void;
}

// ─── Component (SRP — only manages the form) ──────────────────────────────────

export function ExternalClientDataFormDialog({
  open,
  userId,
  record,
  onSuccess,
  onClose,
}: ExternalClientDataFormDialogProps) {
  const isEditing = !!record;

  const [remoteJid, setRemoteJid] = useState('');
  const [pairs, setPairs] = useState<KeyValuePair[]>([{ key: '', value: '' }]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setRemoteJid(record?.remoteJid ?? '');
      setPairs(record ? recordToKV(record.data) : [{ key: '', value: '' }]);
    }
  }, [open, record]);

  const addPair = () => setPairs((prev) => [...prev, { key: '', value: '' }]);

  const removePair = (index: number) =>
    setPairs((prev) => prev.filter((_, i) => i !== index));

  const updatePair = (index: number, field: 'key' | 'value', val: string) =>
    setPairs((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: val } : p)),
    );

  const handleSave = async () => {
    const jid = remoteJid.trim();
    if (!jid) {
      toast.error('El remoteJid es obligatorio');
      return;
    }
    const data = kvToRecord(pairs);
    setIsSaving(true);
    try {
      await upsertExternalClientData(userId, jid, data, 'manual');
      toast.success(isEditing ? 'Registro actualizado' : 'Registro creado');
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message ?? 'Error al guardar el registro');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (!isSaving) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar registro' : 'Nuevo registro'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Modifica los campos de datos del contacto.'
              : 'Ingresa el número de WhatsApp y los datos del contacto.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Remote JID */}
          <div className="space-y-1.5">
            <Label htmlFor="remoteJid">WhatsApp / Remote JID</Label>
            <Input
              id="remoteJid"
              placeholder="ej: 5491112345678@s.whatsapp.net"
              value={remoteJid}
              onChange={(e) => setRemoteJid(e.target.value)}
              disabled={isEditing || isSaving}
              className="font-mono text-xs"
            />
            {isEditing && (
              <p className="text-xs text-muted-foreground">
                El remoteJid no puede modificarse una vez creado.
              </p>
            )}
          </div>

          <Separator />

          {/* Key-value editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Campos de datos</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addPair}
                disabled={isSaving}
                className="gap-1.5 h-7 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar campo
              </Button>
            </div>

            <div className="max-h-64 overflow-y-auto pr-1 space-y-2">
              {pairs.map((pair, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    placeholder="Clave (ej: nombre)"
                    value={pair.key}
                    onChange={(e) => updatePair(i, 'key', e.target.value)}
                    disabled={isSaving}
                    className="flex-1 text-xs"
                  />
                  <Input
                    placeholder="Valor"
                    value={pair.value}
                    onChange={(e) => updatePair(i, 'value', e.target.value)}
                    disabled={isSaving}
                    className="flex-1 text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => removePair(i)}
                    disabled={isSaving || pairs.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEditing ? 'Guardar cambios' : 'Crear registro'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
