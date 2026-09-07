'use client';

import { useState, useMemo } from 'react';
import { Loader2, Info } from 'lucide-react';
import { FaTelegramPlane } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { createTelegramInstance } from '@/actions/instances-actions';
import { sanitizeInstanceName } from '@/schema/connection';
import { cleanInstanceDisplayName } from '@/lib/instance-display-name';
import { toast } from 'sonner';
import { TAMANO_DEL_ICONO } from './TituloDeTarjeta';
import { TarjetaDeCanal } from './TarjetaDeCanal';

interface TelegramInstanceCreatorProps {
  userId: string;
  company?: string | null;
}

const TELEGRAM_BLUE = '#229ED9';

export const TelegramInstanceCreator = ({ userId, company }: TelegramInstanceCreatorProps) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [botToken, setBotToken] = useState('');

  const instanceName = useMemo(
    () => `${sanitizeInstanceName(company ?? userId ?? 'instancia')}_tg`,
    [company, userId]
  );
  const visibleName = cleanInstanceDisplayName(instanceName);

  const handleCreate = async () => {
    if (!botToken.trim()) {
      toast.error('El Bot Token es requerido.');
      return;
    }
    setSaving(true);
    const res = await createTelegramInstance({ instanceName, userId, botToken });
    setSaving(false);
    if (res.success) {
      toast.success(res.message);
      setOpen(false);
      setBotToken('');
    } else {
      toast.error(res.message);
    }
  };

  return (
    <>
      <TarjetaDeCanal
        icono={<FaTelegramPlane className={TAMANO_DEL_ICONO} style={{ color: TELEGRAM_BLUE }} />}
        titulo="Mensajería Telegram"
        color={TELEGRAM_BLUE}
        instanceName={visibleName}
        textoConectar="Conectar Telegram"
        alAbrirFormulario={() => setOpen(true)}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva instancia de Telegram</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Nombre de instancia</p>
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span className="flex-1 font-mono text-foreground">{visibleName}</span>
                <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Bot Token <span className="text-red-500">*</span></Label>
              <Input
                type="password"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyz"
              />
              <p className="text-xs text-muted-foreground">
                Crea un bot con <code className="bg-muted px-1 rounded">@BotFather</code> en Telegram y pega aquí el token.
                El webhook se configura automáticamente.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="animate-spin w-4 h-4 mr-1" />}
              Conectar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
