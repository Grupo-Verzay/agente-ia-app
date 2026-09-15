import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { responderJson } from "@/lib/responder-json";
import { getAssociatedAccountIds } from "@/lib/cuentas-asociadas";
import { resolveInstanceOwner } from "@/lib/chat-persistence";
import { warmChatMessagesAction } from "@/actions/chat-manual-actions";
import { warmChannelMessages } from "@/actions/channel-chat-actions";
import type { FindMessagesResult } from "@/actions/chat-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Tope de identidades por peticion. Un contacto tiene cuatro, no cuarenta. */
const TOPE_DE_ALIAS = 24;

/**
 * Los mensajes de UNA conversacion, fuera de la cola de acciones.
 *
 * ## Que problema resuelve
 *
 * La lista precalienta las conversaciones segun se hacen visibles, y para eso
 * ya hay un tope de concurrencia en el navegador:
 *
 *     const PREFETCH_MAX_CONCURRENT = 4;   // chats-client.tsx
 *
 * Ese tope **nunca llegaba a aplicarse**. La precarga llamaba a una accion de
 * servidor, y Next las atiende de una en una, asi que daba igual dejar salir
 * cuatro: la segunda esperaba a la primera. Medido en produccion: **54
 * acciones sumando 27.422 ms de espera**, la peor de 2.310 ms, devolviendo
 * entre 0 y 7 KB cada una. No era trabajo, era turno.
 *
 * Por `/api` el tope del navegador vuelve a ser el que manda, que es para lo
 * que se escribio: acotar los picos cuando se hacen visibles muchas filas de
 * golpe.
 *
 * ## No cambia lo que se pide
 *
 * `localOnly` y `localFirst` viajan tal cual y significan lo mismo que antes.
 * Esta ruta no decide nada sobre el contenido: resuelve de quien es la linea,
 * comprueba que se pueda mirar, y llama a la misma accion de siempre.
 *
 * ## La puerta
 *
 * Meta y Telegram tienen su propia consulta, y `warmChannelMessages` lee por el
 * `userId` de la propia linea sin preguntar nada -igual que `fetchChannelChats`
 * en la ruta de la lista-. Atada a una accion con el nombre ya puesto eso no se
 * notaba; abierta por una ruta que acepta el nombre, seria la conversacion de
 * cualquier cuenta a quien supiera el nombre de su linea. Por eso el alcance se
 * comprueba **aqui**, con `getAssociatedAccountIds`, que es el mismo con el que
 * la bandeja lee los chats.
 *
 * Y la sesion se comprueba aqui y no solo en el middleware (ver CLAUDE.md).
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user?.id) {
    return NextResponse.json({ success: false, message: "No autorizado." }, { status: 401 });
  }

  const cuerpo = (await request.json().catch(() => null)) as {
    instanceName?: unknown;
    remoteJid?: unknown;
    page?: unknown;
    pageSize?: unknown;
    remoteJidAliases?: unknown;
    localOnly?: unknown;
    localFirst?: unknown;
  } | null;

  const instanceName =
    typeof cuerpo?.instanceName === "string" ? cuerpo.instanceName.trim() : "";
  const remoteJid = typeof cuerpo?.remoteJid === "string" ? cuerpo.remoteJid.trim() : "";
  if (!instanceName || !remoteJid) {
    return NextResponse.json(
      { success: false, message: "Falta la linea o el contacto." },
      { status: 400 },
    );
  }

  const dueno = await resolveInstanceOwner(instanceName);
  if (!dueno?.userId) {
    return NextResponse.json({ success: false, message: "Esa linea no existe." }, { status: 404 });
  }

  const cuentas = await getAssociatedAccountIds(user);
  if (!cuentas.includes(dueno.userId)) {
    console.warn("[chats] se pidio una conversacion de una linea que no es de estas cuentas", {
      instanceName,
      quienPregunta: user.id,
    });
    return NextResponse.json(
      { success: false, message: "Esa linea no es de esta cuenta." },
      { status: 403 },
    );
  }

  const opciones = {
    page: Number(cuerpo?.page) > 0 ? Number(cuerpo?.page) : 1,
    pageSize: Number(cuerpo?.pageSize) > 0 ? Number(cuerpo?.pageSize) : undefined,
    remoteJidAliases: Array.isArray(cuerpo?.remoteJidAliases)
      ? cuerpo!.remoteJidAliases
          .filter((a): a is string => typeof a === "string" && !!a)
          .slice(0, TOPE_DE_ALIAS)
      : undefined,
    localOnly: cuerpo?.localOnly === true,
    localFirst: cuerpo?.localFirst === true,
  };

  const tipo = (dueno.instanceType ?? "").trim().toLowerCase();
  const resultado: FindMessagesResult =
    tipo === "meta" || tipo === "telegram"
      ? await warmChannelMessages(instanceName, remoteJid, opciones)
      // `apiKeyData: null` a proposito: que la clave la resuelva el servidor,
      // igual que en la ruta de la lista.
      : await warmChatMessagesAction({ apiKeyData: null, instanceName }, remoteJid, opciones);

  return responderJson(request, resultado);
}
