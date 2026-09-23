import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { RELLENO_DE_PX_2 } from "@/lib/pastillas-de-la-fila";

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
            <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border border-orange-300 bg-orange-100 text-xs font-medium text-orange-800 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-300", compacta ? RELLENO_DE_PX_2 : "px-2")}>
              <span className="h-2 w-2 rounded-full bg-orange-500 dark:bg-orange-400" />
              {count}
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
