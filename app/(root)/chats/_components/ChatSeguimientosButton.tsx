"use client";

import dynamic from "next/dynamic";

import { useState } from "react";
import { Timer } from "lucide-react";

import type { Session } from "@/types/session";

// El panel de registros arrastra las tablas y tarjetas del CRM, que son con
// diferencia lo más pesado de esta pantalla. Se carga solo cuando el usuario lo
// abre: hasta entonces no se descarga, y la bandeja no paga su peso.
const ChatRegistrosSheet = dynamic(
  () => import("./ChatRegistrosSheet").then((m) => m.ChatRegistrosSheet),
  { ssr: false },
);

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
        className="inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md border border-amber-300 bg-amber-100 px-1.5 text-amber-800 hover:bg-amber-200 focus:outline-none transition-colors"
      >
        <Timer className="h-3.5 w-3.5" />
        {/* El número va DENTRO del botón: la fila de herramientas tiene
            overflow-x-auto, que también recorta por arriba, y un badge flotando
            fuera del borde salía cortado. */}
        {count > 0 && (
          <span className="text-[10px] font-bold leading-none tabular-nums">
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
