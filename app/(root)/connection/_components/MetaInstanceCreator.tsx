'use client';

import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { createMetaInstance } from '@/actions/instances-actions';
import { toast } from 'sonner';

interface MetaInstanceCreatorProps {
  userId: string;
}

export const MetaInstanceCreator = ({ userId }: MetaInstanceCreatorProps) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    instanceName: '',
    phoneNumberId: '',
    accessToken: '',
    wabaId: '',
    verifyToken: '',
  });

  const handleCreate = async () => {
    if (!form.instanceName || !form.phoneNumberId || !form.accessToken) {
      toast.error('Nombre, Phone Number ID y Access Token son requeridos.');
      return;
    }
    setSaving(true);
    const res = await createMetaInstance({ ...form, userId });
    setSaving(false);
    if (res.success) {
      toast.success(res.message);
      setOpen(false);
      setForm({ instanceName: '', phoneNumberId: '', accessToken: '', wabaId: '', verifyToken: '' });
    } else {
      toast.error(res.message);
    }
  };

  return (
    <>
      <Card className="border-border flex-1 border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Meta Cloud API</CardTitle>
          <CardDescription className="text-xs">
            Conecta un número con la API oficial de WhatsApp Business (Meta Developer, Gupshup, Twilio, etc.)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setOpen(true)} className="w-full gap-2" variant="outline">
            <Plus className="w-4 h-4" />
            Nueva instancia Meta
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva instancia Meta Cloud API</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Nombre de instancia <span className="text-red-500">*</span></Label>
              <Input
                value={form.instanceName}
                onChange={(e) => setForm(f => ({ ...f, instanceName: e.target.value }))}
                placeholder="mi-empresa-meta"
              />
            </div>
            <div className="space-y-1">
              <Label>Phone Number ID <span className="text-red-500">*</span></Label>
              <Input
                value={form.phoneNumberId}
                onChange={(e) => setForm(f => ({ ...f, phoneNumberId: e.target.value }))}
                placeholder="123456789012345"
              />
              <p className="text-xs text-muted-foreground">Encuéntralo en Meta Developer → WhatsApp → API Setup</p>
            </div>
            <div className="space-y-1">
              <Label>Access Token <span className="text-red-500">*</span></Label>
              <Input
                type="password"
                value={form.accessToken}
                onChange={(e) => setForm(f => ({ ...f, accessToken: e.target.value }))}
                placeholder="EAAxxxxx..."
              />
            </div>
            <div className="space-y-1">
              <Label>WABA ID <span className="text-xs text-muted-foreground">(opcional)</span></Label>
              <Input
                value={form.wabaId}
                onChange={(e) => setForm(f => ({ ...f, wabaId: e.target.value }))}
                placeholder="123456789012345"
              />
            </div>
            <div className="space-y-1">
              <Label>Verify Token <span className="text-xs text-muted-foreground">(opcional)</span></Label>
              <Input
                value={form.verifyToken}
                onChange={(e) => setForm(f => ({ ...f, verifyToken: e.target.value }))}
                placeholder="mi_token_secreto"
              />
              <p className="text-xs text-muted-foreground">
                URL del webhook: <code className="bg-muted px-1 rounded">/webhook/meta</code>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="animate-spin w-4 h-4 mr-1" />}
              Crear instancia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
