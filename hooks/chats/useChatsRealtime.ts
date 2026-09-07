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

/** Lo que el contacto esta haciendo ahora mismo. `nada` apaga el indicador. */
export type PresenciaContacto = "escribiendo" | "grabando";
export type ChatPresencePayload = {
  remoteJid: string;
  instanceName: string | null;
  presence: PresenciaContacto | "nada";
  ts: number;
};

type UseChatsRealtimeOptions = {
  /** Se llama cada vez que el servidor notifica que un chat cambió. */
  onChatChanged: (payload: ChatChangedPayload) => void;
  /** Presencia del contacto (escribiendo / grabando audio). Efimera: no se guarda. */
  onPresence?: (payload: ChatPresencePayload) => void;
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
export function useChatsRealtime({ onChatChanged, onPresence, enabled = true, onConnectedChange }: UseChatsRealtimeOptions) {
  const handlerRef = useRef(onChatChanged);
  useEffect(() => {
    handlerRef.current = onChatChanged;
  }, [onChatChanged]);

  const presenceRef = useRef(onPresence);
  useEffect(() => {
    presenceRef.current = onPresence;
  }, [onPresence]);

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

    const fetchToken = async (): Promise<{ url: string; token: string; cuentas?: number } | null> => {
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
        return {
          url: data.url as string,
          token: data.token as string,
          cuentas: typeof data.cuentas === "number" ? data.cuentas : undefined,
        };
      } catch (error) {
        console.warn("[realtime] no se pudo pedir el token:", error);
        return null;
      }
    };

    const connect = async () => {
      const creds = await fetchToken();
      if (!creds || cancelled) return;

      // Cuantas cuentas escucha este socket. Si la linea de un chat es de una
      // cuenta vinculada y aqui sale 1, los avisos de esa linea no van a llegar
      // y la conversacion depende solo del reloj. Ver CLAUDE.md, "buscar la
      // fila por TODAS las identidades".
      console.info("[realtime] conectando a", creds.url, { cuentas: creds.cuentas ?? "(sin dato)" });

      socket = io(creds.url, {
        path: "/socket.io",
        // Primero polling, luego subir a WebSocket si se puede. Es el orden por
        // defecto de socket.io y hay un motivo para volver a el: en produccion
        // el WebSocket contra backend.ia-app.com FALLA ("WebSocket connection
        // ... failed", "no se pudo conectar: websocket error", varias veces
        // seguidas) y solo despues se conecta por polling. Con "websocket"
        // primero, cada conexion y cada reconexion esperaba a que el WebSocket
        // agotara su plazo -20 s por intento- antes de probar el otro, y en
        // todo ese rato no llegaba NINGUN aviso: el mensaje salia en la lista
        // por su reloj y en la conversacion no. Con polling primero se conecta
        // al instante y, si el WebSocket funciona, socket.io sube solo.
        transports: ["polling", "websocket"],
        auth: { token: creds.token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 8000,
      });

      socket.on("connect", () => {
        // Con que transporte quedo. Si aqui sale siempre "polling" y nunca un
        // "subio a websocket", el WebSocket no pasa por el proxy y hay que
        // mirar Traefik; mientras, polling funciona igual, solo con algo mas
        // de latencia.
        const transporte = socket?.io.engine.transport.name ?? "(desconocido)";
        console.info("[realtime] conectado", { transporte });
        notifyConnected(true);
        socket?.io.engine.on("upgrade", (nuevo: { name: string }) => {
          console.info("[realtime] subio a", nuevo?.name);
        });
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
        // Cada aviso deja rastro. "A veces se pinta y a veces no" no se puede
        // diagnosticar sin saber si el aviso LLEGO: si la fila se mueve y esta
        // linea no sale, el mensaje entro por el reloj de la lista y no por
        // aqui, y el problema esta en la suscripcion, no en como se pinta.
        console.info("[realtime] aviso", {
          remoteJid: payload?.remoteJid,
          instancia: payload?.instanceName ?? "(sin linea)",
          tipo: payload?.message?.messageType ?? "(sin contenido)",
          fromMe: payload?.message?.fromMe ?? null,
        });
        if (payload?.remoteJid) handlerRef.current?.(payload);
      });

      // Presencia: sin rastro en consola a proposito, llega varias veces por
      // minuto mientras el contacto escribe y taparia los avisos que importan.
      socket.on("chat:presence", (payload: ChatPresencePayload) => {
        if (payload?.remoteJid) presenceRef.current?.(payload);
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
      socket?.off("chat:presence");
      socket?.disconnect();
      socket = null;
    };
  }, [enabled]);
}
