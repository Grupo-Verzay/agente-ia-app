'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Ellipsis, List, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { PESTANAS_DE_LA_SECCION, type SeccionDeMisDatos } from '@/lib/pantalla-de-mis-datos';

const ICONO_DE_LA_PESTANA = { import: Upload, management: List } as const;

/**
 * La fila de arriba de una sección de Mis datos: sus dos pestañas y su «⋯».
 *
 * La pintan las DOS secciones —Google Sheets y la Base de conocimiento— con el
 * mismo componente: estaban escritas cada una a mano, con otros nombres, otros
 * iconos y un «⋯» de otro tamaño, y puestas una detrás de otra no se leían como
 * la misma pantalla.
 */
export function PestanasDeLaSeccion({ seccion, menu }: { seccion: SeccionDeMisDatos; menu: ReactNode }) {
  return (
    <div
      data-pestanas-de-la-seccion={seccion}
      className="flex items-center justify-between gap-2 py-2 px-4 border-b border-border/40 bg-muted/40"
    >
      <TabsList className="h-10">
        {PESTANAS_DE_LA_SECCION.map((p) => {
          const Icono = ICONO_DE_LA_PESTANA[p.valor];
          return (
            <TabsTrigger key={p.valor} value={p.valor} className="gap-2 px-5 h-9 text-sm font-medium">
              <Icono className="h-4 w-4" />
              {p.rotulo}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {menu}
    </div>
  );
}

/**
 * El disparador del «⋯» de una sección: el MISMO botón que el «⋯» de acciones
 * de toda la plataforma (`AccionesMasivas`): 40 px, contorno y los tres puntos
 * en horizontal. Uno medía 32 px y el otro 36, con los puntos en vertical.
 */
export const BotonDelMenuDeLaSeccion = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof Button> & { seccion: SeccionDeMisDatos }
>(function BotonDelMenuDeLaSeccion({ seccion, className, ...props }, ref) {
  return (
    <Button
      ref={ref}
      variant="outline"
      size="icon"
      data-menu-de-la-seccion={seccion}
      title="Acciones"
      aria-label="Acciones"
      className={cn('h-10 w-10 shrink-0', className)}
      {...props}
    >
      <Ellipsis className="h-4 w-4" />
    </Button>
  );
});
