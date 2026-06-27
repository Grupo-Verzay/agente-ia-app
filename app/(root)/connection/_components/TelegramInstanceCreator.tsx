'use client';

import { useState, useMemo } from 'react';
import { Loader2, Plus, Info } from 'lucide-react';
import { FaTelegramPlane } from 'react-icons/fa';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { createTelegramInstance } from '@/actions/instances-actions';
import { sanitizeInstanceName } from '@/schema/connection';
import { toast } from 'sonner';

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
      <Card className="flex-1 border-dashed flex flex-col" style={{ borderColor: '#9bd4ee' }}>
        <CardHeader className="flex flex-row items-center justify-center px-6 py-4">
          <CardTitle className="text-center text-2xl font-bold flex items-center gap-2">
            <FaTelegramPlane className="rounded-sm w-6 h-6" style={{ color: TELEGRAM_BLUE }} />
            <span className="text-xl font-bold">Telegram</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-6 pb-3 pt-0">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-muted-foreground">Nombre de instancia</p>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="flex-1 font-mono text-foreground">{instanceName}</span>
              <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
        <CardFooter className="mt-auto px-6 pb-4 pt-0">
          <Button
            onClick={() => setOpen(true)}
            className="w-full text-white border-0" style={{ backgroundColor: TELEGRAM_BLUE }}
          >
            <Plus className="w-4 h-4 mr-1" />
            Conectar Telegram
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva instancia de Telegram</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Nombre de instancia</p>
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span className="flex-1 font-mono text-foreground">{instanceName}</span>
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
