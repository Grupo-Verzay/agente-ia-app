"use client";

import { useEffect, useRef } from "react";
import type { ChatContactSessionMap } from "@/types/session";

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
 * Notifica al asesor cuando llegan nuevas conversaciones asignadas.
 * Se activa automáticamente con cada actualización de chatSessions (cada ~10s).
 * Solo funciona para usuarios con currentAdvisorId (asesores, no dueños).
 */
export function useAdvisorNotifications(
  chatSessions: ChatContactSessionMap,
  currentAdvisorId: string | undefined,
  advisorRole: string | null | undefined,
) {
  const seenIdsRef = useRef<Set<number> | null>(null);
  const pendingCountRef = useRef(0);
  const originalTitleRef = useRef("");

  // Solicitar permiso de notificaciones al montar (solo para asesores)
  useEffect(() => {
    if (!currentAdvisorId || !advisorRole) return;
    originalTitleRef.current = document.title;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, [advisorRole, currentAdvisorId]);

  // Resetear badge del título al enfocar la ventana
  useEffect(() => {
    if (!currentAdvisorId) return;
    const onFocus = () => {
      pendingCountRef.current = 0;
      if (originalTitleRef.current) document.title = originalTitleRef.current;
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [currentAdvisorId]);

  // Detectar nuevas asignaciones en cada actualización de chatSessions
  useEffect(() => {
    if (!currentAdvisorId || !advisorRole) return;

    const storageKey = `advisor_seen_${currentAdvisorId}`;
    const myChats = Object.values(chatSessions).filter(
      (s) => s?.assignedAdvisorId === currentAdvisorId,
    );

    // Primera ejecución: inicializar seenIds con todo lo existente (sin notificar)
    if (seenIdsRef.current === null) {
      const stored: number[] = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      const currentIds = myChats.filter(Boolean).map((s) => s!.id);
      seenIdsRef.current = new Set(stored.concat(currentIds));
      localStorage.setItem(storageKey, JSON.stringify(Array.from(seenIdsRef.current)));
      return;
    }

    const newSessions = myChats.filter((s) => s && !seenIdsRef.current!.has(s.id));

    if (newSessions.length > 0) {
      newSessions.forEach((s) => s && seenIdsRef.current!.add(s.id));
      localStorage.setItem(storageKey, JSON.stringify(Array.from(seenIdsRef.current)));

      pendingCountRef.current += newSessions.length;
      playNotificationSound();

      // Notificación del browser
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        newSessions.forEach((session) => {
          if (!session) return;
          const name = session.pushName?.trim() || session.remoteJid;
          const n = new Notification("Nueva conversación asignada", {
            body: name,
            icon: "/favicon.ico",
            tag: `advisor-assign-${session.id}`,
          });
          setTimeout(() => n.close(), 7000);
        });
      }

      // Badge en el título del tab
      if (originalTitleRef.current) {
        document.title = `(${pendingCountRef.current}) ${originalTitleRef.current}`;
      }
    }
  }, [chatSessions, currentAdvisorId, advisorRole]);
}
