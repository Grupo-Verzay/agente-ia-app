'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { FaTelegramPlane } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { deleteTelegramInstance, updateInstanceDisplayName, updateTelegramInstance } from '@/actions/instances-actions';
import { getInstanceDisplayName } from '@/lib/instance-display-name';
import { toast } from 'sonner';
import { TAMANO_DEL_ICONO } from './TituloDeTarjeta';
import { TarjetaDeCanal } from './TarjetaDeCanal';

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
      <TarjetaDeCanal
        conectado
        icono={<FaTelegramPlane className={TAMANO_DEL_ICONO} style={{ color: TELEGRAM_BLUE }} />}
        titulo="Mensajería Telegram"
        color={TELEGRAM_BLUE}
        nombre={visibleName}
        dato={botUsername ? `@${botUsername}` : null}
        textoConectar="Conectar Telegram"
        alAbrirFormulario={() => setShowEditDialog(true)}
        alEliminar={() => setShowDeleteDialog(true)}
      />

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
