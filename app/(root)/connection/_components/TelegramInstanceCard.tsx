'use client';

import { useState } from 'react';
import { Loader2, Trash2, Pencil, CheckCircle2 } from 'lucide-react';
import { FaTelegramPlane } from 'react-icons/fa';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { deleteTelegramInstance, updateTelegramInstance } from '@/actions/instances-actions';
import { toast } from 'sonner';

interface TelegramInstanceCardProps {
  instanceName: string;
  botUsername?: string | null;
}

const TELEGRAM_BLUE = '#229ED9';

export const TelegramInstanceCard = ({ instanceName, botUsername }: TelegramInstanceCardProps) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [botToken, setBotToken] = useState('');

  const handleDelete = async () => {
    setDeleting(true);
    const res = await deleteTelegramInstance(instanceName);
    setDeleting(false);
    if (res.success) toast.success(res.message);
    else { toast.error(res.message); setShowDeleteDialog(false); }
  };

  const handleSave = async () => {
    if (!botToken.trim()) {
      toast.error('El Bot Token es requerido.');
      return;
    }
    setSaving(true);
    const res = await updateTelegramInstance({ instanceName, botToken });
    setSaving(false);
    if (res.success) { toast.success(res.message); setShowEditDialog(false); setBotToken(''); }
    else toast.error(res.message);
  };

  return (
    <>
      <Card className="border-border flex-1">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>{instanceName}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1" style={{ color: TELEGRAM_BLUE, borderColor: TELEGRAM_BLUE }}>
                <CheckCircle2 className="w-3 h-3" />
                Telegram
              </Badge>
              <Button size="sm" variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <FaTelegramPlane className="w-5 h-5" style={{ color: TELEGRAM_BLUE }} />
            <div className="text-sm space-y-0.5">
              <p className="text-muted-foreground text-xs font-medium">BOT</p>
              <p className="font-mono text-sm">{botUsername ? `@${botUsername}` : 'Conectado'}</p>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs font-medium">WEBHOOK</p>
            <p className="font-mono text-xs bg-muted rounded px-2 py-1 inline-block">Configurado automáticamente</p>
          </div>
        </CardContent>

        <CardFooter>
          <Button size="sm" variant="outline" onClick={() => setShowEditDialog(true)} className="w-full gap-1.5">
            <Pencil className="w-4 h-4" />
            Actualizar token
          </Button>
        </CardFooter>
      </Card>

      {/* Dialog de edición */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Actualizar token — {instanceName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Bot Token <span className="text-red-500">*</span></Label>
              <Input
                type="password"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyz"
              />
              <p className="text-xs text-muted-foreground">
                Al guardar se valida el token y se vuelve a configurar el webhook.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="animate-spin w-4 h-4 mr-1" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de eliminación */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desconectar el bot de Telegram?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{instanceName}</strong> y sus credenciales, y se quitará el webhook del bot.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="animate-spin w-4 h-4 mr-1" />}
              Sí, desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
