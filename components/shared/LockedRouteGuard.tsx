'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Lock, Zap, ShieldCheck, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

const BULLETS = [
  { icon: ShieldCheck, text: 'No dejes escapar clientes listos para comprar' },
  { icon: TrendingUp, text: 'Impulsa tus resultados con herramientas exclusivas' },
  { icon: Zap, text: 'Desbloquea funciones premium que multiplican tu éxito' },
];

function UpgradeScreen() {
  const router = useRouter();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Lock className="h-8 w-8 text-primary" />
      </div>
      <div className="max-w-md space-y-3">
        <h1 className="text-2xl font-bold leading-tight">
          Actualiza tu plan y desbloquea todo el potencial de tu agente
        </h1>
        <p className="text-muted-foreground">
          Ofrece una mejor experiencia a los usuarios, accediendo a herramientas más avanzadas para elevar tu negocio destacándote de la competencia y con soporte prioritario.
        </p>
      </div>
      <ul className="space-y-2 text-left">
        {BULLETS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-2 text-sm">
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <Button size="lg" onClick={() => router.push('/planes')}>
        Mejorar mi plan ahora
      </Button>
    </div>
  );
}

export function LockedRouteGuard({
  children,
  lockedRoutes,
}: {
  children: React.ReactNode;
  lockedRoutes: string[];
}) {
  const pathname = usePathname() ?? '';
  const isLocked = lockedRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + '/'),
  );
  if (isLocked) return <UpgradeScreen />;
  return <>{children}</>;
}
