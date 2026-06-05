'use client';

import { useState } from 'react';
import { Loader2, Trash2, Pencil, Copy, CheckCircle2 } from 'lucide-react';
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
import { deleteMetaInstance, updateMetaInstance } from '@/actions/instances-actions';
import { toast } from 'sonner';

interface MetaInstanceCardProps {
  instanceName: string;
  phoneNumberId: string;
  wabaId?: string | null;
}

export const MetaInstanceCard = ({ instanceName, phoneNumberId, wabaId }: MetaInstanceCardProps) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [draft, setDraft] = useState({
    phoneNumberId,
    accessToken: '',
    wabaId: wabaId ?? '',
    verifyToken: '',
  });

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin.replace('3000', process.env.NEXT_PUBLIC_BACKEND_PORT ?? '3001')}/webhook/meta`
    : '/webhook/meta';

  const handleDelete = async () => {
    setDeleting(true);
    const res = await deleteMetaInstance(instanceName);
    setDeleting(false);
    if (res.success) toast.success(res.message);
    else { toast.error(res.message); setShowDeleteDialog(false); }
  };

  const handleSave = async () => {
    if (!draft.phoneNumberId || !draft.accessToken) {
      toast.error('Phone Number ID y Access Token son requeridos.');
      return;
    }
    setSaving(true);
    const res = await updateMetaInstance({ instanceName, ...draft });
    setSaving(false);
    if (res.success) { toast.success(res.message); setShowEditDialog(false); }
    else toast.error(res.message);
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('URL del webhook copiada');
  };

  return (
    <>
      <Card className="border-border flex-1">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>{instanceName}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-blue-500 border-blue-500 gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Meta Cloud API
              </Badge>
              <Button size="sm" variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="text-sm space-y-1">
            <p className="text-muted-foreground text-xs font-medium">PHONE NUMBER ID</p>
            <p className="font-mono text-sm">{phoneNumberId}</p>
          </div>
          {wabaId && (
            <div className="text-sm space-y-1">
              <p className="text-muted-foreground text-xs font-medium">WABA ID</p>
              <p className="font-mono text-sm">{wabaId}</p>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs font-medium">URL WEBHOOK</p>
            <div className="flex items-center gap-2">
              <p className="font-mono text-xs truncate flex-1 bg-muted rounded px-2 py-1">/webhook/meta</p>
              <Button size="sm" variant="ghost" onClick={copyWebhook} title="Copiar URL del webhook">
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>

        <CardFooter>
          <Button size="sm" variant="outline" onClick={() => setShowEditDialog(true)} className="w-full gap-1.5">
            <Pencil className="w-4 h-4" />
            Editar credenciales
          </Button>
        </CardFooter>
      </Card>

      {/* Dialog de edición */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar — {instanceName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Phone Number ID</Label>
              <Input value={draft.phoneNumberId} onChange={(e) => setDraft(d => ({ ...d, phoneNumberId: e.target.value }))} placeholder="123456789..." />
            </div>
            <div className="space-y-1">
              <Label>Access Token <span className="text-xs text-muted-foreground">(nuevo — dejar vacío para mantener el actual)</span></Label>
              <Input type="password" value={draft.accessToken} onChange={(e) => setDraft(d => ({ ...d, accessToken: e.target.value }))} placeholder="EAAxxxxx..." />
            </div>
            <div className="space-y-1">
              <Label>WABA ID <span className="text-xs text-muted-foreground">(opcional)</span></Label>
              <Input value={draft.wabaId} onChange={(e) => setDraft(d => ({ ...d, wabaId: e.target.value }))} placeholder="123456789..." />
            </div>
            <div className="space-y-1">
              <Label>Verify Token <span className="text-xs text-muted-foreground">(opcional)</span></Label>
              <Input value={draft.verifyToken} onChange={(e) => setDraft(d => ({ ...d, verifyToken: e.target.value }))} placeholder="mi_token_secreto" />
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
            <AlertDialogTitle>¿Eliminar instancia Meta?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{instanceName}</strong> y sus credenciales de Meta Cloud API.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="animate-spin w-4 h-4 mr-1" />}
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
