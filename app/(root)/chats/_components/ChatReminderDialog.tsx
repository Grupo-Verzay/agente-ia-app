'use client';

import { useState, useCallback, useEffect } from 'react';
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

// Las deps del recordatorio (apikey + workflows + TODOS los leads) son a nivel de
// USUARIO: iguales para todos los chats. Se cargan UNA sola vez por sesión del
// navegador y se cachean a nivel de módulo, así el diálogo abre al instante en
// cualquier chat (antes se re-consultaba por chat, con una query pesada de leads).
let reminderDepsCache: FormDeps | null = null;
let reminderDepsPromise: Promise<FormDeps | null> | null = null;

function loadReminderDeps(userId: string, instanceId: string): Promise<FormDeps | null> {
  if (reminderDepsCache) return Promise.resolve(reminderDepsCache);
  if (!reminderDepsPromise) {
    reminderDepsPromise = getReminderFormDeps(userId, instanceId)
      .then((result) => {
        if (result.success && result.data) {
          reminderDepsCache = result.data as FormDeps;
          return reminderDepsCache;
        }
        reminderDepsPromise = null; // permitir reintento si vino vacío
        return null;
      })
      .catch(() => {
        reminderDepsPromise = null; // permitir reintento si falló
        return null;
      });
  }
  return reminderDepsPromise;
}

interface ChatReminderDialogProps {
  session: Session;
  userId: string;
}

export function ChatReminderDialog({ session, userId }: ChatReminderDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [deps, setDeps] = useState<FormDeps | null>(reminderDepsCache);

  // Prefetch en 2º plano al montar (al abrir el chat): cachea a nivel de módulo, así
  // la primera vez carga una sola vez y de ahí en más el diálogo abre instantáneo.
  useEffect(() => {
    if (deps) return;
    let alive = true;
    void loadReminderDeps(userId, session.instanceId).then((d) => {
      if (alive && d) setDeps(d);
    });
    return () => {
      alive = false;
    };
  }, [userId, session.instanceId, deps]);

  const handleOpen = useCallback(() => {
    setOpen(true);
    if (deps || reminderDepsCache) {
      if (!deps && reminderDepsCache) setDeps(reminderDepsCache);
      return;
    }
    setIsLoading(true);
    void loadReminderDeps(userId, session.instanceId)
      .then((d) => {
        if (d) setDeps(d);
      })
      .finally(() => setIsLoading(false));
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
        className="h-7 px-2 border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200 hover:text-amber-900"
        title="Crear recordatorio para este lead"
      >
        <BellPlus className="h-3.5 w-3.5" />
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
