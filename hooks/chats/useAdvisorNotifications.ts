"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatContactSessionMap } from "@/types/session";
import type { FetchChatsResult } from "@/actions/chat-actions";
import { epochToMs } from "@/app/(root)/chats/_components/chat-sidebar.utils";

/**
 * Un mensaje deja de ser "nuevo" pasado este rato. Sin este corte, cualquier
 * cosa que hiciera subir el timestamp de un chat viejo (una resincronización,
 * el mismo mensaje llegando en otra unidad de tiempo) se anunciaba como recién
 * llegada, y al abrir la app salía una chorrera de avisos ya vistos.
 */
const VENTANA_DE_NOVEDAD_MS = 5 * 60 * 1000;

/** Cuántos chats se recuerdan entre aperturas. Los más recientes mandan. */
const MAXIMO_CHATS_RECORDADOS = 500;

function claveDeAvisos(advisorId: string | undefined): string {
  return `chat_avisado_ts_${advisorId ?? "cuenta"}`;
}

/** Lee el mapa de "último mensaje ya avisado" que quedó de la sesión anterior. */
function leerAvisados(advisorId: string | undefined): Map<string, number> {
  try {
    const crudo = localStorage.getItem(claveDeAvisos(advisorId));
    if (!crudo) return new Map();
    const filas = JSON.parse(crudo) as [string, number][];
    if (!Array.isArray(filas)) return new Map();
    return new Map(filas.filter((fila) => Array.isArray(fila) && typeof fila[0] === "string"));
  } catch {
    return new Map();
  }
}

function guardarAvisados(advisorId: string | undefined, mapa: Map<string, number>): void {
  try {
    const filas = Array.from(mapa.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAXIMO_CHATS_RECORDADOS);
    localStorage.setItem(claveDeAvisos(advisorId), JSON.stringify(filas));
  } catch {
    // Sin espacio o sin localStorage: se avisa igual, solo se pierde la memoria.
  }
}

async function showNotification(title: string, options: NotificationOptions): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const mobileOptions = {
    ...options,
    icon: options.icon || "/icon-192.png",
    badge: "/favicon-48.png",
    vibrate: [250, 120, 250, 120, 400],
    renotify: true,
  } as NotificationOptions;
  try {
    const n = new Notification(title, mobileOptions);
    setTimeout(() => n.close(), 7000);
  } catch {
    // Mobile Chrome (Android) requires ServiceWorkerRegistration.showNotification()
    if ("serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, mobileOptions);
      } catch {
        // Service worker not available
      }
    }
  }
}

function updateAppBadge(count: number) {
  if (!("setAppBadge" in navigator)) return;
  const badgeNavigator = navigator as Navigator & {
    setAppBadge: (value?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count > 0) void badgeNavigator.setAppBadge(count);
  else if (badgeNavigator.clearAppBadge) void badgeNavigator.clearAppBadge();
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
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  // Resetear badge del título al enfocar la ventana
  useEffect(() => {
    const onFocus = () => {
      pendingCountRef.current = 0;
      updateAppBadge(0);
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

    const prevMyIds = prevMyIdsRef.current;
    // Si el snapshot anterior estaba vacío (la bandeja aún cargaba), la siguiente
    // población es la carga INICIAL: registrar sin notificar para no floodear al abrir.
    const wasEmpty = !prevMyIds || prevMyIds.size === 0;

    // Detectar sesiones quitadas (estaban en prevMyIds pero ya no están en las mías)
    if (prevMyIds && !wasEmpty) {
      const removedIds = Array.from(prevMyIds).filter((id) => !currentMyIds.has(id));
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

      // Solo notificar si NO es la carga inicial (snapshot previo vacío).
      if (!wasEmpty) {
        pendingCountRef.current += newSessions.length;
        updateAppBadge(pendingCountRef.current);
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
    }
  }, [chatSessions, currentAdvisorId, advisorRole]);

  // Detectar mensajes nuevos en chats con agente inactivo (todos los usuarios)
  useEffect(() => {
    if (!chatsResult?.success) return;
    const chats = chatsResult.data;

    // Primera ejecución: se parte de lo que quedó guardado de la sesión anterior
    // y se registra lo que hay ahora, sin avisar de nada.
    if (prevMsgTimestampsRef.current === null) {
      const inicial = leerAvisados(currentAdvisorId);
      for (const chat of chats) {
        const ts = epochToMs(chat.lastMessage?.messageTimestamp);
        if (ts > (inicial.get(chat.remoteJid) ?? 0)) inicial.set(chat.remoteJid, ts);
      }
      prevMsgTimestampsRef.current = inicial;
      guardarAvisados(currentAdvisorId, inicial);
      return;
    }

    const prev = prevMsgTimestampsRef.current;
    const toNotify: typeof chats = [];
    const recienteDesde = Date.now() - VENTANA_DE_NOVEDAD_MS;
    let hayCambios = false;

    for (const chat of chats) {
      // Normalizado a milisegundos: el mismo mensaje puede llegar en segundos
      // por un camino y en milisegundos por otro, y comparar los dos crudos
      // hacía pasar por nuevo un mensaje de hace meses.
      const currentTs = epochToMs(chat.lastMessage?.messageTimestamp);
      const prevTs = prev.get(chat.remoteJid) ?? 0;
      const isFromMe = chat.lastMessage?.key?.fromMe ?? true;
      // Un chat que aparece por PRIMERA vez en esta sesión (la bandeja carga de
      // forma incremental al abrir) NO debe notificar: solo se registra su
      // timestamp. Sin este guard, al abrir la app se disparaban CIENTOS de
      // notificaciones (cada chat con último mensaje del cliente entraba con
      // prevTs=0 y pasaba el filtro).
      const known = prev.has(chat.remoteJid);

      if (
        known &&
        currentTs > prevTs &&
        currentTs >= recienteDesde &&
        !isFromMe &&
        chat.remoteJid !== selectedJid
      ) {
        toNotify.push(chat);
      }

      // Siempre actualizar el timestamp visto para no re-detectar el mismo mensaje
      if (currentTs !== prevTs) {
        prev.set(chat.remoteJid, currentTs);
        hayCambios = true;
      }
    }

    if (hayCambios) guardarAvisados(currentAdvisorId, prev);

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
        icon: "/icon-192.png",
        tag: `new-msg-${chat.remoteJid}`,
        data: { url: `/chats?jid=${encodeURIComponent(chat.remoteJid)}` },
      });
    }

    pendingCountRef.current += reallNew.length;
    updateAppBadge(pendingCountRef.current);
    if (originalTitleRef.current) {
      document.title = `(${pendingCountRef.current}) ${originalTitleRef.current}`;
    }
  // pendingUnreadJids excluido de deps a propósito: usamos el valor del closure sin ciclo
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatsResult, chatSessions, selectedJid, currentAdvisorId]);

  return { pendingUnreadJids };
}
