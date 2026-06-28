'use client';

import { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

interface LockedChannelCardProps {
  icon: ReactNode;
  title: string;
  instanceName: string;
}

/** Tarjeta de canal deshabilitado — mismo estilo que Facebook/Instagram bloqueados. */
export const LockedChannelCard = ({ icon, title, instanceName }: LockedChannelCardProps) => {
  return (
    <Card className="border-border flex-1 flex flex-col">
      <CardHeader className="flex flex-row items-center justify-center px-6 py-4">
        <CardTitle className="text-center text-2xl font-bold flex items-center gap-2">
          {icon}
          <span className="text-xl font-bold">{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-6 pb-3 pt-0">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-muted-foreground">Nombre de instancia</p>
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <span className="flex-1 font-mono text-foreground">{instanceName}</span>
            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
      <CardFooter className="mt-auto px-6 pb-6 pt-0">
        <Button
          variant="secondary"
          className="w-full cursor-not-allowed bg-muted-foreground/35 text-foreground/85 hover:bg-muted-foreground/35 font-semibold"
          disabled
          title="Contacta con un administrador para activar este canal."
        >
          <Lock className="w-4 h-4 mr-2 text-amber-500 [filter:drop-shadow(0_0_5px_rgba(245,158,11,0.9))]" />
          Canal no habilitado
        </Button>
      </CardFooter>
    </Card>
  );
};
