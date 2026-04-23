"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type { Registro, TipoRegistro } from "@prisma/client";

import { getRegistrosBySessionId } from "@/actions/registro-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ChatRegistrosSheet } from "./ChatRegistrosSheet";

const TIPOS: TipoRegistro[] = ["SOLICITUD", "PEDIDO", "RECLAMO", "PAGO", "RESERVA", "PRODUCTO"];

const TIPO_LABELS: Record<TipoRegistro, string> = {
  REPORTE: "Reportes",
  SOLICITUD: "Solicitudes",
  PEDIDO: "Pedidos",
  RECLAMO: "Reclamos",
  PAGO: "Pagos",
  RESERVA: "Reservas",
  PRODUCTO: "Productos",
};

export function ChatRegistrosBadge({
  sessionId,
  sessionPushName,
  whatsapp,
  userId,
  remoteJid,
  instanceId,
}: {
  sessionId: number;
  sessionPushName?: string | null;
  whatsapp: string;
  userId: string;
  remoteJid: string;
  instanceId: string | null;
}) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async () => {
    const result = await getRegistrosBySessionId(sessionId);
    if (result.success && result.data) setRegistros(result.data);
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  const total = registros.length;

  const countByTipo = TIPOS.reduce((acc, tipo) => {
    acc[tipo] = registros.filter((r) => r.tipo === tipo).length;
    return acc;
  }, {} as Record<TipoRegistro, number>);

  const withData = TIPOS.filter((t) => countByTipo[t] > 0);

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-7 items-center focus:outline-none"
          >
            <Badge
              variant="outline"
              className="h-7 gap-1.5 rounded-md px-2 text-xs font-medium border-teal-300 bg-teal-100 text-teal-800 hover:bg-teal-200 cursor-pointer"
            >
              <Plus className="h-3 w-3" />
              Registros
              {total > 0 && (
                <span className="inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-teal-200 px-1 text-[10px] font-bold leading-none text-teal-900">
                  {total}
                </span>
              )}
            </Badge>
          </button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-52 p-3 space-y-2">
          <p className="text-xs font-semibold">Registros del lead</p>

          {total === 0 ? (
            <p className="text-xs text-muted-foreground">Sin registros aún.</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
              {withData.map((tipo) => (
                <>
                  <span key={`${tipo}-label`} className="text-muted-foreground">
                    {TIPO_LABELS[tipo]}
                  </span>
                  <span key={`${tipo}-count`} className="font-medium">
                    {countByTipo[tipo]}
                  </span>
                </>
              ))}
            </div>
          )}

          <Separator />

          <Button
            size="sm"
            className="w-full h-7 text-xs"
            onClick={() => setSheetOpen(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            {total === 0 ? "Agregar registro" : "Ver y gestionar"}
          </Button>
        </PopoverContent>
      </Popover>

      <ChatRegistrosSheet
        open={sheetOpen}
        onOpenChange={(v) => {
          setSheetOpen(v);
          if (!v) load();
        }}
        sessionId={sessionId}
        sessionPushName={sessionPushName}
        whatsapp={whatsapp}
        userId={userId}
        remoteJid={remoteJid}
        instanceId={instanceId}
      />
    </>
  );
}
