'use client';

import { useMemo } from 'react';
import { Info } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { MetaEmbeddedSignup } from './MetaEmbeddedSignup';
import { sanitizeInstanceName } from '@/schema/connection';
import { useRouter } from 'next/navigation';

interface MetaInstanceCreatorProps {
  userId: string;
  company?: string | null;
}

export const MetaInstanceCreator = ({ userId, company }: MetaInstanceCreatorProps) => {
  const router = useRouter();

  const instanceName = useMemo(
    () => sanitizeInstanceName(company ?? userId ?? 'instancia'),
    [company, userId]
  );

  return (
    <Card className="border-border flex-1 border-dashed flex flex-col">
      <CardHeader className="flex flex-row items-center justify-center px-6 py-4">
        <CardTitle className="text-center text-2xl font-bold flex items-center gap-2">
          <FaWhatsapp className="text-green-500 rounded-sm w-6 h-6" />
          <span className="text-xl font-bold">WhatsApp Cloud API</span>
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
      <CardFooter className="mt-auto flex-col gap-2 px-6 pb-6 pt-0">
        {/* El cliente elige UNA modalidad: cada botón inicia el Embedded Signup
            de Meta en su modo. Al conectar por una, solo se muestra esa. */}
        <div className="grid w-full grid-cols-2 gap-2">
          <MetaEmbeddedSignup
            userId={userId}
            instanceName={instanceName}
            mode="api"
            label="WhatsApp API"
            className="w-full gap-2 bg-green-600 text-white hover:bg-green-700"
            onConnected={() => router.refresh()}
          />
          <MetaEmbeddedSignup
            userId={userId}
            instanceName={instanceName}
            mode="coexistence"
            label="Coexistencia API"
            className="w-full gap-2 bg-[#1877F2] text-white hover:bg-[#166FE5]"
            onConnected={() => router.refresh()}
          />
        </div>
      </CardFooter>
    </Card>
  );
};
