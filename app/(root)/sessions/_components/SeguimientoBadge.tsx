import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  GLIFO_DE_LA_PASTILLA,
  NUMERO_DE_LA_PASTILLA,
  PASTILLA_CONTADORA,
} from "@/lib/pastillas-de-la-fila";

type TipoCount = { tipo: string; count: number };

export const SeguimientoBadge = ({
  count,
  tipos,
  compacta = false,
}: {
  count: number;
  tipos?: TipoCount[];
  /** En la fila de una tarjeta de Chats: 2 px menos de relleno por lado (`lib/pastillas-de-la-fila.ts`). */
  compacta?: boolean;
}) => {
  if (count === 0) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <span
              /* En la fila de Chats (`compacta`) esta pastilla es una CONTADORA,
               * con la misma anatomía que las de la cita, las notas y las
               * etiquetas: el mismo relleno, el mismo hueco, el punto en una
               * caja del tamaño del glifo de las demás y el número en 10 px,
               * con el ancho mínimo que hace que las cinco midan igual. Iba
               * con el relleno y la letra de una pastilla de TEXTO —6 px y
               * 12— y un punto de 8 donde las otras tienen un glifo de 12, y
               * por eso se leía como otra cosa. `data-ui="badge"` se queda:
               * es el gancho con el que `globals.css` baja un `.text-xs` a
               * 12 px dentro de `.app-module-content`, donde si no vale 14.
               * Fuera de la fila —el CRM, `/sessions`— no cambia nada. */
              {...(compacta ? { "data-ui": "badge" } : {})}
              className={cn(
                "inline-flex h-6 items-center gap-1.5 rounded-full border border-orange-300 bg-orange-100 text-xs font-medium text-orange-800 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-300",
                compacta ? PASTILLA_CONTADORA : "px-2",
              )}
            >
              {/* El punto va en una caja del tamaño del glifo de las demás
                  contadoras: así el reparto de dentro es el mismo y el número
                  cae en el mismo sitio en las cinco. */}
              <span className={cn(compacta && `${GLIFO_DE_LA_PASTILLA} inline-flex items-center justify-center`)}>
                <span className="h-2 w-2 rounded-full bg-orange-500 dark:bg-orange-400" />
              </span>
              <span className={cn(compacta && NUMERO_DE_LA_PASTILLA)}>{count}</span>
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="z-[9999]">
          <div className="space-y-1 min-w-[130px]">
            <div className="text-xs font-bold">Seguimientos pendientes</div>
            {tipos && tipos.length > 0 ? (
              <ul className="space-y-0.5">
                {tipos.map(({ tipo, count: c }) => (
                  <li key={tipo} className="flex items-center justify-between gap-4 text-xs">
                    <span className="capitalize">{tipo}</span>
                    <span className="font-semibold tabular-nums">{c}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs">{count} seguimiento(s)</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
