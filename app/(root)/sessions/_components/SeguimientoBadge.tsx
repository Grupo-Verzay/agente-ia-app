import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const SeguimientoBadge = ({ count, tipos }: { count: number; tipos?: string[] }) => {
  if (count === 0) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-orange-300 bg-orange-100 px-2 text-xs font-medium text-orange-800 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-300">
              <span className="h-2 w-2 rounded-full bg-orange-500 dark:bg-orange-400" />
              {count}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="z-[9999] max-w-[420px]">
          <div className="space-y-1">
            <div className="text-xs font-bold">Seguimientos pendientes</div>
            {tipos && tipos.length > 0 ? (
              <ul className="list-disc pl-4 text-xs space-y-0.5">
                {tipos.map((t) => (
                  <li key={t} className="break-words">{t}</li>
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
