"use client";

import { useEffect, useState, useTransition } from "react";
import { Clock3, Loader2 } from "lucide-react";

import {
  getAuditLogsForEntity,
  type AuditEntityType,
  type AuditLogItem,
} from "@/actions/audit-log-actions";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type AuditHistoryButtonProps = {
  entityType: AuditEntityType;
  entityId: string;
};

function formatAuditDate(value: Date | string) {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AuditHistoryButton({ entityType, entityId }: AuditHistoryButtonProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !entityId) return;

    startTransition(async () => {
      const result = await getAuditLogsForEntity(entityType, entityId);
      setItems(result.data);
    });
  }, [entityId, entityType, open]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Historial">
          <Clock3 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="border-b px-4 pb-3 pt-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Clock3 className="h-4 w-4" />
            Historial
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isPending ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando historial...
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">Sin cambios registrados.</p>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="border-b pb-3 last:border-0">
                  <p className="text-sm font-medium text-foreground">{item.summary}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatAuditDate(item.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
