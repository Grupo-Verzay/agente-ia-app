'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getSessionByRemoteJid } from '@/actions/session-action';
import { updateLeadPushNameAction } from '@/actions/registro-action';
import type { Session, SingleSessionResponse } from '@/types/session';

interface UseChatSessionOptions {
  userId: string;
  remoteJid?: string;
  remoteJidAliases?: string[];
  onSessionResolved?: (remoteJid: string, session: Session | null) => void;
}

interface UseChatSessionReturn {
  session: Session | null;
  contactNameDraft: string;
  isContactUpdatePending: boolean;
  setContactNameDraft: (value: string) => void;
  fetchSessionStatus: () => Promise<void>;
  refreshSessionStatus: () => Promise<void>;
  mutateSessionStatus: () => void;
  handleSaveContactName: () => Promise<boolean>;
}

export function useChatSession({
  userId,
  remoteJid,
  remoteJidAliases,
  onSessionResolved,
}: UseChatSessionOptions): UseChatSessionReturn {
  const [session, setSession] = useState<Session | null>(null);
  const [contactNameDraft, setContactNameDraft] = useState('');
  const [isContactUpdatePending, setIsContactUpdatePending] = useState(false);

  const fetchSessionStatus = useCallback(async () => {
    if (!userId || !remoteJid) {
      setSession(null);
      if (remoteJid) onSessionResolved?.(remoteJid, null);
      return;
    }

    try {
      const candidates = Array.from(
        new Set([remoteJid, ...(remoteJidAliases ?? [])].filter(Boolean)),
      );

      let resolved: SingleSessionResponse | null = null;
      for (const candidate of candidates) {
        const result: SingleSessionResponse = await getSessionByRemoteJid(userId, candidate, {
          aliases: candidates,
        });
        if (result.success && result.data) {
          resolved = result;
          break;
        }
      }

      if (resolved?.success && resolved.data) {
        setSession(resolved.data);
        onSessionResolved?.(remoteJid, resolved.data);
      } else {
        setSession(null);
        onSessionResolved?.(remoteJid, null);
      }
    } catch (error) {
      setSession(null);
      console.error('Error al obtener el estado de la sesión:', error);
    }
  }, [userId, remoteJid, remoteJidAliases, onSessionResolved]);

  useEffect(() => {
    if (userId && remoteJid) {
      void fetchSessionStatus();
    }
  }, [fetchSessionStatus, userId, remoteJid]);

  // Sync contact name draft when session changes
  useEffect(() => {
    const name = session?.pushName?.trim() || '';
    setContactNameDraft(name);
  }, [session?.pushName]);

  const refreshSessionStatus = useCallback(async () => {
    await fetchSessionStatus();
  }, [fetchSessionStatus]);

  const mutateSessionStatus = useCallback(() => {
    void fetchSessionStatus();
  }, [fetchSessionStatus]);

  const handleSaveContactName = useCallback(async (): Promise<boolean> => {
    if (!session) return false;

    const normalizedName = contactNameDraft.trim();
    if (!normalizedName) {
      toast.error('El nombre del contacto es obligatorio.');
      return false;
    }

    try {
      setIsContactUpdatePending(true);
      const result = await updateLeadPushNameAction({
        sessionId: session.id,
        pushName: normalizedName,
      });
      if (!result.success) {
        toast.error(result.message || 'No se pudo actualizar el contacto.');
        return false;
      }
      toast.success('Nombre del contacto actualizado.');
      await fetchSessionStatus();
      return true;
    } finally {
      setIsContactUpdatePending(false);
    }
  }, [contactNameDraft, fetchSessionStatus, session]);

  return {
    session,
    contactNameDraft,
    isContactUpdatePending,
    setContactNameDraft,
    fetchSessionStatus,
    refreshSessionStatus,
    mutateSessionStatus,
    handleSaveContactName,
  };
}
