'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2, Pencil, CheckCircle2 } from 'lucide-react';
import { FaTelegramPlane } from 'react-icons/fa';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { deleteTelegramInstance, updateInstanceDisplayName, updateTelegramInstance } from '@/actions/instances-actions';
import { getInstanceDisplayName } from '@/lib/instance-display-name';
import { toast } from 'sonner';

interface TelegramInstanceCardProps {
  instanceName: string;
  displayName?: string | null;
  botUsername?: string | null;
}

const TELEGRAM_BLUE = '#229ED9';

export const TelegramInstanceCard = ({ instanceName, displayName, botUsername }: TelegramInstanceCardProps) => {
  const router = useRouter();
  const visibleName = getInstanceDisplayName(instanceName, displayName);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftDisplayName, setDraftDisplayName] = useState(visibleName);
  const [botToken, setBotToken] = useState('');

  const handleDelete = async () => {
    setDeleting(true);
    const res = await deleteTelegramInstance(instanceName);
    setDeleting(false);
    if (res.success) toast.success(res.message);
    else { toast.error(res.message); setShowDeleteDialog(false); }
  };

  const handleSave = async () => {
    if (!draftDisplayName.trim()) {
      toast.error('El nombre visible es requerido.');
      return;
    }

    setSaving(true);
    const nameRes = draftDisplayName.trim() !== visibleName
      ? await updateInstanceDisplayName(instanceName, draftDisplayName)
      : { success: true, message: '' };
    if (!nameRes.success) {
      setSaving(false);
      toast.error(nameRes.message);
      return;
    }

    if (!botToken.trim()) {
      setSaving(false);
      toast.success(nameRes.message || 'Nombre actualizado.');
      setShowEditDialog(false);
      router.refresh();
      return;
    }

    const res = await updateTelegramInstance({ instanceName, botToken });
    setSaving(false);
    if (res.success) {
      toast.success(res.message || nameRes.message || 'Actualizado.');
      setShowEditDialog(false);
      setBotToken('');
      router.refresh();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <>
      <Card className="border-border flex h-full flex-col">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2 min-w-0">
              <FaTelegramPlane className="w-5 h-5 shrink-0" style={{ color: TELEGRAM_BLUE }} />
              <span className="truncate">Mensajería Telegram</span>
            </CardTitle>
            <Button size="sm" variant="destructive" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <FaTelegramPlane className="h-5 w-5" style={{ color: TELEGRAM_BLUE }} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{visibleName}</p>
              {botUsername && (
                <p className="truncate text-xs text-muted-foreground">@{botUsername}</p>
              )}
            </div>
          </div>
        </CardContent>

        <CardFooter className="mt-auto grid grid-cols-2 gap-2">
          <Button
            className="w-full gap-2 bg-green-600 text-white hover:bg-green-700"
            onClick={() => router.refresh()}
          >
            <CheckCircle2 className="w-4 h-4" />
            Conectado
          </Button>
          <Button
            onClick={() => setShowEditDialog(true)}
            className="w-full gap-2 text-white"
            style={{ backgroundColor: TELEGRAM_BLUE }}
          >
            <Pencil className="w-4 h-4" />
            Editar
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar — {visibleName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Nombre visible</Label>
              <Input
                value={draftDisplayName}
                onChange={(e) => setDraftDisplayName(e.target.value)}
                placeholder="Nombre visible"
                maxLength={60}
              />
            </div>
            <div className="space-y-1">
              <Label>Bot Token <span className="text-xs text-muted-foreground">(dejar vacío si solo cambias el nombre)</span></Label>
              <Input
                type="password"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyz"
              />
              <p className="text-xs text-muted-foreground">
                Si actualizas el token, también se vuelve a configurar el webhook.
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

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desconectar el bot de Telegram?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{visibleName}</strong> y sus credenciales, y se quitará el webhook del bot.
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
