'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getSessionByRemoteJid } from '@/actions/session-action';
import { apuntarAccion } from '@/lib/cola-de-acciones';
import { updateLeadPushNameAction } from '@/actions/registro-action';
import type { ChatContactSessionSummary, Session, SingleSessionResponse } from '@/types/session';
import {
  laBusquedaDeLaSesionAbierta,
  laLineaDeLaConversacion,
  laLlaveDeLaConversacionAbierta,
} from '@/lib/sesion-de-la-conversacion-abierta';

interface UseChatSessionOptions {
  userId: string;
  sessionUserIds?: string[];
  remoteJid?: string;
  remoteJidAliases?: string[];
  // La LÍNEA de la conversación abierta. El mismo contacto tiene una ficha por
  // cada línea en la que escribe, y la de esta conversación es la de su línea:
  // sin ella, el servidor devolvía la de cualquier línea y una nota interna
  // escrita aquí se guardaba en la ficha de otra (ver
  // `lib/sesion-de-la-conversacion-abierta.ts`).
  instanceName?: string | null;
  onSessionResolved?: (remoteJid: string, session: Session | null, instanceName?: string) => void;
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
  instanceName,
  onSessionResolved,
  refreshSignal,
  initialSession,
}: UseChatSessionOptions): UseChatSessionReturn {
  const [session, setSession] = useState<Session | null>((initialSession as Session) ?? null);
  const linea = laLineaDeLaConversacion(instanceName);
  // «Chat» es número Y línea: pasar a la otra línea del mismo contacto es otra
  // conversación con otra ficha.
  const llaveDeLaConversacion = laLlaveDeLaConversacionAbierta(remoteJid, linea);
  // La conversación que se tiene delante AHORA, leída por referencia: una
  // respuesta que llega tarde de la conversación anterior no pinta su ficha
  // encima de la de esta (era la misma línea pasada al saltar de Ventas a
  // Atención con una consulta en vuelo).
  const llaveActualRef = useRef(llaveDeLaConversacion);
  llaveActualRef.current = llaveDeLaConversacion;
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
      if (remoteJid) onSessionResolved?.(remoteJid, null, linea);
      return;
    }

    const pedida = laLlaveDeLaConversacionAbierta(remoteJid, linea);
    try {
      const busqueda = laBusquedaDeLaSesionAbierta(remoteJid, aliasesKey.split('|'), linea);

      const effectiveUserIds = sessionUserIds?.length ? sessionUserIds : [userId];
      // `getSessionByRemoteJid` ya construye internamente los candidatos a partir
      // de `remoteJid` + `aliases` y busca contra todos en una sola query, así que
      // una única llamada equivale al loop secuencial anterior (que hacía N
      // round-trips redundantes, uno por candidato) sin perder cobertura.
      // Con la línea conocida, solo la ficha de ESA línea.
      const resolved: SingleSessionResponse = await apuntarAccion(
        "getSessionByRemoteJid (sesion del chat abierto)",
        () => getSessionByRemoteJid(effectiveUserIds, busqueda.remoteJid, busqueda.opciones),
      );

      if (llaveActualRef.current !== pedida) return;
      if (resolved?.success && resolved.data) {
        setSession(resolved.data);
        onSessionResolved?.(remoteJid, resolved.data, linea);
      } else {
        setSession(null);
        onSessionResolved?.(remoteJid, null, linea);
      }
    } catch (error) {
      if (llaveActualRef.current !== pedida) return;
      setSession(null);
      console.error('Error al obtener el estado de la sesión:', error);
    }
  }, [userId, remoteJid, aliasesKey, linea, sessionUserIds, onSessionResolved]);

  // Semilla instantánea del sidebar al abrir/cambiar de chat: la barra de contadores
  // del header (envuelta en `{session && ...}`) aparece de una, sin esperar el fetch.
  // Se siembra una sola vez por chat para no pisar luego el session ya resuelto (más
  // completo que el del sidebar), y la llave lleva la línea.
  useEffect(() => {
    if (seededJidRef.current === llaveDeLaConversacion) return;
    seededJidRef.current = llaveDeLaConversacion;
    setSession((initialSession as Session) ?? null);
  }, [llaveDeLaConversacion, initialSession]);

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
