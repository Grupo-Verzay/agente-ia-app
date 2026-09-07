'use client';

import { useState, useMemo } from 'react';
import { Loader2, Info, BookOpen } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { createMetaInstance } from '@/actions/instances-actions';
import { sanitizeInstanceName } from '@/schema/connection';
import { cleanInstanceDisplayName } from '@/lib/instance-display-name';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { TAMANO_DEL_ICONO } from './TituloDeTarjeta';
import { TarjetaDeCanal } from './TarjetaDeCanal';

interface MetaInstanceCreatorProps {
  userId: string;
  company?: string | null;
}

export const MetaInstanceCreator = ({ userId, company }: MetaInstanceCreatorProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    phoneNumberId: '',
    accessToken: '',
    wabaId: '',
    verifyToken: '',
  });

  const instanceName = useMemo(
    () => `${sanitizeInstanceName(company ?? userId ?? 'instancia')}_wh`,
    [company, userId]
  );
  const visibleName = cleanInstanceDisplayName(instanceName);

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
      router.refresh();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <>
      <TarjetaDeCanal
        icono={<FaWhatsapp className={`${TAMANO_DEL_ICONO} text-green-500`} />}
        titulo="WhatsApp Cloud API"
        color="#16a34a"
        instanceName={visibleName}
        textoConectar="Conectar WhatsApp Cloud API"
        alAbrirFormulario={() => setOpen(true)}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva instancia WhatsApp Cloud API</DialogTitle>
          </DialogHeader>
          <Link
            href="/documentation/meta"
            target="_blank"
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <BookOpen className="h-3.5 w-3.5" />
            ¿No sabes de dónde sacar estos datos? Ver guía paso a paso
          </Link>
          <div className="space-y-3 py-2">
            {/* Nombre de instancia — solo lectura, derivado de la empresa */}
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Nombre de instancia</p>
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span className="flex-1 font-medium text-foreground">{visibleName}</span>
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
            <Button onClick={handleCreate} disabled={saving} className="bg-[#1877F2] hover:bg-[#166FE5] text-white">
              {saving && <Loader2 className="animate-spin w-4 h-4 mr-1" />}
              Crear instancia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
