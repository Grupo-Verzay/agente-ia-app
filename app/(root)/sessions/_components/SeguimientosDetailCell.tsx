"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { SeguimientoBadge } from "./SeguimientoBadge";
import { LeadSeguimientosTab } from "../../crm/components/LeadSeguimientosTab";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Session } from "@/types/session";

export function SeguimientosDetailCell({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const count = session.pendingSeguimientos ?? 0;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="focus:outline-none">
        <SeguimientoBadge count={count} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-full max-w-lg h-[75vh] flex flex-col p-0 gap-0 [&>button]:hidden">
          <DialogHeader className="px-4 pt-3 pb-3 border-b shrink-0">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="text-base font-semibold">
                Seguimientos — {session.pushName ?? session.remoteJid}
              </DialogTitle>
              <DialogClose asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md border border-border text-foreground hover:border-red-300 hover:bg-red-50 hover:text-red-600">
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 px-4 py-3 overflow-hidden">
            <LeadSeguimientosTab
              sessionId={session.id}
              userId={session.userId}
              remoteJid={session.remoteJid}
              instanceId={session.instanceId}
              mode="all"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
