'use client';

import { useState, useCallback } from 'react';
import { BellPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ReminderForm } from '@/app/(root)/reminders/_components/ReminderForm';
import { getReminderFormDeps } from '@/actions/reminders-actions';
import type { Session, Workflow } from '@prisma/client';

type FormDeps = {
  apikey: string;
  serverUrl: string;
  instanceName: string;
  workflows: Workflow[];
  leads: Session[];
};

interface ChatReminderDialogProps {
  session: Session;
  userId: string;
}

export function ChatReminderDialog({ session, userId }: ChatReminderDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [deps, setDeps] = useState<FormDeps | null>(null);

  const handleOpen = useCallback(async () => {
    setOpen(true);
    if (deps) return;
    setIsLoading(true);
    try {
      const result = await getReminderFormDeps(userId, session.instanceId);
      if (result.success && result.data) {
        setDeps(result.data as FormDeps);
      }
    } finally {
      setIsLoading(false);
    }
  }, [userId, session.instanceId, deps]);

  const initialData = {
    title: '',
    description: '',
    time: '',
    repeatType: 'NONE' as const,
    repeatEvery: undefined,
    userId,
    remoteJid: session.remoteJid,
    instanceName: deps?.instanceName ?? session.instanceId,
    pushName: session.pushName,
    workflowId: '',
    apikey: deps?.apikey ?? '',
    serverUrl: deps?.serverUrl ?? '',
    isSchedule: false,
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleOpen}
        className="h-7 gap-1.5 text-xs px-2 border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200 hover:text-amber-900"
        title="Crear recordatorio para este lead"
      >
        <BellPlus className="h-3.5 w-3.5" />
        Recordatorio
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crear recordatorio</DialogTitle>
          </DialogHeader>

          {isLoading || !deps ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ReminderForm
              userId={userId}
              serverUrl={deps.serverUrl}
              apikey={deps.apikey}
              instanceNameReminder={deps.instanceName}
              workflows={deps.workflows}
              leads={deps.leads}
              initialData={initialData}
              forceCreate
              onSuccess={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
