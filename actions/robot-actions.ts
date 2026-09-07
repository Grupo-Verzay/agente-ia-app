"use server";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertCanAccessTargetUser } from "./billing/helpers/app-access-guard";

/**
 * El "Robot" de una linea, separado del webhook de Evolution.
 *
 * Hasta ahora el boton Robot encendia y apagaba el WEBHOOK de Evolution: con el
 * robot apagado, Evolution no le mandaba nada al backend, y sin backend no hay
 * aviso en vivo ni historial en nuestra base. Las lineas atendidas por personas
 * -justo las que se apagan- eran las que peor iban en Chats: la conversacion
 * abierta solo vivia del reloj contra Evolution.
 *
 * Ahora el webhook va SIEMPRE encendido y el robot es la marca `bot_enabled`
 * de la instancia, que el backend lee antes de usar la IA o disparar flujos.
 *
 * La columna la crea el backend (docs/db-migrations-ownership.md) y aqui se
 * lee y escribe con SQL en crudo a proposito: declararla en schema.prisma y
 * que no exista aun en la base reventaria cada consulta a Instancias (ver el
 * #360 en CLAUDE.md). Si la columna no esta, se vuelve al comportamiento de
 * antes -tocar el webhook- y se avisa.
 */

const WEBHOOK_POR_DEFECTO = "https://backend.ia-app.com/webhook";
const EVENTOS_DEL_WEBHOOK = ["MESSAGES_UPSERT", "CALL"];

type Resultado<T> = { success: true; data: T } | { success: false; message: string };

export type EstadoDelRobot = {
  instanceName: string;
  /** Si el backend responde en esta linea (IA, flujos). */
  botEnabled: boolean;
  /** Si Evolution le manda los mensajes al backend. Deberia ser siempre true. */
  webhookEnabled: boolean;
  /** De donde salio `botEnabled`: la marca de la base o, sin columna, el webhook. */
  fuente: "marca" | "webhook";
};

async function lineaDeWhatsApp(userId: string, instanceName?: string) {
  const [instancias, usuario] = await Promise.all([
    db.instancia.findMany({
      where: { userId },
      select: { instanceName: true, instanceId: true, instanceType: true },
    }),
    db.user.findUnique({
      where: { id: userId },
      select: { webhookUrl: true, apiKey: { select: { url: true, key: true } } },
    }),
  ]);
  // La linea de WhatsApp es UNA, con dos proveedores posibles: `Whatsapp` es
  // Evolution y `waha` es Waha. Buscar solo `Whatsapp` dejaba sin Robot a las
  // lineas migradas, que es justo la fila que cambia de tipo al cambiar de
  // proveedor (ver actions/proveedor-de-linea-actions.ts).
  // Si la tarjeta dice de que linea habla, esa y no otra: una cuenta puede
  // tener una fila de Evolution y otra de Waha, y sin esto el Robot de una
  // tarjeta acababa encendiendo el de la otra.
  const linea =
    (instanceName ? instancias.find((i) => i.instanceName === instanceName) : null) ??
    instancias.find((i) => i.instanceType === "Whatsapp") ??
    instancias.find((i) => i.instanceType === "waha") ??
    instancias[0] ??
    null;
  const url = (usuario?.apiKey?.url ?? "").trim().replace(/\/+$/, "");
  const base = url ? (/^https?:\/\//i.test(url) ? url : `https://${url}`) : "";
  return {
    linea,
    /**
     * Con Waha no hay nada que preguntarle a Evolution: su webhook se deja
     * puesto al crear la sesion y el backend lee la misma marca para las dos
     * (los mensajes de Waha pasan por el mismo `processWebhook`). Exigir aqui
     * una clave de Evolution dejaba el Robot muerto en esas lineas.
     */
    esWaha: linea?.instanceType === "waha",
    base,
    credenciales: Array.from(
      new Set([linea?.instanceId, usuario?.apiKey?.key].filter(Boolean) as string[]),
    ),
    webhookUrl: usuario?.webhookUrl?.trim() || WEBHOOK_POR_DEFECTO,
  };
}

/** Prueba las credenciales que haya: la de la linea y la de la cuenta. */
async function evolution(
  base: string,
  ruta: string,
  credenciales: string[],
  init?: { method?: string; body?: unknown },
): Promise<{ ok: boolean; data: any }> {
  let ultimo: { ok: boolean; data: any } = { ok: false, data: null };
  for (const credencial of credenciales) {
    const resp = await fetch(`${base}${ruta}`, {
      method: init?.method ?? "GET",
      headers: { apikey: credencial, "Content-Type": "application/json" },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    }).catch(() => null);
    if (!resp) continue;
    const data = await resp.json().catch(() => null);
    ultimo = { ok: resp.ok, data };
    if (resp.ok) return ultimo;
  }
  return ultimo;
}

async function encenderWebhook(base: string, instanceName: string, credenciales: string[], webhookUrl: string) {
  return evolution(base, `/webhook/set/${encodeURIComponent(instanceName)}`, credenciales, {
    method: "POST",
    body: {
      webhook: { enabled: true, url: webhookUrl, base64: true, events: EVENTOS_DEL_WEBHOOK },
    },
  });
}

async function leerMarca(instanceName: string): Promise<boolean | null | "sin-columna"> {
  try {
    const filas = await db.$queryRaw<{ bot_enabled: boolean }[]>(
      Prisma.sql`SELECT "bot_enabled" FROM "Instancias" WHERE "instanceName" = ${instanceName} LIMIT 1`,
    );
    return filas[0]?.bot_enabled ?? null;
  } catch (error) {
    // Columna sin crear todavia (el backend no ha desplegado su migracion).
    console.warn("[robot] la base no tiene bot_enabled; se usa el webhook como antes.", (error as Error)?.message);
    return "sin-columna";
  }
}

async function escribirMarca(instanceName: string, encendido: boolean): Promise<boolean> {
  try {
    await db.$executeRaw(
      Prisma.sql`UPDATE "Instancias" SET "bot_enabled" = ${encendido} WHERE "instanceName" = ${instanceName}`,
    );
    return true;
  } catch (error) {
    console.warn("[robot] no se pudo escribir bot_enabled:", (error as Error)?.message);
    return false;
  }
}

/**
 * Estado actual del robot de la linea de WhatsApp de la cuenta.
 *
 * Migracion en caliente: si el webhook esta apagado en Evolution, es una linea
 * que se apago con el boton viejo. Se toma como robot APAGADO, se guarda la
 * marca y se enciende el webhook, que es lo que hace falta para que lleguen
 * los avisos. La linea sigue sin IA: la marca manda.
 */
export async function leerEstadoDelRobot(
  userId: string,
  instanceName?: string,
): Promise<Resultado<EstadoDelRobot>> {
  try {
    await assertCanAccessTargetUser(userId);
    const { linea, esWaha, base, credenciales, webhookUrl } = await lineaDeWhatsApp(userId, instanceName);
    if (!linea?.instanceName || !linea.instanceId) {
      return { success: false, message: "No se encontraron instancias para este usuario." };
    }

    if (esWaha) {
      const marcaWaha = await leerMarca(linea.instanceName);
      return {
        success: true,
        data: {
          instanceName: linea.instanceName,
          // Sin columna todavia se da por encendido, que es lo que hace el
          // backend cuando no puede leerla.
          botEnabled: marcaWaha === "sin-columna" ? true : (marcaWaha ?? true),
          webhookEnabled: true,
          fuente: marcaWaha === "sin-columna" ? "webhook" : "marca",
        },
      };
    }

    if (!base) {
      return {
        success: false,
        message: "Este usuario no tiene una API Key de Evolution asignada. Contacta al administrador.",
      };
    }

    const webhook = await evolution(base, `/webhook/find/${encodeURIComponent(linea.instanceName)}`, credenciales);
    const webhookEnabled = webhook.ok && webhook.data?.enabled === true;
    const marca = await leerMarca(linea.instanceName);

    if (marca === "sin-columna") {
      return {
        success: true,
        data: { instanceName: linea.instanceName, botEnabled: webhookEnabled, webhookEnabled, fuente: "webhook" },
      };
    }

    if (!webhookEnabled) {
      // Linea apagada con el boton viejo: robot apagado, webhook encendido.
      await escribirMarca(linea.instanceName, false);
      const encendido = await encenderWebhook(base, linea.instanceName, credenciales, webhookUrl);
      console.warn("[robot] linea con el webhook apagado: se marca el robot apagado y se enciende el webhook.", {
        instanceName: linea.instanceName,
        webhookEncendido: encendido.ok,
      });
      return {
        success: true,
        data: { instanceName: linea.instanceName, botEnabled: false, webhookEnabled: encendido.ok, fuente: "marca" },
      };
    }

    return {
      success: true,
      data: { instanceName: linea.instanceName, botEnabled: marca ?? true, webhookEnabled: true, fuente: "marca" },
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "No se pudo leer el robot." };
  }
}

/**
 * Enciende o apaga el robot. El webhook queda encendido en los dos casos.
 */
export async function cambiarRobot(
  userId: string,
  encendido: boolean,
  instanceName?: string,
): Promise<Resultado<EstadoDelRobot>> {
  try {
    await assertCanAccessTargetUser(userId);
    const { linea, esWaha, base, credenciales, webhookUrl } = await lineaDeWhatsApp(userId, instanceName);
    if (!linea?.instanceName || !linea.instanceId) {
      return { success: false, message: "No se encontraron instancias para este usuario." };
    }

    if (esWaha) {
      // La marca es lo unico que hay que tocar, y sin ella no hay Robot: no se
      // puede caer al comportamiento viejo de apagar el webhook, porque el de
      // Waha no lo gobierna esta App.
      if (!(await escribirMarca(linea.instanceName, encendido))) {
        return {
          success: false,
          message: "La base todavía no tiene la marca del Robot. Inténtalo en unos minutos.",
        };
      }
      return {
        success: true,
        data: { instanceName: linea.instanceName, botEnabled: encendido, webhookEnabled: true, fuente: "marca" },
      };
    }

    if (!base) {
      return { success: false, message: "Este usuario no tiene una API Key de Evolution asignada." };
    }

    const marcaEscrita = await escribirMarca(linea.instanceName, encendido);

    if (!marcaEscrita) {
      // Sin columna todavia: el comportamiento de antes, tocar el webhook.
      const r = await evolution(base, `/webhook/set/${encodeURIComponent(linea.instanceName)}`, credenciales, {
        method: "POST",
        body: { webhook: { enabled: encendido, url: webhookUrl, base64: true, events: EVENTOS_DEL_WEBHOOK } },
      });
      if (!r.ok) return { success: false, message: "Evolution no acepto el cambio del webhook." };
      return {
        success: true,
        data: { instanceName: linea.instanceName, botEnabled: encendido, webhookEnabled: encendido, fuente: "webhook" },
      };
    }

    const webhook = await encenderWebhook(base, linea.instanceName, credenciales, webhookUrl);
    if (!webhook.ok) {
      console.warn("[robot] la marca se guardo pero Evolution no acepto encender el webhook.", {
        instanceName: linea.instanceName,
        respuesta: webhook.data,
      });
    }
    return {
      success: true,
      data: { instanceName: linea.instanceName, botEnabled: encendido, webhookEnabled: webhook.ok, fuente: "marca" },
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "No se pudo cambiar el robot." };
  }
}
