"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";

export type RealtimeMessage = {
  id: string | null;
  fromMe: boolean;
  content: string;
  messageType: string;
  pushName: string | null;
  ts: number;
};

export type ChatChangedPayload = {
  remoteJid: string;
  instanceName: string | null;
  message?: RealtimeMessage | null;
  ts: number;
};

type UseChatsRealtimeOptions = {
  /** Se llama cada vez que el servidor notifica que un chat cambió. */
  onChatChanged: (payload: ChatChangedPayload) => void;
  /** Permite desactivar la conexión (p. ej. mientras no hay chats cargados). */
  enabled?: boolean;
  /**
   * Se llama cuando el socket se conecta/desconecta. Permite al consumidor
   * ajustar el polling de respaldo: relajado si el tiempo real está activo,
   * más ágil si el socket está caído o no configurado.
   */
  onConnectedChange?: (connected: boolean) => void;
};

/**
 * Conexión de tiempo real (Fase 1): escucha `chat:changed` del servidor
 * (api-webhook) y la usa como DISPARADOR para refrescar. No reemplaza la lógica
 * de datos existente; el polling de fondo sigue como red de seguridad.
 *
 * Se autoconfigura: pide token a /api/realtime/token. Si el realtime no está
 * habilitado por entorno, no hace nada y todo sigue funcionando con polling.
 */
export function useChatsRealtime({ onChatChanged, enabled = true, onConnectedChange }: UseChatsRealtimeOptions) {
  const handlerRef = useRef(onChatChanged);
  useEffect(() => {
    handlerRef.current = onChatChanged;
  }, [onChatChanged]);

  const connectedRef = useRef(onConnectedChange);
  useEffect(() => {
    connectedRef.current = onConnectedChange;
  }, [onConnectedChange]);

  useEffect(() => {
    if (!enabled) {
      // Sin esto, un tiempo real apagado y un tiempo real roto se ven igual:
      // nada en la consola y nada en la pestaña WS del navegador.
      console.warn("[realtime] desactivado: la carga inicial de chats no vino bien");
      return;
    }

    let socket: Socket | null = null;
    let cancelled = false;
    const notifyConnected = (v: boolean) => connectedRef.current?.(v);

    const fetchToken = async (): Promise<{ url: string; token: string } | null> => {
      try {
        const res = await fetch("/api/realtime/token", { cache: "no-store" });
        if (!res.ok) {
          console.warn("[realtime] /api/realtime/token respondio", res.status);
          return null;
        }
        const data = await res.json();
        if (!data?.enabled) {
          console.warn("[realtime] apagado por entorno (falta REALTIME_URL o REALTIME_JWT_SECRET en la App)");
          return null;
        }
        if (!data?.url || !data?.token) {
          console.warn("[realtime] el token vino incompleto:", { url: !!data?.url, token: !!data?.token });
          return null;
        }
        return { url: data.url as string, token: data.token as string };
      } catch (error) {
        console.warn("[realtime] no se pudo pedir el token:", error);
        return null;
      }
    };

    const connect = async () => {
      const creds = await fetchToken();
      if (!creds || cancelled) return;

      console.info("[realtime] conectando a", creds.url);

      socket = io(creds.url, {
        path: "/socket.io",
        transports: ["websocket", "polling"],
        auth: { token: creds.token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 8000,
      });

      socket.on("connect", () => {
        console.info("[realtime] conectado");
        notifyConnected(true);
      });
      socket.on("disconnect", (motivo) => {
        // "io server disconnect" = el backend nos echa; casi siempre el token
        // no le cuadra con su REALTIME_JWT_SECRET.
        console.warn("[realtime] desconectado:", motivo);
        notifyConnected(false);
      });
      // Sin este manejador, un socket que no llega a levantarse no deja rastro.
      socket.on("connect_error", (error) => {
        console.warn("[realtime] no se pudo conectar:", error?.message ?? error);
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
      notifyConnected(false);
      socket?.off("connect");
      socket?.off("disconnect");
      socket?.off("connect_error");
      socket?.off("chat:changed");
      socket?.disconnect();
      socket = null;
    };
  }, [enabled]);
}
