'use client';

import { useState, useMemo } from 'react';
import { Loader2, Plus, Info } from 'lucide-react';
import { FaFacebook } from 'react-icons/fa';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { createFacebookInstance } from '@/actions/instances-actions';
import { sanitizeInstanceName } from '@/schema/connection';
import { toast } from 'sonner';

interface FacebookInstanceCreatorProps {
  userId: string;
  company?: string | null;
}

export const FacebookInstanceCreator = ({ userId, company }: FacebookInstanceCreatorProps) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    pageId: '',
    accessToken: '',
    verifyToken: '',
  });

  const instanceName = useMemo(
    () => `${sanitizeInstanceName(company ?? userId ?? 'instancia')}_fb`,
    [company, userId]
  );

  const handleCreate = async () => {
    if (!form.pageId || !form.accessToken) {
      toast.error('Page ID y Access Token son requeridos.');
      return;
    }
    setSaving(true);
    const res = await createFacebookInstance({ ...form, instanceName, userId });
    setSaving(false);
    if (res.success) {
      toast.success(res.message);
      setOpen(false);
      setForm({ pageId: '', accessToken: '', verifyToken: '' });
    } else {
      toast.error(res.message);
    }
  };

  return (
    <>
      <Card className="border-border flex-1 border-dashed flex flex-col">
        <CardHeader className="flex flex-row items-center justify-center px-6 py-4">
          <CardTitle className="text-center text-2xl font-bold flex items-center gap-2">
            <FaFacebook className="text-blue-600 rounded-sm w-6 h-6" />
            <span className="text-xl font-bold">Facebook Messenger</span>
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
          <Button onClick={() => setOpen(true)} className="w-full" variant="outline">
            <Plus className="w-4 h-4 mr-1" />
            Conectar Facebook Messenger
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva instancia Facebook Messenger</DialogTitle>
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
              <Label>Page ID <span className="text-red-500">*</span></Label>
              <Input
                value={form.pageId}
                onChange={(e) => setForm(f => ({ ...f, pageId: e.target.value }))}
                placeholder="123456789012345"
              />
              <p className="text-xs text-muted-foreground">ID de tu Página de Facebook. Encuéntralo en Configuración → Acerca de.</p>
            </div>
            <div className="space-y-1">
              <Label>Access Token <span className="text-red-500">*</span></Label>
              <Input
                type="password"
                value={form.accessToken}
                onChange={(e) => setForm(f => ({ ...f, accessToken: e.target.value }))}
                placeholder="EAAxxxxx..."
              />
              <p className="text-xs text-muted-foreground">Token de acceso de página (largo plazo) desde Meta Developer.</p>
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
