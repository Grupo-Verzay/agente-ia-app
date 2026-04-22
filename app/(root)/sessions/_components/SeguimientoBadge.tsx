import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const SeguimientoBadge = ({ count }: { count: number }) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            {count === 0 ? (
              <span className="inline-flex rounded-full border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">
                Sin seguimientos
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-300 bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-300">
                <span className="h-2 w-2 rounded-full bg-orange-500 dark:bg-orange-400" />
                {count}
              </span>
            )}
          </span>
        </TooltipTrigger>
        {count > 0 && (
          <TooltipContent side="top" sideOffset={6} className="z-[9999]">
            <div className="text-xs font-bold">{count} seguimiento(s) pendiente(s)</div>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
};
