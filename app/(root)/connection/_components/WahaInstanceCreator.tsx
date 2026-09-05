'use client';

import { useState, useMemo } from 'react';
import { Loader2, Plus, Info } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createWahaInstance } from '@/actions/instances-actions';
import { buildWahaInstanceName } from '@/schema/connection';
import { cleanInstanceDisplayName } from '@/lib/instance-display-name';
import { toast } from 'sonner';

interface WahaInstanceCreatorProps {
  userId: string;
  company?: string | null;
}

const WHATSAPP_GREEN = '#25D366';

export const WahaInstanceCreator = ({ userId, company }: WahaInstanceCreatorProps) => {
  const [saving, setSaving] = useState(false);

  const instanceName = useMemo(
    () => buildWahaInstanceName(company ?? userId ?? 'instancia'),
    [company, userId],
  );
  const visibleName = cleanInstanceDisplayName(instanceName);

  const handleCreate = async () => {
    setSaving(true);
    const res = await createWahaInstance({ instanceName, userId });
    setSaving(false);
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
  };

  return (
    <Card className="flex-1 border-dashed flex flex-col" style={{ borderColor: '#9be7bb' }}>
      <CardHeader className="flex flex-row items-center justify-center px-6 py-4">
        <CardTitle className="text-center text-2xl font-bold flex items-center gap-2">
          <FaWhatsapp className="rounded-sm w-6 h-6" style={{ color: WHATSAPP_GREEN }} />
          <span className="text-xl font-bold">WhatsApp V2</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-6 pb-3 pt-0">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-muted-foreground">Nombre de instancia</p>
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <span className="flex-1 font-mono text-foreground">{visibleName}</span>
            <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
      <CardFooter className="mt-auto flex-col gap-2 px-6 pb-6 pt-0">
        {/* Mismo slot de texto que las demas tarjetas → el boton queda alineado. */}
        <p className="text-center text-sm text-muted-foreground">
          Conexión por código QR, sin depender de Evolution.
        </p>
        <Button
          onClick={handleCreate}
          disabled={saving}
          className="w-full text-white border-0"
          style={{ backgroundColor: WHATSAPP_GREEN }}
        >
          {saving ? <Loader2 className="animate-spin w-4 h-4 mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
          Conectar WhatsApp V2
        </Button>
      </CardFooter>
    </Card>
  );
};
