"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";

export type ChatChangedPayload = {
  remoteJid: string;
  instanceName: string | null;
  ts: number;
};

type UseChatsRealtimeOptions = {
  /** Se llama cada vez que el servidor notifica que un chat cambió. */
  onChatChanged: (payload: ChatChangedPayload) => void;
  /** Permite desactivar la conexión (p. ej. mientras no hay chats cargados). */
  enabled?: boolean;
};

/**
 * Conexión de tiempo real (Fase 1): escucha `chat:changed` del servidor
 * (api-webhook) y la usa como DISPARADOR para refrescar. No reemplaza la lógica
 * de datos existente; el polling de fondo sigue como red de seguridad.
 *
 * Se autoconfigura: pide token a /api/realtime/token. Si el realtime no está
 * habilitado por entorno, no hace nada y todo sigue funcionando con polling.
 */
export function useChatsRealtime({ onChatChanged, enabled = true }: UseChatsRealtimeOptions) {
  const handlerRef = useRef(onChatChanged);
  useEffect(() => {
    handlerRef.current = onChatChanged;
  }, [onChatChanged]);

  useEffect(() => {
    if (!enabled) return;

    let socket: Socket | null = null;
    let cancelled = false;

    const fetchToken = async (): Promise<{ url: string; token: string } | null> => {
      try {
        const res = await fetch("/api/realtime/token", { cache: "no-store" });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data?.enabled || !data?.url || !data?.token) return null;
        return { url: data.url as string, token: data.token as string };
      } catch {
        return null;
      }
    };

    const connect = async () => {
      const creds = await fetchToken();
      if (!creds || cancelled) return;

      socket = io(creds.url, {
        path: "/socket.io",
        transports: ["websocket", "polling"],
        auth: { token: creds.token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 8000,
      });

      socket.on("chat:changed", (payload: ChatChangedPayload) => {
        if (payload?.remoteJid) handlerRef.current?.(payload);
      });

      // Antes de reintentar, renovar el token (puede haber expirado).
      socket.io.on("reconnect_attempt", async () => {
        const fresh = await fetchToken();
        if (fresh && socket) socket.auth = { token: fresh.token };
      });
    };

    void connect();

    return () => {
      cancelled = true;
      socket?.off("chat:changed");
      socket?.disconnect();
      socket = null;
    };
  }, [enabled]);
}
