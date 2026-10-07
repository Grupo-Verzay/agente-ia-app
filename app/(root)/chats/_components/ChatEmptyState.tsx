import type { LucideIcon } from "lucide-react";
import { lasClasesDelVacio } from "@/lib/vacio-de-la-lista";

type ChatEmptyStateProps = {
  Icon: LucideIcon;
  message: string;
  /** Pegado arriba y sin ocupar el alto: hay resultados debajo (ver lib/vacio-de-la-lista). */
  compacto?: boolean;
};

export function ChatEmptyState({ Icon, message, compacto = false }: ChatEmptyStateProps) {
  return (
    <div data-vacio-de-la-lista={compacto ? "compacto" : "centrado"} className={lasClasesDelVacio(compacto)}>
      {compacto ? (
        <Icon className="h-5 w-5 opacity-70" />
      ) : (
        <div className="rounded-2xl border p-6 opacity-70">
          <Icon className="h-8 w-8" />
        </div>
      )}
      <p className="text-sm">{message}</p>
    </div>
  );
}
