'use client';

import { useState, useMemo } from 'react';
import { Loader2, Plus, Info } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { createMetaInstance } from '@/actions/instances-actions';
import { sanitizeInstanceName } from '@/schema/connection';
import { toast } from 'sonner';

interface MetaInstanceCreatorProps {
  userId: string;
  company?: string | null;
}

export const MetaInstanceCreator = ({ userId, company }: MetaInstanceCreatorProps) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    phoneNumberId: '',
    accessToken: '',
    wabaId: '',
    verifyToken: '',
  });

  const instanceName = useMemo(
    () => sanitizeInstanceName(company ?? userId ?? 'instancia'),
    [company, userId]
  );

  const handleCreate = async () => {
    if (!form.phoneNumberId || !form.accessToken) {
      toast.error('Phone Number ID y Access Token son requeridos.');
      return;
    }
    setSaving(true);
    const res = await createMetaInstance({ ...form, instanceName, userId });
    setSaving(false);
    if (res.success) {
      toast.success(res.message);
      setOpen(false);
      setForm({ phoneNumberId: '', accessToken: '', wabaId: '', verifyToken: '' });
    } else {
      toast.error(res.message);
    }
  };

  return (
    <>
      <Card className="border-border flex-1 border-dashed flex flex-col">
        <CardHeader className="flex flex-row items-center justify-center px-6 py-4">
          <CardTitle className="text-center text-2xl font-bold flex items-center gap-2">
            <FaWhatsapp className="text-green-500 rounded-sm w-6 h-6" />
            <span className="text-xl font-bold">Meta Cloud API</span>
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
          <Button onClick={() => setOpen(true)} className="w-full">
            Crear instancia Meta API
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva instancia Meta Cloud API</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* Nombre de instancia — solo lectura, derivado de la empresa */}
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Nombre de instancia</p>
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span className="flex-1 font-mono text-foreground">{instanceName}</span>
                <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </div>
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
