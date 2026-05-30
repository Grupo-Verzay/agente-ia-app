"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type { Registro, TipoRegistro } from "@prisma/client";

import { getRegistrosBySessionId } from "@/actions/registro-action";
import { getSessionLegacySeguimientos } from "@/actions/seguimientos-actions";
import { getSessionCrmFollowUps } from "@/actions/crm-follow-up-actions";
import { getRemindersByRemoteJid } from "@/actions/reminders-actions";
import { getAppointmentsBySession } from "@/actions/appointments-actions";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ChatRegistrosSheet } from "./ChatRegistrosSheet";
import type { SimpleTag } from "@/types/session";

const TIPOS: TipoRegistro[] = ["SOLICITUD", "PEDIDO", "RECLAMO", "PAGO", "RESERVA", "PRODUCTO", "REPORTE"];

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
  flujos,
  leadStatus,
  leadScore,
  leadScoreReason,
  tags,
  sessionSeguimientos,
}: {
  sessionId: number;
  sessionPushName?: string | null;
  whatsapp: string;
  userId: string;
  remoteJid: string;
  instanceId: string | null;
  flujos?: string | null;
  leadStatus?: string | null;
  leadScore?: number | null;
  leadScoreReason?: string | null;
  tags?: SimpleTag[];
  sessionSeguimientos?: string | null;
}) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [seguimientosCount, setSeguimientosCount] = useState(0);
  const [recordatoriosCount, setRecordatoriosCount] = useState(0);
  const [citasCount, setCitasCount] = useState(0);
  const [followUpsCount, setFollowUpsCount] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async () => {
    const [regResult, segResult, remResult, apptResult, crmResult] = await Promise.all([
      getRegistrosBySessionId(sessionId),
      getSessionLegacySeguimientos(remoteJid),
      getRemindersByRemoteJid(userId, remoteJid),
      getAppointmentsBySession(sessionId),
      getSessionCrmFollowUps(sessionId, userId),
    ]);
    if (regResult.success && regResult.data) setRegistros(regResult.data);
    if (segResult.success && segResult.data)
      setSeguimientosCount(segResult.data.filter((i) => i.followUpStatus === "pending").length);
    if (remResult.success && remResult.data) setRecordatoriosCount(remResult.data.length);
    if (apptResult.success && apptResult.data)
      setCitasCount(apptResult.data.filter((a) => !["FINALIZADO", "DESCARTADO", "CANCELADA"].includes(a.status)).length);
    if (crmResult.success && crmResult.data)
      setFollowUpsCount(crmResult.data.filter((i) => i.status === "PENDING" || i.status === "PROCESSING").length);
  }, [sessionId, userId, remoteJid]);

  useEffect(() => { load(); }, [load]);

  const countByTipo = TIPOS.reduce((acc, tipo) => {
    acc[tipo] = registros.filter((r) => r.tipo === tipo).length;
    return acc;
  }, {} as Record<TipoRegistro, number>);

  const registrosTotal = registros.length;
  const grandTotal = registrosTotal + seguimientosCount + recordatoriosCount + citasCount + followUpsCount;

  const registrosRows = TIPOS.filter((t) => countByTipo[t] > 0).map((tipo) => ({
    label: TIPO_LABELS[tipo],
    count: countByTipo[tipo],
  }));

  const agendaRows = [
    { label: "Seguimientos", count: seguimientosCount },
    { label: "Recordatorios", count: recordatoriosCount },
    { label: "Citas", count: citasCount },
    { label: "Follow-ups IA", count: followUpsCount },
  ].filter((r) => r.count > 0);

  const allRows = [...registrosRows, ...agendaRows];

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Registros del lead"
            className="relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-teal-300 bg-teal-100 text-teal-800 hover:bg-teal-200 focus:outline-none transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {grandTotal > 0 && (
              <span className="absolute -top-1.5 -right-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal-600 px-1 text-[9px] font-bold leading-none text-white">
                {grandTotal > 99 ? "99+" : grandTotal}
              </span>
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-52 p-3 space-y-2">
          <p className="text-xs font-semibold">Registros del lead</p>

          {allRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin registros aún.</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
              {allRows.map((row) => (
                <>
                  <span key={`${row.label}-label`} className="text-muted-foreground">{row.label}</span>
                  <span key={`${row.label}-count`} className="font-medium">{row.count}</span>
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
            {grandTotal === 0 ? "Agregar registro" : "Ver y gestionar"}
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
        flujos={flujos}
        leadStatus={leadStatus}
        leadScore={leadScore}
        leadScoreReason={leadScoreReason}
        tags={tags}
        sessionSeguimientos={sessionSeguimientos}
      />
    </>
  );
}
