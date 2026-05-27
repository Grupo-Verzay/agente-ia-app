"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatContactSessionMap } from "@/types/session";
import type { FetchChatsResult } from "@/actions/chat-actions";

async function showNotification(title: string, options: NotificationOptions): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, options);
    setTimeout(() => n.close(), 7000);
  } catch {
    // Mobile Chrome (Android) requires ServiceWorkerRegistration.showNotification()
    if ("serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, options);
      } catch {
        // Service worker not available
      }
    }
  }
}

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.45);
  } catch {
    // AudioContext not available (e.g. SSR or blocked by browser policy)
  }
}

/**
 * Notifica cuando:
 * 1. (Asesores) Una nueva conversación es asignada al asesor actual.
 * 2. (Todos los usuarios) Llega un mensaje nuevo en un chat donde el agente está inactivo
 *    (session.status=false o agentDisabled=true) y el chat no está seleccionado.
 *    La notificación se dispara una sola vez por chat hasta que el usuario lo abra.
 *
 * Devuelve pendingUnreadJids: Set con los remoteJids que tienen mensajes nuevos
 * pendientes de ver, para que el sidebar los muestre como no leídos.
 */
export function useAdvisorNotifications(
  chatSessions: ChatContactSessionMap,
  currentAdvisorId: string | undefined,
  advisorRole: string | null | undefined,
  chatsResult: FetchChatsResult | null,
  selectedJid: string,
): { pendingUnreadJids: Set<string> } {
  const seenIdsRef = useRef<Set<number> | null>(null);
  const prevMyIdsRef = useRef<Set<number> | null>(null);
  const pendingCountRef = useRef(0);
  const originalTitleRef = useRef("");
  const prevMsgTimestampsRef = useRef<Map<string, number> | null>(null);

  // Set de remoteJids con mensajes nuevos en chats de agente inactivo (no vistos aún)
  const [pendingUnreadJids, setPendingUnreadJids] = useState<Set<string>>(new Set());

  // Inicializar título y solicitar permiso de notificaciones al montar
  useEffect(() => {
    originalTitleRef.current = document.title;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  // Resetear badge del título al enfocar la ventana
  useEffect(() => {
    const onFocus = () => {
      pendingCountRef.current = 0;
      if (originalTitleRef.current) document.title = originalTitleRef.current;
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Cuando el usuario abre un chat, marcarlo como leído en pendingUnreadJids
  useEffect(() => {
    if (!selectedJid) return;
    setPendingUnreadJids((prev) => {
      if (!prev.has(selectedJid)) return prev;
      const next = new Set(prev);
      next.delete(selectedJid);
      return next;
    });
  }, [selectedJid]);

  // Detectar nuevas asignaciones en cada actualización de chatSessions (solo asesores)
  useEffect(() => {
    if (!currentAdvisorId || !advisorRole) return;

    const storageKey = `advisor_seen_${currentAdvisorId}`;
    const myChats = Object.values(chatSessions).filter(
      (s) => s?.assignedAdvisorId === currentAdvisorId,
    );

    const currentMyIds = new Set(myChats.filter(Boolean).map((s) => s!.id));

    // Primera ejecución: inicializar seenIds con todo lo existente (sin notificar)
    if (seenIdsRef.current === null) {
      const stored: number[] = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      seenIdsRef.current = new Set(stored.concat(Array.from(currentMyIds)));
      localStorage.setItem(storageKey, JSON.stringify(Array.from(seenIdsRef.current)));
      prevMyIdsRef.current = new Set(currentMyIds);
      return;
    }

    // Detectar sesiones quitadas (estaban en prevMyIds pero ya no están en las mías)
    if (prevMyIdsRef.current) {
      const removedIds = Array.from(prevMyIdsRef.current).filter((id) => !currentMyIds.has(id));
      if (removedIds.length > 0) {
        removedIds.forEach((id) => {
          void showNotification("Conversación reasignada", {
            body: "Te quitaron una conversación.",
            icon: "/favicon.ico",
            tag: `advisor-removed-${id}`,
          });
        });
      }
    }
    prevMyIdsRef.current = new Set(currentMyIds);

    const newSessions = myChats.filter((s) => s && !seenIdsRef.current!.has(s.id));

    if (newSessions.length > 0) {
      newSessions.forEach((s) => s && seenIdsRef.current!.add(s.id));
      localStorage.setItem(storageKey, JSON.stringify(Array.from(seenIdsRef.current)));

      pendingCountRef.current += newSessions.length;
      playNotificationSound();

      newSessions.forEach((session) => {
        if (!session) return;
        const name = session.pushName?.trim() || session.remoteJid;
        void showNotification("Nueva conversación asignada", {
          body: name,
          icon: "/favicon.ico",
          tag: `advisor-assign-${session.id}`,
        });
      });

      if (originalTitleRef.current) {
        document.title = `(${pendingCountRef.current}) ${originalTitleRef.current}`;
      }
    }
  }, [chatSessions, currentAdvisorId, advisorRole]);

  // Detectar mensajes nuevos en chats con agente inactivo (todos los usuarios)
  useEffect(() => {
    if (!chatsResult?.success) return;
    const chats = chatsResult.data;

    // Primera ejecución: inicializar timestamps sin notificar
    if (prevMsgTimestampsRef.current === null) {
      const initial = new Map<string, number>();
      for (const chat of chats) {
        initial.set(chat.remoteJid, chat.lastMessage?.messageTimestamp ?? 0);
      }
      prevMsgTimestampsRef.current = initial;
      return;
    }

    const prev = prevMsgTimestampsRef.current;
    const toNotify: typeof chats = [];

    for (const chat of chats) {
      const currentTs = chat.lastMessage?.messageTimestamp ?? 0;
      const prevTs = prev.get(chat.remoteJid) ?? 0;
      const isFromMe = chat.lastMessage?.key?.fromMe ?? true;

      if (currentTs > prevTs && !isFromMe) {
        const session = chatSessions[chat.remoteJid];
        const agentInactive = session
          ? session.agentDisabled === true || session.status === false
          : false;
        const isNotSelected = chat.remoteJid !== selectedJid;

        if (agentInactive && isNotSelected) {
          toNotify.push(chat);
        }
      }

      // Siempre actualizar el timestamp visto para no re-detectar el mismo mensaje
      prev.set(chat.remoteJid, currentTs);
    }

    if (toNotify.length === 0) return;

    // Filtrar los que ya tienen notificación pendiente (no re-notificar)
    const reallNew = toNotify.filter((chat) => !pendingUnreadJids.has(chat.remoteJid));
    if (reallNew.length === 0) return;

    // Agregar los nuevos al set de pendientes
    setPendingUnreadJids((prev) => {
      const next = new Set(prev);
      for (const chat of reallNew) next.add(chat.remoteJid);
      return next;
    });

    playNotificationSound();

    for (const chat of reallNew) {
      const name =
        chatSessions[chat.remoteJid]?.pushName?.trim() ||
        chat.pushName?.trim() ||
        chat.remoteJid;
      void showNotification("Nuevo mensaje", {
        body: name,
        icon: "/favicon.ico",
        tag: `new-msg-${chat.remoteJid}`,
      });
    }

    pendingCountRef.current += reallNew.length;
    if (originalTitleRef.current) {
      document.title = `(${pendingCountRef.current}) ${originalTitleRef.current}`;
    }
  // pendingUnreadJids excluido de deps a propósito: usamos el valor del closure sin ciclo
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatsResult, chatSessions, selectedJid]);

  return { pendingUnreadJids };
}
