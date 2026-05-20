"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";

import { getRemindersByRemoteJid } from "@/actions/reminders-actions";
import { getAppointmentsBySession } from "@/actions/appointments-actions";
import type { Session } from "@/types/session";
import { ChatRegistrosSheet } from "./ChatRegistrosSheet";

export function ChatSeguimientosBadges({
  session,
  whatsapp,
  onRefresh,
}: {
  session: Session;
  whatsapp: string;
  onRefresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [extraCount, setExtraCount] = useState(0);

  const seguimientosCount = session.pendingSeguimientos ?? 0;
  const followUpsCount = session.crmFollowUpSummary?.active ?? 0;

  const loadCounts = useCallback(async () => {
    const [remResult, apptResult] = await Promise.all([
      getRemindersByRemoteJid(session.userId, session.remoteJid),
      getAppointmentsBySession(session.id),
    ]);
    let total = 0;
    if (remResult.success && remResult.data) total += remResult.data.length;
    if (apptResult.success && apptResult.data) {
      total += apptResult.data.filter(
        (a) => !["FINALIZADO", "DESCARTADO", "CANCELADA"].includes(a.status)
      ).length;
    }
    setExtraCount(total);
  }, [session.userId, session.remoteJid, session.id]);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  const totalCount = seguimientosCount + extraCount + followUpsCount;

  return (
    <>
      <button
        type="button"
        title="Agenda — seguimientos, recordatorios, citas y follow-ups"
        onClick={() => setOpen(true)}
        className="relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-teal-300 bg-teal-100 text-teal-800 hover:bg-teal-200 focus:outline-none transition-colors"
      >
        <CalendarClock className="h-3.5 w-3.5" />
        {totalCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-teal-600 px-1 text-[9px] font-bold leading-none text-white">
            {totalCount > 99 ? "99+" : totalCount}
          </span>
        )}
      </button>

      <ChatRegistrosSheet
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) { onRefresh(); loadCounts(); }
        }}
        sessionId={session.id}
        sessionPushName={session.pushName}
        whatsapp={whatsapp}
        userId={session.userId}
        remoteJid={session.remoteJid}
        instanceId={session.instanceId}
        flujos={session.flujos}
        initialTab="SEGUIMIENTOS"
      />
    </>
  );
}
