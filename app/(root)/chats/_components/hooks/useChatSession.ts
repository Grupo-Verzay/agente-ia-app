'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getSessionByRemoteJid } from '@/actions/session-action';
import { updateLeadPushNameAction } from '@/actions/registro-action';
import type { ChatContactSessionSummary, Session, SingleSessionResponse } from '@/types/session';

interface UseChatSessionOptions {
  userId: string;
  sessionUserIds?: string[];
  remoteJid?: string;
  remoteJidAliases?: string[];
  onSessionResolved?: (remoteJid: string, session: Session | null) => void;
  refreshSignal?: number;
  // Session que YA trae el sidebar (chatSessions, un resumen). Se usa como semilla
  // instantánea para que la barra de contadores del header aparezca de una, sin
  // esperar el fetch de getSessionByRemoteJid (que la refina un instante después).
  // Trae lo esencial (id/userId/remoteJid/flujos/tags/asignado); los campos que
  // falten se completan con el fetch.
  initialSession?: Session | ChatContactSessionSummary | null;
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
  sessionUserIds,
  remoteJid,
  remoteJidAliases,
  onSessionResolved,
  refreshSignal,
  initialSession,
}: UseChatSessionOptions): UseChatSessionReturn {
  const [session, setSession] = useState<Session | null>((initialSession as Session) ?? null);
  const seededJidRef = useRef<string | undefined>(undefined);
  const [contactNameDraft, setContactNameDraft] = useState('');
  const [isContactUpdatePending, setIsContactUpdatePending] = useState(false);
  const aliasesKey = useMemo(
    () => Array.from(new Set((remoteJidAliases ?? []).filter(Boolean))).sort().join('|'),
    [remoteJidAliases],
  );

  const fetchSessionStatus = useCallback(async () => {
    if (!userId || !remoteJid) {
      setSession(null);
      if (remoteJid) onSessionResolved?.(remoteJid, null);
      return;
    }

    try {
      const candidates = Array.from(
        new Set([remoteJid, ...aliasesKey.split('|')].filter(Boolean)),
      );

      const effectiveUserIds = sessionUserIds?.length ? sessionUserIds : [userId];
      // `getSessionByRemoteJid` ya construye internamente los candidatos a partir
      // de `remoteJid` + `aliases` y busca contra todos en una sola query, así que
      // una única llamada equivale al loop secuencial anterior (que hacía N
      // round-trips redundantes, uno por candidato) sin perder cobertura.
      const resolved: SingleSessionResponse = await getSessionByRemoteJid(
        effectiveUserIds,
        remoteJid,
        { aliases: candidates },
      );

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
  }, [userId, remoteJid, aliasesKey, sessionUserIds, onSessionResolved]);

  // Semilla instantánea del sidebar al abrir/cambiar de chat: la barra de contadores
  // del header (envuelta en `{session && ...}`) aparece de una, sin esperar el fetch.
  // Se siembra una sola vez por chat para no pisar luego el session ya resuelto (más
  // completo que el del sidebar).
  useEffect(() => {
    if (seededJidRef.current === remoteJid) return;
    seededJidRef.current = remoteJid;
    setSession((initialSession as Session) ?? null);
  }, [remoteJid, initialSession]);

  useEffect(() => {
    if (userId && remoteJid) {
      void fetchSessionStatus();
    }
  }, [fetchSessionStatus, userId, remoteJid, refreshSignal]);

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
