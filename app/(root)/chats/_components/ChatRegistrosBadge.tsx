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
import { readBadgeCount, writeBadgeCount } from "./chat-badge-cache";
import { loadRegistrosSnapshot } from "./chat-registros-cache";
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
  // Muestra el último total conocido AL INSTANTE mientras cargan las 5 consultas.
  const [loaded, setLoaded] = useState(false);
  const [cachedTotal, setCachedTotal] = useState(0);

  useEffect(() => {
    setLoaded(false);
    setCachedTotal(readBadgeCount(`reg:${sessionId}`));
  }, [sessionId]);

  const load = useCallback(async () => {
    // Cargador COMPARTIDO con el sheet "Registros": al abrir el chat, el badge dispara
    // esta carga y deja el snapshot cacheado, así el sheet abre instantáneo (no repite
    // las 6 consultas). El sheet reusa el mismo caché.
    const snapshot = await loadRegistrosSnapshot(sessionId, userId, remoteJid);
    setRegistros(snapshot.registros);
    setSeguimientosCount(snapshot.seguimientosPendingCount);
    setRecordatoriosCount(snapshot.recordatoriosCount);
    setCitasCount(snapshot.citasCount);
    setFollowUpsCount(snapshot.seguimientosPendientes);
    setLoaded(true);
  }, [sessionId, userId, remoteJid]);

  useEffect(() => { load(); }, [load]);

  const countByTipo = TIPOS.reduce((acc, tipo) => {
    acc[tipo] = registros.filter((r) => r.tipo === tipo).length;
    return acc;
  }, {} as Record<TipoRegistro, number>);

  const registrosTotal = registros.length;
  const grandTotal = registrosTotal + seguimientosCount + recordatoriosCount + citasCount + followUpsCount;
  // Una vez cargado, guardamos el total para que la PRÓXIMA apertura lo muestre ya.
  // Mientras no ha cargado, mostramos el último total conocido (cachedTotal).
  useEffect(() => {
    if (loaded) writeBadgeCount(`reg:${sessionId}`, grandTotal);
  }, [loaded, grandTotal, sessionId]);
  const displayTotal = loaded ? grandTotal : cachedTotal;

  const notasIaCount = (sessionSeguimientos ?? "")
    .split("\n")
    .filter((line) => /^\[.+?\]\s.+$/.test(line)).length;

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
            {displayTotal > 0 && (
              <span className="absolute top-0 -right-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal-600 px-1 text-[9px] font-bold leading-none text-white">
                {displayTotal > 99 ? "99+" : displayTotal}
              </span>
            )}
            {notasIaCount > 0 && (
              <span className="absolute -bottom-1 -left-1 h-2.5 w-2.5 rounded-full bg-fuchsia-500 ring-1 ring-white" />
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent align="center" className="w-52 p-3 space-y-2">
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
