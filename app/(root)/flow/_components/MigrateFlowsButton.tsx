"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowRightLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { migrateFlowsToVisual } from "@/actions/migrate-flows-action";

/**
 * Botón "Migrar todos al visual": pasa los flujos de lista al creador visual
 * creando sus conexiones automáticamente. Los nodos se conservan.
 */
export function MigrateFlowsButton() {
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    const ok = window.confirm(
      "¿Migrar todos tus flujos de lista al creador visual?\n\n" +
        "Se conservan los nodos y se crean las conexiones automáticamente. " +
        "Luego podrás verlos y editarlos en el creador visual.\n\n" +
        "Revisa cada flujo en WhatsApp tras migrar.",
    );
    if (!ok) return;

    setLoading(true);
    try {
      const res = await migrateFlowsToVisual();
      if (!res.ok) {
        toast.error(res.error || "No se pudo migrar.");
        return;
      }
      const m = res.migrated.length;
      const s = res.skipped.length;
      if (m === 0 && s === 0) {
        toast.info("No hay flujos de lista para migrar.");
        return;
      }
      toast.success(
        `Migrados: ${m}${s ? ` · Sin cambios: ${s}` : ""}. ` +
          "Ábrelos en el creador visual para revisarlos.",
      );
      // Recargar: los migrados ya no aparecen en /flow (ahora son visuales).
      setTimeout(() => window.location.reload(), 1200);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={onClick} disabled={loading} variant="outline" className="gap-2">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
      Migrar todos al visual
    </Button>
  );
}
