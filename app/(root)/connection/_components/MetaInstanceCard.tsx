'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Copy } from 'lucide-react';
import { FaFacebook, FaInstagram, FaWhatsapp } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { deleteMetaInstance, enableMetaCalling, getMetaCallingStatus, getMetaDisplayPhone, updateInstanceDisplayName, updateMetaInstance } from '@/actions/instances-actions';
import { getInstanceDisplayName } from '@/lib/instance-display-name';
import { toast } from 'sonner';
import { TAMANO_DEL_ICONO } from './TituloDeTarjeta';
import { TarjetaDeCanal } from './TarjetaDeCanal';

interface MetaInstanceCardProps {
  instanceName: string;
  displayName?: string | null;
  metaChannel?: string | null;
  phoneNumberId?: string | null;
  wabaId?: string | null;
  pageId?: string | null;
}

const CHANNEL_META = {
  whatsapp: {
    label: 'WhatsApp Cloud API',
    Icon: FaWhatsapp,
    color: 'text-green-500 border-green-500',
    boton: '#16a34a',
  },
  facebook: {
    label: 'Facebook Messenger',
    Icon: FaFacebook,
    color: 'text-blue-600 border-blue-600',
    boton: '#1877F2',
  },
  instagram: {
    label: 'Instagram DMs',
    Icon: FaInstagram,
    color: 'text-pink-500 border-pink-500',
    boton: '#e1306c',
  },
} as const;

export const MetaInstanceCard = ({
  instanceName,
  displayName,
  metaChannel,
  phoneNumberId,
  wabaId,
  pageId,
}: MetaInstanceCardProps) => {
  const router = useRouter();
  const channel = (metaChannel ?? 'whatsapp') as keyof typeof CHANNEL_META;
  const channelMeta = CHANNEL_META[channel] ?? CHANNEL_META.whatsapp;
  const ChannelIcon = channelMeta.Icon;
  const iconColor = channelMeta.color.split(' ')[0];
  const visibleName = getInstanceDisplayName(instanceName, displayName);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enablingCalls, setEnablingCalls] = useState(false);
  const [callsEnabled, setCallsEnabled] = useState(false);
  const [displayPhone, setDisplayPhone] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    displayName: visibleName,
    phoneNumberId: phoneNumberId ?? '',
    pageId: pageId ?? '',
    accessToken: '',
    wabaId: wabaId ?? '',
    verifyToken: '',
  });

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin.replace('3000', process.env.NEXT_PUBLIC_BACKEND_PORT ?? '3001')}/webhook/meta`
    : '/webhook/meta';

  useEffect(() => {
    if (channel !== 'whatsapp') return;
    let mounted = true;
    Promise.all([
      getMetaDisplayPhone(instanceName),
      getMetaCallingStatus(instanceName),
    ]).then(([phoneRes, callingRes]) => {
      if (!mounted) return;
      if (phoneRes.success && phoneRes.displayPhone) setDisplayPhone(phoneRes.displayPhone);
      if (callingRes.success) setCallsEnabled(Boolean(callingRes.enabled));
    });
    return () => { mounted = false; };
  }, [channel, instanceName]);

  const handleDelete = async () => {
    setDeleting(true);
    const res = await deleteMetaInstance(instanceName);
    setDeleting(false);
    if (res.success) toast.success(res.message);
    else { toast.error(res.message); setShowDeleteDialog(false); }
  };

  const handleSave = async () => {
    if (channel === 'whatsapp' && !draft.phoneNumberId) {
      toast.error('Phone Number ID es requerido.');
      return;
    }
    if ((channel === 'facebook' || channel === 'instagram') && !draft.pageId) {
      toast.error(channel === 'facebook' ? 'Page ID es requerido.' : 'Instagram Account ID es requerido.');
      return;
    }
    setSaving(true);
    const nameRes = draft.displayName.trim() !== visibleName
      ? await updateInstanceDisplayName(instanceName, draft.displayName)
      : { success: true, message: '' };
    if (!nameRes.success) {
      setSaving(false);
      toast.error(nameRes.message);
      return;
    }
    const res = await updateMetaInstance({
      instanceName,
      metaChannel: channel,
      phoneNumberId: channel === 'whatsapp' ? draft.phoneNumberId : undefined,
      pageId: channel !== 'whatsapp' ? draft.pageId : undefined,
      accessToken: draft.accessToken || undefined,
      wabaId: channel === 'whatsapp' ? draft.wabaId : undefined,
      verifyToken: draft.verifyToken,
    });
    setSaving(false);
    if (res.success) { toast.success(res.message || nameRes.message || 'Actualizado.'); setShowEditDialog(false); router.refresh(); }
    else toast.error(res.message);
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('URL del webhook copiada');
  };

  const handleEnableCalls = async () => {
    setEnablingCalls(true);
    const res = await enableMetaCalling(instanceName);
    setEnablingCalls(false);
    if (res.success) {
      setCallsEnabled(true);
      toast.success(res.message);
    }
    else toast.error(res.message);
  };

  return (
    <>
      <TarjetaDeCanal
        conectado
        icono={<ChannelIcon className={`${TAMANO_DEL_ICONO} ${iconColor}`} />}
        titulo={channelMeta.label}
        color={channelMeta.boton}
        nombre={visibleName}
        dato={channel === 'whatsapp' ? (displayPhone || phoneNumberId || 'Consultando número…') : null}
        textoConectar={`Conectar ${channelMeta.label}`}
        alAbrirFormulario={() => setShowEditDialog(true)}
        alEliminar={() => setShowDeleteDialog(true)}
        extraEnCabecera={
          // Las llamadas son cosa de Cloud API y viven donde vivian: en la
          // cabecera, junto a la papelera.
          channel === 'whatsapp' ? (
            <Switch
              checked={callsEnabled}
              disabled={enablingCalls}
              title={callsEnabled ? 'Llamadas activadas' : 'Activar llamadas'}
              onCheckedChange={(checked) => {
                if (checked) void handleEnableCalls();
              }}
            />
          ) : null
        }
      />

      {/* Dialog de edición */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar — {visibleName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Nombre visible</Label>
              <Input
                value={draft.displayName}
                onChange={(e) => setDraft(d => ({ ...d, displayName: e.target.value }))}
                placeholder="Nombre visible"
                maxLength={60}
              />
            </div>
            {channel === 'whatsapp' && (
              <>
                <div className="space-y-1">
                  <Label>Phone Number ID</Label>
                  <Input value={draft.phoneNumberId} onChange={(e) => setDraft(d => ({ ...d, phoneNumberId: e.target.value }))} placeholder="123456789..." />
                </div>
                <div className="space-y-1">
                  <Label>WABA ID <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                  <Input value={draft.wabaId} onChange={(e) => setDraft(d => ({ ...d, wabaId: e.target.value }))} placeholder="123456789..." />
                </div>
              </>
            )}
            {(channel === 'facebook' || channel === 'instagram') && (
              <div className="space-y-1">
                <Label>{channel === 'facebook' ? 'Page ID' : 'Instagram Account ID'}</Label>
                <Input value={draft.pageId} onChange={(e) => setDraft(d => ({ ...d, pageId: e.target.value }))} placeholder="123456789..." />
              </div>
            )}
            <div className="space-y-1">
              <Label>Access Token <span className="text-xs text-muted-foreground">(nuevo — dejar vacío para mantener el actual)</span></Label>
              <Input type="password" value={draft.accessToken} onChange={(e) => setDraft(d => ({ ...d, accessToken: e.target.value }))} placeholder="EAAxxxxx..." />
            </div>
            <div className="space-y-1">
              <Label>Verify Token <span className="text-xs text-muted-foreground">(opcional)</span></Label>
              <Input value={draft.verifyToken} onChange={(e) => setDraft(d => ({ ...d, verifyToken: e.target.value }))} placeholder="mi_token_secreto" />
            </div>
            <div className="space-y-1">
              <Label>URL Webhook</Label>
              <div className="flex items-center gap-2">
                <p className="font-mono text-xs truncate flex-1 bg-muted rounded px-2 py-1">/webhook/meta</p>
                <Button type="button" size="sm" variant="ghost" onClick={copyWebhook} title="Copiar URL del webhook">
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
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
            <AlertDialogTitle>¿Eliminar instancia {channelMeta.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{visibleName}</strong> y sus credenciales.
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
