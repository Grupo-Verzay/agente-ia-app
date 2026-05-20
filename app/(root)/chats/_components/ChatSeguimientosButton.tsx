"use client";

import { useState } from "react";
import { Timer } from "lucide-react";
import { ChatRegistrosSheet } from "./ChatRegistrosSheet";
import type { Session } from "@/types/session";

export function ChatSeguimientosButton({
  session,
  whatsapp,
  onRefresh,
}: {
  session: Session;
  whatsapp: string;
  onRefresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const count = session.pendingSeguimientos ?? 0;

  return (
    <>
      <button
        type="button"
        title="Seguimientos del lead"
        onClick={() => setOpen(true)}
        className="relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200 focus:outline-none transition-colors"
      >
        <Timer className="h-3.5 w-3.5" />
        {count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-600 px-1 text-[9px] font-bold leading-none text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      <ChatRegistrosSheet
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) onRefresh();
        }}
        sessionId={session.id}
        sessionPushName={session.pushName}
        whatsapp={whatsapp}
        userId={session.userId}
        remoteJid={session.remoteJid}
        instanceId={session.instanceId}
        initialTab="SEGUIMIENTOS"
      />
    </>
  );
}
